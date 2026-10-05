import express from 'express';
import pool from '../db.js';

const router = express.Router();

// 贴纸转粉球比例
const STICKERS_PER_BALL = 160;

// 获取待审批列表
router.get('/pending/:familyId', async (req, res) => {
  try {
    const { familyId } = req.params;
    const result = await pool.query(
      `SELECT a.*,
        m.name as applicant_name, m.role as applicant_role, m.avatar as applicant_avatar,
        t.name as task_name, t.sticker_reward
       FROM applications a
       JOIN members m ON a.applicant_id = m.id
       LEFT JOIN tasks t ON a.task_id = t.id
       WHERE m.family_id = $1 AND a.status = 'pending'
       ORDER BY a.created_at DESC`,
      [familyId]
    );
    res.json({ success: true, applications: result.rows });
  } catch (error) {
    console.error('获取申请列表失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 获取申请历史
router.get('/history/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { limit } = req.query;
    const result = await pool.query(
      `SELECT a.*, t.name as task_name,
        r.name as reviewer_name
       FROM applications a
       LEFT JOIN tasks t ON a.task_id = t.id
       LEFT JOIN members r ON a.reviewer_id = r.id
       WHERE a.applicant_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [memberId, limit || 50]
    );
    res.json({ success: true, applications: result.rows });
  } catch (error) {
    console.error('获取历史失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 创建申请（孩子提交）
router.post('/', async (req, res) => {
  try {
    const { applicantId, taskId, applicationType, requestedStickers, reason } = req.body;

    const result = await pool.query(
      `INSERT INTO applications (applicant_id, task_id, application_type, requested_stickers, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [applicantId, taskId, applicationType, requestedStickers, reason]
    );

    res.json({ success: true, application: result.rows[0] });
  } catch (error) {
    console.error('创建申请失败:', error);
    res.status(500).json({ success: false, error: '创建失败' });
  }
});

// 审批申请
router.put('/:id/review', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { reviewerId, approved, rejectReason } = req.body;

    await client.query('BEGIN');

    // 获取申请详情
    const appResult = await client.query('SELECT * FROM applications WHERE id = $1', [id]);
    if (appResult.rows.length === 0) {
      throw new Error('申请不存在');
    }
    const application = appResult.rows[0];

    if (application.status !== 'pending') {
      throw new Error('该申请已处理');
    }

    if (approved) {
      // 获取成员当前贴纸数
      const memberResult = await client.query(
        'SELECT * FROM members WHERE id = $1 FOR UPDATE',
        [application.applicant_id]
      );
      const member = memberResult.rows[0];

      // 计算新贴纸数
      const changeType = application.application_type === 'penalty' ? 'penalty' : 'earn';
      const newStickers = changeType === 'penalty'
        ? Math.max(0, member.current_stickers - application.requested_stickers)
        : member.current_stickers + application.requested_stickers;

      // 更新成员贴纸
      await client.query(
        `UPDATE members SET
          current_stickers = $1,
          total_stickers = total_stickers + $2
         WHERE id = $3`,
        [newStickers, changeType === 'earn' ? application.requested_stickers : 0, application.applicant_id]
      );

      // 记录贴纸日志
      await client.query(
        `INSERT INTO sticker_logs (member_id, task_id, application_id, change_type, sticker_change, balance_after, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [application.applicant_id, application.task_id, application.id, changeType, application.requested_stickers, newStickers, reviewerId]
      );

      // 自动转粉球（如果是获得贴纸）
      if (changeType === 'earn' && newStickers >= STICKERS_PER_BALL) {
        const ballsEarned = Math.floor(newStickers / STICKERS_PER_BALL);
        const remainingStickers = newStickers % STICKERS_PER_BALL;

        // 获取刚插入的日志ID
        const logResult = await client.query(
          'SELECT id FROM sticker_logs WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1',
          [application.id]
        );

        // 更新贴纸和粉球
        await client.query(
          `UPDATE members SET
            current_stickers = $1,
            current_balls = current_balls + $2,
            total_balls = total_balls + $2
           WHERE id = $3`,
          [remainingStickers, ballsEarned, application.applicant_id]
        );

        // 记录粉球日志
        await client.query(
          `INSERT INTO ball_logs (member_id, change_type, ball_change, balance_after, remark, related_sticker_log_id)
           VALUES ($1, 'convert', $2, $3, $4, $5)`,
          [application.applicant_id, ballsEarned, member.current_balls + ballsEarned, `${ballsEarned}个粉球（${STICKERS_PER_BALL}贴纸兑换）`, logResult.rows[0].id]
        );
      }

      // 更新申请状态
      await client.query(
        `UPDATE applications SET status = 'approved', reviewer_id = $1, reviewed_at = NOW() WHERE id = $2`,
        [reviewerId, id]
      );
    } else {
      // 拒绝申请
      await client.query(
        `UPDATE applications SET status = 'rejected', reviewer_id = $1, reviewed_at = NOW() WHERE id = $2`,
        [reviewerId, id]
      );
    }

    await client.query('COMMIT');

    // 返回更新后的成员信息
    const updatedMember = await pool.query(
      'SELECT * FROM members WHERE id = $1',
      [application.applicant_id]
    );

    res.json({
      success: true,
      message: approved ? '已通过' : '已拒绝',
      member: updatedMember.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('审批失败:', error);
    res.status(500).json({ success: false, error: error.message || '审批失败' });
  } finally {
    client.release();
  }
});

export default router;

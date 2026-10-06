import express from 'express';
import pool from '../db.js';
import { requireAuth, requireParent } from '../lib/auth.js';
import { applyStickerChange, deductStickers } from '../lib/economy.js';

const router = express.Router();

router.use(requireAuth);

// 获取待审批列表（家长）
router.get('/pending/:familyId', requireParent, async (req, res) => {
  try {
    const familyId = req.member.family_id;
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

// 获取申请历史（本人或同家庭家长）
router.get('/history/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { limit } = req.query;

    const targetResult = await pool.query('SELECT family_id FROM members WHERE id = $1', [memberId]);
    if (targetResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '成员不存在' });
    }
    if (targetResult.rows[0].family_id !== req.member.family_id) {
      return res.status(403).json({ success: false, error: '无权查看该成员的申请' });
    }
    if (memberId !== req.member.id && req.member.role !== 'parent') {
      return res.status(403).json({ success: false, error: '无权查看该成员的申请' });
    }

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

// 创建申请（仅限不关联任务的额外奖励/惩罚申请）。
// 任务奖励统一走 POST /task/:id/submit（服务端计算剩余量，防止重复发奖）。
router.post('/', async (req, res) => {
  try {
    const applicantId = req.member.id;
    const { taskId, applicationType, requestedStickers, reason } = req.body;

    if (taskId) {
      return res.status(400).json({ success: false, error: '任务奖励请通过打卡提交入口（POST /task/:id/submit）' });
    }
    if (!['earn', 'penalty', 'custom'].includes(applicationType)) {
      return res.status(400).json({ success: false, error: '申请类型无效' });
    }
    if (!Number.isInteger(requestedStickers) || requestedStickers < 1 || requestedStickers > 10000) {
      return res.status(400).json({ success: false, error: '贴纸数量需为 1-10000 的整数' });
    }
    if (reason && (typeof reason !== 'string' || reason.length > 200)) {
      return res.status(400).json({ success: false, error: '理由需为 200 字以内的文本' });
    }

    const result = await pool.query(
      `INSERT INTO applications (applicant_id, application_type, requested_stickers, reason)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [applicantId, applicationType, requestedStickers, reason || null]
    );

    res.json({ success: true, application: result.rows[0] });
  } catch (error) {
    console.error('创建申请失败:', error);
    res.status(500).json({ success: false, error: '创建失败' });
  }
});

// 审批申请（家长）
router.put('/:id/review', requireParent, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const reviewerId = req.member.id;
    const { approved, rejectReason } = req.body;

    await client.query('BEGIN');

    // 获取申请详情
    const appResult = await client.query('SELECT * FROM applications WHERE id = $1', [id]);
    if (appResult.rows.length === 0) {
      throw new Error('申请不存在');
    }
    const application = appResult.rows[0];

    // 申请必须属于本家庭的孩子
    const applicantResult = await client.query('SELECT family_id FROM members WHERE id = $1', [application.applicant_id]);
    if (applicantResult.rows.length === 0 || applicantResult.rows[0].family_id !== req.member.family_id) {
      throw new Error('无权审批该申请');
    }

    if (application.status !== 'pending') {
      throw new Error('该申请已处理');
    }

    if (approved) {
      // 统一经账务模块发放/扣除（含流水与满160自动转粉球）
      if (application.application_type === 'penalty') {
        await deductStickers(client, {
          memberId: application.applicant_id,
          amount: application.requested_stickers,
          taskId: application.task_id,
          createdBy: reviewerId,
        });
      } else {
        await applyStickerChange(client, {
          memberId: application.applicant_id,
          amount: application.requested_stickers,
          changeType: 'earn',
          taskId: application.task_id,
          applicationId: application.id,
          createdBy: reviewerId,
        });
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
      'SELECT id, name, role, current_stickers, current_balls, total_stickers, total_balls, avatar FROM members WHERE id = $1',
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
    const msg = error.message || '审批失败';
    const status = msg.includes('不存在') ? 404 : msg.includes('已处理') || msg.includes('无权') ? 409 : 500;
    res.status(status).json({ success: false, error: msg });
  } finally {
    client.release();
  }
});

export default router;

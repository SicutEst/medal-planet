import express from 'express';
import pool from '../db.js';

const router = express.Router();

// 贴纸转粉球比例
const STICKERS_PER_BALL = 160;

// 获取贴纸记录
router.get('/logs/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { limit, type } = req.query;

    let query = `
      SELECT sl.*, t.name as task_name, a.reason as application_reason,
        m.name as created_by_name
       FROM sticker_logs sl
       LEFT JOIN tasks t ON sl.task_id = t.id
       LEFT JOIN applications a ON sl.application_id = a.id
       LEFT JOIN members m ON sl.created_by = m.id
       WHERE sl.member_id = $1
    `;
    const params = [memberId];

    if (type) {
      query += ` AND sl.change_type = $2`;
      params.push(type);
    }

    query += ` ORDER BY sl.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit || 50);

    const result = await pool.query(query, params);
    res.json({ success: true, logs: result.rows });
  } catch (error) {
    console.error('获取记录失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 直接奖励/扣除贴纸（家长操作）
router.post('/adjust', async (req, res) => {
  const client = await pool.connect();
  try {
    const { memberId, changeType, amount, remark, operatorId } = req.body;

    await client.query('BEGIN');

    // 获取成员
    const memberResult = await client.query(
      'SELECT * FROM members WHERE id = $1 FOR UPDATE',
      [memberId]
    );
    const member = memberResult.rows[0];

    if (!member) {
      throw new Error('成员不存在');
    }

    // 计算新贴纸数
    let newStickers;
    if (changeType === 'earn') {
      newStickers = member.current_stickers + amount;
    } else if (changeType === 'penalty') {
      newStickers = Math.max(0, member.current_stickers - amount);
    } else {
      newStickers = member.current_stickers + amount; // adjust可以是负数
    }

    // 更新成员
    await client.query(
      `UPDATE members SET
        current_stickers = $1,
        total_stickers = total_stickers + $2
       WHERE id = $3`,
      [newStickers, changeType === 'earn' ? amount : 0, memberId]
    );

    // 记录日志
    await client.query(
      `INSERT INTO sticker_logs (member_id, change_type, sticker_change, balance_after, remark, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [memberId, changeType, amount, newStickers, remark, operatorId]
    );

    // 自动转粉球
    if (changeType === 'earn' && newStickers >= STICKERS_PER_BALL) {
      const ballsEarned = Math.floor(newStickers / STICKERS_PER_BALL);
      const remainingStickers = newStickers % STICKERS_PER_BALL;

      await client.query(
        `UPDATE members SET
          current_stickers = $1,
          current_balls = current_balls + $2,
          total_balls = total_balls + $2
         WHERE id = $3`,
        [remainingStickers, ballsEarned, memberId]
      );

      // 获取刚插入的日志
      const logResult = await client.query(
        'SELECT id FROM sticker_logs WHERE member_id = $1 ORDER BY created_at DESC LIMIT 1',
        [memberId]
      );

      await client.query(
        `INSERT INTO ball_logs (member_id, change_type, ball_change, balance_after, remark, related_sticker_log_id)
         VALUES ($1, 'convert', $2, $3, $4, $5)`,
        [memberId, ballsEarned, member.current_balls + ballsEarned, `${ballsEarned}个粉球（${STICKERS_PER_BALL}贴纸兑换）`, logResult.rows[0].id]
      );
    }

    await client.query('COMMIT');

    // 返回更新后的信息
    const updatedMember = await pool.query('SELECT * FROM members WHERE id = $1', [memberId]);

    res.json({
      success: true,
      message: `已${changeType === 'earn' ? '奖励' : '扣除'} ${amount} 贴纸`,
      member: updatedMember.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('操作失败:', error);
    res.status(500).json({ success: false, error: error.message || '操作失败' });
  } finally {
    client.release();
  }
});

// 统计接口
router.get('/stats/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { period } = req.query;

    let dateFilter = "AND sl.created_at >= NOW() - INTERVAL '30 days'";
    if (period === 'week') {
      dateFilter = "AND sl.created_at >= NOW() - INTERVAL '7 days'";
    } else if (period === 'month') {
      dateFilter = "AND sl.created_at >= NOW() - INTERVAL '30 days'";
    } else if (period === 'all') {
      dateFilter = '';
    }

    // 每日趋势
    const trendResult = await pool.query(`
      SELECT DATE(created_at) as date,
        SUM(CASE WHEN change_type = 'earn' THEN sticker_change ELSE 0 END) as earned,
        SUM(CASE WHEN change_type = 'penalty' THEN sticker_change ELSE 0 END) as penalty
      FROM sticker_logs
      WHERE member_id = $1 ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [memberId]);

    // 任务完成排行
    const taskStatsResult = await pool.query(`
      SELECT t.name, COUNT(*) as completions
      FROM task_completions tc
      JOIN tasks t ON tc.task_id = t.id
      WHERE tc.member_id = $1 ${dateFilter.replace('sl.created_at', 'tc.created_at')}
      GROUP BY t.id, t.name
      ORDER BY completions DESC
      LIMIT 10
    `, [memberId]);

    res.json({
      success: true,
      trend: trendResult.rows,
      taskStats: taskStatsResult.rows
    });
  } catch (error) {
    console.error('获取统计失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

export default router;

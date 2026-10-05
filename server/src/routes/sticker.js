import express from 'express';
import pool from '../db.js';
import { requireAuth, requireParent } from '../lib/auth.js';
import { applyStickerChange, deductStickers } from '../lib/economy.js';

const router = express.Router();

router.use(requireAuth);

// 获取贴纸记录（本人或同家庭家长）
router.get('/logs/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { limit, type } = req.query;

    if (memberId !== req.member.id && req.member.role !== 'parent') {
      return res.status(403).json({ success: false, error: '无权查看该成员的记录' });
    }
    const targetResult = await pool.query('SELECT family_id FROM members WHERE id = $1', [memberId]);
    if (targetResult.rows.length === 0 || targetResult.rows[0].family_id !== req.member.family_id) {
      return res.status(403).json({ success: false, error: '无权查看该成员的记录' });
    }

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
router.post('/adjust', requireParent, async (req, res) => {
  const client = await pool.connect();
  try {
    const { memberId, changeType, amount, remark } = req.body;
    const operatorId = req.member.id;

    if (!['earn', 'penalty', 'adjust'].includes(changeType)) {
      return res.status(400).json({ success: false, error: '操作类型无效' });
    }
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 10000) {
      return res.status(400).json({ success: false, error: '数量需为 1-10000 的非零整数' });
    }
    if (changeType !== 'adjust' && amount < 0) {
      return res.status(400).json({ success: false, error: '该操作类型的数量必须为正数' });
    }

    // 目标成员必须属于本家庭
    const targetResult = await pool.query('SELECT family_id FROM members WHERE id = $1', [memberId]);
    if (targetResult.rows.length === 0 || targetResult.rows[0].family_id !== req.member.family_id) {
      return res.status(403).json({ success: false, error: '无权对该成员操作' });
    }

    await client.query('BEGIN');

    // 目标成员必须存在
    const memberResult = await client.query(
      'SELECT id FROM members WHERE id = $1 FOR UPDATE',
      [memberId]
    );
    if (memberResult.rows.length === 0) {
      throw new Error('成员不存在');
    }

    // 统一经账务模块变动（含流水与满160自动转粉球）
    let resultInfo;
    if (changeType === 'penalty') {
      resultInfo = await deductStickers(client, {
        memberId, amount, taskId: null, remark, createdBy: operatorId,
      });
    } else {
      resultInfo = await applyStickerChange(client, {
        memberId, amount, changeType, taskId: null, remark, createdBy: operatorId,
      });
    }

    await client.query('COMMIT');

    // 返回更新后的信息
    const updatedMember = await pool.query(
      'SELECT id, name, role, current_stickers, current_balls, total_stickers, total_balls, avatar FROM members WHERE id = $1',
      [memberId]
    );

    res.json({
      success: true,
      message: `已${changeType === 'earn' ? '奖励' : '扣除'} ${Math.abs(amount)} 贴纸`,
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

// 统计接口（本人或同家庭家长）
router.get('/stats/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { period } = req.query;

    if (memberId !== req.member.id && req.member.role !== 'parent') {
      return res.status(403).json({ success: false, error: '无权查看该成员的统计' });
    }
    const targetResult = await pool.query('SELECT family_id FROM members WHERE id = $1', [memberId]);
    if (targetResult.rows.length === 0 || targetResult.rows[0].family_id !== req.member.family_id) {
      return res.status(403).json({ success: false, error: '无权查看该成员的统计' });
    }

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

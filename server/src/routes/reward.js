import express from 'express';
import pool from '../db.js';

const router = express.Router();

// 获取家庭的所有奖励
router.get('/family/:familyId', async (req, res) => {
  try {
    const { familyId } = req.params;
    const result = await pool.query(
      `SELECT * FROM rewards WHERE family_id = $1 ORDER BY sort_order, created_at DESC`,
      [familyId]
    );
    res.json({ success: true, rewards: result.rows });
  } catch (error) {
    console.error('获取奖励列表失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 获取兑换记录
router.get('/exchanges/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const result = await pool.query(
      `SELECT re.*, r.name as reward_name, r.icon as reward_icon, r.tier as reward_tier
       FROM reward_exchanges re
       JOIN rewards r ON re.reward_id = r.id
       WHERE re.member_id = $1
       ORDER BY re.created_at DESC LIMIT 50`,
      [memberId]
    );
    res.json({ success: true, exchanges: result.rows });
  } catch (error) {
    console.error('获取兑换记录失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 获取家庭所有兑换记录（家长查看并确认领取）
router.get('/family-exchanges/:familyId', async (req, res) => {
  try {
    const { familyId } = req.params;
    const result = await pool.query(
      `SELECT re.*, r.name as reward_name, r.icon as reward_icon, r.tier as reward_tier,
              m.name as member_name
       FROM reward_exchanges re
       JOIN rewards r ON re.reward_id = r.id
       JOIN members m ON re.member_id = m.id
       WHERE r.family_id = $1
       ORDER BY re.created_at DESC LIMIT 100`,
      [familyId]
    );
    res.json({ success: true, exchanges: result.rows });
  } catch (error) {
    console.error('获取家庭兑换记录失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 创建奖励（家长操作）
router.post('/', async (req, res) => {
  try {
    const {
      familyId, name, description, tier, requiredBalls,
      isGachaPool, isExchangeable, stock, icon
    } = req.body;

    const result = await pool.query(
      `INSERT INTO rewards (family_id, name, description, tier, required_balls, is_gacha_pool, is_exchangeable, stock, icon)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        familyId, name, description || '', tier || '普通',
        requiredBalls || 10, isGachaPool || false, isExchangeable !== false,
        stock !== undefined ? stock : -1, icon || '🎁'
      ]
    );

    res.json({ success: true, reward: result.rows[0] });
  } catch (error) {
    console.error('创建奖励失败:', error);
    res.status(500).json({ success: false, error: '创建失败' });
  }
});

// 更新奖励
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, tier, requiredBalls, isGachaPool, isExchangeable, stock, icon } = req.body;

    const result = await pool.query(
      `UPDATE rewards SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        tier = COALESCE($3, tier),
        required_balls = COALESCE($4, required_balls),
        is_gacha_pool = COALESCE($5, is_gacha_pool),
        is_exchangeable = COALESCE($6, is_exchangeable),
        stock = COALESCE($7, stock),
        icon = COALESCE($8, icon)
       WHERE id = $9 RETURNING *`,
      [name, description, tier, requiredBalls, isGachaPool, isExchangeable, stock, icon, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '奖励不存在' });
    }

    res.json({ success: true, reward: result.rows[0] });
  } catch (error) {
    console.error('更新奖励失败:', error);
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

// 删除奖励
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM rewards WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('删除奖励失败:', error);
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

// 直接兑换奖励
router.post('/:id/exchange', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { memberId } = req.body;

    await client.query('BEGIN');

    // 获取奖励信息并锁定
    const rewardResult = await client.query(
      'SELECT * FROM rewards WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (rewardResult.rows.length === 0) {
      throw new Error('奖励不存在');
    }
    const reward = rewardResult.rows[0];

    // 检查是否可兑换
    if (!reward.is_exchangeable) {
      throw new Error('该奖励不可直接兑换');
    }

    // 检查库存
    if (reward.stock === 0) {
      throw new Error('奖励已兑换完');
    }

    // 获取成员信息并锁定
    const memberResult = await client.query(
      'SELECT * FROM members WHERE id = $1 FOR UPDATE',
      [memberId]
    );
    if (memberResult.rows.length === 0) {
      throw new Error('成员不存在');
    }
    const member = memberResult.rows[0];

    // 检查粉球是否足够
    if (member.current_balls < reward.required_balls) {
      throw new Error(`粉球不足，需要 ${reward.required_balls} 个，当前 ${member.current_balls} 个`);
    }

    // 扣除粉球
    const newBallBalance = member.current_balls - reward.required_balls;
    await client.query(
      'UPDATE members SET current_balls = $1 WHERE id = $2',
      [newBallBalance, memberId]
    );

    // 记录粉球日志
    await client.query(
      `INSERT INTO ball_logs (member_id, change_type, ball_change, balance_after, remark)
       VALUES ($1, 'use', $2, $3, $4)`,
      [memberId, -reward.required_balls, newBallBalance, `兑换「${reward.name}」`]
    );

    // 减少库存（-1为无限）
    if (reward.stock > 0) {
      await client.query(
        'UPDATE rewards SET stock = stock - 1 WHERE id = $1',
        [id]
      );
    }

    // 创建兑换记录
    const exchangeResult = await client.query(
      `INSERT INTO reward_exchanges (reward_id, member_id, cost_balls, status)
       VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [id, memberId, reward.required_balls]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `兑换成功！消耗 ${reward.required_balls} 粉球`,
      exchange: exchangeResult.rows[0],
      newBallBalance
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('兑换失败:', error);
    res.status(400).json({ success: false, error: error.message || '兑换失败' });
  } finally {
    client.release();
  }
});

// 确认兑换（家长确认领取）
router.put('/exchange/:exchangeId/confirm', async (req, res) => {
  try {
    const { exchangeId } = req.params;
    const result = await pool.query(
      `UPDATE reward_exchanges SET status = 'confirmed' WHERE id = $1 AND status = 'pending' RETURNING *`,
      [exchangeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '兑换记录不存在或已处理' });
    }

    res.json({ success: true, exchange: result.rows[0] });
  } catch (error) {
    console.error('确认兑换失败:', error);
    res.status(500).json({ success: false, error: '操作失败' });
  }
});

export default router;

import express from 'express';
import pool from '../db.js';
import { requireAuth } from '../lib/auth.js';

const router = express.Router();

router.use(requireAuth);

// 抽卡配置
const GACHA_CONFIG = {
  singleCost: 10,
  multiCost: 100,
  pityThreshold: 90, // 90抽保底五星
  // 概率分布（百分比）
  rates: {
    '五星': 1,
    '四星': 9,
    '三星': 30,
    '普通': 60
  }
};

// 按概率抽取稀有度（不应用保底）
function rollTier() {
  const rand = Math.random() * 100;
  let acc = 0;
  for (const tier of ['五星', '四星', '三星', '普通']) {
    acc += GACHA_CONFIG.rates[tier];
    if (rand < acc) return tier;
  }
  return '普通';
}

// 从指定tier的奖池中随机选一个奖励
function pickRewardFromTier(pool, tier) {
  const candidates = pool.filter(r => r.tier === tier);
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  // 该tier无奖励，降级查找：先向更低稀有度查找，再向更高稀有度查找
  const tierOrder = ['五星', '四星', '三星', '普通'];
  const startIdx = tierOrder.indexOf(tier);
  // 向下查找（更低稀有度，真正的"降级"）
  for (let i = startIdx + 1; i < tierOrder.length; i++) {
    const fallbackPool = pool.filter(r => r.tier === tierOrder[i]);
    if (fallbackPool.length > 0) {
      return fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
    }
  }
  // 向上查找（更高稀有度，仅在降级无果时使用）
  for (let i = startIdx - 1; i >= 0; i--) {
    const fallbackPool = pool.filter(r => r.tier === tierOrder[i]);
    if (fallbackPool.length > 0) {
      return fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
    }
  }
  return null;
}

// 获取家庭抽卡池
async function getGachaPool(client, familyId) {
  const result = await client.query(
    `SELECT id, name, icon, tier FROM rewards
     WHERE family_id = $1 AND is_gacha_pool = true
     ORDER BY tier DESC`,
    [familyId]
  );
  return result.rows;
}

// 抽卡（单抽或十连）
router.post('/draw', async (req, res) => {
  const client = await pool.connect();
  try {
    const memberId = req.member.id;
    const { count = 1 } = req.body;

    if (![1, 10].includes(count)) {
      return res.status(400).json({ success: false, error: '抽卡次数只能是1或10' });
    }

    const cost = count === 10 ? GACHA_CONFIG.multiCost : GACHA_CONFIG.singleCost;

    await client.query('BEGIN');

    // 锁定成员行
    const memberResult = await client.query(
      'SELECT * FROM members WHERE id = $1 FOR UPDATE',
      [memberId]
    );
    if (memberResult.rows.length === 0) {
      throw new Error('成员不存在');
    }
    const member = memberResult.rows[0];

    if (member.current_balls < cost) {
      throw new Error(`粉球不足，需要 ${cost} 个，当前 ${member.current_balls} 个`);
    }

    // 获取家庭抽卡池
    const pool_rewards = await getGachaPool(client, member.family_id);
    if (pool_rewards.length === 0) {
      throw new Error('抽卡池为空，请先添加抽卡奖励');
    }

    // 扣除粉球
    const newBallBalance = member.current_balls - cost;
    await client.query(
      'UPDATE members SET current_balls = $1 WHERE id = $2',
      [newBallBalance, memberId]
    );

    // 记录粉球日志
    await client.query(
      `INSERT INTO ball_logs (member_id, change_type, ball_change, balance_after, remark)
       VALUES ($1, 'use', $2, $3, $4)`,
      [memberId, -cost, newBallBalance, `抽卡${count === 10 ? '十连' : '单抽'}`]
    );

    // 执行抽卡
    let pityCounter = member.gacha_pity_counter || 0;
    const results = [];

    for (let i = 0; i < count; i++) {
      pityCounter++;
      let tier;
      let isGuaranteed = false;

      // 保底机制：达到90抽必出五星
      if (pityCounter >= GACHA_CONFIG.pityThreshold) {
        tier = '五星';
        isGuaranteed = true;
        pityCounter = 0;
      } else {
        tier = rollTier();
        if (tier === '五星') {
          pityCounter = 0;
        }
      }

      const reward = pickRewardFromTier(pool_rewards, tier);
      if (!reward) {
        // 兜底：池子有问题，跳过本次
        continue;
      }

      // 记录抽卡记录
      const recordResult = await client.query(
        `INSERT INTO gacha_records (member_id, reward_id, total_pulls, is_guaranteed)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [memberId, reward.id, count, isGuaranteed]
      );
      const gachaRecordId = recordResult.rows[0].id;

      // 更新宠物收藏（已存在则count+1，否则新增）
      const existing = await client.query(
        `SELECT id, count FROM pet_collections
         WHERE member_id = $1 AND reward_name = $2`,
        [memberId, reward.name]
      );

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE pet_collections
           SET count = count + 1, last_obtained_at = CURRENT_TIMESTAMP,
               gacha_record_id = $2
           WHERE id = $1`,
          [existing.rows[0].id, gachaRecordId]
        );
      } else {
        await client.query(
          `INSERT INTO pet_collections
           (member_id, reward_id, reward_name, reward_icon, reward_tier, gacha_record_id, count)
           VALUES ($1, $2, $3, $4, $5, $6, 1)`,
          [memberId, reward.id, reward.name, reward.icon || '🎁', tier, gachaRecordId]
        );
      }

      results.push({
        name: reward.name,
        icon: reward.icon || '🎁',
        tier,
        isGuaranteed,
        rewardId: reward.id
      });
    }

    // 更新保底计数器
    await client.query(
      'UPDATE members SET gacha_pity_counter = $1 WHERE id = $2',
      [pityCounter, memberId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `抽卡成功，本次共抽中 ${results.length} 个奖励`,
      results,
      cost,
      newBallBalance,
      pityCounter,
      pityThreshold: GACHA_CONFIG.pityThreshold
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('抽卡失败:', error);
    res.status(400).json({ success: false, error: error.message || '抽卡失败' });
  } finally {
    client.release();
  }
});

// 获取抽卡记录
router.get('/records/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { limit = 50 } = req.query;

    if (memberId !== req.member.id && req.member.role !== 'parent') {
      return res.status(403).json({ success: false, error: '无权查看该成员的记录' });
    }

    const result = await pool.query(
      `SELECT gr.*, r.name as reward_name, r.icon as reward_icon, r.tier as reward_tier
       FROM gacha_records gr
       LEFT JOIN rewards r ON gr.reward_id = r.id
       WHERE gr.member_id = $1
       ORDER BY gr.created_at DESC LIMIT $2`,
      [memberId, limit]
    );
    res.json({ success: true, records: result.rows });
  } catch (error) {
    console.error('获取抽卡记录失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 获取宠物收藏
router.get('/pets/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;

    if (memberId !== req.member.id && req.member.role !== 'parent') {
      return res.status(403).json({ success: false, error: '无权查看该成员的收藏' });
    }

    const result = await pool.query(
      `SELECT * FROM pet_collections
       WHERE member_id = $1
       ORDER BY
         CASE reward_tier
           WHEN '五星' THEN 0
           WHEN '四星' THEN 1
           WHEN '三星' THEN 2
           ELSE 3
         END,
         count DESC,
         first_obtained_at DESC`,
      [memberId]
    );
    res.json({ success: true, pets: result.rows });
  } catch (error) {
    console.error('获取宠物收藏失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 获取保底进度
router.get('/pity/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;

    if (memberId !== req.member.id && req.member.role !== 'parent') {
      return res.status(403).json({ success: false, error: '无权查看该成员的保底进度' });
    }

    const result = await pool.query(
      'SELECT gacha_pity_counter FROM members WHERE id = $1',
      [memberId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '成员不存在' });
    }
    const counter = result.rows[0].gacha_pity_counter || 0;
    res.json({
      success: true,
      pityCounter: counter,
      pityThreshold: GACHA_CONFIG.pityThreshold,
      remaining: GACHA_CONFIG.pityThreshold - counter
    });
  } catch (error) {
    console.error('获取保底进度失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

export default router;

import express from 'express';
import pool from '../db.js';
import { generateFamilyCode } from '../models/init.js';

const router = express.Router();

// 创建家庭
router.post('/create', async (req, res) => {
  try {
    const { familyName, memberName, password, role } = req.body;

    // 生成唯一家庭码
    let familyCode;
    let isUnique = false;
    while (!isUnique) {
      familyCode = generateFamilyCode();
      const existing = await pool.query('SELECT id FROM families WHERE family_code = $1', [familyCode]);
      if (existing.rows.length === 0) isUnique = true;
    }

    // 创建家庭
    const familyResult = await pool.query(
      'INSERT INTO families (family_code, name) VALUES ($1, $2) RETURNING *',
      [familyCode, familyName]
    );
    const family = familyResult.rows[0];

    const defaultAvatar = role === 'parent' 
      ? (memberName.includes('妈') || memberName.includes('母') ? '👩' : '👨')
      : (memberName.includes('妹') || memberName.includes('姐') || memberName.includes('女') ? '👧' : '👦');

    const memberResult = await pool.query(
      `INSERT INTO members (family_id, name, role, password, avatar)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, role, current_stickers, current_balls, avatar`,
      [family.id, memberName, role || 'parent', password, defaultAvatar]
    );

    res.json({
      success: true,
      family: { id: family.id, code: family.family_code, name: family.name },
      member: memberResult.rows[0]
    });
  } catch (error) {
    console.error('创建家庭失败:', error);
    res.status(500).json({ success: false, error: '创建失败' });
  }
});

// 加入家庭
router.post('/join', async (req, res) => {
  try {
    const { familyCode, familyName, memberName, password, role } = req.body;

    // 查找家庭（优先用家庭码，也可用家庭名称）
    let familyResult;
    if (familyCode) {
      familyResult = await pool.query(
        'SELECT * FROM families WHERE family_code = $1',
        [familyCode.toUpperCase()]
      );
    } else if (familyName) {
      familyResult = await pool.query(
        'SELECT * FROM families WHERE name = $1',
        [familyName]
      );
    }

    if (!familyResult || familyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '家庭不存在' });
    }

    const family = familyResult.rows[0];

    // 检查成员数量
    const memberCount = await pool.query(
      'SELECT COUNT(*) FROM members WHERE family_id = $1',
      [family.id]
    );

    if (parseInt(memberCount.rows[0].count) >= 10) {
      return res.status(400).json({ success: false, error: '家庭成员已满（最多10人）' });
    }

    const defaultAvatar = role === 'parent' 
      ? (memberName.includes('妈') || memberName.includes('母') ? '👩' : '👨')
      : (memberName.includes('妹') || memberName.includes('姐') || memberName.includes('女') ? '👧' : '👦');

    const memberResult = await pool.query(
      `INSERT INTO members (family_id, name, role, password, avatar)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, role, current_stickers, current_balls, avatar`,
      [family.id, memberName, role || 'child', password, defaultAvatar]
    );

    res.json({
      success: true,
      family: { id: family.id, code: family.family_code, name: family.name },
      member: memberResult.rows[0]
    });
  } catch (error) {
    console.error('加入家庭失败:', error);
    res.status(500).json({ success: false, error: '加入失败' });
  }
});

// 登录（支持多种方式）
router.post('/login', async (req, res) => {
  try {
    const { memberName, familyName, password, familyCode } = req.body;

    // 方式1: 按家庭名称 + 成员名称 + 密码登录
    if (familyName && memberName && password) {
      const result = await pool.query(
        `SELECT m.* FROM members m
         JOIN families f ON m.family_id = f.id
         WHERE f.name = $1 AND m.name = $2 AND m.password = $3`,
        [familyName, memberName, password]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, error: '登录信息错误' });
      }

      const member = result.rows[0];

      // 获取家庭信息
      const familyResult = await pool.query(
        'SELECT * FROM families WHERE id = $1',
        [member.family_id]
      );

      return res.json({
        success: true,
        member: {
          id: member.id,
          name: member.name,
          role: member.role,
          current_stickers: member.current_stickers,
          current_balls: member.current_balls,
          total_stickers: member.total_stickers,
          total_balls: member.total_balls,
          avatar: member.avatar
        },
        family: familyResult.rows[0]
      });
    }
    
    // 方式2: 按家庭码 + 成员名称 + 密码登录
    if (familyCode && memberName && password) {
      const result = await pool.query(
        `SELECT m.* FROM members m
         JOIN families f ON m.family_id = f.id
         WHERE f.family_code = $1 AND m.name = $2 AND m.password = $3`,
        [familyCode.toUpperCase(), memberName, password]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, error: '登录信息错误' });
      }

      const member = result.rows[0];

      // 获取家庭信息
      const familyResult = await pool.query(
        'SELECT * FROM families WHERE id = $1',
        [member.family_id]
      );

      return res.json({
        success: true,
        member: {
          id: member.id,
          name: member.name,
          role: member.role,
          current_stickers: member.current_stickers,
          current_balls: member.current_balls,
          total_stickers: member.total_stickers,
          total_balls: member.total_balls,
          avatar: member.avatar
        },
        family: familyResult.rows[0]
      });
    }

    return res.status(400).json({ success: false, error: '请提供登录信息' });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ success: false, error: '登录失败' });
  }
});

// 通过 memberId + password 登录
router.post('/login-by-id', async (req, res) => {
  try {
    const { memberId, password } = req.body;

    if (!memberId || !password) {
      return res.status(400).json({ success: false, error: '请提供完整信息' });
    }

    const result = await pool.query(
      'SELECT * FROM members WHERE id = $1 AND password = $2',
      [memberId, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: '密码错误' });
    }

    const member = result.rows[0];

    const familyResult = await pool.query(
      'SELECT * FROM families WHERE id = $1',
      [member.family_id]
    );

    return res.json({
      success: true,
      member: {
        id: member.id,
        name: member.name,
        role: member.role,
        current_stickers: member.current_stickers,
        current_balls: member.current_balls,
        total_stickers: member.total_stickers,
        total_balls: member.total_balls,
        avatar: member.avatar
      },
      family: familyResult.rows[0]
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ success: false, error: '登录失败' });
  }
});

// 通过家庭码查询家庭信息和成员列表（公开接口，不含敏感信息）
router.get('/lookup/:familyCode', async (req, res) => {
  try {
    const { familyCode } = req.params;

    const familyResult = await pool.query(
      'SELECT id, family_code, name, created_at FROM families WHERE family_code = $1',
      [familyCode.toUpperCase()]
    );

    if (familyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '家庭不存在' });
    }

    const family = familyResult.rows[0];

    const membersResult = await pool.query(
      'SELECT id, name, role, created_at FROM members WHERE family_id = $1 ORDER BY created_at',
      [family.id]
    );

    res.json({
      success: true,
      family: {
        id: family.id,
        code: family.family_code,
        name: family.name
      },
      members: membersResult.rows
    });
  } catch (error) {
    console.error('查询家庭失败:', error);
    res.status(500).json({ success: false, error: '查询失败' });
  }
});

// 获取家庭成员列表
router.get('/:familyId/members', async (req, res) => {
  try {
    const { familyId } = req.params;
    const result = await pool.query(
      `SELECT id, name, role, current_stickers, current_balls, total_stickers, total_balls, created_at
       FROM members WHERE family_id = $1 ORDER BY created_at`,
      [familyId]
    );
    res.json({ success: true, members: result.rows });
  } catch (error) {
    console.error('获取成员失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 一键清除家庭数据（保留家庭和成员，清除所有配置和记录）
router.post('/:familyId/reset', async (req, res) => {
  try {
    const { familyId } = req.params;
    const { operatorId, password } = req.body;

    if (!operatorId || !password) {
      return res.status(400).json({ success: false, error: '请提供操作者信息和密码' });
    }

    const operatorResult = await pool.query(
      'SELECT role, password FROM members WHERE id = $1 AND family_id = $2',
      [operatorId, familyId]
    );

    if (operatorResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '操作者不存在' });
    }

    const operator = operatorResult.rows[0];
    if (operator.role !== 'parent') {
      return res.status(403).json({ success: false, error: '只有家长可以执行此操作' });
    }
    if (operator.password !== password) {
      return res.status(401).json({ success: false, error: '密码错误' });
    }

    const familyResult = await pool.query('SELECT id FROM families WHERE id = $1', [familyId]);
    if (familyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '家庭不存在' });
    }

    const taskIdsResult = await pool.query('SELECT id FROM tasks WHERE family_id = $1', [familyId]);
    const taskIds = taskIdsResult.rows.map(r => r.id);
    const memberIdsResult = await pool.query('SELECT id FROM members WHERE family_id = $1', [familyId]);
    const memberIds = memberIdsResult.rows.map(r => r.id);
    const rewardIdsResult = await pool.query('SELECT id FROM rewards WHERE family_id = $1', [familyId]);
    const rewardIds = rewardIdsResult.rows.map(r => r.id);

    if (taskIds.length > 0) {
      const placeholders = taskIds.map((_, i) => `$${i + 1}`).join(',');
      await pool.query(`DELETE FROM task_completions WHERE task_id IN (${placeholders})`, taskIds);
    }
    if (memberIds.length > 0) {
      const placeholders = memberIds.map((_, i) => `$${i + 1}`).join(',');
      await pool.query(`DELETE FROM sticker_logs WHERE member_id IN (${placeholders})`, memberIds);
      await pool.query(`DELETE FROM ball_logs WHERE member_id IN (${placeholders})`, memberIds);
      await pool.query(`DELETE FROM gacha_records WHERE member_id IN (${placeholders})`, memberIds);
    }
    await pool.query('DELETE FROM applications WHERE family_id = $1', [familyId]);
    if (rewardIds.length > 0) {
      const placeholders = rewardIds.map((_, i) => `$${i + 1}`).join(',');
      await pool.query(`DELETE FROM reward_exchanges WHERE reward_id IN (${placeholders})`, rewardIds);
    }
    await pool.query('DELETE FROM tasks WHERE family_id = $1', [familyId]);
    await pool.query('DELETE FROM rewards WHERE family_id = $1', [familyId]);

    await pool.query(
      `UPDATE members SET current_stickers = 0, total_stickers = 0, current_balls = 0, total_balls = 0, gacha_pity_counter = 0
       WHERE family_id = $1`,
      [familyId]
    );

    res.json({ success: true, message: '家庭数据已清除' });
  } catch (error) {
    console.error('清除家庭数据失败:', error);
    res.status(500).json({ success: false, error: '清除失败' });
  }
});

// 彻底删除家庭
router.delete('/:familyId', async (req, res) => {
  try {
    const { familyId } = req.params;
    const { operatorId, password } = req.body;

    if (!operatorId || !password) {
      return res.status(400).json({ success: false, error: '请提供操作者信息和密码' });
    }

    const operatorResult = await pool.query(
      'SELECT role, password FROM members WHERE id = $1 AND family_id = $2',
      [operatorId, familyId]
    );

    if (operatorResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '操作者不存在' });
    }

    const operator = operatorResult.rows[0];
    if (operator.role !== 'parent') {
      return res.status(403).json({ success: false, error: '只有家长可以执行此操作' });
    }
    if (operator.password !== password) {
      return res.status(401).json({ success: false, error: '密码错误' });
    }

    const familyResult = await pool.query('SELECT id FROM families WHERE id = $1', [familyId]);
    if (familyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '家庭不存在' });
    }

    const taskIdsResult = await pool.query('SELECT id FROM tasks WHERE family_id = $1', [familyId]);
    const taskIds = taskIdsResult.rows.map(r => r.id);
    const memberIdsResult = await pool.query('SELECT id FROM members WHERE family_id = $1', [familyId]);
    const memberIds = memberIdsResult.rows.map(r => r.id);
    const rewardIdsResult = await pool.query('SELECT id FROM rewards WHERE family_id = $1', [familyId]);
    const rewardIds = rewardIdsResult.rows.map(r => r.id);

    if (taskIds.length > 0) {
      const placeholders = taskIds.map((_, i) => `$${i + 1}`).join(',');
      await pool.query(`DELETE FROM task_completions WHERE task_id IN (${placeholders})`, taskIds);
    }
    if (memberIds.length > 0) {
      const placeholders = memberIds.map((_, i) => `$${i + 1}`).join(',');
      await pool.query(`DELETE FROM sticker_logs WHERE member_id IN (${placeholders})`, memberIds);
      await pool.query(`DELETE FROM ball_logs WHERE member_id IN (${placeholders})`, memberIds);
      await pool.query(`DELETE FROM gacha_records WHERE member_id IN (${placeholders})`, memberIds);
    }
    await pool.query('DELETE FROM applications WHERE family_id = $1', [familyId]);
    if (rewardIds.length > 0) {
      const placeholders = rewardIds.map((_, i) => `$${i + 1}`).join(',');
      await pool.query(`DELETE FROM reward_exchanges WHERE reward_id IN (${placeholders})`, rewardIds);
    }
    await pool.query('DELETE FROM tasks WHERE family_id = $1', [familyId]);
    await pool.query('DELETE FROM rewards WHERE family_id = $1', [familyId]);
    await pool.query('DELETE FROM members WHERE family_id = $1', [familyId]);
    await pool.query('DELETE FROM families WHERE id = $1', [familyId]);

    res.json({ success: true, message: '家庭已删除' });
  } catch (error) {
    console.error('删除家庭失败:', error);
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

export default router;

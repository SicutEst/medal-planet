import express from 'express';
import pool, { isMemoryDb } from '../db.js';
import { generateFamilyCode } from '../models/init.js';
import { signToken, requireAuth, requireParent } from '../lib/auth.js';
import { hashPassword, verifyPassword, needsRehash } from '../lib/password.js';
import { rateLimit } from '../lib/ratelimit.js';

const router = express.Router();

// 登录/注册类接口限流（防爆破）
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: req => `${req.ip}:${req.body?.memberName || req.body?.memberId || ''}`,
});
const lookupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyFn: req => req.ip });

// 头像改为前端头像池（Fluent 3D）后不再预置；未选择时前端按称呼猜 emoji 兜底
function defaultAvatar() {
  return null;
}

// 输出成员信息前剥离密码等敏感字段（不依赖 SQL RETURNING 的列过滤）
function publicMember(member) {
  if (!member) return member;
  const { password, ...rest } = member;
  return rest;
}

// 校验注册/登录公共输入
function validateCredentials(memberName, password, role) {
  if (!memberName || typeof memberName !== 'string' || memberName.trim().length === 0 || memberName.length > 50) {
    return '成员昵称需为 1-50 个字符';
  }
  if (!password || typeof password !== 'string' || password.length < 4 || password.length > 100) {
    return '密码需为 4-100 个字符';
  }
  if (role && !['parent', 'child'].includes(role)) {
    return '角色只能是 parent 或 child';
  }
  return null;
}

// 创建家庭
router.post('/create', authLimiter, async (req, res) => {
  try {
    const { familyName, memberName, password, role } = req.body;
    if (!familyName || typeof familyName !== 'string' || familyName.trim().length === 0 || familyName.length > 50) {
      return res.status(400).json({ success: false, error: '家庭名称需为 1-50 个字符' });
    }
    const inputError = validateCredentials(memberName, password, role || 'parent');
    if (inputError) {
      return res.status(400).json({ success: false, error: inputError });
    }
    const finalRole = role || 'parent';

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
      [familyCode, familyName.trim()]
    );
    const family = familyResult.rows[0];

    const memberResult = await pool.query(
      `INSERT INTO members (family_id, name, role, password, avatar)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, role, current_stickers, current_balls, avatar`,
      [family.id, memberName.trim(), finalRole, hashPassword(password), defaultAvatar(finalRole, memberName)]
    );
    const member = memberResult.rows[0];

    res.json({
      success: true,
      token: signToken({ id: member.id, role: member.role, family_id: family.id }),
      family: { id: family.id, code: family.family_code, name: family.name },
      member: publicMember(member)
    });
  } catch (error) {
    console.error('创建家庭失败:', error);
    res.status(500).json({ success: false, error: '创建失败' });
  }
});

// 加入家庭（仅支持家庭码，避免同名家庭串号）
router.post('/join', authLimiter, async (req, res) => {
  try {
    const { familyCode, memberName, password, role } = req.body;
    if (!familyCode) {
      return res.status(400).json({ success: false, error: '请提供家庭码' });
    }
    const inputError = validateCredentials(memberName, password, role || 'child');
    if (inputError) {
      return res.status(400).json({ success: false, error: inputError });
    }
    const finalRole = role || 'child';

    const familyResult = await pool.query(
      'SELECT * FROM families WHERE family_code = $1',
      [String(familyCode).toUpperCase()]
    );
    if (familyResult.rows.length === 0) {
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

    // 同家庭内成员昵称不可重复（登录按昵称+密码匹配）
    const dupResult = await pool.query(
      'SELECT id FROM members WHERE family_id = $1 AND name = $2',
      [family.id, memberName.trim()]
    );
    if (dupResult.rows.length > 0) {
      return res.status(400).json({ success: false, error: '该家庭内已有同名成员，请换一个昵称' });
    }

    const memberResult = await pool.query(
      `INSERT INTO members (family_id, name, role, password, avatar)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, role, current_stickers, current_balls, avatar`,
      [family.id, memberName.trim(), finalRole, hashPassword(password), defaultAvatar(finalRole, memberName)]
    );
    const member = memberResult.rows[0];

    res.json({
      success: true,
      token: signToken({ id: member.id, role: member.role, family_id: family.id }),
      family: { id: family.id, code: family.family_code, name: family.name },
      member: publicMember(member)
    });
  } catch (error) {
    console.error('加入家庭失败:', error);
    res.status(500).json({ success: false, error: '加入失败' });
  }
});

// 登录（家庭码或家庭名 + 成员昵称 + 密码）
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { memberName, familyName, familyCode, password } = req.body;
    if (!memberName || !password || (!familyName && !familyCode)) {
      return res.status(400).json({ success: false, error: '请提供登录信息' });
    }

    let result;
    if (familyCode) {
      result = await pool.query(
        `SELECT m.* FROM members m
         JOIN families f ON m.family_id = f.id
         WHERE f.family_code = $1 AND m.name = $2`,
        [String(familyCode).toUpperCase(), memberName.trim()]
      );
    } else {
      result = await pool.query(
        `SELECT m.* FROM members m
         JOIN families f ON m.family_id = f.id
         WHERE f.name = $1 AND m.name = $2`,
        [familyName, memberName.trim()]
      );
    }

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: '登录信息错误' });
    }

    const member = result.rows[0];
    if (!verifyPassword(password, member.password)) {
      return res.status(401).json({ success: false, error: '登录信息错误' });
    }

    // 旧明文密码透明升级为哈希
    if (needsRehash(member.password)) {
      await pool.query('UPDATE members SET password = $1 WHERE id = $2', [hashPassword(password), member.id]);
    }

    const familyResult = await pool.query('SELECT * FROM families WHERE id = $1', [member.family_id]);

    return res.json({
      success: true,
      token: signToken(member),
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

// 通过 memberId + password 登录（扫历史登录记录快捷登录用）
router.post('/login-by-id', authLimiter, async (req, res) => {
  try {
    const { memberId, password } = req.body;
    if (!memberId || !password) {
      return res.status(400).json({ success: false, error: '请提供完整信息' });
    }

    const result = await pool.query('SELECT * FROM members WHERE id = $1', [memberId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: '密码错误' });
    }

    const member = result.rows[0];
    if (!verifyPassword(password, member.password)) {
      return res.status(401).json({ success: false, error: '密码错误' });
    }

    if (needsRehash(member.password)) {
      await pool.query('UPDATE members SET password = $1 WHERE id = $2', [hashPassword(password), member.id]);
    }

    const familyResult = await pool.query('SELECT * FROM families WHERE id = $1', [member.family_id]);

    return res.json({
      success: true,
      token: signToken(member),
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

// 通过家庭码查询家庭信息和成员列表（公开接口，仅含昵称与角色）
router.get('/lookup/:familyCode', lookupLimiter, async (req, res) => {
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
      'SELECT name, role, created_at FROM members WHERE family_id = $1 ORDER BY created_at',
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

// 获取家庭成员列表（同家庭可见）
router.get('/:familyId/members', requireAuth, async (req, res) => {
  try {
    const { familyId } = req.params;
    if (familyId !== req.member.family_id) {
      return res.status(403).json({ success: false, error: '无权访问该家庭' });
    }
    const result = await pool.query(
      `SELECT id, name, role, avatar, current_stickers, current_balls, total_stickers, total_balls, created_at
       FROM members WHERE family_id = $1 ORDER BY created_at`,
      [familyId]
    );
    res.json({ success: true, members: result.rows });
  } catch (error) {
    console.error('获取成员失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 清除家庭下所有成员的账目与记录（保留家庭和成员），须在事务内调用
async function clearFamilyData(client, familyId) {
  const memberIdsResult = await client.query('SELECT id FROM members WHERE family_id = $1', [familyId]);
  const memberIds = memberIdsResult.rows.map(r => r.id);

  for (const mid of memberIds) {
    await client.query('DELETE FROM sticker_logs WHERE member_id = $1', [mid]);
    await client.query('DELETE FROM ball_logs WHERE member_id = $1', [mid]);
    await client.query('DELETE FROM gacha_records WHERE member_id = $1', [mid]);
    await client.query('DELETE FROM pet_collections WHERE member_id = $1', [mid]);
    await client.query('DELETE FROM task_completions WHERE member_id = $1', [mid]);
    await client.query('DELETE FROM applications WHERE applicant_id = $1', [mid]);
    await client.query('DELETE FROM reward_exchanges WHERE member_id = $1', [mid]);
  }

  await client.query('DELETE FROM tasks WHERE family_id = $1', [familyId]);
  await client.query('DELETE FROM rewards WHERE family_id = $1', [familyId]);
  await client.query(
    `UPDATE members SET current_stickers = 0, total_stickers = 0, current_balls = 0, total_balls = 0, gacha_pity_counter = 0
     WHERE family_id = $1`,
    [familyId]
  );
}

// 校验家长密码复核（重置/删除家庭等高危操作）
async function verifyParentPassword(req, familyId, password) {
  const operatorResult = await pool.query(
    'SELECT id, role, password FROM members WHERE id = $1 AND family_id = $2',
    [req.member.id, familyId]
  );
  if (operatorResult.rows.length === 0) {
    return { error: '操作者不存在', code: 404 };
  }
  const operator = operatorResult.rows[0];
  if (!password || !verifyPassword(password, operator.password)) {
    return { error: '密码错误', code: 401 };
  }
  return {};
}

// 一键清除家庭数据（保留家庭和成员，清除所有配置和记录）
router.post('/:familyId/reset', requireAuth, requireParent, async (req, res) => {
  const client = await pool.connect();
  try {
    const { familyId } = req.params;
    if (familyId !== req.member.family_id) {
      return res.status(403).json({ success: false, error: '无权操作该家庭' });
    }
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: '请提供密码' });
    }

    const familyResult = await pool.query('SELECT id FROM families WHERE id = $1', [familyId]);
    if (familyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '家庭不存在' });
    }

    const check = await verifyParentPassword(req, familyId, password);
    if (check.error) {
      return res.status(check.code).json({ success: false, error: check.error });
    }

    await client.query('BEGIN');
    await clearFamilyData(client, familyId);
    await client.query('COMMIT');

    res.json({ success: true, message: '家庭数据已清除' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('清除家庭数据失败:', error);
    res.status(500).json({ success: false, error: '清除失败' });
  } finally {
    client.release();
  }
});

// 彻底删除家庭
router.delete('/:familyId', requireAuth, requireParent, async (req, res) => {
  const client = await pool.connect();
  try {
    const { familyId } = req.params;
    if (familyId !== req.member.family_id) {
      return res.status(403).json({ success: false, error: '无权操作该家庭' });
    }
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: '请提供密码' });
    }

    const familyResult = await pool.query('SELECT id FROM families WHERE id = $1', [familyId]);
    if (familyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '家庭不存在' });
    }

    const check = await verifyParentPassword(req, familyId, password);
    if (check.error) {
      return res.status(check.code).json({ success: false, error: check.error });
    }

    await client.query('BEGIN');
    if (isMemoryDb) {
      // 内存库没有外键级联，手动按序清理
      await clearFamilyData(client, familyId);
      const memberIdsResult = await client.query('SELECT id FROM members WHERE family_id = $1', [familyId]);
      for (const row of memberIdsResult.rows) {
        await client.query('DELETE FROM members WHERE id = $1', [row.id]);
      }
      await client.query('DELETE FROM families WHERE id = $1', [familyId]);
    } else {
      // PostgreSQL：所有子表外键均为 CASCADE/SET NULL，删除家庭即可级联清理
      await client.query('DELETE FROM families WHERE id = $1', [familyId]);
    }
    await client.query('COMMIT');

    res.json({ success: true, message: '家庭已删除' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('删除家庭失败:', error);
    res.status(500).json({ success: false, error: '删除失败' });
  } finally {
    client.release();
  }
});

export default router;

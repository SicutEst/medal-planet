import express from 'express';
import pool from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

const router = express.Router();

// 获取成员信息（本人或同家庭家长）
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT m.id, m.name, m.role, m.family_id, m.avatar,
              m.current_stickers, m.current_balls, m.total_stickers, m.total_balls,
              f.name as family_name, f.family_code
       FROM members m
       JOIN families f ON m.family_id = f.id
       WHERE m.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '成员不存在' });
    }

    const member = result.rows[0];
    if (member.family_id !== req.member.family_id) {
      return res.status(403).json({ success: false, error: '无权访问该成员' });
    }

    res.json({ success: true, member });
  } catch (error) {
    console.error('获取成员失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 更新自己的资料（昵称/头像/密码）；改密码必须提供旧密码
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (id !== req.member.id) {
      return res.status(403).json({ success: false, error: '只能修改自己的信息' });
    }

    const { name, avatar, password, oldPassword } = req.body;
    if (!name && avatar === undefined && !password) {
      return res.status(400).json({ success: false, error: '没有要更新的字段' });
    }

    let passwordHash = null;
    if (password) {
      const currentResult = await pool.query('SELECT password FROM members WHERE id = $1', [id]);
      if (currentResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: '成员不存在' });
      }
      if (!oldPassword || !verifyPassword(oldPassword, currentResult.rows[0].password)) {
        return res.status(401).json({ success: false, error: '旧密码错误' });
      }
      if (typeof password !== 'string' || password.length < 4 || password.length > 100) {
        return res.status(400).json({ success: false, error: '新密码需为 4-100 个字符' });
      }
      passwordHash = hashPassword(password);
    }

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0 || name.length > 50)) {
      return res.status(400).json({ success: false, error: '昵称需为 1-50 个字符' });
    }

    // 头像存头像池 id 或旧版 emoji 字符，超长一律拒绝
    if (avatar !== undefined && avatar !== null && (typeof avatar !== 'string' || avatar.length > 100)) {
      return res.status(400).json({ success: false, error: '头像格式不正确' });
    }

    const result = await pool.query(
      `UPDATE members SET
        name = COALESCE($1, name),
        avatar = COALESCE($2, avatar),
        password = COALESCE($3, password)
       WHERE id = $4
       RETURNING id, name, role, family_id, avatar, current_stickers, current_balls, total_stickers, total_balls`,
      [name ? name.trim() : null, avatar !== undefined ? avatar : null, passwordHash, id]
    );

    res.json({ success: true, member: result.rows[0] });
  } catch (error) {
    console.error('更新成员失败:', error);
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

export default router;

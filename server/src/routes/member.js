import express from 'express';
import pool from '../db.js';

const router = express.Router();

// 获取成员信息
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT m.*, f.name as family_name, f.family_code
       FROM members m
       JOIN families f ON m.family_id = f.id
       WHERE m.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: '成员不存在' });
    }

    const member = result.rows[0];
    res.json({
      success: true,
      member: {
        id: member.id,
        name: member.name,
        role: member.role,
        family_id: member.family_id,
        family_name: member.family_name,
        family_code: member.family_code,
        current_stickers: member.current_stickers,
        current_balls: member.current_balls,
        total_stickers: member.total_stickers,
        total_balls: member.total_balls,
        avatar: member.avatar
      }
    });
  } catch (error) {
    console.error('获取成员失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 更新成员（密码等）
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, password, avatar } = req.body;

    let query = 'UPDATE members SET';
    const updates = [];
    const values = [];

    if (name) {
      updates.push(` name = $${updates.length + 1}`);
      values.push(name);
    }
    if (password) {
      updates.push(` password = $${updates.length + 1}`);
      values.push(password);
    }
    if (avatar !== undefined) {
      updates.push(` avatar = $${updates.length + 1}`);
      values.push(avatar);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: '没有要更新的字段' });
    }

    values.push(id);
    query += updates.join(',') + ` WHERE id = $${values.length} RETURNING *`;

    const result = await pool.query(query, values);
    res.json({ success: true, member: result.rows[0] });
  } catch (error) {
    console.error('更新成员失败:', error);
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

export default router;

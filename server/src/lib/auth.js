import jwt from 'jsonwebtoken';
import pool from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const TOKEN_EXPIRES = '90d';

export function signToken(member) {
  return jwt.sign(
    { sub: member.id, role: member.role, familyId: member.family_id },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES }
  );
}

// 从 Authorization: Bearer <token> 解析身份并挂到 req.member
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      return res.status(401).json({ success: false, error: '未登录' });
    }
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
    }
    const result = await pool.query(
      'SELECT id, family_id, name, role FROM members WHERE id = $1',
      [payload.sub]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: '账号不存在' });
    }
    req.member = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

export function requireParent(req, res, next) {
  if (!req.member || req.member.role !== 'parent') {
    return res.status(403).json({ success: false, error: '仅家长可执行此操作' });
  }
  next();
}

// 校验目标成员存在且与当前用户同家庭，且当前用户是本人或本家庭家长
// 通过返回成员行，否则返回 null
export async function assertMemberAccess(req, memberId) {
  if (!memberId) return null;
  const result = await pool.query(
    'SELECT id, family_id, role FROM members WHERE id = $1',
    [memberId]
  );
  if (result.rows.length === 0) return null;
  const target = result.rows[0];
  if (target.family_id !== req.member.family_id) return null;
  if (target.id !== req.member.id && req.member.role !== 'parent') return null;
  return target;
}

import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

const familyId = db.tables.families[0].id;
const memberId = db.tables.members[1].id;
const today = new Date().toISOString().split('T')[0];

// 测试1: 简单多条件
console.log('=== Test 1: Simple WHERE with AND ===');
const sql1 = `SELECT * FROM tasks WHERE family_id = '${familyId}' AND is_active = true`;
const r1 = await db.query(sql1, []);
console.log('Count:', r1.rows.length);
console.log('First name:', r1.rows[0]?.name);
console.log('');

// 测试2: 带表别名
console.log('=== Test 2: With table alias t. ===');
const sql2 = `SELECT t.* FROM tasks t WHERE t.family_id = '${familyId}' AND t.is_active = true`;
const r2 = await db.query(sql2, []);
console.log('Count:', r2.rows.length);
console.log('First name:', r2.rows[0]?.name);
console.log('First keys:', Object.keys(r2.rows[0] || {}).length);
console.log('');

// 测试3: 带子查询和 t.*
console.log('=== Test 3: With subquery and t.* ===');
const sql3 = `
  SELECT t.*,
    (SELECT COUNT(*) FROM task_completions tc
     WHERE tc.task_id = t.id AND tc.member_id = '${memberId}' AND tc.completed_date = '${today}') as is_completed_today
  FROM tasks t
  WHERE t.family_id = '${familyId}' AND t.is_active = true AND t.category IN ('habit', 'bad_habit')
  ORDER BY t.created_at
`;
const r3 = await db.query(sql3, []);
console.log('Count:', r3.rows.length);
console.log('First name:', r3.rows[0]?.name);
console.log('First is_completed_today:', r3.rows[0]?.is_completed_today);
console.log('First keys:', Object.keys(r3.rows[0] || {}).join(', '));

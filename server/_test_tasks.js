import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

const familyId = db.tables.families[0].id;
const memberId = db.tables.members[1].id;

// 模拟今日任务的 SQL（简化版，带子查询和 t.*）
const sql = `
  SELECT t.*,
    (SELECT COUNT(*) FROM task_completions tc
     WHERE tc.task_id = t.id AND tc.member_id = '${memberId}' AND tc.completed_date = '2026-07-05') as is_completed_today
  FROM tasks t
  WHERE t.family_id = '${familyId}' AND t.is_active = true AND t.category IN ('habit', 'bad_habit')
  ORDER BY t.created_at
`;

console.log('SQL:', sql.substring(0, 100) + '...');
console.log('');

const result = await db.query(sql, []);
console.log('Result count:', result.rows.length);
console.log('First row keys:', Object.keys(result.rows[0] || {}));
console.log('First row:', JSON.stringify(result.rows[0], null, 2));
console.log('First row name:', result.rows[0]?.name);

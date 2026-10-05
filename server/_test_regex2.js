import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

const familyId = db.tables.families[0].id;
const memberId = db.tables.members[1].id;
const today = new Date().toISOString().split('T')[0];

const sql = `
  SELECT t.*,
    (SELECT COUNT(*) FROM task_completions tc
     WHERE tc.task_id = t.id AND tc.member_id = '${memberId}' AND tc.completed_date = '${today}') as is_completed_today
  FROM tasks t
  WHERE t.family_id = '${familyId}' AND t.is_active = true AND t.category IN ('habit', 'bad_habit')
  ORDER BY t.created_at
`;

const filled = sql;
console.log('SQL length:', filled.length);

// 测试 FROM
const fromMatch = filled.match(/FROM\s+(\w+)/i);
console.log('FROM match:', fromMatch ? fromMatch[1] : 'NULL');

// 测试 WHERE
const whereMatch = filled.match(/WHERE\s+(.+?)(?=\s+(?:GROUP|ORDER|LIMIT)|$)/i);
console.log('WHERE match:', whereMatch ? whereMatch[1].substring(0, 60) + '...' : 'NULL');

// 测试 ORDER BY
const orderMatch = filled.match(/ORDER\s+BY\s+(.+?)(?=\s+(?:LIMIT|$))/i);
console.log('ORDER match:', orderMatch ? orderMatch[1] : 'NULL');

// 测试 SELECT
const selectMatch = filled.match(/SELECT\s+(.+?)\s+FROM\s/i);
console.log('SELECT match:', selectMatch ? selectMatch[1].substring(0, 40) + '...' : 'NULL');

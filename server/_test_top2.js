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
const topSql = db._getTopLevelSql(filled);
console.log('Top SQL:');
console.log(topSql);
console.log('');

// FROM
const fromMatch = topSql.match(/FROM\s+(\w+)/i);
console.log('FROM match:', fromMatch ? fromMatch[1] : 'NULL');

// WHERE
const whereMatch = topSql.match(/WHERE\s+(.+?)(?=\s+(?:GROUP|ORDER|LIMIT)|$)/i);
console.log('WHERE match:', whereMatch ? whereMatch[1].substring(0, 80) + '...' : 'NULL');

// ORDER BY
const orderMatch = topSql.match(/ORDER\s+BY\s+(.+?)(?=\s+(?:LIMIT|$))/i);
console.log('ORDER match:', orderMatch ? orderMatch[1] : 'NULL');

// SELECT
const selectMatch = topSql.match(/SELECT\s+(.+?)\s+FROM\s/i);
console.log('SELECT match:', selectMatch ? selectMatch[1].substring(0, 40) + '...' : 'NULL');
console.log('');

// 恢复 WHERE
if (whereMatch) {
  const restored = db._restoreSubquery(whereMatch[1].trim(), filled);
  console.log('Restored WHERE:', restored.substring(0, 80));
}

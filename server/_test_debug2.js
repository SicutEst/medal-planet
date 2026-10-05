import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

const childId = db.tables.members[1].id;
const sql = `SELECT * FROM members WHERE id = '${childId}'`;
console.log('SQL:', sql);

// 手动模拟 _execSelect
const filled = sql;
const fromMatch = filled.match(/FROM\s+(\w+)/i);
console.log('fromMatch:', fromMatch ? fromMatch[1] : 'NULL');

const whereMatch = filled.match(/WHERE\s+(.+?)(?=\s+(?:GROUP|ORDER|LIMIT)|$)/i);
console.log('whereMatch:', whereMatch ? whereMatch[1] : 'NULL');

let rows = [...db.tables.members];
console.log('rows before filter:', rows.length);

const whereClause = whereMatch ? whereMatch[1].trim() : null;
console.log('whereClause:', whereClause);

if (whereClause) {
  const before = rows.length;
  rows = rows.filter(row => {
    const result = db._evalCondition(whereClause, row);
    console.log('  row', row.name, '->', result);
    return result;
  });
  console.log('rows after filter:', rows.length, '(was ' + before + ')');
}

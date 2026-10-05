import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

const childId = db.tables.members[1].id;
const sql = `SELECT * FROM members WHERE id = '${childId}'`;
const filled = sql;

// 原代码
const fromMatch = filled.match(/FROM\s+(\w+)/i);
const tableName = fromMatch[1];
const table = db.tables[tableName] || [];
console.log('table:', tableName, 'rows:', table.length);

const joinMatches = [...filled.matchAll(/JOIN\s+(\w+)\s+(?:\w+\s+)?ON\s+(.+?)(?=\s+(?:WHERE|GROUP|ORDER|LIMIT|JOIN|$))/gi)];
console.log('joinMatches count:', joinMatches.length);

const whereMatch = filled.match(/WHERE\s+(.+?)(?=\s+(?:GROUP|ORDER|LIMIT)|$)/i);
console.log('whereMatch:', whereMatch ? whereMatch[1] : 'NULL');

let rows = [...table];
console.log('initial rows:', rows.length);

// 原代码中的 join 循环
for (const join of joinMatches.map(m => ({
  table: m[1],
  on: m[2].trim()
}))) {
  console.log('processing join:', join);
}

const whereClause = whereMatch ? whereMatch[1].trim() : null;
console.log('whereClause:', whereClause);

if (whereClause) {
  console.log('applying where...');
  rows = rows.filter(row => db._evalCondition(whereClause, row));
  console.log('rows after where:', rows.length);
}

// 现在直接调 _execSelect
console.log('\n--- calling _execSelect ---');
const r = db._execSelect(filled, []);
console.log('_execSelect result:', r.length, r[0]?.name);

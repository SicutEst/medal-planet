import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

const childId = db.tables.members[1].id;

// 测试1: 直接调 query
const sql = `SELECT * FROM members WHERE id = '${childId}'`;
console.log('SQL:', sql);
const result = await db.query(sql, []);
console.log('query result count:', result.rows.length);
console.log('query result name:', result.rows[0]?.name);

// 测试2: 手动 _execute
console.log('\n--- _execute directly:');
const r2 = db._execute(sql, []);
console.log('_execute count:', r2.length, r2[0]?.name);

// 测试3: 看 _param 后的 SQL
console.log('\n--- _param result:');
const parammed = db._param(sql, []);
console.log('_param:', parammed);
console.log('same as input?', parammed === sql);

// 测试4: SELECT 检测
console.log('\n--- SELECT test:');
console.log('starts with SELECT?', /^SELECT\s/i.test(sql.trim()));

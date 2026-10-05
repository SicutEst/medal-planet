import pool from './src/db-memory.js';

const db = pool._db;

db.tables.members.push({
  id: 'test-id-123',
  name: '小明',
  password: '123456',
  role: 'child',
  current_stickers: 100,
  current_balls: 2,
});

const sql = "SELECT * FROM members WHERE id = 'test-id-123'";
const result = await db.query(sql, []);
console.log('Test 1 (id = test-id-123):', result.rows.length, result.rows[0]?.name);

const sql2 = "SELECT * FROM members WHERE name = '小明'";
const r2 = await db.query(sql2, []);
console.log('Test 2 (name = 小明):', r2.rows.length, r2.rows[0]?.name);

const sql3 = "SELECT * FROM members WHERE password = '123456'";
const r3 = await db.query(sql3, []);
console.log('Test 3 (password = 123456):', r3.rows.length, r3.rows[0]?.name);

const sql4 = "SELECT * FROM members WHERE id = 'test-id-123' AND password = '123456'";
const r4 = await db.query(sql4, []);
console.log('Test 4 (id AND password):', r4.rows.length, r4.rows[0]?.name);

import pool from './src/db-memory.js';

const db = pool._db;
console.log('members count:', db.tables.members.length);
console.log('member 0:', db.tables.members[0].name, db.tables.members[0].id.substring(0, 8));
console.log('member 1:', db.tables.members[1].name, db.tables.members[1].id.substring(0, 8));

const targetId = db.tables.members[1].id;
const sql = `SELECT * FROM members WHERE id = '${targetId}' AND password = '123456'`;
console.log('sql:', sql.substring(0, 80) + '...');

const result = await db.query(sql, []);
console.log('result count:', result.rows.length);
if (result.rows.length > 0) {
  console.log('result name:', result.rows[0].name);
} else {
  console.log('NO RESULTS - where condition broken');
}

const sql2 = `SELECT * FROM members WHERE name = '小明'`;
const r2 = await db.query(sql2, []);
console.log('\nname query result:', r2.rows.length, r2.rows[0]?.name);

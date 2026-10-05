import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

console.log('members count:', db.tables.members.length);
console.log('member 0:', db.tables.members[0].name, db.tables.members[0].id.substring(0, 8));
console.log('member 1:', db.tables.members[1].name, db.tables.members[1].id.substring(0, 8));

const childId = db.tables.members[1].id;
const sql = `SELECT * FROM members WHERE id = '${childId}'`;
const result = await db.query(sql, []);
console.log('query by id result count:', result.rows.length);
console.log('query by id result name:', result.rows[0]?.name);

const sql2 = "SELECT * FROM members WHERE name = '小明'";
const r2 = await db.query(sql2, []);
console.log('query by name result:', r2.rows.length, r2.rows[0]?.name);

const sql3 = `SELECT * FROM members WHERE id = '${childId}' AND password = '123456'`;
const r3 = await db.query(sql3, []);
console.log('query by id+password result:', r3.rows.length, r3.rows[0]?.name);

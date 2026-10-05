import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

const childId = db.tables.members[1].id;
const sql = `SELECT * FROM members WHERE id = '${childId}'`;
console.log('Test SQL:', sql);
console.log('');

const result = await db.query(sql, []);
console.log('');
console.log('Final result:', result.rows.length, result.rows[0]?.name);

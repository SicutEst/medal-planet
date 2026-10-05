import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

const familyId = db.tables.families[0].id;
console.log('tasks total:', db.tables.tasks.length);
console.log('first task name:', db.tables.tasks[0].name);
console.log('first task keys:', Object.keys(db.tables.tasks[0]));
console.log('');

// 简单 SQL：不带别名，不用子查询
const sql1 = `SELECT * FROM tasks WHERE family_id = '${familyId}' AND is_active = true`;
const r1 = await db.query(sql1, []);
console.log('Simple SELECT * result:', r1.rows.length, 'rows');
console.log('First row name:', r1.rows[0]?.name);
console.log('');

// 带 t. 前缀的 SQL
const sql2 = `SELECT t.* FROM tasks t WHERE t.family_id = '${familyId}' AND t.is_active = true`;
const r2 = await db.query(sql2, []);
console.log('SELECT t.* result:', r2.rows.length, 'rows');
console.log('First row keys:', Object.keys(r2.rows[0] || {}));
console.log('First row name:', r2.rows[0]?.name);

import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

const familyId = db.tables.families[0].id;
console.log('familyId:', familyId);
console.log('task[0].family_id:', db.tables.tasks[0].family_id);
console.log('match?', db.tables.tasks[0].family_id === familyId);
console.log('');

// 单个条件
const sql1 = `SELECT * FROM tasks WHERE family_id = '${familyId}'`;
const r1 = await db.query(sql1, []);
console.log('Single cond result:', r1.rows.length, 'rows');
console.log('');

// 两个条件 AND
const sql2 = `SELECT * FROM tasks WHERE family_id = '${familyId}' AND is_active = true`;
const r2 = await db.query(sql2, []);
console.log('Two cond AND result:', r2.rows.length, 'rows');

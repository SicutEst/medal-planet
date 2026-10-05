import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

const row = db.tables.members[1]; // 小明
console.log('Row keys:', Object.keys(row));
console.log('Row id:', row.id);
console.log('Row name:', row.name);
console.log('Row password:', row.password);

const cond = `id = '${row.id}'`;
console.log('\nCondition:', cond);
console.log('Eval result:', db._evalCondition(cond, row));

const cond2 = `name = '小明'`;
console.log('\nCondition2:', cond2);
console.log('Eval result2:', db._evalCondition(cond2, row));

// 测试 _splitBy
console.log('\n_splitBy test:');
const andCond = `id = '${row.id}' AND password = '123456'`;
console.log('AND condition:', andCond);
const parts = db._splitBy(andCond, 'AND');
console.log('Parts:', parts.length, parts.map(p => p.trim()));

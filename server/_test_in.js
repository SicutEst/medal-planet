import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

const familyId = db.tables.families[0].id;
const row = db.tables.tasks[0];
console.log('Task:', row.name, 'category:', row.category);
console.log('');

// 测试 IN 条件（不带前缀）
const cond1 = `category IN ('habit', 'bad_habit')`;
console.log('Cond1:', cond1);
console.log('Result:', db._evalCondition(cond1, row));
console.log('');

// 测试 IN 条件（带前缀）
const cond2 = `t.category IN ('habit', 'bad_habit')`;
console.log('Cond2:', cond2);
console.log('Result:', db._evalCondition(cond2, row));
console.log('');

// 测试整个 WHERE
const where = `t.family_id = '${familyId}' AND t.is_active = true AND t.category IN ('habit', 'bad_habit')`;
console.log('Full WHERE:', where);
console.log('Result:', db._evalCondition(where, row));
console.log('');

// 看看 _splitBy 的结果
const parts = db._splitBy(where, 'AND');
console.log('AND parts:', parts.length);
parts.forEach((p, i) => console.log(`  ${i}:`, p.trim()));

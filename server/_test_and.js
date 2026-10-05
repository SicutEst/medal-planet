import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

const familyId = db.tables.families[0].id;
const cond = `family_id = '${familyId}' AND is_active = true`;
console.log('Condition:', cond);
console.log('');

// 测试 _splitBy
const parts = db._splitBy(cond, 'AND');
console.log('_splitBy result:', parts.length, 'parts');
parts.forEach((p, i) => console.log(`  part ${i}:`, p.trim()));
console.log('');

// 测试每个条件
const row = db.tables.tasks[0];
console.log('Task row:', row.name, 'is_active:', row.is_active);
console.log('');

for (const p of parts) {
  const trimmed = p.trim();
  console.log('Eval cond:', trimmed);
  console.log('  Result:', db._evalCondition(trimmed, row));
}
console.log('');

// 测试整体
console.log('Overall result:', db._evalCondition(cond, row));

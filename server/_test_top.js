import { seedDatabase } from './src/db-memory.js';
import pool from './src/db-memory.js';

const db = pool._db;
seedDatabase();

const familyId = db.tables.families[0].id;

// 简单 SQL
const sql1 = `SELECT * FROM tasks WHERE family_id = '${familyId}' AND is_active = true`;
console.log('Original SQL:', sql1.substring(0, 80));
const topSql1 = db._getTopLevelSql(sql1);
console.log('Top SQL:', topSql1.substring(0, 80));
console.log('Same?', sql1 === topSql1);
console.log('');

// 测试 FROM 匹配
const fromMatch = topSql1.match(/FROM\s+(\w+)/i);
console.log('FROM match:', fromMatch ? fromMatch[1] : 'NULL');
console.log('');

// 测试 WHERE 匹配
const whereMatch = topSql1.match(/WHERE\s+(.+?)(?=\s+(?:GROUP|ORDER|LIMIT)|$)/i);
console.log('WHERE match:', whereMatch ? whereMatch[1].substring(0, 60) : 'NULL');

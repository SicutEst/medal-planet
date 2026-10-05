#!/usr/bin/env node
// 余额对账脚本：用流水重算每个成员的贴纸/粉球余额，与成员表快照比对。
// 只读不改；发现不一致时以非零码退出。
//
// 背景：流水（sticker_logs/ball_logs）是不可变的事实来源，成员表余额是事务内
// 维护的快照。两者由 lib/economy.js 保证同步；本脚本独立核验这一不变量。
//
// 用法（连接参数与 server/src/db.js 相同）：
//   DB_HOST=localhost DB_PORT=5433 DB_NAME=medal_planet DB_USER=medal \
//   DB_PASSWORD=medal123 node scripts/reconcile.js

import pg from 'pg';

if (process.env.USE_MEMORY_DB === 'true') {
  console.error('对账脚本仅支持 PostgreSQL（内存模式没有独立的流水存储可供核对）');
  process.exit(2);
}

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'medal_planet',
  user: process.env.DB_USER || 'medal',
  password: process.env.DB_PASSWORD || 'medal123',
});

const { rows: members } = await pool.query(`
  SELECT m.id, m.name, m.role,
         m.current_stickers, m.current_balls,
         COALESCE((
           SELECT SUM(sl.sticker_change) FROM sticker_logs sl WHERE sl.member_id = m.id
         ), 0) AS sticker_ledger_sum,
         COALESCE((
           SELECT SUM(bl.ball_change) FROM ball_logs bl WHERE bl.member_id = m.id
         ), 0) AS ball_ledger_sum,
         f.name AS family_name, f.family_code
  FROM members m
  JOIN families f ON m.family_id = f.id
  ORDER BY f.family_code, m.created_at
`);

console.log(`对账范围：${members.length} 名成员\n`);

let driftCount = 0;
let lastFamily = null;

for (const m of members) {
  if (m.family_code !== lastFamily) {
    lastFamily = m.family_code;
    console.log(`家庭 ${m.family_code}（${m.family_name}）`);
  }

  const issues = [];
  const stickerSum = Number(m.sticker_ledger_sum);
  const ballSum = Number(m.ball_ledger_sum);
  const stickerOk = stickerSum === Number(m.current_stickers || 0);
  const ballOk = ballSum === Number(m.current_balls || 0);

  if (!stickerOk) {
    issues.push(`贴纸 快照 ${m.current_stickers || 0} ≠ 流水和 ${stickerSum}（差 ${Number(m.current_stickers || 0) - stickerSum}）`);
  }
  if (!ballOk) {
    issues.push(`粉球 快照 ${m.current_balls || 0} ≠ 流水和 ${ballSum}（差 ${Number(m.current_balls || 0) - ballSum}）`);
  }

  if (issues.length === 0) {
    console.log(`  ${m.role === 'parent' ? '👨' : '🧒'} ${m.name}  贴纸 ${m.current_stickers || 0} ✓  粉球 ${m.current_balls || 0} ✓`);
  } else {
    driftCount += issues.length;
    console.log(`  ${m.role === 'parent' ? '👨' : '🧒'} ${m.name}  ⚠️ 不一致：${issues.join('；')}`);
  }
}

console.log(`\n结果：${driftCount === 0 ? '全部一致 ✓' : `发现 ${driftCount} 项不一致 ⚠️`}`);
if (driftCount > 0) {
  console.log('提示：历史版本（2026-10 修复前）存在"惩罚申请按请求数记流水、按实际扣减余额"的问题，');
  console.log('      旧数据出现贴纸差异多源于此。流水不可修改，如需以流水为准重建快照请手工评估后处理。');
}

await pool.end();
process.exit(driftCount > 0 ? 1 : 0);

#!/usr/bin/env node
// 演示数据灌入脚本：创建一个带真实感的测试家庭，供本地体验完整玩法。
// 前提：后端已在本机运行（默认 http://localhost:4000）。
// 用法：node scripts/seed-demo.mjs [--base http://localhost:4000/api]
// 每次运行都会新建一个家庭（家庭码随机），账号密码见输出。

const BASE = (() => {
  const i = process.argv.indexOf('--base');
  return i > -1 ? process.argv[i + 1] : 'http://localhost:4000/api';
})();

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

const localDateStr = (d = new Date()) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localDateStr(d); };

const PASSWORD = 'test1234';

const run = async () => {
  // 1. 家庭与成员
  const fam = await api('POST', '/family/create', {
    body: { familyName: '快乐星球（演示）', memberName: '爸爸', password: PASSWORD, role: 'parent' },
  });
  const parentToken = fam.token;
  const family = fam.family;
  const child = await api('POST', '/family/join', {
    body: { familyCode: family.code, memberName: '小明', password: PASSWORD, role: 'child' },
  });
  const childToken = child.token, childId = child.member.id;

  // 2. 任务：5 个好习惯 + 1 个坏习惯 + 1 个临时任务
  const batch = await api('POST', '/task/batch', {
    token: parentToken,
    body: {
      tasks: [
        { name: '按时完成作业', category: 'habit', repeatRule: 'daily', stickerReward: 2 },
        { name: '阅读30分钟', category: 'habit', repeatRule: 'daily', stickerReward: 2 },
        { name: '整理房间', category: 'habit', repeatRule: 'daily', stickerReward: 3 },
        { name: '跳绳100下', category: 'habit', repeatRule: 'daily', stickerReward: 5 },
        { name: '口算练习（做满3页）', category: 'habit', targetCount: 3, stickerReward: 5 },
        { name: '喝够8杯水', category: 'habit', targetCount: 8, accumulativeMode: 'cumulative', stickerReward: 1 },
      ],
    },
  });
  const habitTasks = batch.tasks;
  const badTask = await api('POST', '/task', {
    token: parentToken,
    body: { name: '看电视超过1小时', category: 'bad_habit', stickerReward: 3 },
  });
  await api('POST', '/task', {
    token: parentToken,
    body: { name: '周末帮妈妈买菜', category: 'temporary', validDays: 7, stickerReward: 10 },
  });

  // 3. 奖励池：抽卡池（四档稀有度）+ 直兑区
  const gacha = [
    { name: '迪士尼一日游', icon: '🏰', tier: '五星' },
    { name: '乐高小套装', icon: '🧱', tier: '四星' },
    { name: '冰淇淋券', icon: '🍦', tier: '三星' },
    { name: '小红花贴纸', icon: '🌸', tier: '普通' },
  ];
  for (const g of gacha) {
    await api('POST', '/reward', { token: parentToken, body: { ...g, isGachaPool: true, isExchangeable: false } });
  }
  const shop = [
    { name: '周末多吃一次冰淇淋', icon: '🍦', requiredBalls: 1 },
    { name: '新玩具', icon: '🚗', requiredBalls: 8 },
    { name: '游乐场半天', icon: '🎡', requiredBalls: 15 },
  ];
  for (const s of shop) {
    await api('POST', '/reward', { token: parentToken, body: { ...s, isExchangeable: true, stock: -1 } });
  }

  // 4. 小明的资产：340 贴纸 → 自动结转 2 粉球 + 余 20 贴纸
  await api('POST', '/sticker/adjust', {
    token: parentToken,
    body: { memberId: childId, changeType: 'earn', amount: 340, remark: '开学以来攒的贴纸' },
  });

  // 5. 打卡历史：过去 4 天每天完成 3 个习惯（热力图/月报有内容）
  for (let d = 4; d >= 1; d--) {
    for (const t of habitTasks.slice(0, 3)) {
      await api('POST', `/task/${t.id}/complete`, { token: childToken, body: { date: daysAgo(d) } });
    }
  }

  // 6. 留一条待审批：小明今天完成作业并提交
  await api('POST', `/task/${habitTasks[0].id}/complete`, { token: childToken, body: {} });
  await api('POST', `/task/${habitTasks[0].id}/submit`, { token: childToken, body: {} });

  console.log('✅ 演示环境就绪\n');
  console.log(`  家庭：快乐星球（演示）   家庭码：${family.code}`);
  console.log(`  家长：爸爸   密码：${PASSWORD}`);
  console.log(`  孩子：小明   密码：${PASSWORD}（340 贴纸 → 2 粉球 + 余 20）`);
  console.log(`  任务：习惯 5（含达标/累计型）+ 坏习惯 1 + 临时 1`);
  console.log(`  奖励：抽卡池 4 档 + 直兑 3 档；另有 1 条待审批申请`);
};

run().catch((e) => { console.error('❌', e.message); process.exit(1); });

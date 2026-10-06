// 阶段2 冒烟测试：鉴权、密码、权限矩阵
const BASE = 'http://localhost:4100/api';
let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const parent = { name: 'p1', password: 'test1234' };
let ids;

// ---- 注册 ----
{
  const r = await api('POST', '/family/create', { body: { familyName: 'T-smoke', memberName: parent.name, password: parent.password, role: 'parent' } });
  check('创建家庭成功', r.data?.success === true && !!r.data?.token);
  ids = { memberId: r.data.member.id, familyId: r.data.family.id, familyCode: r.data.family.code, token: r.data.token };
}
// 重复创建限流检查放到最后（避免影响其他用例）

// ---- 登录 ----
{
  const r = await api('POST', '/family/login', { body: { familyCode: ids.familyCode, memberName: parent.name, password: parent.password } });
  check('家庭码+昵称+密码登录', r.status === 200 && !!r.data?.token);
  const bad = await api('POST', '/family/login', { body: { familyCode: ids.familyCode, memberName: parent.name, password: 'wrong' } });
  check('错误密码 401', bad.status === 401);
}
{
  const r = await api('POST', '/family/login-by-id', { body: { memberId: ids.memberId, password: parent.password } });
  check('memberId+密码登录', r.status === 200 && !!r.data?.token);
}

// ---- 加入家庭 ----
let childToken, childId;
{
  const r = await api('POST', '/family/join', { body: { familyCode: ids.familyCode, memberName: 'c1', password: 'child1234', role: 'child' } });
  check('孩子加入家庭', r.data?.success === true && r.data.member.role === 'child');
  childToken = r.data.token; childId = r.data.member.id;

  const dup = await api('POST', '/family/join', { body: { familyCode: ids.familyCode, memberName: 'c1', password: 'child1234', role: 'child' } });
  check('同家庭重名被拒', dup.status === 400);

  const noName = await api('POST', '/family/join', { body: { familyCode: 'ZZZZZZZ', memberName: 'xx', password: 'child1234' } });
  check('不存在的家庭码 404', noName.status === 404);
}

// ---- 未认证拦截 ----
{
  const r = await api('GET', '/task/family/' + ids.familyId);
  check('无 token 访问任务 401', r.status === 401);
  const r2 = await api('GET', '/application/pending/' + ids.familyId, { token: childToken });
  check('孩子访问审批列表 403', r2.status === 403);
}

// ---- 任务管理（家长）----
let taskId, badTaskId, quotaTaskId;
{
  const r = await api('POST', '/task', { token: ids.token, body: { name: '刷牙', category: 'habit', repeatRule: 'daily', stickerReward: 5 } });
  check('家长创建任务', r.data?.success === true);
  taskId = r.data.task.id;

  const bad = await api('POST', '/task', { token: ids.token, body: { name: '咬指甲', category: 'bad_habit', stickerReward: 2 } });
  check('创建坏习惯任务', bad.data?.success === true);
  badTaskId = bad.data.task.id;

  const q = await api('POST', '/task', { token: ids.token, body: { name: '跳绳50下', category: 'habit', targetCount: 3, accumulativeMode: 'pass_or_fail', stickerReward: 8 } });
  quotaTaskId = q.data.task.id;

  const childCreate = await api('POST', '/task', { token: childToken, body: { name: 'hack', category: 'habit' } });
  check('孩子创建任务被拒 403', childCreate.status === 403);

  const list = await api('GET', `/task/family/${ids.familyId}`, { token: childToken });
  check('孩子可查看任务列表', list.data?.success === true && list.data.tasks.length >= 3);
}

// ---- 打卡（方案A：打卡只记完成不发贴纸）----
{
  const r = await api('POST', `/task/${taskId}/complete`, { token: childToken, body: {} });
  check('孩子打卡成功', r.data?.success === true);
  const dup = await api('POST', `/task/${taskId}/complete`, { token: childToken, body: {} });
  check('重复打卡被拒 400', dup.status === 400);

  // 取消打卡：删除今日记录后可重新打卡
  const un = await api('POST', `/task/${taskId}/uncomplete`, { token: childToken, body: {} });
  check('取消打卡成功', un.data?.success === true);
  const re = await api('POST', `/task/${taskId}/complete`, { token: childToken, body: {} });
  check('取消后可重新打卡', re.data?.success === true);
  const unBad = await api('POST', `/task/${badTaskId}/uncomplete`, { token: childToken, body: {} });
  check('坏习惯记录不可取消 400', unBad.status === 400);

  const bad = await api('POST', `/task/${badTaskId}/complete`, { token: childToken, body: {} });
  check('坏习惯打卡成功（余额0实际扣0）', bad.data?.success === true && bad.data.actualDeduction === 0, '实际=' + JSON.stringify(bad.data));

  // 达标型 3 次打卡
  for (let i = 0; i < 3; i++) {
    await api('POST', `/task/${quotaTaskId}/complete`, { token: childToken, body: {} });
  }
  const today = await api('GET', `/task/family/${ids.familyId}/today`, { token: childToken });
  const qt = today.data.tasks.find(t => t.id === quotaTaskId);
  check('达标型任务累计 3/3', qt && (qt.completed_count || 0) === 3, '实际=' + JSON.stringify(qt?.completed_count));
}

// ---- 申请 + 审批（打卡不发贴纸，审批后发放）----
{
  const r = await api('POST', '/application', { token: childToken, body: { taskId, applicationType: 'earn', requestedStickers: 5, reason: 'test' } });
  check('孩子创建申请', r.data?.success === true);
  const appId = r.data.application.id;

  // 有待审批申请时不可取消打卡
  const unBlock = await api('POST', `/task/${taskId}/uncomplete`, { token: childToken, body: {} });
  check('已提交审批时取消打卡被拒 409', unBlock.status === 409);

  const childReview = await api('PUT', `/application/${appId}/review`, { token: childToken, body: { approved: true } });
  check('孩子审批被拒 403', childReview.status === 403);

  const review = await api('PUT', `/application/${appId}/review`, { token: ids.token, body: { approved: true } });
  check('家长审批通过', review.data?.success === true);
  check('审批后贴纸到账 5', review.data.member.current_stickers === 5, '实际=' + review.data.member?.current_stickers);

  const again = await api('PUT', `/application/${appId}/review`, { token: ids.token, body: { approved: true } });
  check('重复审批返回 409', again.status === 409);

  // 防重复：同一任务 pending 中不可重复申请
  const dupApp = await api('POST', '/application', { token: childToken, body: { taskId, applicationType: 'earn', requestedStickers: 5 } });
  check('已批准的任务可再次申请', dupApp.data?.success === true && !dupApp.data.skipped);
  const dupApp2 = await api('POST', '/application', { token: childToken, body: { taskId, applicationType: 'earn', requestedStickers: 5 } });
  check('pending 中重复申请被跳过', dupApp2.data?.success === true && dupApp2.data.skipped === true);
  // 拒绝清理这条 pending，避免影响后续用例
  await api('PUT', `/application/${dupApp.data.application.id}/review`, { token: ids.token, body: { approved: false } });
}

// ---- 调分（家长）+ 满160自动转粉球 ----
{
  const r = await api('POST', '/sticker/adjust', { token: ids.token, body: { memberId: childId, changeType: 'earn', amount: 160, remark: '批量奖励' } });
  check('家长调分成功', r.data?.success === true);
  check('满160自动转粉球（5+160=165→余5贴纸+1粉球）', r.data.member.current_stickers === 5 && r.data.member.current_balls === 1, '实际=' + JSON.stringify({ s: r.data.member?.current_stickers, b: r.data.member?.current_balls }));
  const childAdjust = await api('POST', '/sticker/adjust', { token: childToken, body: { memberId: childId, changeType: 'earn', amount: 100 } });
  check('孩子调分被拒 403', childAdjust.status === 403);
}

// ---- 资料修改 ----
{
  const r = await api('PUT', `/member/${childId}`, { token: ids.token, body: { name: 'hacker' } });
  check('家长不能改孩子资料 403', r.status === 403);
  const noOld = await api('PUT', `/member/${childId}`, { token: childToken, body: { password: 'newpass123' } });
  check('改密码缺旧密码 401', noOld.status === 401);
  const withOld = await api('PUT', `/member/${childId}`, { token: childToken, body: { password: 'newpass123', oldPassword: 'child1234', avatar: '👧' } });
  check('带旧密码改密成功', withOld.data?.success === true);
  const relogin = await api('POST', '/family/login-by-id', { body: { memberId: childId, password: 'newpass123' } });
  check('新密码可登录（旧密码已透明迁移哈希）', relogin.status === 200);
  const leak = await api('GET', `/member/${childId}`, { token: childToken });
  check('成员信息不含密码字段', leak.data?.success === true && !('password' in leak.data.member));
}

// ---- 奖励与兑换 ----
{
  const r = await api('POST', '/reward', { token: ids.token, body: { name: '冰淇淋', requiredBalls: 2, stock: 5 } });
  check('家长创建奖励', r.data?.success === true);
  const rewardId = r.data.reward.id;

  const ex = await api('POST', `/reward/${rewardId}/exchange`, { token: childToken, body: {} });
  check('粉球不足兑换被拒 400', ex.status === 400 && /不足/.test(ex.data.error));
}

// ---- 统计 ----
{
  const r = await api('GET', `/stats/heatmap/${childId}`, { token: ids.token });
  check('家长查看孩子热力图', r.data?.success === true);
  const r2 = await api('GET', `/stats/heatmap/${childId}`, { token: childToken });
  check('本人查看热力图', r2.data?.success === true);
}

// ---- 重置 / 删除 ----
{
  const noPwd = await api('POST', `/family/${ids.familyId}/reset`, { token: ids.token, body: {} });
  check('重置缺密码 400', noPwd.status === 400);
  const wrongPwd = await api('POST', `/family/${ids.familyId}/reset`, { token: ids.token, body: { password: 'wrong' } });
  check('重置密码错误 401', wrongPwd.status === 401);
  const childReset = await api('POST', `/family/${ids.familyId}/reset`, { token: childToken, body: { password: 'newpass123' } });
  check('孩子重置被拒 403', childReset.status === 403);
  const reset = await api('POST', `/family/${ids.familyId}/reset`, { token: ids.token, body: { password: parent.password } });
  check('家长重置成功', reset.data?.success === true);
  const after = await api('GET', `/task/family/${ids.familyId}`, { token: ids.token });
  check('重置后任务清空', after.data?.tasks.length === 0);

  const del = await api('DELETE', `/family/${ids.familyId}`, { token: ids.token, body: { password: parent.password } });
  check('家长删除家庭成功', del.data?.success === true);
  const gone = await api('POST', '/family/login-by-id', { body: { memberId: ids.memberId, password: parent.password } });
  check('删除后成员登录失败', gone.status >= 400);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);

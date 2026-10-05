# AGENTS.md — 奖章星球

本文件面向 AI 编码助手与人类协作者，说明项目结构、构建命令、开发约定与禁区。改动代码前请先读完本文件。

## 项目定位

开源的家庭奖章激励管理系统：家长布置任务 → 孩子打卡提交 → 家长审批发放贴纸 → 贴纸满 160 自动转粉球 → 粉球抽卡（90 抽保底）/兑换奖励。中文、移动端优先 H5、自托管部署。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js 18+ / Express 4 / pg（PostgreSQL 15+）/ jsonwebtoken |
| 前端 | Vue 3 + Vite 5 + Pinia + vue-router |
| 部署 | Docker Compose（nginx 同源反代 `/api`） |

## 项目结构

```
server/
├── src/
│   ├── lib/               # 核心横切模块
│   │   ├── economy.js     # ★ 贴纸/粉球账务唯一出口（余额+流水+自动转粉球）
│   │   ├── auth.js        # JWT 签发、requireAuth/requireParent/assertMemberAccess
│   │   ├── password.js    # scrypt 哈希、透明迁移
│   │   └── ratelimit.js   # 内存限流
│   ├── routes/            # family/member/task/application/sticker/reward/gacha/stats
│   ├── models/init.js     # 建表与增量迁移（幂等）
│   ├── db.js              # 连接池（USE_MEMORY_DB=true 时切内存库）
│   ├── db-memory.js       # 内存库（仅本地页面调试，SQL 支持不完整）
│   └── index.js           # 入口（生产环境 JWT_SECRET 校验在此）
├── test/smoke.mjs         # 接口冒烟测试（43 断言）
└── Dockerfile

web/
├── src/
│   ├── views/             # 页面（商店页内含抽卡/兑换）
│   ├── stores/auth.js     # 登录态（token/member/family 存 localStorage）
│   ├── utils/date.js      # localDateStr（唯一合法的本地日期来源）
│   └── api/index.js       # axios 实例（自动带 token、401 自动登出）
├── nginx.conf             # 生产容器内 nginx
└── Dockerfile
```

## 构建与运行命令

```bash
# 本地开发
cd server && DB_HOST=localhost npm run dev     # 后端 :4000
cd web && npm run dev                          # 前端 :3000（vite 代理 /api）

# 冒烟测试（必须连真实 PostgreSQL，内存模式结果不作数）
docker run -d --name medal-planet-test-pg -e POSTGRES_USER=medal -e POSTGRES_PASSWORD=medal123 \
  -e POSTGRES_DB=medal_planet -p 5433:5432 postgres:15-alpine
cd server
DB_HOST=localhost DB_PORT=5433 DB_NAME=medal_planet DB_USER=medal DB_PASSWORD=medal123 PORT=4100 node src/index.js &
node test/smoke.mjs
# 涉及账务的改动，再跑对账（流水重算 vs 快照，发现不一致以非零码退出）：
node scripts/reconcile.js
# 测试完：docker rm -f medal-planet-test-pg

# 构建 / 部署
cd web && npm run build
cp .env.example .env && docker-compose up -d

# 推送到 GitHub（本机网络无法直连 github.com 时的替代通道，走 Git Data API 增量重建）
node scripts/push-via-api.mjs

# 内存模式（仅调试页面用）
cd server && USE_MEMORY_DB=true npm run dev
```

## 开发约定

1. **文档同步（硬性）**：每次功能/修复合入前，更新 `CHANGELOG.md` 的 `[未发布]` 条目（用户可读，不写实现细节）；README 受影响必须同步。发版时 CHANGELOG 分组整理、README 全面对齐。
2. **身份与权限**：所有业务接口挂 `requireAuth`；家长专属再挂 `requireParent`；操作者身份一律取 `req.member`，**禁止从请求体读 memberId/operatorId 充当身份**；访问他人资源用 `assertMemberAccess` 或显式校验 `family_id` 一致。
3. **账务**：任何贴纸/粉球余额变动必须经 `lib/economy.js`（`applyStickerChange` / `deductStickers`），在事务内完成；**禁止直接 UPDATE members 的余额列**；`STICKERS_PER_BALL` 只在 economy.js 定义。对账恒等式（`余额 == SUM(流水)`）必须始终成立，改账务逻辑后跑 `scripts/reconcile.js` 核验。
4. **发放语义**：普通任务打卡只记完成，贴纸经"申请 → 家长审批"发放；坏习惯打卡即时扣；补贴即时发（家长操作）。改语义需先在 CHANGELOG 里说明。
5. **密码**：只用 `password.js` 的 hash/verify/rehash；任何响应不得包含 `password` 字段（member 查询用显式列，不用 `SELECT *`）。
6. **SQL**：全部参数化（`$1`）占位；建表/加列写在 `models/init.js`，必须幂等（`IF NOT EXISTS`）。
7. **日期**：服务端用本地日期函数（容器已设 `TZ=Asia/Shanghai`）；前端一律 `utils/date.js` 的 `localDateStr` 并显式传参。
8. **错误码**：400 参数/业务拒绝、401 未登录/密码错误、403 越权、404 不存在、409 状态冲突（如重复审批）、429 限流、500 其余；前端对 401 自动登出。
9. **测试**：新增/修改接口行为时同步扩展 `server/test/smoke.mjs`，合入前真实 PG 下全绿。
10. **提交信息**：中文一行主题，前缀 `feat/fix/chore/docs`；一个逻辑变更一个 commit。

## 禁区

- 禁止把 `.env`、任何密钥/密码提交进仓库；禁止给 `JWT_SECRET` 写回默认值——生产留空拒绝启动是刻意的安全行为。
- 禁止绕过鉴权中间件新增接口；禁止信任请求体里的身份字段。
- 禁止在生产 compose 中恢复 5432 端口映射、恢复 `./server/src` 挂载。
- 禁止用 `toISOString()` 生成业务日期（UTC 偏移会错一天）。
- 不要为内存库补生产特性，也不要以内存模式跑通作为合入依据；内存库存在 JOIN/默认值支持不完整的已知缺陷，仅用于无 PG 时看页面。
- 测试用容器固定命名 `medal-planet-test-pg`，用完即删，不得复用或触碰机器上其他项目的数据库容器。

## 已知边界（设计取舍，非 bug）

- 家庭码即加入凭证：拿到 7 位家庭码者可以任意角色加入家庭，信任边界是"家庭内部分享"。
- 加入家庭仅支持家庭码方式（按家庭名匹配会在同名家庭间串号）。
- 成就徽章（achievements 表已建）与周末任务区未实现。

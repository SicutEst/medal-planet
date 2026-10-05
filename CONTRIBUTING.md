# 贡献指南

感谢关注奖章星球！动手前请先读一遍 [AGENTS.md](AGENTS.md)（开发约定与禁区）和 [SPEC.md](SPEC.md)（业务规格），能避免绝大多数返工。

## 环境要求

- Node.js 18+
- Docker（用于起 PostgreSQL，生产部署也用它）
- Git

## 快速上手

```bash
git clone <your-fork> medal-planet && cd medal-planet

# 起一个开发数据库
docker run -d --name medal-planet-db -e POSTGRES_USER=medal -e POSTGRES_PASSWORD=medal123 \
  -e POSTGRES_DB=medal_planet -p 5432:5432 postgres:15-alpine

# 后端（:4000）
cd server && npm install && DB_HOST=localhost npm run dev

# 前端（:3000，新开终端）
cd web && npm install && npm run dev
```

## 提交前必须通过

```bash
# 1. 接口冒烟测试（必须连真实 PostgreSQL，内存模式结果不作数）
docker run -d --name medal-planet-test-pg -e POSTGRES_USER=medal -e POSTGRES_PASSWORD=medal123 \
  -e POSTGRES_DB=medal_planet -p 5433:5432 postgres:15-alpine
cd server
DB_HOST=localhost DB_PORT=5433 DB_NAME=medal_planet DB_USER=medal DB_PASSWORD=medal123 \
PORT=4100 node src/index.js &
node test/smoke.mjs          # 全部通过
# 涉及账务的改动，再跑一次对账：
node scripts/reconcile.js    # 全部一致

# 2. 前端构建
cd ../web && npm run build   # 无报错

# 测试完清理
docker rm -f medal-planet-test-pg
```

## 推送到 GitHub

正常环境 `git push` 即可。如果所在网络无法直连 github.com（HTTPS 被重置、镜像不支持推送），
用 API 推送通道（依赖 gh CLI 登录）：

```bash
node scripts/push-via-api.mjs   # 增量：自动识别远端已有的 commit，只补新的
```

## 约定速查

1. **每个 commit 同步 `CHANGELOG.md`**（`[未发布]` 下追加用户可读的条目）；README 受影响必须改。
2. 账务（贴纸/粉球）只走 `server/src/lib/economy.js`，禁止直接 UPDATE 余额列。
3. 身份取自 `req.member`（JWT），不从请求体读；新接口挂 `requireAuth` / `requireParent`。
4. 提交信息：`feat/fix/chore/docs` 前缀 + 中文一行主题。
5. 改业务行为先改 `SPEC.md` 再改代码。

## 报告 Bug

请附上：复现步骤、相关接口的请求/响应、如果是账目问题附上 `reconcile.js` 的输出。安全漏洞请勿公开提交 issue，先私下联系维护者。

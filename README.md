# 奖章星球 - 家庭奖章激励管理系统

🏅 一个可爱、简单的家庭奖章激励管理系统

## 功能特点

- 🏠 家庭码账号体系：创建家庭生成家庭码，家人凭码加入，支持二维码/链接邀请与快捷登录
- 📋 任务管理：习惯任务（每天/每周/每月/自定义周期）、坏习惯任务（即时扣贴纸）、临时任务（限当天或 N 天有效）
- 🎯 定量打卡：达标型（满 N 次算完成）与累计型（每次都算），支持 x/y 进度展示
- ✅ 审批流程：孩子打卡后提交申请，家长审批通过才发放贴纸（坏习惯与补贴即时生效）
- 🎟️ 贴纸/粉球双货币：贴纸满 160 自动兑换 1 粉球，全部余额变动统一走账务模块（流水可查）
- 🎁 奖励商店：家长维护奖励池（库存/档位/图标），孩子用粉球兑换，家长确认领取
- 🔮 粉球抽卡：单抽 10 球 / 十连 100 球，90 抽保底五星，抽到的奖励进入宠物收藏
- 📊 数据统计：打卡热力图、月度报告、月度趋势
- 📱 移动端优先的 H5，手机电脑都能用

## 快速启动

### 方式一：Docker 一键部署（推荐）

```bash
# 1. 克隆项目
git clone <your-repo> medal-planet
cd medal-planet

# 2. 配置环境变量（必须设置数据库密码和 JWT_SECRET，否则后端拒绝启动）
cp .env.example .env
# 编辑 .env；JWT_SECRET 生成方式：
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. 一键启动
docker-compose up -d

# 4. 访问（前端 nginx 已同源反代 /api）
# 前端：http://your-server-ip:3000
```

### 方式二：本地开发

```bash
# 数据库（或使用本机已有的 PostgreSQL，改 server 侧环境变量即可）
docker run -d --name medal-planet-db -e POSTGRES_USER=medal -e POSTGRES_PASSWORD=medal123 \
  -e POSTGRES_DB=medal_planet -p 5432:5432 postgres:15-alpine

# 后端
cd server
npm install
DB_HOST=localhost npm run dev

# 前端（新开终端）
cd web
npm install
npm run dev
```

> 无 PostgreSQL 时可以 `USE_MEMORY_DB=true npm run dev` 用内存模式开发，
> 但内存库对 JOIN/默认值等支持不完整，仅用于页面调试，接口联调请连真实数据库。

### 运行接口冒烟测试

```bash
# 需要一个可用的 PostgreSQL（示例用 5433 端口的测试库）
docker run -d --name medal-planet-test-pg -e POSTGRES_USER=medal -e POSTGRES_PASSWORD=medal123 \
  -e POSTGRES_DB=medal_planet -p 5433:5432 postgres:15-alpine

cd server
DB_HOST=localhost DB_PORT=5433 DB_NAME=medal_planet DB_USER=medal DB_PASSWORD=medal123 \
PORT=4100 node src/index.js &
node test/smoke.mjs
```

## 项目结构

```
medal-planet/
├── server/                 # 后端 Node.js + Express
│   ├── src/
│   │   ├── routes/        # API 路由（family/member/task/application/sticker/reward/gacha/stats）
│   │   ├── lib/           # 鉴权、密码哈希、限流、账务（economy）
│   │   ├── models/        # 数据库建表与迁移
│   │   ├── db.js          # 数据库连接（支持内存模式）
│   │   └── index.js       # 入口
│   └── test/smoke.mjs     # 接口冒烟测试
│
├── web/                   # 前端 Vue 3
│   ├── src/
│   │   ├── views/         # 页面
│   │   ├── components/    # 组件
│   │   ├── stores/        # 状态管理
│   │   └── utils/         # 日期等工具
│   ├── nginx.conf         # 生产容器内 nginx（SPA 回退 + /api 反代）
│   └── Dockerfile
│
├── docker-compose.yml     # Docker 编排
├── CHANGELOG.md           # 变更日志
└── README.md
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Pinia + vue-router |
| 后端 | Node.js + Express |
| 数据库 | PostgreSQL |
| 鉴权 | JWT（jsonwebtoken）+ scrypt 密码哈希 |
| 部署 | Docker Compose（nginx 反代同源） |

## 安全模型

- **密码**：scrypt 哈希存储（带随机盐），旧明文密码在登录成功时自动升级；修改密码需验证旧密码
- **会话**：登录签发 JWT（90 天），前端存 localStorage 并随请求携带；登录态失效自动回到登录页
- **权限**：
  - 公开接口仅限注册/登录/家庭码查询（均有限流：登录类 10 次/15 分钟、查询类 30 次/15 分钟）
  - 家长专属：任务与奖励管理、审批、补贴、贴纸调整、家庭重置/删除
  - 本人专属：打卡、抽卡、兑换、发起申请
  - 所有资源访问校验家庭归属，身份一律取自服务端令牌，不信任请求体传入的 ID
- **账务**：贴纸/粉球余额变动唯一出口（`server/src/lib/economy.js`），余额、流水、自动转粉球在同一事务内完成，余额不允许为负
- **已知边界**：家庭码即加入凭证（7 位），凡拿到家庭码的人都能以任意角色加入；请仅在家可信范围内分享。生产部署务必修改 `.env` 全部默认值

## 功能完成度

### Phase 1 (MVP)
- [x] 家庭码账号体系
- [x] 任务管理（习惯性 + 临时 + 坏习惯）
- [x] 审批流程
- [x] 贴纸/粉球记录

### Phase 2
- [x] 粉球抽卡系统（含保底与宠物收藏）
- [x] 奖励池管理
- [x] 累计兑换

### Phase 3
- [x] 数据统计（热力图/月报/趋势）
- [ ] 成就徽章（表结构已建，功能未实现）
- [ ] 周末任务区（未实现）

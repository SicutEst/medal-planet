# 奖章星球 - 家庭奖章激励管理系统

🏅 一个可爱、简单的家庭奖章激励管理系统

## 功能特点

- 🎟️ 贴纸奖励系统
- 🔮 粉球抽卡（参考原神机制）
- ✅ 审批流程（孩子申请，家长审批）
- 📊 数据统计
- 📱 支持手机和电脑访问

## 快速启动

### 方式一：Docker 一键部署（推荐）

```bash
# 1. 克隆项目
git clone <your-repo> medal-planet
cd medal-planet

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，修改密码等配置

# 3. 一键启动
docker-compose up -d

# 4. 访问
# 前端：http://your-server-ip:3000
# 后端API：http://your-server-ip:4000
```

### 方式二：本地开发

```bash
# 后端
cd server
npm install
npm run dev

# 前端（新开终端）
cd web
npm install
npm run dev
```

## 项目结构

```
medal-planet/
├── server/                 # 后端 Node.js
│   ├── src/
│   │   ├── routes/        # API 路由
│   │   ├── models/        # 数据模型
│   │   └── db.js          # 数据库连接
│   └── Dockerfile
│
├── web/                   # 前端 Vue 3
│   ├── src/
│   │   ├── views/         # 页面
│   │   ├── components/     # 组件
│   │   └── stores/        # 状态管理
│   └── Dockerfile
│
├── docker-compose.yml     # Docker 配置
└── README.md
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite |
| 后端 | Node.js + Express |
| 数据库 | PostgreSQL |
| 部署 | Docker Compose |

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 数据库 | PostgreSQL |
| 前端 | Vue 3 + Vite |
| 部署 | Docker Compose |

## 功能规划

### Phase 1 (MVP)
- [x] 家庭码账号体系
- [x] 任务管理（习惯性 + 独立任务）
- [x] 审批流程
- [x] 贴纸/粉球记录

### Phase 2
- [ ] 粉球抽卡系统
- [ ] 奖励池管理
- [ ] 累计兑换

### Phase 3
- [ ] 数据统计
- [ ] 成就徽章
- [ ] 周末任务区

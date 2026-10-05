# 勋章星球 - 部署指南

## 项目简介
家庭勋章奖励管理系统，Vue3 前端 + Express 后端 + PostgreSQL 数据库。

## Windows / macOS 通用部署

### 1. 安装 Node.js
从 https://nodejs.org 下载 LTS 版本安装

### 2. 安装 Docker Desktop
从 https://www.docker.com/products/docker-desktop 下载安装

### 3. 解压并安装依赖
```bash
# 解压 medal-planet-source.zip
# 进入源码目录
cd 源码目录

# 安装前端依赖
cd web && npm install

# 安装后端依赖
cd ../server && npm install
```

### 4. 启动数据库
```bash
docker-compose up -d db
```

### 5. 恢复数据库备份（可选，需要之前的数据才做）
```bash
cat medal_planet_backup.sql | docker exec -i medal-planet-db psql -U medal -d medal_planet
```

### 6. 启动后端
```bash
cd server && npm start
# 后端运行在 http://localhost:4000
```

### 7. 启动前端
```bash
cd web && npm run dev
# 前端运行在 http://localhost:3000
```

### 一键 Docker Compose 启动
```bash
docker-compose up -d
# 全部服务自动启动
```

## 数据库信息
- 主机: localhost / db(Docker网络内)
- 端口: 5432
- 数据库: medal_planet
- 用户: medal
- 密码: medal123

## 环境变量
复制 `.env.example` 为 `.env` 按需修改。

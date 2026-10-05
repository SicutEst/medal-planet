# 奖章星球 - 部署指南

## 项目简介
家庭奖章激励管理系统，Vue3 前端 + Express 后端 + PostgreSQL 数据库。

## Windows / macOS 通用部署

### 1. 安装 Docker Desktop
从 https://www.docker.com/products/docker-desktop 下载安装

### 2. 配置环境变量（必须）
```bash
cp .env.example .env
```
编辑 `.env`：
- 修改 `DB_PASSWORD`（数据库密码）
- 设置 `JWT_SECRET`（登录令牌签名密钥），生成方式：
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  **JWT_SECRET 留空或使用默认值时，生产模式下后端会拒绝启动。**

### 3. 一键启动
```bash
docker-compose up -d
```
启动三个容器：
- `medal-planet-db`：PostgreSQL 15（仅容器网络内可达，不暴露宿主机端口）
- `medal-planet-server`：后端 API（宿主机 4000 端口，可用于调试，公网部署可用防火墙屏蔽）
- `medal-planet-web`：nginx 托管前端并同源反代 `/api`（宿主机 3000 端口）

### 4. 访问
浏览器打开 `http://服务器IP:3000`，创建家庭后把家庭码分享给家人。

## 本地开发（不用 Docker 跑前后端）

```bash
# 1. 数据库
docker run -d --name medal-planet-db -e POSTGRES_USER=medal -e POSTGRES_PASSWORD=medal123 \
  -e POSTGRES_DB=medal_planet -p 5432:5432 postgres:15-alpine

# 2. 后端（默认连接 localhost:5432）
cd server && npm install
DB_HOST=localhost npm run dev
# 后端运行在 http://localhost:4000

# 3. 前端（新开终端，vite 已配置 /api 代理到 4000）
cd web && npm install
npm run dev
# 前端运行在 http://localhost:3000
```

## 数据库信息
- 主机: localhost / db（Docker 网络内）
- 端口: 5432
- 数据库: medal_planet
- 用户: medal（见 `.env`）
- 密码: 见 `.env` 的 `DB_PASSWORD`

## 环境变量
| 变量 | 说明 |
|------|------|
| DB_USER / DB_PASSWORD / DB_NAME | 数据库账号 |
| JWT_SECRET | 登录令牌签名密钥，生产必填且不可用默认值 |

## 数据备份与恢复

```bash
# 备份
docker exec medal-planet-db pg_dump -U medal medal_planet > medal_planet_backup.sql

# 恢复
cat medal_planet_backup.sql | docker exec -i medal-planet-db psql -U medal -d medal_planet
```

## 升级注意

- 2026-10 起密码为 scrypt 哈希存储：老用户的明文密码在**下一次成功登录时自动升级**，无需手动迁移，但升级后所有用户需要重新登录一次（浏览器会自动跳回登录页）。

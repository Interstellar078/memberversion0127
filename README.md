# Custom Travel Builder (Refactored)

前后端分离版本：
- 前端：Vite + React + TypeScript
- 后端：FastAPI + Postgres

## 目录结构
- `frontend/`：前端项目
- `backend/`：后端项目
- `deploy/`：Nginx 生产配置
- `docker-compose.yml`：一键部署（推荐）

---

## 本地开发

### Frontend
**Prerequisites:** Node.js 18+

```bash
cd frontend
npm install
# 本地开发（API 指向本地后端）
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

### Backend
**Prerequisites:** Python 3.13+，Postgres 16+

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .

# 初始化数据库
psql "$DATABASE_URL" -f db/schema.sql

# 启动后端
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir src
```

---

## Docker Compose (推荐)

```bash
# 构建并启动
docker compose up -d --build

# 查看日志
docker compose logs -f backend
docker compose logs -f frontend
```

**日志挂载说明（推荐）**
- 后端日志使用 Docker 命名卷 `backend_logs`（容器内 `/app/logs`）
- 无需手动创建宿主机目录

---

## 生产部署指南

### 1. 准备工作
需要一台安装了 **Docker** 和 **Docker Compose** 的服务器（Linux/Mac/Windows 均可）。

**Docker 安装（Ubuntu 示例）**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录以生效
```

### 2. 上传代码
将整个项目上传到服务器（可用 git / scp / FTP）。

```bash
git clone <您的仓库地址> xingjiyun007
cd xingjiyun007
```

### 3. 配置环境
在项目根目录创建 `.env`，配置必要的环境变量。

```bash
touch .env
nano .env
```

**`.env` 示例：**
```ini
# 后端密钥 (请修改为随机字符串)
JWT_SECRET=prod_secret_key_change_me_123456

# AI API Key (Gemini/OpenAI 任选)
GEMINI_API_KEY=your_gemini_api_key_here
# OPENAI_API_KEY=your_openai_key_here
# LLM_PROVIDER=gemini

# 前端 API 地址（打包时使用）
VITE_API_BASE_URL=http://<您的服务器IP>:8000

# 数据库配置 (PostgreSQL)
# 使用内置 Postgres（默认）：
POSTGRES_DB=travel_builder
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/travel_builder

# 或者使用外部数据库（RDS/CloudSQL）：
# DATABASE_URL=postgresql+psycopg://user:pass@xxxx.region.rds.amazonaws.com:5432/db
```

### 4. 启动服务
在项目根目录（`docker-compose.yml` 所在目录）运行：

```bash
docker compose up -d --build
```

- `-d`: 后台运行
- `--build`: 强制构建镜像（确保代码更新后生效）

### 5. 验证
访问服务器 IP 或域名：
- 前端：`http://<您的服务器IP>`
- 后端 API：`http://<您的服务器IP>/api/docs`

### 6. 更新部署
```bash
git pull
docker compose up -d --build
```

### 7. 数据备份
PostgreSQL 数据存储在 Docker Volume `postgres_data` 中。即使删除容器，数据也会保留。
如需备份，可使用 `pg_dump` 导出。

### 8. 查看日志
```bash
docker compose logs -f
docker compose logs -f backend
```

---

## 说明
- 账号/数据存储在 Postgres。
- 需要管理员权限时，可在数据库中将用户 role 设为 admin。
- 前端默认通过 Nginx 反代访问后端 `/api`。

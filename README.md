# Custom Travel Builder (Refactored)

前后端分离版本：
- 前端：Vite + React + TypeScript
- 后端：FastAPI + Postgres

## Frontend

**Prerequisites:** Node.js 18+

```bash
cd frontend
npm install
# 本地开发（API 指向本地后端）
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

## Backend

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

## Docker Compose (推荐)

```bash
# 构建并启动
docker compose up -d --build

# 查看日志
docker compose logs -f backend
docker compose logs -f frontend
```

## 说明
- 账号/数据存储在 Postgres。
- 需要管理员权限时，可在数据库中将用户 role 设为 admin。
- 前端默认通过 Nginx 反代访问后端 `/api`。

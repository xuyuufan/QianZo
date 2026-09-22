# Qianzo

Qianzo 的第一阶段目标是用真实登录、真实数据库和真实权限检查，在本地完成一条合成项目交付链。当前施工范围是 S0：真实登录与自己的项目草稿。

## 本机要求

- Node.js 24 LTS（当前基线：24.13.1）
- pnpm 11.19.0（由 `packageManager` 固定）
- Git
- Docker Desktop 或其他兼容 Docker API 的容器引擎；本机已验证 Docker Desktop 4.91.0 / Engine 29.8.0

本地 Supabase 首次启动会下载 Postgres、Auth、PostgREST 和网关镜像。建议至少提供 8 GB 内存，并确保本地端口 54321、54322 可用。

## 初次启动

```powershell
pnpm install
pnpm db:start
pnpm db:prepare
pnpm dev
```

`db:prepare` 只接受本机 loopback Supabase，应用 migration，生成受限数据库账号的本地密码，并写入：

- `.env.local`：Next.js 运行时所需的公开 Auth 配置和受限 `DATABASE_URL`。
- `.env.tools.local`：仅数据库准备、演示数据和测试工具显式读取的管理员配置。

这两个文件都被 Git 忽略；不要复制到代码、日志或浏览器。变量说明见 `.env.example` 和 `.env.tools.example`。

开发服务默认位于 <http://127.0.0.1:3000>。停止本地 Supabase：

```powershell
pnpm db:stop
```

## 验证

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm build
pnpm start
```

数据库集成测试必须在 `db:start` 和 `db:prepare` 之后运行，使用真实的本地 PostgreSQL 和 Data API。当前页面仍是应用基线；认证和项目草稿将在后续 S0 任务中接入。

## 仅重建本地合成数据库

```powershell
pnpm db:reset
```

此命令会先确认目标是 loopback Supabase，然后清空并重建本地合成数据库。它不会接受远程数据库地址，也不会由普通启动流程自动执行。

## 权威文档

- [工程总纲](QIANZO_MVP_V0_ENGINEERING_BLUEPRINT.md)
- [开发与 Git 工作流程](DEVELOPMENT_WORKFLOW.md)
- [施工切片](BUILD_SLICES.md)
- [S0 施工规格](slices/S0-project-draft/README.md)

# Qianzo

Qianzo 当前完成了 S0：企业通过真实 Supabase Auth 登录后，可以创建、查看和编辑自己的持久化项目草稿。企业间资源隔离、Builder 拒绝、重复创建和旧版本保存冲突均在服务端及真实 PostgreSQL 上验证。S1 尚未开始。

## 本机要求

- Node.js 24 LTS（当前基线：24.13.1）
- pnpm 11.19.0（由 `packageManager` 固定）
- Git
- Docker Desktop 或其他兼容 Docker API 的容器引擎（当前验证：Docker Desktop 4.91.0 / Engine 29.8.0）

本机的 Docker 程序和数据分别位于 `D:\Docker\Docker`、`D:\Docker\data`，Playwright 浏览器位于 `D:\PlaywrightBrowsers`。其他机器不要求使用相同路径。Supabase 首次启动会下载 Postgres、Auth、PostgREST 和网关镜像；本地端口 54321、54322 需要可用。

## 从 checkout 启动

```powershell
pnpm install
pnpm db:start
pnpm db:prepare
pnpm demo:seed
pnpm dev
```

开发服务位于 <http://127.0.0.1:3000>。`db:prepare` 只接受 loopback Supabase，应用尚未执行的 migration、配置受限 `qianzo_runtime` 登录账号，并生成：

- `.env.local`：Next.js 运行时所需的公开 Auth 配置和受限 `DATABASE_URL`。
- `.env.tools.local`：仅数据库准备、seed 和测试工具显式读取的管理员配置及本地演示密码。

两个本地文件均被 Git 忽略。应用运行时不会加载 `.env.tools.local`，浏览器也不会收到数据库或管理凭据。变量模板见 `.env.example` 和 `.env.tools.example`。

停止本地服务：

```powershell
pnpm db:stop
```

## 本地演示

`pnpm demo:seed` 会幂等准备以下合成账号：

- `enterprise-a@qianzo.local`
- `enterprise-b@qianzo.local`
- `builder@qianzo.local`

三者共享的本地密码只保存在 `.env.tools.local` 的 `DEMO_USER_PASSWORD` 中，不会由 seed 输出。建议按以下顺序验收：

1. 使用企业 A 登录，创建标题和原始需求，进入详情并编辑保存。
2. 刷新、退出后重新登录，确认草稿和递增后的版本仍存在。
3. 使用企业 B 登录，确认列表中没有 A 的项目；直接访问 A 的项目 UUID 也返回不存在。
4. 使用 Builder 登录，确认企业项目入口不可用。
5. 在两个页面同时打开同一版本，先后保存；第二次保存应提示刷新，不覆盖第一次内容。

## 验证

首次运行 Playwright 前安装 Chromium。若希望安装到 D 盘：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = 'D:\PlaywrightBrowsers'
[Environment]::SetEnvironmentVariable('PLAYWRIGHT_BROWSERS_PATH', $env:PLAYWRIGHT_BROWSERS_PATH, 'User')
pnpm exec playwright install chromium
```

在 `db:start`、`db:prepare` 和 `demo:seed` 之后运行：

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm start
```

集成测试连接真实本地 PostgreSQL、Supabase Auth 和 Data API；E2E 使用真实登录 cookie 及独立浏览器 context，不以固定用户 mock 授权。

## 仅重建本地合成数据库

```powershell
pnpm db:reset
pnpm demo:seed
```

`db:reset` 会先确认数据库位于 loopback，再清空并从 migration 重建本地合成数据库，同时重新准备运行时账号。它不会接受远程数据库地址，也不会由普通启动流程自动执行。该命令会删除本地项目草稿。

## 当前边界

- S0 仅有 `app.users`、`app.user_roles`、`app.projects` 三张业务表。
- 资源隔离由每个服务端入口执行；当前没有用户级 RLS，且不会宣称已有该隔离层。
- 尚未实现 AIPM、Spec、发布、申请、Payment、Workspace、文件上传、通知、管理员界面或生产部署。
- 演示账号与本地数据库只用于合成开发数据，不代表企业认证、合同接受或真实交易。
- 下一施工项是 S1，但本轮没有开始 S1。

## 权威文档

- [工程总纲](docs/QIANZO_MVP_V0_ENGINEERING_BLUEPRINT.md)
- [开发与 Git 工作流程](docs/DEVELOPMENT_WORKFLOW.md)
- [施工切片](docs/BUILD_SLICES.md)
- [S0 施工规格](docs/slices/S0-project-draft/README.md)
- [当前项目状态](docs/PROJECT_STATUS.md)

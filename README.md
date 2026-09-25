# Qianzo

Qianzo 当前完成了 S0 与 S1：企业通过真实 Supabase Auth 登录后可以创建项目草稿，用 Mock AIPM 访谈生成候选 Spec，审核保存并锁定范围，填写参考预算、完成模拟企业定金，确认脱敏预览后发布。已发布项目对任何登录用户可见可评估。企业间资源隔离、Builder 角色拒绝、并发冲突、锁定不可改写、定金只生效一次、发布原子性与脱敏边界都在服务端和真实 PostgreSQL 上验证。[S1 施工规格](docs/slices/S1-spec-publish/README.md) 已实施，状态与验证证据见 [PROJECT_STATUS](docs/PROJECT_STATUS.md)。

## 本机要求

- Node.js 24 LTS（当前基线：24.13.1）
- pnpm 11.19.0（由 `packageManager` 固定）
- Git
- Docker Desktop 或其他兼容 Docker API 的容器引擎（当前验证：Docker Desktop 4.91.0 / Engine 29.8.0）

本机的 Docker 程序和数据分别位于 `D:\Docker\Docker`、`D:\Docker\data`，Playwright 浏览器位于 `D:\PlaywrightBrowsers`。其他机器不要求使用相同路径。Supabase 首次启动会下载 Postgres、Auth、PostgREST 和网关镜像；本地端口 54321、54322 需要可用。

### 当前开发机的两处差异（照抄前先看）

本机系统 PATH 里的 `node` 解析到 22.22.2，不满足 `engines: >=24 <25`；Node 24.13.1 装在 `D:\node.exe`。
同时 `pnpm` 没有加入 PATH。因此**每打开一个新终端，先执行一次**：

```powershell
cd D:\Qianzo
$env:PATH = "D:\;$env:PATH"
node -v          # 必须显示 v24.13.1，若仍是 v22.22.2 不要继续
corepack pnpm -v # 显示 11.19.0
```

之后把本文所有 `pnpm <script>` 写成 `corepack pnpm <script>`。希望直接敲 `pnpm` 时，可执行一次
`corepack enable pnpm`（会在 Node 24 目录生成 shim）；也可把 `D:\` 固定加到用户 PATH 最前面。

## 从 checkout 启动

```powershell
corepack pnpm install
corepack pnpm db:start
corepack pnpm db:prepare
corepack pnpm demo:seed
corepack pnpm dev
```

已经准备过、且本地 Supabase 容器仍在运行的环境（用 `docker ps` 可确认 `supabase_db_qianzo` 在运行），
只需要最后一条 `corepack pnpm dev`；重新开机后按 `db:start` → `db:prepare` → `demo:seed` → `dev` 顺序补齐。

开发服务位于 <http://127.0.0.1:3000>。`db:prepare` 只接受 loopback Supabase；它会对尚未执行的 migration 执行应用、配置受限的 `qianzo_runtime` 登录账号，并生成：

- `.env.local`：Next.js 运行时所需的公开 Auth 配置和受限 `DATABASE_URL`。
- `.env.tools.local`：仅数据库准备、seed 和测试工具显式读取的管理员配置及本地演示密码。

两个本地文件均被 Git 忽略。应用运行时不会加载 `.env.tools.local`，浏览器也不会收到数据库或管理凭据。变量模板见 `.env.example` 和 `.env.tools.example`。

停止本地服务：

```powershell
corepack pnpm db:stop
```

## 本地演示

`corepack pnpm demo:seed` 会幂等准备以下合成账号：

- `enterprise-a@qianzo.local`
- `enterprise-b@qianzo.local`
- `builder@qianzo.local`

三者共享的本地密码只保存在 `.env.tools.local` 的 `DEMO_USER_PASSWORD` 中，不会由 seed 输出。查看方式：

```powershell
Select-String DEMO_USER_PASSWORD D:\Qianzo\.env.tools.local
```

建议按以下顺序验收，括注是每步应当看到的结果：

1. 使用企业 A 登录，创建标题和原始需求，进入详情并编辑保存。（保存后显示“草稿已保存。”，版本从 1 变 2）
2. 刷新、退出后重新登录，确认草稿和递增后的版本仍存在。（刷新后内容不丢，说明写进了真实数据库）
3. 使用企业 B 登录，确认列表中没有 A 的项目；直接访问 A 的项目 UUID 也返回不存在。（返回 404，不是 403、也不是空白页）
4. 使用 Builder 登录，确认默认进入「招募浏览」；直接访问 `/enterprise/projects/new` 会回到 `/projects`，不能创建企业草稿。
5. 在两个页面同时打开同一版本，先后保存；第二次保存应提示刷新，不覆盖第一次内容。（旧标签页提示“项目已被更新，请刷新页面后再编辑”）
6. 回到企业 A 的草稿，进入「需求访谈与 Spec」，按 Mock AIPM 的提问回复两轮，然后点「生成候选 Spec」。（右侧出现只读候选预览，含使用者角色、功能范围、里程碑与验收）
7. 点「采用为当前 Spec 版本」，在结构化 Spec 表单里编辑项目目标或其他字段，再点「保存为新版本」。（表单覆盖完整 Spec；版本历史出现版本 2，可点「版本 1」查看只读历史）
8. 返回项目总览填写参考预算（例如下限 1000、上限 2500.50），然后回到 Spec 页点「确认锁定当前版本」。（金额以整数分保存；锁定后访谈、采用、另存与改预算入口都关闭，标题与需求也被冻结）
9. 进入「企业定金与发布」，先「创建企业模拟定金」再「模拟支付成功」。（金额固定为 ¥1.00，页面注明是模拟金额、不发生真实收付；付款成功不会自动发布）
10. 在结构化脱敏编辑器里替换需要保密的文字，检查预览和全部验收标准及验证方法，勾选「我已确认这是最终预览」后发布。（ID、条目数量与顺序、引用和工期不可编辑；文字变化后须重新确认）
11. 用 Builder 登录并打开「招募浏览」。（能看到已发布项目、脱敏后的完整 Spec、参考预算与周期；看不到企业的原始需求、访谈对话、账号或付款明细）

第 3、4、5 步验证隔离与并发，第 6～11 步验证 S1 链路：锁定不可改写、定金只生效一次、发布原子且不可回滚、招募视图只暴露脱敏快照。这些点都在服务端和数据库上验证，不是前端隐藏按钮。

## 验证

首次运行 Playwright 前安装 Chromium。若希望安装到 D 盘：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = 'D:\PlaywrightBrowsers'
[Environment]::SetEnvironmentVariable('PLAYWRIGHT_BROWSERS_PATH', $env:PLAYWRIGHT_BROWSERS_PATH, 'User')
corepack pnpm exec playwright install chromium
```

在 `db:start`、`db:prepare` 和 `demo:seed` 之后运行：

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm test:integration
corepack pnpm test:e2e
```

集成测试连接真实本地 PostgreSQL、Supabase Auth 和 Data API；E2E 使用真实登录 cookie 及独立浏览器 context，不以固定用户 mock 授权。

三点注意：

- **E2E 对生产构建运行**：`test:e2e` 的 `webServer.command` 是 `corepack pnpm build && corepack pnpm start`，会在 `timeout: 300_000` 内自行完成生产构建并启动服务，全新环境不必手动 `build`/`start`。之所以不复用 `next dev`：dev 冷启动会为第一个用例现场编译 Server Action，可能超出用例超时造成假失败；完整用例数量和耗时以当前测试运行结果为准。
- `reuseExistingServer` 在本机（非 CI）为 true：只要 <http://127.0.0.1:3000> 已有服务（`dev` 或 `start`）就会直接复用而不重新构建；若希望强制对全新生产构建运行，先停掉 3000 端口的服务再执行。命令统一写作 `corepack pnpm ...`（本机 `pnpm` 不在 PATH，corepack 随 Node 24 提供且就在 PATH 上）。
- `build` 与 `test:e2e` 会重建 `.next/` 与 `test-results/`，属正常清理；`build` 后根目录不会产生 `tsconfig.tsbuildinfo`（已重定向到 `.next/cache/`）。

## 仅重建本地合成数据库

```powershell
corepack pnpm db:reset
corepack pnpm demo:seed
```

`db:reset` 会先确认数据库位于 loopback，再清空并从 migration 重建本地合成数据库，同时重新准备运行时账号。它不会接受远程数据库地址，也不会由普通启动流程自动执行。该命令会删除本地项目草稿，重建后必须重新执行 `demo:seed` 才会重新出现演示账号。

只验证「空库顺序重建」而不动本地数据时，可在同一个 Postgres 实例里另建一个 scratch 数据库、按文件名顺序重放 `supabase/migrations/*.sql`（只补一个最小的 `auth.users` 桩件），验证完直接删除该库。S1 的实际执行记录见 [PROJECT_STATUS](docs/PROJECT_STATUS.md)。

停止开发服务器用 `Ctrl+C`；停止本地 Supabase 用 `corepack pnpm db:stop`（下次需要先 `db:start` 并重新 `db:prepare`）。

## 当前边界

- S1 累计 7 张业务表：`app.users`、`app.user_roles`、`app.projects`、`app.aipm_sessions`、`app.aipm_messages`、`app.spec_versions`、`app.payments`。
- 资源隔离由每个服务端入口执行；当前没有用户级 RLS，且不会宣称已有该隔离层。
- 链路到「项目 OPEN、其他登录用户可评估」为止，不是完整交易闭环：申请、选择、Builder Mock 押金与开工尚未开始。
- S1 不提供解锁、下架、重新发布或修改已公开内容；已发布快照、锁定范围与 Spec 历史均不可改写。
- 尚未实现真实 AIPM、真实支付、Workspace、文件上传、通知、管理员界面或生产部署。
- 演示账号与本地数据库只用于合成开发数据，不代表企业认证、合同接受或真实交易；模拟定金不代表真实收付。
- 下一施工项是 S2，开工需要新的明确授权。

## 权威文档

- [工程总纲](docs/QIANZO_MVP_V0_ENGINEERING_BLUEPRINT.md)
- [开发与 Git 工作流程](docs/DEVELOPMENT_WORKFLOW.md)
- [施工切片](docs/BUILD_SLICES.md)
- [S0 施工规格](docs/slices/S0-project-draft/README.md)
- [S1 施工规划：需求变成可招募项目](docs/slices/S1-spec-publish/README.md)
- [当前项目状态](docs/PROJECT_STATUS.md)

# Qianzo 项目状态

更新时间：2026-09-22

当前分支：`feat/s0-project-draft`

当前 Slice：S0 已完成本地实现与验收；S1 尚未开始。

## 已完成

- 建立 Next.js 16 / React 19 / TypeScript strict 应用，以及 pnpm、ESLint、Vitest、Playwright 和构建命令。
- 建立本地 Supabase 与两条 migration，仅创建 `app.users`、`app.user_roles`、`app.projects`。
- 应用以非 owner、非 SUPERUSER、非 BYPASSRLS 的 `qianzo_runtime` 连接；仅具有 S0 所需 DML，不能建表、删除、截断、改 owner/status 或提升角色。
- 接入真实邮箱密码 Auth、SSR cookie 刷新、退出、首次 onboarding、Enterprise/Builder allowlist 和 DISABLED 拒绝。
- 实现企业自己的项目列表、创建、读取和编辑；项目 UUID 支持创建意图重放，编辑使用行锁和 expectedVersion 防止旧页面覆盖新内容。
- 页面展示保存成功、输入失败和版本冲突；未知项目与其他企业项目统一视为不存在。
- 演示 seed 幂等准备两个企业和一个 Builder；高权限 Auth key 与演示密码只存在工具环境文件。

## 实际验证

2026-09-22 在 Windows 本机执行：

- `pnpm db:reset`：从空的 loopback 合成库成功应用两条 migration，并重新配置 runtime 账号。
- `pnpm demo:seed` 连续执行两次：成功，未重复用户或角色。
- `pnpm db:prepare` 在已准备的库再次执行：无待应用 migration，数据未被 reset。
- `pnpm typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过；当前没有独立单元测试文件。
- `pnpm test:integration`：3 个文件、23 个真实 PostgreSQL/Auth/Data API 用例通过。
- `pnpm test:e2e`：3 个真实浏览器用例通过，覆盖登录/刷新/退出、首次 onboarding、持久化草稿、双企业隔离、Builder 拒绝和旧版本冲突。
- `pnpm build`：通过；包含 `/sign-in`、`/onboarding`、项目列表、新建和动态详情路由。
- `pnpm start`：生产构建成功启动；未登录请求 `/enterprise/projects` 返回 307 并指向 `/sign-in`。

## 本地提交

- `1075fff chore(s0): bootstrap minimal application and local workflow`
- `9178132 feat(db): add S0 foundation tables with restricted runtime access`
- `76aa611 feat(identity): add authenticated onboarding and local demo users`
- `652a10a feat(projects): create and edit drafts scoped to the owner`
- S0-05 验收与文档位于包含本文件的 `test(s0)` 提交。

## 环境与远端

- Node.js 24.13.1，pnpm 11.19.0。
- Docker Desktop 4.91.0 / Engine 29.8.0；程序和数据安装在 D 盘。
- Supabase CLI 2.117.0；Playwright 1.63.0 / Chromium 153 安装在 D 盘。
- `origin` 为 `https://github.com/xuyuufan/QianZo.git`；开工时已核验远端无 refs。
- 当前提交仅在本地，尚未 push、创建 PR 或 merge。

## 已知限制与交接

- 当前是本地合成数据演示，不是生产部署；没有 CI、备份、生产监控或用户级 RLS。
- S0 不包含真实 AI、支付、文件、通知、管理员操作或完整交易链。
- Spec 可见性、报价、价格模式和选择后二次接受仍是 Pending Product Decisions。
- 下一 Slice 是 S1“需求变成可招募项目”；本轮明确停在一个持久化项目草稿，没有开始 S1。

# Qianzo 项目状态

更新时间：2026-09-23（S0 完成于 2026-09-22；2026-09-23 由独立会话复验、整理文档位置、推送远端并处理 PR #1 评审）

当前分支：`feat/s0-project-draft`（已推送，PR #1 待合入 `main`）

当前 Slice：S0 已完成本地实现与验收；[S1 施工规划](slices/S1-spec-publish/README.md)已完成，业务实现尚未开始。

权威文档位置：根目录只保留 `README.md` 与 `AGENTS.md`；总纲、Workflow、施工切片、本文件与切片施工说明集中在 `docs/`。

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

## 独立复验（2026-09-23）

由第二个执行者（非 S0 原实现方）在 Windows 本机、Node.js 24.13.1 / pnpm 11.19.0 上重新实际执行，不采信上一轮自述：

- `pnpm typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过；当前没有独立单元测试文件（`--passWithNoTests`）。
- `pnpm test:integration`：3 个文件、23 个用例通过，与上一轮记录一致。
- `pnpm build`：通过；生成 `/`、`/_not-found`、`/enterprise/projects`、`/enterprise/projects/[projectId]`、`/enterprise/projects/new`、`/onboarding`、`/sign-in` 共 7 条路由。
- `pnpm test:e2e`：3 个真实浏览器用例通过（34.1s），覆盖真实登录/刷新/退出、首次 onboarding、草稿持久化、双企业隔离、Builder 拒绝和旧版本冲突。
- `pnpm start`：本轮未重复执行；上一轮记录保持不变。
- 注意：`pnpm build` 与 `pnpm test:e2e` 会重建 `.next/` 与 `test-results/`；在带批量删除保护的环境中需要显式授权，这不影响项目本身的可构建性。

代码与边界独立复核结论：服务端入口逐个校验身份与资源归属，`app` schema 不对 Data API 暴露，`qianzo_runtime` 无建表/删除/改 owner 与提权能力，编辑走行锁加 `expectedVersion` 乐观并发；未发现与文档不符的实现。

## 本地提交

- `1075fff chore(s0): bootstrap minimal application and local workflow`
- `9178132 feat(db): add S0 foundation tables with restricted runtime access`
- `76aa611 feat(identity): add authenticated onboarding and local demo users`
- `652a10a feat(projects): create and edit drafts scoped to the owner`
- S0-05 验收与文档位于 `16aa688 test(s0): verify project draft isolation and document handoff`。
- `0144cc9 docs: collect authoritative documents under docs/`
- `43a799d chore: ignore the local agent workspace directory`
- `437687a chore: keep the TypeScript incremental cache out of the repository root`
- `acbd2e8 docs: make the README runnable on this machine`
- `8a55e9f chore(s0): join the initial empty main into the S0 branch`
- `6ee3092 fix(db): keep runtime inserts column-scoped`
- `1036031 fix(identity): return an auth error when the onboarding session expires`
- `c15124b fix(identity): allow active users to repeat onboarding`
- `669d54a test(s0): reject non-loopback targets before destructive test setup`
- `da289ba fix(db): revoke runtime memberships and temporary-table creation`
- `11de376 fix(db): revoke direct privileges from a reused runtime role`

## PR #1 评审修复（2026-09-23）

PR #1 上的自动评审提出 1 条 P1 与 3 条 P2；核对业务规则与文档后确认全部成立，逐条修复并各自独立提交：

- **P1 破坏性测试前未校验目标**（`669d54a`）：新增 `tests/helpers/local-env.ts`，在创建任何数据库或 Auth 客户端前拒绝非 loopback 地址；identity、projects 集成测试与两个 E2E spec 全部改走该 helper，`database-permissions` 复用同一实现而不是各自复制。
- **P2 runtime 表级 INSERT 覆盖列级授权**（`6ee3092`）：Drizzle 0.45.3 会把整表所有列写进 INSERT 列清单（缺省值写成 `default`），这是原先表级授权的根因；三处插入改为 `sql` 模板的显式列，迁移改为 `revoke` 表级授权并重新授予列级授权（PostgreSQL 表级 REVOKE 会同时清除列级授权，因此必须显式重授）。
- **P2 onboarding action 未处理会话过期**（`1036031`）：`requireAuth()` 移入受处理路径，过期会话返回与项目 action 一致的 `AUTHENTICATION_REQUIRED`，不再抛出未处理的 Server Action 失败。
- **P2 ACTIVE 用户无法重复 onboarding**（`c15124b`）：移除 ACTIVE 重定向，表单按当前资料与角色预填，Builder 落地页提供「增加企业身份」入口；DoD 第 5 条要求的「Builder 主动增加 ENTERPRISE」补了 E2E 用例。
- **P2 角色加固复审**（`da289ba`）：新提交后评审又指出两点，均已修。`NOINHERIT` 不阻止 `SET ROLE`，因此新增 `20260922020000_s0_runtime_role_hardening.sql` 撤销 `qianzo_runtime` 的全部既有角色成员关系；同时撤销数据库级 `TEMPORARY`（PostgreSQL 默认授予 `PUBLIC`，仅撤销 schema 的 `CREATE` 仍可建临时表），并只把 `TEMPORARY` 保留给实际存在的 Supabase 内置服务角色。测试新增成员关系为空、`SET ROLE` 被拒、`CREATE TEMP TABLE` 被拒三项；S0 规格第 6 节同步补记该边界。
- **P2 复用角色的直接授权**（`11de376`）：评审随后指出，撤销 `PUBLIC` 的 `TEMPORARY` 不会清除记录在 **角色自身** ACL 上的直接授权，foundation 明确支持复用既有角色，因此该角色仍可能建临时表。已用故障注入确认（直接授权后 `CREATE TEMP TABLE` 确实成功），修复为除 `PUBLIC` 外再从 `qianzo_runtime` 自身撤销数据库级 `TEMPORARY`/`CREATE` 以及 `app`、`public` schema 的 `CREATE`。测试新增权限边界断言与「注入直接授权 → 重放迁移 → 权限消失」的回归用例。

修复后的实际验证（Windows 本机、Node.js 24.13.1 / pnpm 11.19.0）：

- `pnpm typecheck`：通过。`pnpm lint`：通过。
- `pnpm test:integration`：3 个文件、34 个用例通过（新增越权 INSERT 拒绝、逐列授权校验、成员关系为空、`SET ROLE` 拒绝、`CREATE TEMP TABLE`/`CREATE SCHEMA` 拒绝、权限边界断言，以及「直接授予 `TEMPORARY` → 重放加固迁移 → 权限消失」的故障注入用例）。
- `pnpm test:e2e`：4 个用例通过（新增重复 onboarding 用例；撤销数据库级 `TEMPORARY` 并重放加固迁移后 Auth 与登录流程仍正常）。
- `pnpm build`：通过，仍为 7 条路由。
- 真实连接复核：`qianzo_runtime` 仅可插入 `users(id, display_name)`、`user_roles(user_id, role)`、`projects(id, owner_id, title, original_requirement)`；带 `status`、`version`、时间戳列的插入、`SET ROLE`、`CREATE TEMP TABLE`、`CREATE SCHEMA` 与两处 schema 建表均被拒绝；该角色无任何角色成员关系，`datacl` 中只剩 `CONNECT`。
- 已推送到 `origin/feat/s0-project-draft`（`32006c2..11de376`），并在 PR 上逐条回复评审结论指向对应 commit。**7 条评审（1×P1 + 6×P2）全部处理并已回复**，未见新增未处理评审；**未 merge**。

本地数据库说明：改已应用的 migration 时未使用 `db:reset`，而是 `supabase migration repair 20260922010000 --status reverted --local` 后用 `migration up --local` 重放，数据未丢失。

## 环境与远端

- Node.js 24.13.1，pnpm 11.19.0。
- Docker Desktop 4.91.0 / Engine 29.8.0；程序和数据安装在 D 盘。
- Supabase CLI 2.117.0；Playwright 1.63.0 / Chromium 153 安装在 D 盘。
- `origin` 为 `https://github.com/xuyuufan/QianZo.git`；开工时远端无 refs，2026-09-23 经 `gh api` 复核仍为空仓库（`size: 0`、无分支）。
- 2026-09-23 建立 `main`：一个空树根提交 `168b4ee chore: initialize the repository`，作为本 Slice 的 PR 基准分支。
  S0 分支原本是另一条独立根历史，因此以 `--allow-unrelated-histories` 把 `main` 接入 S0 分支
  （`8a55e9f`），建立共同祖先；未改写任何既有提交，也未经由强制推送。
- 已推送：`origin/main`（`168b4ee`）与 `origin/feat/s0-project-draft`（`11de376`，含三轮 PR 评审修复共 6 个提交）。
- 已创建 PR：<https://github.com/xuyuufan/QianZo/pull/1>（base `main` ← head `feat/s0-project-draft`）。
  按开发流程，本 Slice 建议以 squash merge 合入 `main`；**当前尚未 merge**。

## 已知限制与交接

### S1 规划核验（2026-09-23）

- 已读总纲、Workflow、BUILD_SLICES、S0 规格、根入口与状态记录，并核对项目 service/repository、数据库 schema/migration 和相关测试。
- 本次修改前工作区/暂存区干净，HEAD 为 `32006c2`；实时 `git ls-remote` 确认远端 S0 分支同为 `32006c2`，main 仍为 `168b4ee`。`gh pr view 1` 确认 PR #1 为 OPEN、未合并。前述远端 `8a55e9f` 是较早推送记录。
- 新增 `docs/slices/S1-spec-publish/README.md`，规划 IBQ-04～06 的六个实施任务：Mock 访谈、不可变 Spec 版本、锁定、企业 Mock 定金、脱敏发布与组合验收。
- 明确 S1 开工需使用包含 S0 的基线；现有 main 尚不包含应用。没有在本次规划中执行合并或远端写入。
- 本次仅修改文档，未改业务代码、运行 migration 或重跑业务测试；上述 S0 测试结果属于已注明日期的历史验收。S1 验收矩阵是计划，不是通过记录。

### 后续边界

- 当前是本地合成数据演示，不是生产部署；没有 CI、备份、生产监控或用户级 RLS。
- S0 不包含真实 AI、支付、文件、通知、管理员操作或完整交易链。
- Spec 可见性、报价、价格模式和选择后二次接受仍是 Pending Product Decisions。
- 下一 Slice 是 S1“需求变成可招募项目”；规划已落盘，实施从 S1-01 开始，当前应用仍停在持久化项目草稿。

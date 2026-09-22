# S0：真实登录与自己的项目草稿

**状态：已实施并完成本地验收（2026-09-22）。等级：V0 REQUIRED。对应 IBQ-01～03。** 本文件保留施工规格；实际环境、验证和提交状态见 [PROJECT_STATUS](../../PROJECT_STATUS.md)。

目标：企业使用真实 Supabase 登录后，可以创建、读取、修改自己的项目草稿；刷新后数据仍在；另一企业无法读取或修改该项目。

## 1. 开工入口与边界

先读 [AGENTS](../../AGENTS.md)、[工程总纲](../../QIANZO_MVP_V0_ENGINEERING_BLUEPRINT.md)、[开发与 Git 工作流程](../../DEVELOPMENT_WORKFLOW.md)，再按本 README 实施。[施工切片](../../BUILD_SLICES.md) 说明 S0 与后续 S1～S3 的关系。

- 本 README 补足 S0 的实现细节；范围和不变量服从总纲，commit/远端规则服从 Workflow。
- 实际开始实施需要用户明确要求执行 S0。仅阅读、规划或完善本文件，不构成业务开发授权。
- 已有总纲、Workflow、Slices、AGENTS 是现有成果；保留原位，不重造一套并列文档，不为 S0 强制搬到 docs。
- 只创建三个业务表：`app.users`、`app.user_roles`、`app.projects`。
- 不实现 AIPM、Spec、发布、申请、Payment、Workspace、文件、通知、审计平台或管理员界面；不预建其表和模块空壳。
- 不决定报价方式、固定价格、Spec 公开范围或选择后二次接受；这些仍是 Pending Product Decisions。
- 不增加身份映射、用户级 RLS、通用 Command Framework、通用幂等表、队列和生产部署。

S0 结束停在“一个持久化草稿”。S1 的下一步写入交接记录，不自动开始 S1。

## 2. 开工预检与技术基线

远端：`https://github.com/xuyuufan/QianZo.git`。文档准备时本地尚无 Git 工作区，远端历史和默认分支尚未核验；访问失败不能当作空仓库。

1. 清点现有文件；若已存在 Git，检查分支、工作区、暂存区和最近提交，保留他人修改。
2. 核验远端。已有历史时保留远端历史并把本地文档纳入 checkout；不得在非空文档目录直接覆盖 clone，不得为图省事建立冲突的新历史。
3. 只有确认远端为空才初始化 `main`；远端不可达时不猜默认分支，不 force-push。可继续独立的本地工作，但记录 Git/交付尚未完成。
4. 按 Workflow 建立 `feat/s0-project-draft`。缺少 Git 身份时不猜姓名邮箱，不修改全局配置。
5. 检查 Node、pnpm、Git、Docker CLI/引擎、Supabase CLI。Docker 引擎可用且本地 Supabase 可启动，是数据库与集成验收的前提。

预检时曾找到 Node/pnpm/npm/Git，Docker/Supabase 未在 PATH 中找到；这不证明绝对未安装，也不代表任一版本兼容或服务已运行。实施时重新核验。缺少 Docker 时完成不依赖它的工作，并报告阻塞；不得用内存库或 SQLite 替代后宣称 S0 验收通过。

| 项目 | S0 选择 |
|---|---|
| Runtime | Node.js 24 LTS，记录实际补丁版本 |
| Web | Next.js 16 App Router、React、TypeScript strict；Node.js Runtime |
| 包管理 | pnpm；固定 packageManager，提交 lockfile |
| 数据访问 | Drizzle + postgres.js；SQL migration 由 Supabase CLI 执行 |
| Auth | Supabase Auth + `@supabase/ssr`；邮箱密码登录 |
| 验证与测试 | Zod、Vitest、Playwright；集成测试使用本地真实 PostgreSQL |
| UI | 简单中文表单和列表；普通 CSS 即可，不先建设设计系统 |

安装时核验这些主版本的兼容稳定补丁并锁定版本；不要猜“最新版本”。不为 S0 新增 Tailwind、组件库或 CI 平台依赖。不得让初始化脚手架删除或覆盖已存在文档。

## 3. 最小交互与服务边界

| 路由 | 行为 |
|---|---|
| `/` | 未登录转 `/sign-in`；已登录但未 onboarding 转 `/onboarding`；企业转自己的项目列表；只有 Builder 时显示“已登录，后续切片开放接单” |
| `/sign-in` | 邮箱密码登录；失败使用通用错误；成功按上述身份进入页面 |
| `/onboarding` | 显示名、Enterprise/Builder 角色选择；角色可同时拥有 |
| `/enterprise/projects` | 仅显示当前企业用户的草稿、创建入口 |
| `/enterprise/projects/new` | 标题、原始需求，创建后进入详情 |
| `/enterprise/projects/[projectId]` | 查看并编辑自己的草稿；展示保存成功、验证失败和版本冲突 |

所有已登录页面提供退出登录。S0 通过本地演示账号验证真实认证，不要求注册、邮箱投递、密码找回、公司认证或完整 profile 页。

建议实际需要的文件布局如下；同一职责可在合理范围内合并，不预建空文件：

```text
src/app/                         页面及贴近页面的 Server Actions
src/proxy.ts                     Supabase SSR 会话 cookie 刷新
src/platform/auth/               SSR client、requireAuth / requireActor
src/platform/db/                 postgres.js 共享池、Drizzle schema
src/platform/config/env.ts       运行环境验证
src/modules/identity/            onboarding 与角色读取
src/modules/projects/           validation、service、repository
supabase/config.toml             本地 Supabase 配置
supabase/migrations/             SQL migration
scripts/                        本地角色凭据配置、演示账号准备
tests/integration/               数据库约束与服务授权测试
tests/e2e/                       真实登录和草稿流程
```

读取使用 Server Component → service/query → repository；写入使用 Server Action → Zod → service → repository。所有含数据库、凭据的模块标记 server-only。React 组件不调用 `supabase.from()`，无需为相同表单再建 REST API。

最小服务接口：

```ts
completeOnboarding({ displayName, roles })
listOwnProjects()
getOwnProject(projectId)
createProject({ projectId, title, originalRequirement })
updateProjectDraft({ projectId, expectedVersion, title, originalRequirement })
```

`projectId` 在创建表单首次展示时生成 UUID，一次提交意图复用；数据库主键提供最小重复提交保护。已存在且属于当前用户、原始创建内容相同则返回原项目；同 ID 不同内容返回冲突，不更新它；他人的 ID 返回不存在。创建请求重放遇到已编辑项目时可返回冲突，不需要建设通用响应重放系统。

每个服务端入口自行验证身份和资源关系，不能仅依靠页面跳转或 Proxy。项目接口的 Zod 输入使用严格字段校验，不接受客户端提供的 actor/userId/ownerId/status/role。onboarding 的 roles 是明确允许的普通输入，只能经第 4 节的 allowlist 校验后赋予参与身份，不能当作已有授权事实。

## 4. Auth 与 onboarding 决定

- 使用 SSR cookie 会话；服务端通过 Supabase `getUser()` 验证身份，不把客户端 session 或 metadata 当授权事实。会话刷新采用所安装版本的官方 SSR 实现；不得缓存共享用户响应。
- `requireAuth` 返回已验证 Auth UUID。`requireActor` 另读 `app.users` 状态和 `app.user_roles`；未 onboarding 跳转/返回相应错误，DISABLED 明确拒绝。
- `app.users.id` 直接等于 `auth.users.id`，不生成第二个 User ID，不建立 provider/subject 映射。
- onboarding 的角色选项严格限制为 ENTERPRISE/BUILDER，服务端验证后写 `user_roles`；这是允许用户选择参与身份，不是企业认证。
- 不读取 user_metadata 中的 role、不接受 ADMIN、不允许客户端修改 status。既有用户重复 onboarding 只更新显示名、幂等增加允许角色；不移除角色，不将 DISABLED 改回 ACTIVE。
- onboarding 在一个数据库事务中创建/更新平台资料及角色；并发重复请求不能生成多条用户或角色记录。
- 企业角色才能创建、编辑、列出自己的项目；仅 Builder 角色时相关动作返回禁止。未登录不能调用任何项目查询或变更。
- 登录、退出、保存全部走真实 Supabase/数据库；禁止增加“演示跳过鉴权”开关。

## 5. S0 数据库规格

所有时间为非空 `timestamptz`，默认 `now()`。外键默认 `ON DELETE RESTRICT`；S0 无物理删除功能。更新动作显式更新 `updated_at`，无需提前创建通用时间戳框架。

| 表 | 字段与约束 |
|---|---|
| `app.users` | `id uuid PRIMARY KEY REFERENCES auth.users(id)`；`display_name text NOT NULL`，trim 后 1～80 字符；`status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED'))`；created_at、updated_at |
| `app.user_roles` | `user_id uuid REFERENCES app.users(id)`；`role text CHECK(role IN ('ENTERPRISE','BUILDER'))`；created_at；`PRIMARY KEY(user_id, role)`；字段均非空 |
| `app.projects` | `id uuid PRIMARY KEY`；`owner_id uuid NOT NULL REFERENCES app.users(id)`；`title text NOT NULL`，trim 后 1～120 字符；`original_requirement text NOT NULL DEFAULT ''`，0～10000 字符；`status text NOT NULL DEFAULT 'DRAFT' CHECK(status='DRAFT')`；`version integer NOT NULL DEFAULT 1 CHECK(version>0)`；created_at、updated_at |

加 `projects(owner_id, created_at DESC)` 索引。标题和需求长度由 Zod 与数据库约束共同限制。预算、Spec 指针、发布快照、选中申请、付款和执行字段在后续使用时迁移增加；S0 不提前添加。

编辑采用事务内锁定项目并校验 owner、DRAFT、expectedVersion；成功 version 加一，旧版本保存返回 `VERSION_CONFLICT`，不覆盖较新的修改。不提供通用修改 status 的接口。查询和变更均按当前 actor 的 owner_id 限定；不先全量查询再前端过滤。

错误约定：未认证 401/跳转登录、仅 Builder 角色 403、访问其他企业项目或未知 ID 均为 404、输入错误 422、版本或重复意图冲突 409；Server Action 返回对应稳定错误码，界面保持可理解的中文提示。不输出 SQL、堆栈或凭据。

## 6. 数据库权限与凭据

- 业务表在私有 `app` schema，Supabase Data API exposed schemas 不含 app；撤销 PUBLIC/anon/authenticated 对业务 schema、表和函数的权限。
- 应用连接账号 `qianzo_runtime` 不是表 owner，无 SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE/REPLICATION，无迁移或建表权限，不允许通过角色成员关系提权。
- runtime 仅有数据库 CONNECT、app USAGE 及本阶段必要 DML：users SELECT/INSERT、UPDATE(display_name, updated_at)；user_roles SELECT/INSERT；projects SELECT/INSERT、UPDATE(title, original_requirement, version, updated_at)。不给 DELETE/TRUNCATE，不给改用户状态、owner 或 project status 的权限。
- 表由迁移账号创建；创建后精确授权，不使用“未来所有表全部可写”的默认 grants。runtime 在 public schema 同样不得具有建表权限。
- S0 不配置 app 表的 RLS policy，也不模拟 JWT 注入数据库。用户资源隔离由服务层承担，必须做越权测试。
- SQL migration 创建角色及 grants；角色密码通过独立的本地准备脚本安全注入，不硬编码进 migration，不回显密码。
- 应用进程只读取 runtime DATABASE_URL。迁移管理员连接与 seed 的 Auth 管理 key 仅给专用工具进程，不放入应用自动加载的 env 文件。

本地 scripts 可使用高权限创建合成 Auth 用户和测试数据，但不能让正常应用以同样凭据启动。不得以“测试方便”为由用 postgres URL 跑应用或只测试管理员连接。

## 7. 必须交付的本地工具与说明

以下 S0 scripts 接口已经建立；实际使用顺序和验证结果记录在根 README 与 `PROJECT_STATUS.md`。

| scripts | 用途 |
|---|---|
| `pnpm dev` / `build` / `start` | 本地开发、生产构建、本地运行构建产物 |
| `pnpm lint` / `typecheck` | ESLint CLI、TypeScript；不使用已不适用的 next lint |
| `pnpm test` | 非 watch 模式单元测试 |
| `pnpm test:integration` | 本地 Supabase 上的真实数据库、角色权限和服务授权测试 |
| `pnpm test:e2e` | Playwright 真实登录、onboarding、草稿与越权验收 |
| `pnpm db:start` / `db:stop` | 通过项目固定的 Supabase CLI 管理本地开发实例 |
| `pnpm db:prepare` | 应用待执行的本地 migration，配置 runtime 登录凭据；可重跑，不删除数据 |
| `pnpm db:reset` | 只允许显式重建本地合成数据库；默认启动流程不调用 |
| `pnpm demo:seed` | 幂等准备两个企业、一个 Builder 的合成 Auth 账号；无真实个人资料 |

db/seed/test 脚本明确拒绝非 loopback 或未经识别的数据库目标，不连接远端业务数据库；reset 在 README 中明确标注会清空本地合成数据。先验证目标再变更，不能把是否生产只寄托于任意环境字符串。

演示账号通过 Supabase Auth Admin API 创建并确认邮箱；仅工具持有管理 key。seed 账号不自动授予 ADMIN，平台角色由同一 onboarding 服务确定。允许种入已完成 onboarding 的账号方便重演，同时保留一个可验证首次 onboarding 的测试用例。

新增 `.env.example`（无真实值）说明应用必需变量：`APP_ENV=local`、`APP_BASE_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`DATABASE_URL`。若本地 CLI 仅提供 legacy anon key，可作为客户端 publishable 凭据使用并说明兼容性；绝不可用 service-role key 替代。

工具专用 `.env.tools.example` 单列管理员数据库 URL、runtime 待设置密码、Supabase Auth 管理 key、演示密码；本地副本 `.env.tools.local` 只由对应工具显式加载。运行时启动、build 或浏览器不得加载它。命名和实际读取方式必须在 README 对齐。

`.gitignore` 忽略 `.env*` 的本地秘密副本并保留上述 example、node_modules、.next、测试缓存/trace、Playwright 会话文件和 Supabase 临时状态。应用 env 缺项给出变量名提示，不打印值；不提交演示账号真实密码、token 或数据库连接串。

根 README 写明从已有 checkout 到运行的步骤、Docker 要求、环境模板、migration/seed 顺序、验证命令、两账号操作步骤及已知限制。新增 `PROJECT_STATUS.md` 记录实际状态；不为 S0 预建更多架构文档。

## 8. 五个实施任务与 commit 节点

每个任务按 Workflow 检查 diff、运行相应验证、明确路径暂存、检查 staged diff，完成后默认本地 commit；不默认 push/PR/merge。已有 Git/身份问题应如实记录，不用未提交冒充完成。

| Task | 工作与依赖 | 该任务验收与建议 commit |
|---|---|---|
| S0-01 | 核验 Git/历史并保留文档；初始化最小 Next/TS、配置与 scripts；不覆盖现有材料 | typecheck/lint/build 通过；`chore(s0): bootstrap minimal application and local workflow` |
| S0-02 | 依赖 01；本地 Supabase、三表 migration、runtime 最小权限、Drizzle schema、工具 env 与本地脚本 | 空库 migration 与 db:prepare 可重跑；runtime 正常读写和禁止操作验证；`feat(db): add S0 foundation tables with restricted runtime access` |
| S0-03 | 依赖 02；真实登录/退出、SSR session、onboarding、角色检查、两企业一 Builder 演示数据 | 登录/刷新/退出；重复 onboarding；禁用用户和伪造角色被拒绝；`feat(identity): add authenticated onboarding and local demo users` |
| S0-04 | 依赖 03；自己的列表、创建、读取、编辑；版本冲突和错误提示 | 刷新持久化；双企业越权；Builder 拒绝；重复创建与陈旧版本验证；`feat(projects): create and edit drafts scoped to the owner` |
| S0-05 | 依赖 04；补齐组合 E2E、新环境重演、README/状态和交接 | 本节后全部验收通过；`test(s0): verify project draft isolation and document handoff` |

S0-05 是组合验收，不允许把 02～04 的权限测试推迟到最后。每个任务可以有必要的修复 commit，但不为无关重构扩大范围。

## 9. Definition of Done 与测试用例

必须全部满足，才称为 S0 完成：

1. 未登录访问项目页面进入登录；直接调用项目动作也被拒绝。
2. 企业 A 登录并完成 onboarding，可创建标题和原始需求；成功后显示数据库中的同一个草稿。
3. A 编辑草稿，刷新、退出重新登录后仍显示更新内容，version 递增。
4. 企业 B 登录时列表不出现 A 的项目；已知 A 的 UUID 也无法直接读取或修改，返回不存在，数据库内容不变。
5. 只有 Builder 角色的账号不能创建/编辑项目；伪造项目请求字段、Auth metadata 或浏览器状态不能获得 ENTERPRISE/ADMIN 权限。按允许的 onboarding 流程主动增加 ENTERPRISE 是独立合法操作，增加后才允许企业动作。
6. 重复 onboarding 不重复用户或角色，不解禁 DISABLED；禁用用户的页面和直接动作都拒绝。
7. 两个已打开的编辑页使用同一旧版本保存：只有首次合法提交成功，后者显示冲突，不丢失前者内容。
8. 同一创建意图重复提交只产生一个项目；非法标题/需求长度被服务和数据库共同拒绝。
9. Data API 不能访问 app；anon/authenticated 不能直接 SELECT/INSERT 业务表。用真实 runtime 连接验证无 CREATE TABLE、TRUNCATE、DELETE、修改 owner/status 或提升数据库角色的权限。
10. Auth 成功不会让浏览器拿到数据库/管理凭据；退出后受保护查询与动作被拒绝。不存在依赖内存数组或 localStorage 的业务持久化。
11. typecheck、lint、相关单元测试、真实集成测试、Playwright E2E、build 均实际执行并通过；外部前置缺失时列出未执行项目，不写“通过”。
12. 专用本地合成库能从空库应用 migration、准备账号并重演；在已有库重跑 db:prepare 不丢失项目。重建只在明确的测试数据库中执行。
13. 文档与实际命令一致；完成内容有 commit SHA；git status 与远端状态如实记录；没有开始 S1。

单元测试集中验证输入和版本规则；授权与数据库权限必须在真实 PostgreSQL 连接下验证。E2E 使用真实登录 cookie，至少两个隔离浏览器 context，不把 requireActor mock 成固定企业用户后称为权限验收。

## 10. 交付与下一步

按照 Workflow 交付，并把事实同步到 `PROJECT_STATUS.md`：

```text
完成：S0 实际可操作的页面、服务与三张表
验证：每条实际命令、结果；未执行项和原因；如何重演双用户验收
提交：commit SHA + message；未提交内容及原因
远端：已核验的 origin/default branch；未推送或已授权执行的远端结果
剩余：已知限制、环境阻塞；下一 Slice 是 S1，尚未开始
```

S0 无需解决 Pending Product Decisions，不等待真实 AI、支付或部署。如果发现远端已有实现、版本不兼容或原有资料冲突，先核验并复用已有能力；变更本 README 的实施假设时同步记录，不静默推翻总纲，也不靠绕过权限来通过演示。

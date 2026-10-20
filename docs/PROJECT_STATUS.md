# Qianzo 项目状态

更新时间：2026-10-20（PR #2 已合并；PR #3 新复审修复与最终验证通过，主模型审查 PASS）

当前分支：`codex/s1-review-closeout`，PR #3 已审核衔接基线 `42e692a84d5e517d2e500c823ac0d4a713ed2005` 的 tree 与 UI HEAD `8989517` 相同，并已同步到 `feat/lovable-ui-parity`。本次延迟角色导航修复、E2E 回归与文档更新已通过主审和最终验证；接下来按已授权流程更新现有 PR #3 并合并。

远端状态（本次本地提交前）：[PR #2](https://github.com/xuyuufan/QianZo/pull/2) 已于 2026-10-15 squash 合并，merge commit 为 `6a9e5a9e0c79258953122022952e0c7538d3e985`；[PR #3](https://github.com/xuyuufan/QianZo/pull/3) 为 OPEN，base=`main`，远端 head=`42e692a84d5e517d2e500c823ac0d4a713ed2005`。主模型于 2026-10-20 发现第 4 条未解决 UI 评审意见；本地修复、最终验证和主审均已通过，接下来按已授权流程更新现有 PR 并合并。

当前 Slice：S1「需求变成可招募项目」已完成并合入 `main`；PR #3 的 UI 基线修复已通过本地主审与验证，等待按授权流程合并。S2 尚未开始；待 PR #3 合并、在最新 `main` 复验后再开始 S2。平台与 AIPM 由同一项目团队端到端负责，Provider 替换保持内部模块边界；报价、二次接受、可见性等 PPD 仍为 Pending。

权威文档位置：根目录只保留 `README.md` 与 `AGENTS.md`；总纲、Workflow、施工切片、本文件与切片施工说明集中在 `docs/`。

## PR #2 / PR #3 基线衔接（2026-10-15）

PR #2 的准确 head `736c42c0fe02f8b3a13ea71cb9eabce4d6e7ff49` 已合并；合并后的 `origin/main` 与该 head 的 tree 均为 `72c9c140a7863c7e3ebf01e357320d2fe810e066`，`git diff --exit-code 736c42c origin/main` 返回 0。PR #3 原 head `8989517` 的 tree 为 `9b6f8a075787c4a70ae0731e8275170118418d83`；新的祖先衔接提交 `42e692a` 以 `8989517` 为第一父提交、`6a9e5a9` 为第二父提交，tree 保持 `9b6f8a07...` 不变。该提交只补上 squash 后的祖先关系，没有丢弃 main 树上的差异。

PR #3 已更新为 base `main`。在 2026-10-15 衔接提交 `42e692a` 时，base→head diff 为 68 个文件（6,152 insertions / 1,194 deletions），包含 UI、UI 回归、静态素材与当时已审规范更新；没有 migration，也没有 AIPM/Spec/Payment repository 或 service 变更。AIPM 路径的 `contract.ts`、`gateway.ts` 只改注释以表达版本化模块契约和未来 Provider 边界；`src/app/actions/auth.ts` 仅传递经过白名单校验的 UI 导航意图。2026-10-20 新增修复与验收见下方同日复审记录。

流程依据：[GitHub CLI `gh pr merge`](https://cli.github.com/manual/gh_pr_merge) 与 [GitHub 修改 Pull Request base 的文档](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/changing-the-base-branch-of-a-pull-request?apiVersion=2022-11-28)。树完全相同后使用普通 Git 祖先衔接；随后普通非 force push，并通过 `gh pr edit --base main` 更新现有 PR，不创建新 PR。

PR #2 准确 head 的基线验证：typecheck、lint 通过；87 个 unit 与 115 个 integration 用例通过；production build 输出 11 个 routes；5/5 production E2E 通过。使用的是与 PR #2 package/lock 直接依赖版本一致的本地已安装二进制，没有重建全新 frozen install。原 E2E 的 3 个 Builder 失败来自本地 seeded `builder@qianzo.local` 实际为 ACTIVE 双角色；仅在测试窗口移除额外 ENTERPRISE 行后 5 例通过，并按备份精确恢复角色、状态及 `created_at`。初次失败、5/5通过记录和恢复备份保存在 ignored `artifacts/ui-parity/merge-verification-20261015/pr2/`；之后 PR #2 的 10 条已核验 review thread 均标记 resolved。

截至 2026-10-15 的记录，本分支 PR #3 完整验证及新增回归见下文，当时尚未合并 PR #3。没有 `db:reset`。S2 仍未开始。

## PR #3 复审补充（2026-10-20）

第 4 条新评审意见指出：首页 `chooseRole` 通过 1,300ms（普通动效）或 320ms（减少动态效果）延迟调用 `router.push`，用户在等待中通过浏览器返回离开时，待执行的回调仍会改写其后续导航。新增 E2E 从登录页通过站内链接进入首页、选择开发者、按返回并等待超过 1,300ms；验收要求留在原登录意图。

修复在首页保留一个 timeout handle，并在组件卸载清除未完成的定时器；原转场与延迟不变。修复前 production 回归失败，离开后被推到 `sign-in?intent=builder`；修复后 targeted production E2E 通过 1/1。记录在 ignored `artifacts/ui-parity/merge-verification-20261020/role-transition-back-pre-fix.log`、`role-transition-back-pre-fix-error-context.md` 与 `role-transition-back-post-fix.log`。

本次复用候选：[React 官方 `useEffect` 清理示例源码](https://github.com/reactjs/react.dev/blob/main/src/content/learn/synchronizing-with-effects.md)展示了 effect cleanup 调用 `clearTimeout`；已采用这一标准模式，不引入外部包或定时器框架。本地 Next 16 指南 `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` 及 `01-app/03-api-reference/04-functions/use-router.md` 确认 App Router Link 和 `router.back()` 使用客户端历史导航，因此回归覆盖组件卸载后的实际浏览器返回路径。

最终修复后检查：typecheck、lint 通过；100/100 unit、115/115 integration、16/16 production E2E 通过。Playwright production webServer 执行了 `corepack pnpm build && corepack pnpm start`；full E2E 日志、退出码 0 及 `.last-run.json` 保存在 ignored `artifacts/ui-parity/merge-verification-20261020/full-production-e2e.log`、`full-production-e2e-exit.txt` 与 `full-production-e2e.last-run.json`。完整套件在 `builder@qianzo.local` 的 ACTIVE BUILDER/ENTERPRISE 双角色下运行，测试前后角色状态和原始时间戳均核验一致，具体行值只保存在 ignored 的 `pre-run-builder-role-verification.txt` 与 `post-run-builder-role-verification.txt`。此前 2026-10-15 的 `.last-run.json` 只保存 `passed`/空 `failedTests`，无可核对的最终计数或进程退出记录，已标为不完整证据；当前验收不以其计数。

## FIX-BASELINE 首次通过记录（2026-10-15；当时尚未更新远端）

以下记录保留了 FIX-BASELINE 首次审核通过、远端尚未更新时的状态与证据；当时“本轮没有 push/merge”描述的是这一阶段，不代表当前远端状态。

PR #3 的新意见在该记录时仍保持远端未解决状态；以下本地修复与生产回归已通过主模型审核并提交：

| 新评审意见 | 本地处理与证据 |
|---|---|
| [公开 Spec 的结构 ID 通过 RSC/Flight 泄露](https://github.com/xuyuufan/QianZo/pull/3#discussion_r4164384769) | `SpecDocumentView` 在公开模式下对所有列表使用序号 key；未知角色、功能和交付物引用显示通用文案。修复前生产测试在初始 HTML 和真实客户端导航请求的同会话 Flight 重放载荷中均找到 15 个特制 ID；修复后两者均不含这些 ID，企业私有 Spec 仍保留它们。单元测试另覆盖缺失引用 fallback。 |
| [单角色用户无法从 header 打开身份设置](https://github.com/xuyuufan/QianZo/pull/3#discussion_r4164384780) | `ProjectHeader` 对所有已登录角色显示「身份设置」入口；生产 E2E 覆盖 Enterprise-only、Builder-only 经入口添加 Enterprise，以及双角色切换；双角色 header 在 390px 下无水平溢出。 |
| [最终 production E2E 数量记录过期](https://github.com/xuyuufan/QianZo/pull/3#discussion_r4164384790) | 新增公开 HTML/Flight 隐私回归后，本轮完整 production E2E 为 **15/15 通过**；2026-10-02 的 14 例是当时历史数量。 |

本轮实际验证：`corepack pnpm typecheck`、`lint` 通过；单元 **12 文件 / 100 例**、集成 **9 文件 / 115 例**通过；`corepack pnpm test:e2e` 以生产构建运行，**15 例全部通过（约 1.4 分钟）**。另行执行的 `corepack pnpm build` 通过，Next.js 16.3.5 输出 **11 个 app 路由**。修复前先运行公开 ID 和身份入口回归，复现上述问题；第一次 E2E 探针的响应体读取竞态已修正后才记录泄露结果。没有执行 `db:reset`。

失败边界：修复前完整 production E2E 为 **12/15**；两条身份用例确实因缺少设置入口失败，公开 ID 用例首次失败是测试探针在导航后读取响应体的竞态，不作为产品缺陷证据。修正探针后，在未修改产品代码的构建上，独立回归从原始 HTML 和真实 Link 导航请求的同会话 Flight 重放中复现 15 个 ID 泄露，同时确认私有 Spec 保留 ID。

复用检查：参考 [React 官方渲染列表与 key 文档源码](https://github.com/reactjs/react.dev/blob/main/src/content/learn/rendering-lists.md)，没有找到需要引入的外部实现；按当前静态有序列表使用序号 key，不复制代码或引入依赖。实现前还阅读了本地 Next.js 16.3.5 `data-security.md`、`server-actions.md` 与 `Link` 文档，依据 RSC/Flight 序列化边界加原始载荷回归；未采用外部框架或测试基础设施。

本轮没有 push、创建 PR、评论或关闭 GitHub 线程，也没有 merge。S2 等待更新既有 PR、用户授权合并及合并基线复验；PR #2/#3 的合并依赖及次序保持不变。

## Codex 评审修复历史记录（2026-10-02，按当时状态）

以下评审线程数量、分支和远端状态截至 2026-10-02；新的状态见文首基线衔接记录。

针对 `e68b0d9` 上新增的 3 条 P2，逐条复现后完成修复；代码与回归用例提交为 `68b5193`，已推送到 PR #3。

| 评审问题 | 最终处理与浏览器证据 |
|---|---|
| [隐藏首页视频后仍下载/播放](https://github.com/xuyuufan/QianZo/pull/3#discussion_r4163281103) | 媒体查询不匹配时显式 `pause()`，移除 source 后 `load()` 释放所选资源；重新匹配时重新选择资源，区分旧加载事件与真实错误，保留加载失败时的海报回退。回归覆盖桌面播放 → 手机暂停且无媒体缓冲 → 桌面重新播放 → reduced-motion 再次释放。 |
| [版本冲突时确认放弃仍恢复旧草稿](https://github.com/xuyuufan/QianZo/pull/3#discussion_r4163281109) | 在确认后的 reload 前调用 `clearSpecDraftFor(projectId)`。独立合成账号的回归先验证刷新恢复，再通过另一标签页真实保存预算制造版本冲突；取消放弃保留草稿，确认放弃清除草稿并恢复服务端 Spec。 |
| [采用新 Spec 后复用旧锁定确认](https://github.com/xuyuufan/QianZo/pull/3#discussion_r4163281113) | 以 `current.id + projectVersion` 为 `LockSpecForm` 的 key；Spec 或项目修订变化时重建确认状态。回归覆盖确认 v1 → 采用候选 v2 → 复选框未选、锁定按钮禁用、数据库仍未锁定 → 重新确认后只锁当前 v2。 |

新增用例先对修复前的生产构建执行，分别证实仍在播放、已放弃草稿仍存在、旧确认仍勾选；随后对最终新构建回归通过。新增 Spec 测试只建立测试起始状态，操作走真实登录与 Server Actions，清理仅针对本套件独立创建的合成账号；本地项目数测试前后均为 0，没有运行 `db:reset`。

本次最终验证：`corepack pnpm typecheck`、`lint` 通过；单元 **11 文件 / 99 例**，集成 **9 文件 / 115 例**，生产构建 **11 条路由**，生产服务上的完整 E2E **14 例全部通过（约 1.2 分钟）**；`git diff --check` 通过。

远端已逐条核对并解决 PR #3 的 **16 条线程（13 条历史 + 3 条本轮），未解决数为 0**。历史意见的最终处理以对应修复源码及下文复核记录为准，特别是历史离开守卫采用已有的草稿恢复方案。刷新恢复与取消/确认放弃已有本轮 E2E 覆盖；直接浏览器 Back/Forward 的拦截仍为 best effort、尚无自动化断言，存储不可用时也不能保证恢复。

最新自动评审针对修复前的 `e68b0d9`；解决线程不等于新提交获得 APPROVED review。PR #3 仍为 OPEN，依赖 PR #2；本轮未执行 merge，S2/S3、真实 AI/支付和生产部署继续保持未实施。

## PR 就绪复核（2026-10-02）

核查时应用代码基线为 `638aa72`，本地与远端 UI 分支一致，工作区干净；远端 PR #2 与 #3 均为 OPEN、非 Draft、MERGEABLE/CLEAN。现有 PR 已覆盖本轮交付，不重复创建。

- **本次实际运行**：`corepack pnpm typecheck`、`lint` 通过；`test` 为 11 文件、99 例通过；`test:integration` 为 9 文件、115 例通过（含独立 scratch 库迁移链重建）；`build` 通过、11 条路由；新生产构建的 `start` + `test:e2e` 为 11 例通过（56.8 秒）。E2E 使用真实本地 Auth/PostgreSQL，覆盖 S0→S1 发布、招募脱敏与角色/企业隔离。
- **本地环境**：启动 Docker Desktop 后复用原有健康的 Qianzo 容器；测试前已有 9 条 migration、3 个演示 Auth 账号、0 个项目，未执行 `db:reset`。根目录被忽略的旧 `.env` 含其他 `SUPABASE_PROJECT_ID`，导致第一次 `db:prepare` 查找错误的本地容器；在当前 shell 指定 `$env:SUPABASE_PROJECT_ID = 'qianzo'` 后重跑成功，无待应用迁移。根 README 已补充该设置，环境文件和凭据未纳入提交。
- **独立静态复审**：核对草稿恢复、版本同步、锁定后禁写、脱敏确认、公开 DTO，以及 PR #3 的 13 条评审线程；现有源码或明确记录的取舍已处理这些意见，本次未发现新的实际阻塞问题。相对 S1 的 `git diff --check` 通过，业务模块、平台层与 migration 无改动，未发现新增凭据或生成垃圾。
- **证据边界**：仓库没有 CI checks，也没有正式 APPROVED review；评审线程尚未形式上 resolved。浏览器前进/后退及返回编辑器恢复草稿仍无自动化断言，现有历史守卫与存储不可用时的恢复为 best effort，不能将上述 E2E 结果解释为这些路径已覆盖。
- **远端交付**：本轮更新既有 PR #3 的说明与验证记录，不执行 merge。PR #2 应先合入 `main`，随后处理 PR #3 与合并后基线的衔接、重新核查 diff 和验证，再将 base 调整为 `main`；不能因当前 stacked diff 无冲突而省略这一步。

本轮只补齐交付文档与 PR 记录；S2/S3、真实 AI、真实支付及生产部署继续保持未实施。

## S1 已完成

S1-01～S1-06 六个任务全部落地，链路为「草稿 → Mock 访谈 → 候选采用/手工另存 → 锁定范围与参考预算 → 企业 Mock 定金 → 脱敏确认 → 发布 → 招募浏览」。

- **Mock AIPM 访谈（S1-01）**：共享 `SpecDocumentV1` 校验器（必要内容非空、元素 ID 全局唯一、引用有效、每条里程碑至少一条验收标准、`dueAfterDays` 正整数且严格递增）、双向 Contract Schema 与平台侧响应校验、确定性 Mock Gateway（同输入同输出，可注入 FAILED/错误关联/非法文档）。新增 `app.aipm_sessions`、`app.aipm_messages`（只追加，`UNIQUE(project_id)` 与 `UNIQUE(session_id, sequence)`）；调用在事务外执行，生成基线不匹配时候选标记为过期。
- **不可变 Spec 版本（S1-02）**：新增 `app.spec_versions`（`UNIQUE(project_id, version_no)`、`UNIQUE(project_id, id)`、`UNIQUE(source_message_id)`，只追加）；`Project.current_spec_version_id` 用复合外键 `(id, current_spec_version_id) → spec_versions(project_id, id)` 保证指针只能指向本项目版本。候选采用取自落库 payload 而非客户端，重复采用返回原版本，手工保存永远新增版本。访谈请求开始携带 `baseSpec`。
- **参考预算与锁定（S1-03）**：预算三列同生同灭、非负、下限不高于上限、币种 3 位大写，金额按字符串解析成整数分；锁定前必须有完整预算。锁定冻结标题、原始需求、预算、current 与 locked 指针，用窄触发器兜底，锁定后访谈、采用、另存、改预算、旧标签页保存全部被拒，历史仍可读。
- **企业 Mock 定金（S1-04）**：新增 `app.payments`（`UNIQUE(project_id, purpose)`）；金额、币种、付款人与用途由服务端 fixture 与 owner 决定（S1 演示固定 CNY 100 分），客户端无法指定。`PaymentProvider` 只有 `createPayment`，Mock 专用的 `simulatePaymentSuccess` 不在接口内；成功后不可回退或改写时间，重复请求返回当前结果且不重复递增版本。
- **脱敏发布与招募浏览（S1-05）**：`Project` 增加 `published_spec_snapshot`/`published_at`，`status` 扩展为 DRAFT/OPEN 并要求 OPEN 同时具备锁定指针、锁定时间、完整预算、快照与发布时间；守卫触发器扩展为已发布内容不可改写。发布在单事务内依次锁定 Project 与 Payment 并校验来源版本、`expectedVersion`、确认标志与已成功的定金，失败整体回滚。脱敏只允许替换文字，结构 ID、引用、条目数量、里程碑顺序与 `dueAfterDays`、每条验收标准都必须保留。快照是白名单，招募查询只 SELECT OPEN 行的快照列并返回独立 DTO；新增 `/projects` 与 `/projects/[projectId]`。
- **组合验收与文档（S1-06）**：本文件、S1 切片说明与根 README 的演示步骤同步更新；E2E 串起完整 S0→S1 链路并断言招募响应不含私有信息。

数据库累计 7 张业务表（`users`、`user_roles`、`projects`、`aipm_sessions`、`aipm_messages`、`spec_versions`、`payments`）与 9 条 migration；`qianzo_runtime` 对不可变历史只保留 SELECT 与列级 INSERT，对 Project/Payment 只开放流程需要的列级 UPDATE，且无 DELETE、无 DDL、无提权。

## S1 实际验证

2026-09-24 在 Windows 本机（Node.js 24.13.1 / pnpm 11.19.0）执行：

- `pnpm typecheck`：通过。`pnpm lint`：通过（无警告）。
- `pnpm test`：9 个文件、87 个单元用例通过（`SpecDocument` 17、money 23、AIPM Contract 14、mock gateway 7、脱敏规则 10、`stableJson` 4、错误映射 5、字段级错误 3、编辑器同步 4）。`test` 脚本已移除 `--passWithNoTests`，S1 不依赖空跑通过。
- `pnpm test:integration`：9 个文件、115 个真实 PostgreSQL/Auth 用例通过（identity 5、projects 6、database-permissions 34、aipm-interview 15、spec-versions 12、spec-lock 11、enterprise-deposit 12、publish-recruitment 15、migration-rebuild 5）。
- `pnpm build`：通过，11 条路由（`/`、`/_not-found`、`/enterprise/projects`、`/enterprise/projects/[projectId]`、`/enterprise/projects/[projectId]/publish`、`/enterprise/projects/[projectId]/spec`、`/enterprise/projects/new`、`/onboarding`、`/projects`、`/projects/[projectId]`、`/sign-in`）。
- `pnpm test:e2e`：5 个真实浏览器用例通过（约 60s）。`playwright.config.ts` 的 `webServer` 自行执行 `corepack pnpm build && corepack pnpm start`，运行日志确认生产构建与生产服务启动均由用例运行过程完成，全新环境不必手动先 `build`、`start`。主链路用例覆盖：创建草稿 → 访谈两轮 → 生成候选 → 采用 → 手工另存 → 查看历史版本 → 补预算 → 锁定 → 锁定后旧入口被拒 → 创建模拟定金 → 模拟支付成功 → 替换敏感标记后确认发布 → Builder 在招募视图看到脱敏内容；并覆盖企业 B 的私有页 404、Builder 企业动作被拒、招募响应体不含原始需求/对话/邮箱/敏感标记。
- `pnpm start`：生产构建启动成功；未登录请求受保护页返回 307 并指向 `/sign-in`。

### 升级与空库重建

- **已有库升级**：S1 的 4 条 migration（`20260923000000`、`20260923010000`、`20260923020000`+`20260923020100`、`20260923030000`、`20260923040000`）全部通过 `pnpm db:prepare` 应用到 S0 建立的本地库，未使用 `db:reset`；`20260923020100` 改写已应用迁移时用 `supabase migration repair --status reverted --local` + `migration up --local` 重放。
- **重跑不删数据**：临时插入一张合成草稿（runtime 角色、显式列），连续执行 `pnpm db:prepare` 后该草稿的 `status`/`version`/时间戳不变；验证后已删除该临时行，本地库恢复为验证前状态（0 个项目）。
- **空库顺序重建**：在本地实例另建合成数据库 `qianzo_migration_check`，仅补一个最小的 `auth.users` 桩件（真实环境由 Supabase 平台提供，是本 schema 唯一引用的平台对象），以 `supabase_admin` 连接按文件名顺序重放全部 9 条 migration，全部成功。重建后的关键不变量：`app` schema 7 张表、2 个守卫触发器（`projects_guard_locked_scope`、`payments_guard_success`）、2 个可延迟外键；`qianzo_runtime` 对 `spec_versions` 无 UPDATE/DELETE、对 `projects`/`payments` 无 DELETE、可写 `status`；`anon` 与 `authenticated` 对 `app.projects` 无 SELECT。验证后已删除该 scratch 数据库。
- **未执行项**：没有运行 `supabase db reset --local`。该命令会清空本地实例，按 S1 规格「不擅自清空用户本地草稿」的要求未执行；本地实例保留现有合成数据。空库重建改用上述独立 scratch 数据库完成，平台 schema 用最小桩件替代，因此验证的是本仓库 SQL 链本身，不含 Supabase 平台对象的初始化。
- **已固化为自动化用例**：上述「空库顺序重放」检查现由 `tests/integration/migration-rebuild.test.ts` 承担——自建独立 scratch 库 `qianzo_migration_rebuild`、按文件名顺序重放全部 migration、断言 7 张业务表 / 2 个守卫触发器 / 2 个可延迟外键 / `qianzo_runtime` 的列级授权，运行结束后删除该库。该用例以 `supabase_admin` 连接（迁移含 `alter role qianzo_runtime`，本机 `postgres` 不是超级用户）；若环境无法提供超级用户连接，套件**跳过并打印原因**，避免把缺少凭据误报成迁移链损坏。迁移中所有库级语句都作用于 `current_database()`，唯一硬编码的 `grant connect on database postgres` 因角色已持有该权限而为幂等空操作，因此重放不会改动本地现有库。

## S1 代码质检修复（2026-09-24）

S1 实现完成后做过一轮独立代码质检（功能正确性、异常处理、边界、规范与可读性、架构风险）。全部修复项已落地，验证结果见上节。

**缺陷修复**

- **消息上限 off-by-one**（边界说明于 2026-10-15 补充）：`beginAipmInvocationWithDatabase` 原判据 `history.length + 1 > 上限`、`completeAipmInvocationWithDatabase` 原判据 `max(sequence) + 1 > 上限` 口径不一致；`maxSessionMessages` 又直接复用了「单次请求消息数」的常量。Provider 失败只落 USER，旧判据会在 odd history 下留下无法完成的半程写入。现在会话 admission 单独定义 `aipmLimits.sessionMessages = 40`，`begin` 只检查当前历史加上本轮 USER 与 ASSISTANT 后仍在阈值内（当前历史最多 38 条），不登记 in-flight reservation；失败只落 USER，可能提前耗尽可用轮次。40 是 admission cap，不是并发下持久历史的硬上限：已接纳的重叠调用回复仍持久化；从空历史按当前 begin/complete 语义推导最多 78 条（未实测）。单次 transcript schema 上限为 40；真实 Provider 接入前需重新验证并发和资源限制，详见 [S1 README](slices/S1-spec-publish/README.md)。
- **E2E 运行方式未固化**：`playwright.config.ts` 的 `webServer.command` 原为 `pnpm dev`，与「E2E 对生产构建运行」的约定不符，全新环境无法复现，且 `next dev` 冷启动会现场编译 Server Action 造成首个用例假失败。现改为 `corepack pnpm build && corepack pnpm start`（`timeout` 300s、`reuseExistingServer: !CI` 保留），两份 README 同步。
- **错误映射重复**：5 个 Server Action 各写一份「领域错误 → `*ActionState`」映射。抽出 `src/app/actions/error-mapping.ts` 统一处理跨域同构部分（认证、身份、输入校验）与 SQLSTATE 兜底（`23505`→`VERSION_CONFLICT`，`23514`/`23503`→`INVALID_INPUT`，仍不外泄 SQL 原文、供应商正文或堆栈），各 action 只保留领域特有映射与自身文案。归并后**未改变任何既有错误码或中文文案**（已逐行核对）。
- **行锁与版本校验重复**：「`for update` 锁行 + `expectedVersion` 校验 + `version` 递增」在 5 处以上重复。抽出 `src/modules/projects/lock.ts` 的 `withProjectLock`，改造 9 处调用点并保持各自的判定顺序与错误码不变（如 `publish` 的「已 OPEN 重复意图」仍先于锁定指针校验），锁顺序仍为 Project → Payment。
- **`ProjectError` 归属**：从 `projects/repository.ts` 迁到新建 `src/modules/projects/errors.ts`，与 `AipmError`/`SpecError`/`PaymentError` 对齐。
- **`server-only` 边界缺失**：5 个 `repository.ts` 只以 `import type` 引用 `@/platform/db/client`（编译期擦除），因此运行时**并不存在**经其传递的 `server-only` 保护。现补显式 `import "server-only"`；`vitest.config.mts` 增加 alias 把 `server-only` 指向包自带 `empty.js`，仅为让集成测试能直接 import repository，不影响生产构建边界。
- **Drizzle schema 与迁移分歧**：`schema.ts` 的 `projects_status_check` 由 `= 'DRAFT'` 同步为 `in ('DRAFT','OPEN')`，并注明迁移文件是约束的唯一权威来源（本仓库无 drizzle-kit，不生成迁移）。
- **其余 P3**：删除 `parseAipmResponse` 中恒为假的 `contractVersion` 比较死分支；发布动作不再把所有 `ZodError` 都报成「未勾选确认」（改为区分字段级非法）；缺预算提示的 `data-error-code` 由 `PAYMENT_REQUIRED` 改为 `INVALID_PROPOSAL`；发布成功文案改走 `successMessage` 与 success 样式；`parseMinorUnits` 收紧千分位（`1,234.50` 可用，`1,2,3`/`12,34`/`1,,2` 拒绝）；`maskSpecIssues` 重构为统一两遍式比对（错误信息集合不变）；`test` 脚本移除 `--passWithNoTests`。

**补齐的验收证据**（此前验收矩阵中无自动化对应用例）

- 消息 admission 边界：奇数历史下整轮被拒且不产生半程写入；单次 begin 检查两条本轮消息能否放在当前阈值内。该测试验证单次准入边界，不宣称并发下持久历史硬封顶 40。
- 并发发布：两个相同意图都返回同一结果且 `version` 恰好 +1；两份不同预览只有一方成功、另一方 `PUBLISH_CONFLICT`，落库快照恰为胜者。
- 已成功的定金在项目 `OPEN` 后重复请求返回同一结果且不改 `succeeded_at`/`version`/`published_at`。
- 并发创建定金只产生一单。
- `stableJson` 的键序无关性与数组序敏感性；`describeFieldIssues` 的路径拼接；`money` 的币种小数位、未知币种回退与超安全整数返回 `null`。
- 对 `withProjectLock`、错误映射归并、`maskSpecIssues` 重构三处高风险改动的反向验证（判定顺序、错误码与文案、脱敏错误信息集合是否漂移）。

## S1 本地提交

- `432285d docs(s1): record the spec publish slice plan`
- `fc9693b feat(aipm): persist mock interviews with validated responses`
- `31982c6 feat(specs): save immutable reviewed spec versions`
- `fa6c2bf feat(specs): lock reviewed scope and reference budget`
- `c4e05f2 feat(payments): add enterprise mock deposit`
- `24f0057 feat(projects): publish confirmed recruitment snapshots`

S1-06 的验收与文档提交见 `eb38dc6`。

本轮代码质检修复：

- `cc67d08 fix(s1): resolve the review findings in the spec publish slice`（生产代码）
- `8e96184 test(s1): cover the review boundaries and rebuild the migration chain`（测试）
- 本文件所在提交 `docs(s1): record the review fixes and the verified results`

## 环境与远端

- Node.js 24.13.1，pnpm 11.19.0；Docker Desktop 4.91.0 / Engine 29.8.0；Supabase CLI 2.117.0；Playwright 1.63.0 / Chromium 153（均安装在 D 盘）。
- `origin` 为 `https://github.com/xuyuufan/QianZo.git`（私有）。
- PR #1（S0）已由用户 merge，`origin/main` 现为 `08bf24b`，已包含完整 S0。
- `feat/s1-spec-publish` 从 `origin/main` 建立，本地领先 10 个提交（S1 规划与六个实施任务、S1-06 文档，以及本轮质检修复的生产代码、测试与本文档三条）；**已推送**（`origin/feat/s1-spec-publish` = `736c42c`）并对应 PR #2，仍待合并；S1 约定以 squash merge 合入 `main`。

## UI 重做评估（2026-09-24，设计已存档；已被 2026-09-25 UI 接入取代）

后端已完成的情况下，用户提出重新做 UI。经架构师只读静态评估（团队协作），结论与设计存档在 **[UI_REWORK_DESIGN.md](UI_REWORK_DESIGN.md)**。

- **结论**：UI 与后端完全解耦——重做 UI **无需改动** `src/modules/**`、`src/platform/**` 或 9 条 migration；单元 82 例与集成 112 例天然不受影响，仅 5 个 E2E 用例必然需要同步修改。
- **已决定**：档位取 **B 档（页面结构与信息架构重做）**，仍保持 Server Component 服务端取数与服务层授权；E2E **不单独立项**加固，改为「改哪一页就顺手补 `data-testid` 并同步改对应 spec」；契约保护措施（字段名常量化 + Action 入口断言）**暂不做**；**暂不开工**。
- **当时待拍板、现已落地**：UI 技术栈。存档文档推荐 Tailwind v4 + shadcn/ui（本项目 RSC/client 边界早已落在 11 个表单上，故组件库的边际客户端渗透为零），回退方案为纯 CSS Modules；MUI 会把全局导航壳推向客户端、并有诱发取数下沉的风险；Ant Design 因 `<Form>` 自管字段、不写入原生 `FormData`，会直接打断 `formData.get` 契约，已排除。
- 本节为历史评估记录：其「未开工 / 待拍板」状态随后由 2026-09-25 的 UI 接入完成——技术栈最终采用 Tailwind v4 + Radix Slot + CVA，且 `src/modules/**`、`src/platform/**` 与 migration 均未改动，见下节「Qianzo Flow UI 接入」。

## 已知限制与交接

- 当前是本地合成数据演示，不是生产部署；没有 CI、备份、生产监控或用户级 RLS。
- S1 到达「项目已 OPEN、其他登录用户可评估」为止，**不是完整交易闭环**：申请、选择、Builder 押金与开工均未开始（S2）。
- S1 不提供解锁、下架、重新发布或修改已公开内容；已发布快照、锁定范围与 Spec 历史都不可改写。
- Mock 定金与 Mock AIPM 都不代表真实收付、真实模型或合同接受；演示金额为固定 fixture，不是已确定的定金标准。
- Spec 可见性细则、报价能力、价格模式与选择后二次接受仍是 Pending Product Decisions。
- 下一 Slice 是 S2；开工需要新的明确授权，不要自行开始。

---

## S0 历史基线（2026-09-22 ~ 2026-09-23）

### 已完成

- 建立 Next.js 16 / React 19 / TypeScript strict 应用，以及 pnpm、ESLint、Vitest、Playwright 和构建命令。
- 建立本地 Supabase 与两条 migration，仅创建 `app.users`、`app.user_roles`、`app.projects`。
- 应用以非 owner、非 SUPERUSER、非 BYPASSRLS 的 `qianzo_runtime` 连接；仅具有 S0 所需 DML，不能建表、删除、截断、改 owner/status 或提升角色。
- 接入真实邮箱密码 Auth、SSR cookie 刷新、退出、首次 onboarding、Enterprise/Builder allowlist 和 DISABLED 拒绝。
- 实现企业自己的项目列表、创建、读取和编辑；项目 UUID 支持创建意图重放，编辑使用行锁和 expectedVersion 防止旧页面覆盖新内容。
- 页面展示保存成功、输入失败和版本冲突；未知项目与其他企业项目统一视为不存在。
- 演示 seed 幂等准备两个企业和一个 Builder；高权限 Auth key 与演示密码只存在工具环境文件。

### 实际验证（2026-09-22，Windows 本机）

- `pnpm db:reset`：从空的 loopback 合成库成功应用两条 migration，并重新配置 runtime 账号。
- `pnpm demo:seed` 连续执行两次：成功，未重复用户或角色。
- `pnpm db:prepare` 在已准备的库再次执行：无待应用 migration，数据未被 reset。
- `typecheck` / `lint` / `build` 通过；`pnpm start` 生产构建启动成功，未登录访问受保护页返回 307。
- `pnpm test:integration`：3 个文件、23 个用例通过；`pnpm test:e2e`：3 个浏览器用例通过。

### 独立复验与 PR #1 评审修复（2026-09-23）

- 第二个执行者在同机复跑 `typecheck`/`lint`/`test`/`test:integration`/`build`/`test:e2e`，结果与上一轮一致（23 个集成用例、3 个 E2E、7 条路由）。
- PR #1 上的 7 条评审（1×P1 + 6×P2）全部修复并逐条回复，各自独立提交：破坏性测试前校验 loopback（`669d54a`）、runtime 表级 INSERT 覆盖列级授权（`6ee3092`）、onboarding 会话过期（`1036031`）、ACTIVE 用户重复 onboarding（`c15124b`）、运行时角色成员关系与临时表权限（`da289ba`）、复用角色的直接授权（`11de376`）。
- 修复后集成用例增至 34 个，E2E 增至 4 个；S0 规格第 6 节同步补记权限边界。PR #1 随后由用户以 squash merge 合入 `main`。

## Qianzo Flow UI 接入（2026-09-25）

基于已含 S1 的 `feat/lovable-ui-s0-s1` 分支，将 Qianzo Flow 视觉接入既有 Next.js App Router 和 S0/S1 服务。Lovable 源码冻结于 `a0c5a38a88db7768e84e13b51d263b0aebcd5acc`；本轮没有复制其认证、路由、localStorage 或 AI 数据层。

- 已完成公开品牌首页、真实登录意图与 onboarding 导航、企业项目列表/创建/详情、访谈工作台、全字段结构化 Spec 编辑、候选采用/只读历史/锁定、Mock 定金、文字级脱敏编辑、发布确认、招募大厅与完整脱敏详情。
- 写入继续经过现有 Server Actions、身份和资源校验；本轮没有新增 API、业务表、migration 或业务状态。脱敏招募详情只显示白名单快照。
- README 演示步骤已从旧 JSON 编辑说明改为结构化 Spec 与脱敏流程；S1 切片和 UI 设计说明已同步当前实现。
- 浏览器检查：桌面首页 1440×900、手机首页 390×844，以及 Spec 工作台和招募列表/详情的桌面与手机视口；身份卡布局、Spec 双栏/单列切换、招募列表/详情均无横向溢出；键盘顺序导航与 Enter 跳转通过；`prefers-reduced-motion: reduce` 下动画时长为 0.01ms。首页此阶段以 CSS 品牌图形呈现、无外部媒体依赖；随后一轮 `feat/lovable-ui-parity` 已恢复 Lovable 原始海报与视频素材（`public/assets/qianzo-mechanical-light-poster.webp` 与 `qianzo-mechanical-light.mp4`），并将 E2E 套件扩充至 11 个用例。

### 本轮实际验证

- `corepack pnpm typecheck`：通过。
- `corepack pnpm lint`：通过。
- `corepack pnpm test`：10 个文件，91 个单元用例通过。
- `corepack pnpm test:integration`：9 个文件，115 个真实本地 Supabase/PostgreSQL 用例通过。
- `corepack pnpm build`：通过，11 条 App Router 路由。
- `$env:CI='true'; corepack pnpm test:e2e`：9 个真实浏览器用例通过（41.1 秒）；强制使用本轮新生产构建与服务，覆盖登录/onboarding、越权拒绝、完整 S0→S1 发布及招募链路、响应隐私和移动布局。（该数字对应本轮；随后 `feat/lovable-ui-parity` 轮新增 `tests/e2e/home.spec.ts` 的 5 个用例，套件扩至 11 例，明细见下文对齐轮次。）
- 桌面/手机截图由 E2E 生成并已人工查看，仅保留在 Git 忽略的 `test-results/`。

本地 Supabase 在本任务中启动并通过 `db:prepare`、`demo:seed`；没有清空原有合成数据库。当前实现到项目 OPEN 与招募浏览为止，申请、选人、Builder 押金和开工仍属于尚未开始的 S2。

## Lovable UI 与后端对齐（`feat/lovable-ui-parity`，2026-09-26）

在 `feat/s1-spec-publish` 的 `736c42c` 之上，把 Lovable 的视觉与信息架构对齐到既有 S0/S1 服务层。本轮**没有**新增 API、业务表、migration 或业务状态；`src/modules/**`、`src/platform/**` 与 `supabase/migrations/**` **零改动**（`git diff --stat 736c42c..HEAD -- src/modules src/platform supabase/migrations` 输出为空）。

- **覆盖范围**：公开品牌首页（Lovable 原始海报与视频，含视频加载失败时回退海报）、真实登录意图（`intent`）与 onboarding 导航、企业项目列表与状态筛选、项目总览、访谈工作台、全字段结构化 Spec 编辑、候选采用/只读历史/锁定、Mock 定金、文字级脱敏编辑、发布确认、招募大厅与脱敏详情。
- **表单契约审计**：11 组表单的字段名与 11 个 Server Action 的 `formData.get(...)` 读取键**逐一比对一致**，含 `expectedVersion`、`specVersionId`、`sourceMessageId`、`lockedSpecVersionId`、`maskedTitle`、`maskedDocument`、`confirmed` 等隐藏字段与脱敏字段。UI 重做最容易静默断链的正是这类字符串契约（`typecheck` 覆盖不到），故单列此项。
- **锁定后入口**：访谈、采用候选、另存新版本、改标题/原始需求、改预算全部降级为只读提示；发布流程的定金与发布两步保留（S1 设计内），服务端仍对锁定前的陈旧 DOM 返回 `SPEC_LOCKED` 兜底。
- **边界路径复核**：`?version=` 深链的非法/跨项目/不存在版本均走 `notFound()`(404)；`intent` 非法值被降级忽略，不构成开放重定向，也不影响权限；客户端传入非法 `maskedDocument` JSON 收敛为 `INVALID_JSON` / `INVALID_DOCUMENT` 用户可读错误，不产生 500，也不泄露堆栈。

### 本轮实际验证（2026-09-26，Windows 本机）

- `corepack pnpm typecheck`：通过。`corepack pnpm lint`：通过（无警告）。
- `corepack pnpm test`：10 个文件、**93** 个单元用例通过（本轮复审为 `editor-sync` 归一化新增 2 例）。
- `corepack pnpm test:integration`：9 个文件、115 个真实本地 Supabase/PostgreSQL 用例通过。
- `corepack pnpm build`：通过，11 条 App Router 路由（`/`、`/_not-found`、`/enterprise/projects`、`/enterprise/projects/[projectId]`、`/enterprise/projects/[projectId]/publish`、`/enterprise/projects/[projectId]/spec`、`/enterprise/projects/new`、`/onboarding`、`/projects`、`/projects/[projectId]`、`/sign-in`）。
- `corepack pnpm start` + `corepack pnpm test:e2e`：**11 个真实浏览器用例全部通过**（约 1.8 分钟），`/sign-in` 返回 200。E2E 运行在**生产构建与生产服务**上，覆盖完整 S0→S1 主链路（创建草稿 → 两轮访谈 → 生成候选 → 采用 → 手工另存 → 锁定 → 定金 → 文字脱敏 → 发布 → 招募浏览）、登录意图与 onboarding、越权拒绝、响应隐私与桌面/平板/手机布局。用例分布：`aipm-interview` 1、`home` 5、`identity` 4、`projects` 1。截图仍只落在 Git 忽略的 `test-results/`。
- **独立复核（另一执行者，非本轮实现者）**：独立复跑 `typecheck`、`lint`、`test`（10/91）、`test:integration`（9/115），结论一致；对 E2E 断言逐条比对**未发现变松或换语义**（全文无 `waitForTimeout` / `force: true` / `skip` / `only`），隐私类断言（响应体不含原始需求、访谈正文、企业邮箱与 `ZZSECRET` 标记）**原样保留**；`tests/helpers/ui-visual-fixtures.ts` 的合成夹具仅用于版式截屏与列表计数，主链路仍由 UI 驱动真实 Server Action，夹具行由既有 `clearDemoBusinessData`（含 `spec_versions`）清理，无残留污染。
- **已知测试缺口（本轮未补，非回归）**：`?version=` 深链非法输入的页面级断言、`publishProjectAction` 的 action 级错误映射、招募详情渲染 HTML 对企业 `displayName` 的直接负向断言。三者当前分别由仓储归属校验、代码路径审查与白名单/DTO 精确断言间接保证。此外**浏览器前进/后退守卫没有任何自动化覆盖**——本轮修复是靠独立复核的真实浏览器探针验证的，建议后续补「编辑 → 前进/后退 → 取消/确认」两类用例把该行为锁住。

### PR #3 复审修复（2026-09-26）

PR #3 的自动评审给出 7 条 P2，全部核实成立并修复（均为既有 E2E 覆盖不到的交互路径）：

- **跨角色入口不可达**：`project-header.tsx` 的「重新选择身份」一直指向 `/`，而已登录用户在 `/` 会按角色直接重定向且 ENTERPRISE 优先，双角色用户因此**没有任何 UI 路径进入开发者项目大厅**。现仅在同时持有两种角色时渲染切换链接，并直接指向另一角色的首页；单角色时不渲染。
- **文档内锚点 ID 重复**：`SpecDocumentView` 的 `#spec-section-N` 在 current / candidate / history 三个同时挂载（仅 `hidden`）的面板里重复，目录链接会命中更早的隐藏面板。新增 `idPrefix`，工作区三处分别使用 `current-` / `candidate-` / `history-`。
- **公开页泄露结构 ID**：招募详情复用 `SpecDocumentView`，把 `role.id`/`feature.id`/`milestone.id`/`criterion.id` 等渲染给所有已登录用户；而脱敏契约要求 ID 保持不变，发布者无法脱敏。新增 `showIds`（默认显示），公开招募详情传 `false`，并用序号占位保持网格不塌陷。
- **阶段文案与支付状态不符**：项目总览的 `stageLabel` 只看 `status`/`locked`，Mock 定金成功后回到总览仍显示「等待模拟定金」。现复用既有 `getProjectPayment` 区分「定金已完成，等待发布」。
- **陈旧服务端错误永久禁用发布**：空白脱敏标题被服务端 `trim` 后拒绝会留下非空 `state.issues`，用户改正标题后按钮仍永久禁用。现用「提交指纹」只在输入未变时采信服务端错误；`spec-editor-form` 的同类问题一并修掉。
- **浏览器前进/后退无确认丢稿**：未保存守卫原只覆盖 `beforeunload` 与点击锚点，App Router 的客户端历史切换两者都不触发。现未保存时在历史栈压入守卫项并监听 `popstate`：确认离开才真正退栈，取消则重新压回；保存或放弃后在清理阶段弹出守卫项，不干扰正常后退。
- **保存归一化成功后无法回到干净态**：`syncEditorWithServer` 原以**原始字符串**比较，而服务端存储前会 `trim`，于是「仅空白差异」的保存会永久停留在未保存态，进而**永久隐藏锁定入口**。现以同一套 `specDocumentSchema` 归一化后比较，并保留「脏编辑器保留用户输入」的原有语义；`tests/unit/editor-sync.test.ts` 补 2 例（仅空白差异判干净、真实差异仍判脏）。

复审后重跑：`typecheck`/`lint` 通过，单元 **10 文件 93 例**、集成 **9 文件 115 例**、构建 **11 条路由**、E2E **11 例全绿**。

同一 PR 的**第二轮**自动评审追加 3 条（2×P2 + 1×P3），亦已修复：

- **未保存守卫截断前进栈**：上一轮为覆盖浏览器历史而加的 `pushState` 会丢弃整个 Forward 栈——若用户是按后退到达编辑器，一编辑就再也无法前进，且确认处理器根本不会执行（守卫破坏了它自己要保护的导航）。改用 `replaceState` 给**当前**历史项打标；`popstate` 只在「落到别处」时确认，取消用 `forward()` 退回（back/forward 不截断前进栈），保存或放弃后仅清除标记，位置不跳动。
- **移动端仍加载背景视频**：首页视频在 `md` 断点以下只是被 CSS 隐藏，但 `7.8 MB` 的 mp4 仍挂着自动播放，允许 muted inline autoplay 的移动浏览器会照常下载并播放整段视频。改为仅在桌面断点匹配后才挂载 `<source>`；首屏仍由海报承担，初始状态服务端与客户端一致，不产生 hydration 差异。
- **文档坏链**：`docs/UI_REWORK_DESIGN.md` 链接到 `artifacts/ui-parity/comparison/README.md`，而 `.gitignore` 排除了整棵 `artifacts/ui-parity/`，全新 checkout 必然断链。改为行内路径文本并注明该目录由本地视觉对齐流程重新生成、不在版本控制内。

第二轮后重跑：`typecheck`/`lint` 通过，单元 **10 文件 93 例**、集成 **9 文件 115 例**、构建 **11 条路由**、E2E **11 例全绿**。

**第三轮**自动评审再追加 3 条（2×P2 + 1×P3），亦已修复：

- **取消前进离开时无法回到编辑器**：History 不为一次遍历提供方向，未带标记的落点既可能是「远离编辑器的后退」（编辑器项在前，`forward()` 可恢复），也可能是「远离编辑器的前进」（编辑器项在后，`forward()` 是静默空操作）。现先走一步向前；若没回到编辑器就撤回该步再向后走一步，因此**两个方向的取消都会落回编辑器条目**。
- **历史版本选择不写回地址栏**：选中历史版本原来只改本地状态，而页面本身支持 `?version=` 深链，于是刷新、复制链接或经历史返回都会丢掉选择、回到当前版本。现用 `history.replaceState` 同步查询参数——它是纯地址栏更新，路由不会当作导航，页内状态（含未保存编辑）不被重挂载丢弃。
- **reduced-motion 访客仍下载背景视频**：`md` 以上且偏好减少动效时，`styles.css` 会把影片层设为 `display:none`，但宽度查询仍然匹配，于是 7.8 MB 的 mp4 照样被挂载、下载与播放。现把动效偏好并入挂载条件（`(min-width: 768px) and (prefers-reduced-motion: no-preference)`），并同步调整 `tests/e2e/home.spec.ts`：该视口改为断言**未挂载** `<source>` 且影片层隐藏，mp4 的挂载断言移到不带 reduced-motion 的桌面用例。

第三轮后重跑：`typecheck`/`lint` 通过，单元 **10 文件 93 例**、集成 **9 文件 115 例**、构建 **11 条路由**、E2E **11 例全绿**。

### 独立复核推翻第三轮守卫修复，改为「草稿可恢复」（2026-09-26）

codex 的 code review 配额用尽后（`@codex review` 只会回一条 usage limit 评论，不再产出意见），改由**另一位独立执行者做对抗性复核**，用真实浏览器探针逐条验证第三轮那三项。复核**推翻了其中一项**：

- **前进方向的历史守卫根本不执行**。History 不为一次遍历提供方向，而 App Router 会先提交历史切换、再让路由组件反应过来，于是**前进离开**时 `popstate` 处理器还没被调用，组件就已卸载、cleanup 移除了监听——探针里连确认框都没有出现，未保存编辑静默丢失（两种构造各复现 2 次）。后退方向因同一 tick 内的 `forward()` 补偿而侥幸成立。**结论：前进方向的拦截在当前 App Router 里赢不了这个竞速。**

因此把承诺从「拦住你离开」改为「**草稿不会丢**」：

- 新增 `spec/spec-draft.ts`：纯函数 + **注入 storage**；键按项目作用域，且草稿**只在服务端仍提供它写入时那一版时才被采用**，陈旧草稿不会覆盖新版本。
- 编辑器在 dirty 时把草稿镜像进 `sessionStorage`、干净时清除；重新进入编辑器时在**水合之后**恢复（服务端不知道本地存储，首屏输出必须保持一致）。
- 用户**确认放弃**的两个入口（点击链接离开、popstate 确认）以及「放弃修改并重新加载」按钮都会显式清除草稿——否则刷新会把已放弃的稿子带回来。
- 原有历史守卫保留并**如实标注为 best effort**（后退方向实测有效），但正确性不再依赖它。
- 补上复核指出的覆盖缺口：新增 `tests/unit/spec-draft.test.ts` 6 例（键作用域、同版本往返、跨版本忽略、缺失/非法/非对象载荷、清除、storage 抛错不冒泡）。
- 复核另指出一处真实风险：部分浏览器在存储被禁用时，`window.sessionStorage` 的**属性访问本身**就会抛错，而原实现只把方法调用包在 try/catch 里。现统一经由 `openSpecDraftStorage()` 安全取句柄，清理走 `clearSpecDraftFor(projectId)`。

复核**未能证伪**的两项就此确认：`?version=` 写回地址栏（两个 `replaceState` 都做 `{...window.history.state}` 合并，实测守卫标记与草稿在切换版本后并存、随后后退仍会确认）；reduced-motion 视频跳过（服务端 HTML 里 mp4 出现 **0** 次、海报 1 次，复合查询两部分变化都能触发）。

修复后：`typecheck`/`lint` 通过，单元 **11 文件 99 例**、集成 **9 文件 115 例**、构建 **11 条路由**、E2E **11 例全绿**。

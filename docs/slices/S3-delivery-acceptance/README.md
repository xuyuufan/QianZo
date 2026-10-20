# S3：成果提交、逐条验收与项目完成

本 Slice 承接 [S2 Workspace](../S2-applications-workspace/README.md)，施工依据为[工程总纲](../../QIANZO_MVP_V0_ENGINEERING_BLUEPRINT.md)、[开发流程](../../DEVELOPMENT_WORKFLOW.md)和[施工切片](../../BUILD_SLICES.md)。本文件是 S3 当前授权的实施规格；完成事实、验证证据及主模型审查结果记录在[项目状态](../../PROJECT_STATUS.md)。

当前进度（2026-10-21）：实现、完整本地验证门禁和主模型审查均已通过；当前修改仅在本地，尚未推送。

## 目标与边界

Builder 只能为当前已承接项目中的当前里程碑提交成果链接。企业按锁定的里程碑快照逐项 PASS/FAIL；FAIL 要说明原因并进入返工，Builder 以新 Submission 再交。所有里程碑 PASS 后，系统进入 `FINAL_REVIEW`；只有项目 owner 的有效 `ENTERPRISE` 身份能执行明确的最终确认并转为 `COMPLETED`。

交付物限 HTTP/HTTPS Repo、Demo 等链接。服务端只校验并保存 URL，不访问远端。首轮不增加文件上传、AI、通知、真实支付、评价、退款或管理员终止能力。Mock 支付语义、待产品确认项及 S2 历史均保留。

## Tasks 与验收

| Task | 范围 | 验收 |
|---|---|---|
| S3-01 提交与逐条验收 | 新增 Submission / SubmissionReview append-only 历史、当前提交指针、链接表单、企业逐项审核、FAIL 返工与新提交、逐个 Milestone 推进 | 身份/角色/关系/ACTIVE 检查；只审当前提交；逐项精确覆盖当前快照；重复键同内容幂等、异内容冲突；历史不可改写；并发提交或审核最多一个正式结果；FAIL 后旧提交保留，新提交可 PASS；只有当前里程碑可交付 |
| S3-02 最终确认与闭环 | 全 Milestone PASS 自动转 `FINAL_REVIEW`；企业最终确认转 `COMPLETED`；共享 Workspace、历史入口、隐私 DTO 与端到端闭环 | 未全通过不能进入最终确认或完成；Builder 无最终确认权限；已完成项目拒绝新提交与新审核；双方可在 `IN_PROGRESS`、`FINAL_REVIEW`、`COMPLETED` 查看授权 Workspace；S0→S1→S2→S3 由真实 UI 从新合成项目贯通 |

## 状态转换

```text
Milestone:
IN_PROGRESS → IN_REVIEW → APPROVED
                  └→ REVISION → IN_REVIEW (新 Submission)
PENDING → IN_PROGRESS (仅当前里程碑 PASS 后)

Project:
IN_PROGRESS → FINAL_REVIEW (最后一个 Milestone PASS 时自动)
FINAL_REVIEW → COMPLETED (项目 owner 明确确认)
```

Migration 扩展现有约束和窄 runtime grants；不创建 S3 以外模块。`milestones.position` 在项目内唯一。Milestone 与 Submission 以 `project_id` 组成循环归属约束，且延迟检查，保证当前提交确属同一项目和里程碑，也让合成测试夹具可以在单事务清理时保留约束与触发器。每个 Submission 最多一个 Review；新 Submission、新 Review 均只能 INSERT，runtime 无 UPDATE/DELETE。

## 授权、资源关系与事务顺序

| 操作 | 身份条件 | 项目关系和状态 | 锁与幂等 |
|---|---|---|---|
| 读取 Workspace / 提交与审核历史 | 用户 ACTIVE，持有所需角色 | owner + ENTERPRISE；或所选 `ENGAGED` Builder + BUILDER；非参与者按不存在处理 | 只返回白名单 DTO；按项目和里程碑顺序读取 |
| 提交成果 | ACTIVE BUILDER | 当前已选 Builder，Application=`ENGAGED`，Project=`IN_PROGRESS`，Milestone 为当前 `IN_PROGRESS` 或 `REVISION` | 先 Project 行锁，再重读状态、角色关系、Milestone 当前指针和 Submission key；相同 key + 相同规范化 payload 返回原记录；相同 key + 不同 payload 冲突。浏览器以当前提交指针区分新返工 intent，并在同一 intent 的网络重试中复用 key |
| 逐项审核 | ACTIVE ENTERPRISE | Project owner；Project=`IN_PROGRESS`；目标为当前 `IN_REVIEW` Submission | 先 Project 行锁，再校验当前指针、项目和 Milestone 版本；每 Submission 唯一正式 Review；相同 Review 请求重放返回原记录，不改变后续状态 |
| 最终确认 | ACTIVE ENTERPRISE | Project owner；Project=`FINAL_REVIEW`；所有 Milestone=`APPROVED` | 先 Project 行锁再复核完整通过集合；重复完成请求幂等；`COMPLETED` 不接受后续业务写入 |

每个 Server Action 都独立验证身份、输入、角色和资源关系。不得相信客户端提交的 owner、builder、milestone、审核总结果或 Spec 内容；由已验证 actor 和不可变里程碑快照确定。所有 mutation 的固定顺序是先锁 Project，再读取/锁当前 Application、Milestone 和 Submission，最后插入历史并更新允许变动的指针/状态。事务内不调用网络。

## 请求、审核与隐私规则

- `submission_key` 使用 UUID。Submission 重放匹配提交者、Milestone、key、说明和规范化链接完整 payload；后续里程碑或项目状态推进不改变成功重放结果。payload 不一致为冲突，不创建新行。
- 每次新提交增加 Milestone 内序号，保存说明及有界链接列表。只允许 `http:`/`https:`，拒绝 `javascript:`、`data:`、其他 scheme、凭据、控制字符、超长 URL 和超量链接；不发出远程请求。页面将 URL 作为正常文本并通过 React 属性编码渲染，链接配置安全 `rel`。
- Review 条目以冻结验收标准在 Milestone JSON 数组中的一基位置绑定；S2 快照只有描述和验证方法，没有稳定 criterion ID，不能把私有 Spec ID 暴露给客户端。
- Review 输入必须恰好覆盖全部标准：位置不重复、不遗漏、不多余；每项为 PASS 或 FAIL。总 outcome 由服务端从逐项结果计算，不能由客户端指定。全 PASS 才能 PASS；任一 FAIL 则总结果为 FAIL，必须给非空原因。单个 Submission 只允许一个正式 Review。
- Review 对当前 Submission 生效一次。FAIL 将 Milestone 置为 `REVISION`；后续新 Submission 替换当前指针但不改旧提交/审核。PASS 将该 Milestone 置为 `APPROVED`，并只推进下一个 PENDING Milestone；没有下一个时把 Project 推进 `FINAL_REVIEW`。
- 提交或审核只有当前指针匹配时才能首次写入。旧业务请求重放只能返回自己已经持久化的原记录，不能重新设置指针或再次推进项目。
- DTO 不含 owner/user/Builder 私有标识、内部 Spec/criterion ID、原始需求、访谈、私有 Spec、支付详情或数据库行。Server Action 返回也限定为 UI 所需状态和显示字段。历史按里程碑展示每轮说明、链接、逐项结果、原因及时间。

## 失败、重放和并发矩阵

| 场景 | 结果 | 持久化影响 |
|---|---|---|
| 相同 `submission_key`、相同规范化 payload | 返回原 Submission，即使 Project 已推进 | 无写入，当前指针不变 |
| 相同 `submission_key`、不同 payload | 冲突 | 无写入 |
| 新 key 提交当前开放 Milestone | 创建下一序号 Submission | 指针更新，Milestone 进入 IN_REVIEW |
| 旧 key/旧 Submission 被重新设为当前或拿来新审核 | 拒绝；只允许精确重放其已保存的业务意图 | 无写入 |
| 对同一当前 Submission 并发审核 | 一个事务成功；第二个只可识别同一审核重放，否则冲突 | 最多一条正式 Review，最多推进一次 |
| 对同一 Milestone 并发创建不同 key 的新提交 | 项目锁串行；第一个使其进入 IN_REVIEW，第二个失败 | 最多一个当前待审提交 |
| 新 Submission 的 Review 有重复/漏项/外来 criterion | 验证失败 | 无 Review、无状态变化 |
| 总 PASS 包含任一逐项 FAIL；总 FAIL 缺原因 | 服务端拒绝，且总 outcome 由服务端计算 | 无 Review、无状态变化 |
| 未全 PASS 的项目请求最终确认 | `INVALID_STAGE` | 无写入 |
| `COMPLETED` 后新提交/新审核 | `INVALID_STAGE` | 无写入 |

Migration 复合外键/唯一约束是关系完整性的数据库底线；服务端项目行锁与状态校验负责有授权语义的动作。每次新 Submission、新 Review 和最终完成状态变更均递增 Project 版本；重放只返回原记录，不写历史或再次推进状态。交付动作依据项目锁、Milestone 当前状态和 Submission 身份序列化，不能通过客户端 expectedVersion 替代数据库检查。既有 S2 publish、select 和 successful Mock payment 重放在 `FINAL_REVIEW` 与 `COMPLETED` 仍保持同一意图成功，不扩展为新的写入。

## 验收计划

按顺序串行使用共享本地 PostgreSQL/Auth，测试夹具只使用本套件独立合成身份和项目；不得执行 `db:reset`、覆盖演示账号或更改其角色。

1. 对所有新入口验证 ACTIVE Enterprise/Builder 正例、DISABLED 与双角色授权、缺少角色/非参与人 404、跨项目 Milestone/Submission/Payment ID 拒绝、owner/Builder 反向越权拒绝。
2. 以真实 runtime 连接验证新历史表无 UPDATE/DELETE；列权限最小化；复合外键阻止跨项目当前提交、缺失提交和错 Milestone；里程碑序号与每提交单审核唯一性；链接/criteria/状态 CHECK。
3. 验证非法链接、链接数量/长度边界；非法 criteria 重复/漏项/多项、冲突 summary/reason、总 PASS/FAIL 和 FAIL reason 组合；React SSR/Flight/HTML 中攻击载荷作为文本，不执行 HTML/脚本。
4. 验证完全相同与冲突 submission/review/complete 重放，含状态推进后的重复请求；同键不同内容失败。用真实 PostgreSQL 并发调用验证同里程碑不同 key submit、同提交并发 review、并发 completion 的单一写入和稳定最终状态。
5. 多 Milestone integration 验证顺序、PASS 后只激活下一项、FAIL→新提交→PASS 的两轮历史、最后 PASS 自动 `FINAL_REVIEW`、显式最终确认后 `COMPLETED`，未通过不得跳级/完成。
6. Workspace/导航覆盖 `IN_PROGRESS`、`FINAL_REVIEW`、`COMPLETED` 双方与双角色 viewer；隐藏历史入口不可用不影响正常历史读取。核对公开 DTO、初始 HTML 及实际 Flight 请求没有私有数据。
7. 完整运行当前配置的 typecheck、lint、unit、串行 integration、独立 scratch-database migration rebuild、生产 build 和 production E2E。新增一条从空业务起点经 S0 创建、S1 招募发布、S2 Builder 申请/选人/押金开工、S3 提交/验收/完成的真实 UI E2E；测试页面从新创建的合成项目走主链，不预置其后续业务状态。保留所有失败和通过日志到 ignored `artifacts/ui-parity/s3/`。

## 本地门禁收据（2026-10-21）

以下命令均在北京时间 2026-10-21 的 `D:\Qianzo` 本地工作区执行；所有门禁通过，退出码和完整输出保存在被 Git 忽略的 `artifacts/ui-parity/s3/`。

- TypeScript：`D:\node.exe node_modules/typescript/bin/tsc --noEmit`，exit 0；本机日志 `artifacts/ui-parity/s3/20261021-final-typecheck.log`。
- ESLint：`D:\node.exe node_modules/eslint/bin/eslint.js .`，exit 0；本机日志 `artifacts/ui-parity/s3/20261021-final-lint.log`。
- Unit：`D:\node.exe node_modules/vitest/vitest.mjs run --exclude tests/integration/** --exclude tests/e2e/**`，13 个文件、110/110 通过，exit 0；本机日志 `artifacts/ui-parity/s3/20261021-final-unit.log`。
- 完整 PostgreSQL/Auth integration：`D:\node.exe node_modules/vitest/vitest.mjs run tests/integration --maxWorkers=1 --no-file-parallelism`，12 个文件、138/138 通过，exit 0；包含 migration rebuild、角色与资源授权、DB 窄权限、历史约束、事务并发和多里程碑交付。本机日志 `artifacts/ui-parity/s3/20261021-final-integration.log`。Workspace 读一致性屏障定向运行 3/3 通过；读取暂停时另一事务提交 PASS，读事务仍返回完整提交前快照，本机日志 `artifacts/ui-parity/s3/20261021-workspace-snapshot-targeted-integration-retry1.log`。
- Production E2E：执行 `D:\node.exe node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/cli.js test`，环境为 `CI=1`、`SUPABASE_PROJECT_ID=qianzo`、`RAYON_NUM_THREADS=2`、`NODE_OPTIONS=--max-old-space-size=1536`；配置强制 fresh `corepack pnpm build && corepack pnpm start`。最终 production suite 18/18 通过，Node 直接捕获运行进程状态 `PROCESS_EXIT_CODE=0`。没有更改 Next 配置或改用 Webpack。本机日志 `artifacts/ui-parity/s3/20261021-final-production-e2e.log`；构建后的 App Paths manifest 为 15 项（13 个产品路由、2 个 Next 内部错误路由），计数记录 `artifacts/ui-parity/s3/20261021-production-route-count.log`。
- 真实 UI 闭环截图保存在本机 `artifacts/ui-parity/s3/s3-workspace-completed-mobile.png`（390×844）。新 E2E 从新建合成项目开始，经过发布、申请、选择、押金、开工、提交→FAIL→重载→新提交→PASS→owner 完成；同时验证 390px 无横向溢出、双方历史和 HTML/Flight 不含私有标识。

完整 E2E 早期运行中，S2 application 用例仍断言 Builder 看不到 S3 提交入口，因此记录为 17/18；更新为“承接 Builder 可提交、不可审核/完成”后，最终 18/18 通过。首次 fresh build 遇到 Windows `os error 1450` 后，在上述线程/堆限制下以默认 Turbopack 成功重跑。失败证据保留在本机忽略目录 `artifacts/ui-parity/s3/20261021-e2e-all.log` 和 `artifacts/ui-parity/s3/20261021-final-production-e2e-turbopack-resource-failure.log`；只有最后成功日志计入验收。Migration 准备输出见本机 `artifacts/ui-parity/s3/20261021-db-prepare.log`。以上日志与截图由本地命令生成且被 Git 忽略，可按本节命令重现；不会提交这些文件。本轮未运行 `db:reset`，未修改既有演示账号或角色。

### 当前实施顺序与 commit checkpoint

1. **PLAN/README + schema/migration**：已明确数据约束、窄权限、状态守卫和清理夹具兼容性；完整串行 integration 中的 migration rebuild 验证通过。
2. **S3-01 implementation**：服务端 DTO、validation、repository/service/actions、Workspace 角色/状态、UI、历史视图及 unit/integration 均已完成并通过门禁。
3. **S3-02 + full gate**：端到端 E2E、历史/入口回归和全文档状态同步已完成；主模型审查 PASS，验证证据见上方收据。
4. 按主模型指示形成仅本地的 commit；按用户已授权的后续范围，主模型再负责 push、PR 自动评审迭代与 merge。

## 复用检查

复用仓库现有 `withProjectLock`、身份/ACTIVE 校验、Next Server Action 错误映射、Drizzle/PostgreSQL 和 UI action-state 模式。安装依赖后可在本机阅读 Next.js 16.3.5 指南 `node_modules/next/dist/docs/01-app/02-guides/data-security.md` 与 `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`；指南要求把每个 Server Action 当作可直接调用的不可信入口，重新授权、验证输入并限制返回对象；依据这些规则设计 DTO 和服务端边界。

复用候选已查看：[Drizzle 官方 PostgreSQL DB 实现](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/db.ts)核对事务 API，[PostgreSQL SELECT query builder 实现](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/query-builders/select.ts)核对 `for('update')` 锁 API。其代码是 ORM 内部实现，不是项目领域事务；只作 API 核验，不复制、不引入依赖。项目级锁使用本仓库已有 `withProjectLock`，不引入通用 idempotency 层。

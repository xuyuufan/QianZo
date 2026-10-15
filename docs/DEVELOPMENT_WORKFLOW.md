# Qianzo 开发与 Git 工作流程

**实施等级：V0 REQUIRED。** 本文件规定日常施工与交付方式，不增加业务范围。

- 远端仓库：[xuyuufan/QianZo](https://github.com/xuyuufan/QianZo)。
- Git remote URL：`https://github.com/xuyuufan/QianZo.git`。
- 工程总纲：[V0.2 Blueprint](QIANZO_MVP_V0_ENGINEERING_BLUEPRINT.md)。
- 当前施工顺序：[S0～S3](BUILD_SLICES.md)。

## 1. 基本单位

```text
Blueprint：范围、架构与不可破坏的规则
→ Slice：可演示、可验收的业务增量
→ Task：当前 Slice 中一个小而完整的修改
→ 验证通过
→ 本地 commit
→ Slice 整体验收
→ 按任务授权 push / PR / merge
```

一个通过验收的小任务通常对应一个 commit。一个 Slice 可以有多个 commit，完成后再作为一次集成单元审阅。不要等整个 MVP 写完才提交，也不要每改一行就提交。

## 2. 仓库建立与已有工作保护

S0 开工时已成功核验远端：远端仓库没有 refs。本地因此以 `main` 初始化新历史，并从它建立 `feat/s0-project-draft`；默认仍不 push。以下规则继续适用于后续仓库操作。

开始 S0 时：

1. 检查本地文件、Git 状态及远端已有历史。
2. 远端已有历史时，从该历史建立本地 checkout，再纳入现有文档；远端为空时才初始化新历史。
3. remote 名称使用 `origin`，地址使用本文提供的 URL。
4. 默认分支以远端实际默认分支为准；仅在确认远端为空时采用 `main`。
5. 不覆盖远端历史，不为消除冲突删除现有文档，不擅自清理其他人的修改。

Git 用户身份从现有配置或用户提供的信息取得，不猜测姓名、邮箱，不为本项目擅自修改全局 Git 配置。

## 3. 开始每个任务

- 阅读 AGENTS、Blueprint、施工切片和当前状态记录。
- 运行只读 Git 检查：当前分支、工作区变化、已暂存变化、最近提交。
- 明确本任务的目标、验收、涉及文件和不做的内容，只细拆当前任务。
- 检查相关已有实现与基线结果，再修改；不要重复实现已有能力。
- 当前已有未提交工作时，区分归属；不得覆盖、顺手重构或提交他人改动。
- 遇到尚未确认的正式产品决策，遵守 Blueprint 中的本地演示边界，不由 Codex 静默定案。

## 4. 分支规则

- 已授权开始实施时，从已核验的默认分支建立本次工作的短期分支。
- 推荐命名：`feat/s0-project-draft`、`feat/s1-spec-publish`、`fix/s2-selection-race`、`docs/blueprint-v0.2`。
- 一个 Slice 通常使用一个分支；多人并行时各用独立分支，避免同时推送同一开发分支。
- 小任务在当前 Slice 分支内产生多个 commit，不强制每个小任务创建 PR。
- 不把功能开发直接堆到默认分支；不强制推送、不改写已共享的提交历史。
- 不擅自 reset、清理、stash 或重排他人的工作。冲突解决必须保留原有意图并重新验证。

## 5. 什么时候必须 commit

| 时点 | 规则 |
|---|---|
| 一个小任务实现完成且相关验收通过 | 立即创建一个内容完整的本地 commit |
| 一个可以独立交付的修复完成 | 单独 commit，避免混入无关功能 |
| 一个 Slice 完成 | 确保相关改动均已提交，并记录整体验收 |
| 交接给另一位开发者或结束当前施工任务 | 已完成且验证通过的内容应有 commit；未完成部分明确说明 |
| 只修改工程文档 | 完成内容、链接和范围一致性检查后，也可以形成独立 docs commit |
| 当前任务实现或必需验证失败 | 先修复，不用 commit 冒充完成；如确需保存 WIP，明确标注且不得合并为完成结果 |

在已经建立 Git 工作区、用户已要求实施的任务中，**默认由 Codex 在满足上述条件后创建本地 commit，无需每次询问**。这不表示获得 push 或 merge 的默认授权。

用户明确要求只规划、只评审或暂不提交时，以该要求为准。本次文档保存不隐含初始化 Git、创建应用或发布远端的要求。

## 6. Commit 前的最低检查

每次 commit 必须：

1. 看过完整 diff，确认没有无关改动、调试残留、真实凭据、真实客户数据或生成垃圾。
2. 运行与改动对应的验证；不得只用“页面看起来正常”替代权限与一致性检查。
3. 代码和对应 migration、测试、必要文档一起提交，不留下无法启动的半套修改。
4. 使用明确路径暂存本任务的文件；默认不使用 `git add .` 或 `git add -A` 全量收集。
5. 查看 staged diff 与 `git diff --cached --check`，确认暂存区只含本次应提交内容。
6. 提交后记录 commit SHA，并检查剩余工作区状态；他人的未提交工作可以保留，但不得声称整个工作区已干净。

如果暂存区已经存在他人内容，先隔离本任务，不把整个暂存区直接提交，也不擅自取消他人的暂存。

### 按改动选择验证

| 改动 | 最低验证 |
|---|---|
| Markdown 文档 | 内容完整、路径链接有效、与当前范围及 Pending 决策一致 |
| 应用代码 | 项目已配置的 typecheck/lint，以及对应行为测试 |
| 数据库 migration | 本地 migration 可应用，相关约束和授权用例通过 |
| 身份或资源权限 | 允许访问和拒绝访问两个方向的测试 |
| 选择、支付、开工、验收等状态动作 | 状态前置条件、重复操作及相关并发验证 |
| Slice 集成 | 在已有增量上实际演示，并运行涉及的集成/E2E 与应用构建检查 |

具体命令以仓库 scripts 为准，初始化时建立并写入 README；不要在交付记录中虚构尚不存在或未运行的命令。已有无关基线失败必须说明，不能隐藏；属于本任务验收的失败必须解决。

本机（Windows + 本地 Supabase）实际验证顺序与两点环境差异：

- 顺序：`corepack pnpm typecheck` → `lint` → `test` → `test:integration` → `build` → `start` → `test:e2e`。E2E 对**生产构建**运行（先 `build` 再 `start`，配置里的 `reuseExistingServer` 会复用 3000 端口）；`next dev` 冷启动会为首个用例现场编译 Server Action，容易造成假失败。
- `build` 与 `test:e2e` 会重建 `.next/` 与 `test-results/`，在带批量删除保护的环境里需要显式授权，这不影响项目本身的可构建性。
- 改已应用的 migration 时优先另开新文件；必须改写时用 `supabase migration repair <version> --status reverted --local` 后 `migration up --local` 重放，前提是该迁移可重跑（只做 drop/add/revoke/grant）。

## 7. Commit message

采用简单格式，不引入自动发布、版本号或 commitlint 系统：

```text
<type>(<scope>): <具体结果>
```

type 使用 `feat`、`fix`、`docs`、`test`、`refactor`、`chore`；scope 可省略。禁止只有“update”“fix bug”“完成”的描述。

```text
docs: record V0.2 blueprint and delivery workflow
feat(projects): create drafts scoped to the enterprise owner
feat(specs): save immutable versions and lock the selected version
fix(payments): avoid duplicate milestone creation on mock success
test(delivery): cover revision and final completion
```

可以使用清楚的中文描述，不要求为英文措辞浪费时间。涉及非直观规则时，在提交正文写明原因和已运行的验证。

## 8. Push、PR 与合并

- 本地 commit、push、创建 PR、merge 是不同动作；本地 commit 不代表远端已备份。
- 当前任务明确要求 push、PR 或 merge 时执行对应动作；已持续授权的工作方式继续有效，不反复询问。
- 没有相关远端操作要求时，默认完成本地 commit 并交付结果，不默默推送或合并。
- 允许 push 时：通常在 Slice 完成或需要协作交接时推送分支，无需每个本地 commit 都单独 push。
- 一个 Slice 通常对应一个 PR，描述目标、实际变化、验证结果和仍未覆盖的范围。
- 合并前：目标分支已核验、相关检查通过、冲突解决后重测、文档与实施一致、没有未解决的权限或数据一致性问题。
- 默认使用 squash merge，将 Slice 集成到默认分支；不为此强制改写或 force-push 开发分支历史。
- CI 尚未建立时必须记录本地验证，不能用“以后 CI 会检查”替代当前验收；也不为首个业务增量先搭复杂 CI 平台。

## 9. Slice Definition of Done

一个 Slice 只有同时满足以下条件才算完成：

- 功能可从 UI 操作，并持久化到真实数据库。
- 与本 Slice 有关的身份、资源权限、状态条件和数据库约束已验证。
- 相关测试通过；累计已实现功能未被破坏。
- 需要新增的 migration 和本地演示数据可复现。
- 文档与当前实现同步，未决产品项仍明确标为 Pending。
- 本 Slice 的完成内容已经形成可定位的本地提交。
- 交付中说明仍未实现的能力，不能把本地 Mock 闭环描述为真实资金交易已上线。

## 10. Codex 交付格式

每个施工任务结束时简短报告：

```text
完成：当前 Slice / Task 与实际行为
验证：运行过的检查及结果；未运行项及原因
提交：commit SHA + message，或尚未提交的具体原因
远端：未推送 / 已推送分支 / PR 地址 / 已合并
剩余：已知限制与下一小任务
```

后续建立 PROJECT_STATUS 后，将同样的事实简要写入状态文档。不得将计划、推测或未执行测试写成完成结果。

# S1：需求变成可招募项目

**状态：已实施并通过验收（2026-09-24）。等级：V0 REQUIRED。对应 IBQ-04～06。** 实际进度、验证结果与提交记录见 [PROJECT_STATUS](../../PROJECT_STATUS.md)；权威快照仍以本文件的契约、表设计与验收矩阵为准。

目标：企业从 S0 草稿出发，通过 Mock AIPM 访谈生成候选 Spec，审阅、保存版本并锁定，完成企业 Mock 定金后，预览确认脱敏内容并发布。Builder 登录后能评估已发布项目；申请和开工留在 S2。

## 1. 开工入口与边界

按 [AGENTS](../../../AGENTS.md) 的顺序阅读 [工程总纲](../../QIANZO_MVP_V0_ENGINEERING_BLUEPRINT.md)、[Workflow](../../DEVELOPMENT_WORKFLOW.md)、[施工切片](../../BUILD_SLICES.md)、本文件和当前状态。S0 基础规格见 [S0 README](../S0-project-draft/README.md)。

- 本文件细化 S1，不复制另一份 Blueprint；SpecDocumentV1 与 AIPM 协议以总纲第 6 节及附录 A 为准。
- 复用现有 Auth、onboarding、受限数据库账号、项目模块和测试工具；不重新初始化应用或 Git。
- 新增四张业务表：`aipm_sessions`、`aipm_messages`、`spec_versions`、`payments`。累计七张业务表，按任务分批 migration。
- S1 只实现企业 Mock 定金；不预建 Application、Builder 押金关联、Milestone、Workspace、Submission 或审核表。
- 不接真实模型、真实支付，不实现报价、二次接受、文件上传、通知、通用审计、AIPMRun、队列、通用幂等记录或生产部署。
- PPD-001～005 继续遵循总纲：本地可评估的脱敏展示、预算参考与模拟金额不是正式可见性、价格或资金规则。

终点是 `Project.status = OPEN`，且另一 Builder 可以读取确认过的招募视图。S1 完成后记录 S2 交接，不自动开始申请和选人。

## 2. 当前基线与开工预检

2026-09-23 本次规划核验：

- 本地分支 `feat/s0-project-draft`，HEAD `32006c2`；修改文档前工作区和暂存区干净。
- `git ls-remote` 确认远端 S0 分支为 `32006c2`，`main` 为 `168b4ee`；`gh pr view 1` 确认 [PR #1](https://github.com/xuyuufan/QianZo/pull/1) 为 OPEN，未合并。
- S0 已有真实登录、角色与禁用检查、项目持久化、企业隔离、创建意图重放和 expectedVersion 冲突控制；schema 目前仅三张业务表，项目状态 CHECK 仅允许 DRAFT。
- 状态文档记录 2026-09-23 独立复验：typecheck、lint、build、23 个集成用例和 3 个 E2E 用例通过；单元测试命令通过但没有独立单元用例。本次规划只读核对代码、测试和记录，未重新执行这些业务验收。

实施前依次完成：

1. 再检查分支、工作区、暂存区、最近提交和 PR 状态，保留其他工作。上述 SHA 是规划快照，不是永久基线。
2. 通常先按已有授权处理 S0 合入，再从包含 S0 的默认分支建立 S1 短期分支；当前不能直接从空内容的 main 开始。若用户明确授权基于 S0 分支叠加施工，记录依赖和未来 PR 基准。不因本文件自行 merge/push。
3. 读取根 README 和 package.json，使用已锁定版本，不为 S1 升级依赖。本机先将 `D:\` 放到 PATH 前面，确认 Node 24，再使用 `corepack pnpm`。
4. 核验本地 Docker/Supabase 与工具环境，执行非破坏性的 `db:prepare` 和必要 seed。不得把 `db:reset` 当作开始下一 Slice 的常规步骤。
5. 记录 S0 测试基线。写 Next.js 页面或 Server Actions 前读取已安装包 `node_modules/next/dist/docs/` 的相关指南；按实际版本使用 API。

### 必须处理的 S0 接续点

| 已有位置 | S1 必须接续的行为 |
|---|---|
| `src/modules/projects/repository.ts` 的草稿更新 | 目前依靠 DRAFT 和 expectedVersion；S1 的锁定项目仍为 DRAFT，因此必须额外拒绝 lockedSpecVersionId 非空的编辑 |
| `src/platform/db/schema.ts` 与 migration | 增加 S1 字段、四表及约束；不能只改 TypeScript 而不迁移数据库 |
| `tests/integration/database-permissions.test.ts` | 将“仅三表”调整为 S1 的七表集合；status 的必要 UPDATE 授权随发布动作增加，原“禁止任何 status 更新”测试应替换为合法发布与非法状态/越权拒绝测试 |
| 集成测试的清理逻辑 | 新外键和 Spec 指针引入依赖；只清理测试自己创建的数据，按依赖顺序解除指针和删除，不用级联删除或扩大 runtime 权限解决 |
| 企业详情与 Builder 首页 | 详情增加访谈、Spec、付款及发布阶段；Builder 增加招募浏览入口，保留 S0 权限和真实登录 |

## 3. 最小页面与服务边界

下列为拟定路由，可在不改变行为的前提下合并页面，不为每个动作新增一套 REST API。

| 路由 | 行为 |
|---|---|
| `/enterprise/projects/[projectId]` | 自己的项目总览；未锁定时编辑标题、需求及参考预算；显示 Spec、Mock 付款和发布状态 |
| `/enterprise/projects/[projectId]/spec` | 私有访谈记录、生成候选、候选预览与采用、手工编辑保存、新旧版本查看、锁定确认 |
| `/enterprise/projects/[projectId]/publish` | 已锁 Spec 的脱敏预览、企业 Mock 定金、最终预览确认及发布结果 |
| `/projects` | 已登录且有效的平台用户浏览 OPEN 项目列表；使用招募摘要 DTO |
| `/projects/[projectId]` | 已发布的脱敏 Spec、预算和周期；不提供申请按钮或假成功操作 |

S1 的招募浏览暂限定已登录且完成 onboarding 的 ACTIVE 用户，Enterprise 与 Builder 均可查看；这里的“公开”指申请前的招募视图，不表示匿名互联网公开。匿名访问、搜索引擎收录与正式可见范围仍待产品决定。

所有企业页面、私有查询和写入都验证 ENTERPRISE 与 owner。其他企业访问私有详情、Session、Message、SpecVersion、Payment 均返回不存在；Builder 可看招募快照，不能读取私有数据或执行企业动作。DISABLED 用户与未认证直接动作同样拒绝。不可只在 Proxy 或页面隐藏按钮。

沿用 Server Component → 服务查询、Server Action → 严格输入校验 → service → repository。现有 service 的 userId 必须来自服务端验证的 Auth UUID，不取自表单；请求不接受 ownerId、payerId、status、role 或任意数据库字段。含数据库和凭据的模块保持 server-only。

建议按实际需求增加 `src/modules/aipm/`、`specs/`、`payments/`，发布事务由项目应用服务编排。只创建正在使用的 Contract、校验器、Mock、service/repository 和页面，不预建通用框架。

拟定 Domain Actions：

| 动作 | 必要输入与结果 |
|---|---|
| `invokeAipm` | projectId、expectedVersion、操作、消息/指令；返回已持久化的回复或明确失败 |
| `adoptSpecProposal` | projectId、sourceMessageId、expectedVersion；从服务器保存的候选创建新版本，不相信客户端再次上传的候选 |
| `saveSpecVersion` | projectId、expectedVersion、document；手工保存永远新增版本 |
| `lockSpec` | projectId、specVersionId、expectedVersion；只锁当前已保存版本 |
| `createPayment` / `getPayment` | 当前企业项目；服务端固定 S1 用途、付款人、演示金额 |
| `simulatePaymentSuccess` | paymentId；核验所属项目及付款人，重复调用返回同一成功结果 |
| `publishProject` | projectId、expectedVersion、lockedSpecVersionId、确认过的脱敏预览内容；事务保存快照并转 OPEN |

错误沿用 401/登录跳转、403、404、422、409 的语义；Server Actions 返回稳定错误码和中文提示。新增 SPEC_LOCKED、VERSION_CONFLICT、PAYMENT_REQUIRED、INVALID_PROPOSAL 等必要错误，不返回原始 SQL、供应商错误正文或堆栈。

## 4. 数据库增量与权限

沿用 UUID、timestamptz、显式外键和 ON DELETE RESTRICT。migration 必须同时支持已有 S0 数据升级及空库顺序重建；不改写已应用的 S0 migration。

### 4.1 Project 增列

- `budget_min_minor`、`budget_max_minor`、`currency`：S0 迁移后先为空；企业补齐后才允许锁定。S1 演示采用 CNY，以整数分保存，服务端和数据库验证非负、下限不高于上限；页面输入用精确金额转换，不用浮点运算直接乘 100。
- `current_spec_version_id`、`locked_spec_version_id`、`locked_at`：初始为空；保存更新 current，锁定时 locked=current。
- `published_spec_snapshot jsonb`、`published_at`：发布事务写入；未发布为空。
- 状态 CHECK 扩展为 DRAFT/OPEN，不提前开放 S2/S3 状态。OPEN 必须具备锁定指针、锁定时间、发布快照和发布时间。
- 指针用 `(project_id, spec_version_id)` 对应的复合外键确保属于本项目，不只检查 UUID 存在。locked 指针与时间必须成对存在；当前 S1 锁定后 current 与 locked 保持相同。
- `version` 继续作为 Project 并发令牌；标题、需求、预算、Spec 保存/锁定、付款首次成功与发布等相关状态改变均递增。Spec 的 version_no 是另一套不可变内容序号。

### 4.2 四张新增表

| 表 | 最小字段与约束 |
|---|---|
| `app.aipm_sessions` | id、project_id、created_at；UNIQUE(project_id)，一项目一会话，按需幂等创建 |
| `app.aipm_messages` | id、session_id、role、content、payload 可空、created_at；role 仅 USER/ASSISTANT；只追加；用服务端生成的消息 ID 和稳定排序记录会话 |
| `app.spec_versions` | id、project_id、version_no、schema_version、content JSONB、created_by、source_message_id 可空、created_at；UNIQUE(project_id, version_no)、UNIQUE(project_id, id)、UNIQUE(source_message_id)；version_no>0、schema_version=1；只追加 |
| `app.payments` | id、project_id、payer_id、purpose、amount_minor、currency、status、created_at、updated_at、succeeded_at 可空；S1 purpose 仅 ENTERPRISE_DEPOSIT；UNIQUE(project_id, purpose)；金额正整数；PENDING/SUCCEEDED 与成功时间一致 |

候选回复的 payload 保存已验证的 result，以及服务端记录的 invocationId、contractVersion、operation、生成基线 Project.version 和 baseSpecVersionId。客户端不能修改这些元数据。source_message 必须是本项目 Session 的 ASSISTANT 候选，通过服务检查；唯一约束防止重复采用。保存时的 created_by 来自当前 actor。

Spec 版本分配在 Project 行锁内进行，最大版本号加一并以 UNIQUE 兜底。JSONB 顶层对象、schema_version 等基本结构由 DB CHECK 防守；完整业务结构、引用和长度由共享 Zod 校验器验证。不能声称 PostgreSQL 自动验证了全部 Spec 语义。

### 4.3 runtime 权限与不可变性

- 新表继续位于私有 app schema；PUBLIC/anon/authenticated 不获得业务表访问权，Data API 不暴露 app。
- Session、Message、SpecVersion 只授予必要 SELECT/INSERT；runtime 不得 UPDATE/DELETE 历史。所有表继续禁止 runtime DELETE/TRUNCATE/DDL/提权。
- Project 精确增加预算、Spec 指针、锁定/发布字段和 status 的 UPDATE 权限；仍不给 owner_id 更新权限。Payment 只增加 status、succeeded_at、updated_at 的 UPDATE，不允许改付款人、用途、项目或金额。
- 增加 status 权限意味着运行账号可以执行受约束的状态 SQL；合法转换和用户归属仍由服务端控制，不把 grants 描述为用户级 RLS。
- Project 上用必要的约束/窄触发器禁止已锁定指针被清空或替换、锁定后标题/原始需求/预算/current Spec 被改写，以及 OPEN 后发布快照被覆盖。不引入通用状态引擎。
- 付款首次成功后禁止退回 PENDING 或改写 succeeded_at；可用窄触发器与服务端条件更新共同保证。
- 保留已有 Drizzle INSERT 默认列兼容处理；不可为了修复 SQL 权限错误直接授予 ALL。

## 5. Mock AIPM、候选与版本历史

### Contract 和 Mock

复用总纲的 `AipmGateway.invoke(AipmRequest): Promise<AipmResponse>`、`INTERVIEW` / `GENERATE_SPEC` 与版本化 `POST /v1/invocations` 协议。S1 进程内使用 Mock，不必启动 HTTP 服务，也不需要真实模型 token。

- 校验请求与响应 Schema、contractVersion、invocationId。GENERATE_SPEC 的 SUCCESS 必须带有效 SpecDocumentV1；INTERVIEW 可以只有回复。completeness 仅供审阅提示，不能触发采用、锁定或发布。
- Mock 用稳定的合成 fixture 给出可重复访谈和候选。测试可以注入延迟、FAILED、缺少 Spec、错误关联 ID 或非法文档；不开放“跳过登录”的演示入口。
- 输入长度、消息总量和响应体积设明确上限并测试，失败显示可理解提示；不靠静默截断丢掉需求或候选。
- 平台持有会话和消息，Mock 不自行写数据库。协议实现需要可共享的类型、校验器和示例；若后续另建 AIPM_CONTRACT 文档，应由总纲引用唯一完整定义，避免并列维护两份协议。

### 调用与过期候选

1. 短事务锁 Project，检查有效企业 owner、DRAFT、未锁定与 expectedVersion；幂等获取 Session，保存本轮 USER 消息，递增 Project.version，记录生成基线。组装经过验证的项目、消息与 baseSpec。
2. 事务提交后调用 Gateway，不持锁等待 Mock 或未来网络服务。禁止透明自动重试。
3. 响应校验后重新检查身份/归属；另一个短事务追加 ASSISTANT 消息和基线元数据，记录该响应后递增 Project.version。若调用期间发生相关项目修改或其他访谈，该候选标示过期；不得把旧响应覆盖成新基线。
4. 采用时在 Project 行锁内同时验证当前 expectedVersion、候选本身记录的有效采用版本、baseSpecVersionId、项目归属、未锁定及 source_message 未采用。并发调用中仅仍匹配当前上下文的候选可采用；过期候选保留可查看，明确要求重新生成或人工另存，不自动 rebase。

有效采用版本应由平台在响应落库时、仅在生成基线仍匹配的情况下记录；ASSISTANT 追加造成的版本递增不能使刚生成的有效候选立即过期。候选采用后更新 current 指针和 Project.version；同一 source_message 的再次采用返回原采用版本或明确重复冲突，不能新增第二条。

失败调用保留已保存的用户消息，不生成可采用版本；展示明确失败和手工重试入口。失败响应若作为消息保留，使用经过清理的失败 payload。S1 不保证供应商跨进程恰好执行一次；进程中断不由后台自动恢复。晚到的合法回复可以作为历史保留，但锁定后不能据此修改 Spec。

### 编辑与锁定

- 审阅页面提供完整结构化预览与可编辑表单；首轮可使用带字段错误提示的 JSON 编辑区，但必须能通过 UI 修改并保存，不以直接改库代替。
- 手工保存和采用都新增 SpecVersion；旧版本不覆盖、不删除。手工保存不伪装成采用已有候选。
- 共享校验器完整落实总纲附录 A：必要内容非空、元素 ID 稳定且无重复、引用有效、至少一条里程碑验收标准、dueAfterDays 为正整数并严格递增。Schema 合法不等于企业已经确认需求。
- 锁定必须由企业明确确认当前已保存 Spec，验证版本一致及参考预算完整。事务设置 locked 指针/时间、递增版本；项目仍是 DRAFT，不新增 LOCKED 状态。
- 本地 S1 约定在锁定时同时冻结标题、原始需求和预算，避免后续展示与已确认范围脱节；这不是合同成立规则。锁定后不支持解锁、另存新 Spec 或继续访谈生成；可读所有历史，晚到回复按上节处理。
- 旧标签页、直接动作及并发保存不能绕过锁定。锁定与保存争抢 Project 行锁，只允许符合当前版本的一方成功。

## 6. 企业 Mock 定金与发布事务

PaymentProvider 只承担创建模拟付款的小接口，Mock 专用 `simulatePaymentSuccess` 不进入未来真实 Provider 的必需接口。不得预建 webhook、PaymentEvent、attempt、退款或对账。

### 企业模拟付款

- 创建付款前检查有效企业 owner、DRAFT 且 Spec 已锁；S1 演示固定为 **CNY 100 分（1.00 元）**，由服务端 fixture 提供，页面标注“模拟金额，不发生真实收付”。该值不是已确定的定金标准，不按预算比例计算。
- payer_id 固定为项目 owner；用途固定 ENTERPRISE_DEPOSIT。重复创建返回同一 payment，不能改金额或生成新订单。
- 模拟成功事务按 Project → Payment 顺序加锁，检查归属、用途、锁定状态、当前阶段及付款人；第一次 PENDING → SUCCEEDED，同时记录时间并递增项目版本。
- 对已经 SUCCEEDED 的同一付款，验证当前调用者权限后返回当前结果，包括项目已经 OPEN 的重复请求；不重复更新时间、递增版本或重新触发发布。
- 付款成功只满足发布前置条件，不自动发布。企业仍需预览确认并显式执行 publishProject。

### 发布

1. 企业打开发布页，服务端从 locked Spec 生成脱敏预览，连同 Project.version、lockedSpecVersionId 展示。
2. 企业补充必要脱敏并确认最终预览，提交发布意图；请求中的版本与快照来源必须能对应当前锁定记录。
3. 单个事务先锁 Project，再读取/锁定对应企业 Payment；验证 owner、DRAFT、锁定指针、expectedVersion、合法预览，以及正确付款人和用途的 SUCCEEDED。
4. 服务端重新校验、构造白名单快照，并在同一事务保存 snapshot、published_at、status=OPEN，version 加一。失败全部回滚，不留下“已公开但没快照”的状态。
5. 同一已发布结果的重复意图返回当前结果；不同预览或不同锁定版本的再次发布返回冲突，不能重写旧快照。S1 没有下架、重新发布或修改已公开内容的动作。

若付款首次成功使预览的 expectedVersion 失效，刷新发布预览后再次确认；前端可主动刷新，不在服务端忽略版本检查。并发发布最多一次产生状态变化。

## 7. 脱敏发布与申请前信息

招募查询只读取 `status=OPEN` 的确认快照，返回独立白名单 DTO；不能把完整 Project 或 Spec 数据传到浏览器再隐藏字段。私有数据不应出现在 HTML、RSC/动作响应或浏览器请求中。

快照建议保存 `schemaVersion: 1`、来源 lockedSpecVersionId、脱敏标题、参考预算/币种和脱敏 SpecDocumentV1；来源 ID 供内部校验，招募 DTO 不必暴露。周期来自最后一个里程碑的 dueAfterDays，不另造与锁定 Spec 不一致的工期。

| 必须保留的评估信息 | 对应展示 |
|---|---|
| Scope 与不做事项 | projectGoal、features、outOfScope、必要 assumptions |
| 功能及相关页面/流程 | features、userRoles、pages、userFlows 中影响工作量的内容 |
| 技术要求 | technicalConstraints、integrations 的必要约束 |
| 交付与里程碑 | deliverables、milestones、顺序及 dueAfterDays |
| 验收依据 | 每个 milestone 的完整 acceptanceCriteria 与 verificationMethod |
| 预算及周期 | 冻结的参考预算范围、币种、累计自然日；注明预算不是成交价 |

脱敏处理规则：

- 默认不读取/复制 originalRequirement、AIPM 对话、消息 payload、账号邮箱、联系方式或付款明细。Spec 中的自由文本也可能含敏感信息，白名单本身不保证脱敏。
- 从锁定文档派生可编辑预览；允许替换敏感名称和文本描述。保留结构 ID、引用、条目数量/对应关系、里程碑顺序和周期；不得删掉影响工作量或验收的义务。
- 服务端验证结构、引用、预算与时间对应关系；语义是否仍然完整由企业在并排私有内容/招募预览中确认，不能声称自动规则能识别所有秘密或证明语义等价。
- 如果无法在不丢失关键义务的前提下脱敏，停止发布该项目，不以几句招募文案代替完整评估信息。本地只使用可安全脱敏的合成素材。
- 发布按钮的确认针对最终预览；修改预览后需重新确认。未确认草稿不开放给其他用户。S1 不需另建发布草稿表，刷新后可以重新生成预览；成功发布的确认结果持久化到 Project。
- 读取不存在或未发布项目均返回 404；另一企业可以看 OPEN 项目的招募视图，但仍不能看企业私有页面。

上述为本地演示方案，PPD-001 的正式边界和外部真实招募条件保持 Pending。

## 8. 六个实施任务与 commit 节点

每个任务把页面/服务行为、migration、权限与相关测试一起完成；按 Workflow 验证后形成小 commit。S1-06 是整体验收，不是前五项欠缺权限测试的收尾桶。

| Task | 施工内容与依赖 | 本任务验收及建议 commit |
|---|---|---|
| S1-01 | 核验 S0 基线；实现共享 Contract/Spec 校验器、确定性 Mock、Session/Message migration 与私有访谈 UI | 真实持久消息、越权拒绝、协议异常、事务外调用；`feat(aipm): persist mock interviews with validated responses` |
| S1-02 | 依赖 01；SpecVersion migration、候选基线和采用、手工编辑、新旧版本页面 | Schema 负例、过期候选、重复采用、并发保存、跨项目 source 拒绝、历史不可写；`feat(specs): save immutable reviewed spec versions` |
| S1-03 | 依赖 02；预算表单/迁移、锁定指针及限制，补齐 S0 草稿更新保护 | 同项目指针约束、锁定/保存竞态、旧入口与直接 SQL 不改写冻结字段；`feat(specs): lock reviewed scope and reference budget` |
| S1-04 | 依赖 03；Payment 表、小 Provider 与 Mock、企业创建付款/模拟成功 UI | 重复及并发成功只生效一次、越权/错误阶段拒绝、金额快照不可改；`feat(payments): add enterprise mock deposit` |
| S1-05 | 依赖 04；脱敏预览确认、发布字段/状态迁移及事务、招募列表/详情 | 未锁/未付/陈旧预览拒绝、原子发布、重复请求、响应不泄露私有信息；`feat(projects): publish confirmed recruitment snapshots` |
| S1-06 | 依赖 05；组合 E2E、升级/重建验证、演示步骤及状态文档 | 完整 S0→S1 重演、S0 回归、所有相关检查通过；`test(s1): verify spec to recruitment flow and handoff` |

前期任务只增加当时使用的表、指针和 grants。并发与失败场景要有可控测试，不能仅靠手工双击按钮。每个任务允许必要修复 commit，不夹带依赖升级或无关重构。

## 9. Definition of Done 与验收矩阵

以下为 S1 实施的必需验收。逐项的实际执行结果（命令、用例数与未执行项）记录在 [PROJECT_STATUS](../../PROJECT_STATUS.md)。

| 范围 | 必需用例 |
|---|---|
| S0 回归 | 真登录/退出/onboarding；双企业隔离；Builder 企业动作拒绝；草稿刷新持久；重复创建与旧版本冲突 |
| AIPM Contract | 合法访谈和生成；FAILED、错误 invocationId/version、非法响应、缺少 Spec、超限输入都不能产生可采用结果 |
| Spec 结构 | 空必要内容、重复 ID、悬空引用、空验收标准、非整数/不递增 dueAfterDays 拒绝；合法手工编辑成功 |
| 版本历史 | 采用和手工保存新增不可变版本；重复采用至多一次；旧页面、旧候选、跨项目 Message/Spec ID 拒绝 |
| 竞态 | 候选生成期间编辑或锁定；两个并发保存；保存与锁定竞争；晚到响应保留历史但不能改锁定范围 |
| 锁定保护 | UI、原 S0 更新入口、直接动作拒绝锁后改写；runtime UPDATE/DELETE SpecVersion 失败；冻结 Project 字段不可被 SQL 绕过 |
| Mock 付款 | 未锁不能创建；错误用户/用途/阶段拒绝；重复及并发成功只有一单/一次转换；成功时间和金额不被改写 |
| 发布条件 | 未锁、未付款、未确认预览、错版本、非法快照拒绝；并发发布只有一次；失败不写部分状态；不同快照不能覆盖 OPEN |
| 招募与隐私 | Builder 可读 OPEN 快照；DRAFT 和私有历史不可读；用合成秘密标记验证 HTML/RSC/动作响应不含对话、原始需求、邮箱或付款明细；自由文本敏感标记经企业脱敏后不再出现 |
| 信息完整 | 功能、约束、交付、每条验收标准、预算及周期均可评估；结构删除/改工期被拒绝；刷新后快照相同 |
| 数据库权限 | runtime 正常业务成功；历史不可改/删、owner 不可改、无 DDL/TRUNCATE/提权；新旧表均不对 anon/authenticated/Data API 暴露 |
| migration | 已有 S0 库升级后草稿仍在，db:prepare 重跑不删数据；另在明确可重建的合成测试库验证空库迁移链，不擅自清空用户本地草稿 |

至少一条真实 Playwright 成功链：企业 A 创建草稿 → Mock 访谈 → 候选采用 → 手工另存一版 → 查看历史 → 补预算并锁定 → 模拟定金 → 脱敏预览确认 → 发布 → 刷新/重新登录 → 独立 Builder context 查看招募详情。另覆盖企业 B 私有越权、Builder 动作拒绝、锁定后旧页保存失败及陈旧预览冲突。

Contract、Spec 校验等纯逻辑用单元测试；授权/事务/约束用真实 runtime PostgreSQL 连接与必要 Auth 测试；浏览器使用真实登录 cookie。只 mock AIPM/Payment 外部能力，不把固定 actor 注入当作浏览器权限验收。

实施时沿用现有命令，根 README 为本机环境准备依据：

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm test:integration
corepack pnpm build
corepack pnpm test:e2e
```

build 与 E2E 顺序执行，避免争用 .next；遵循 README 的 pnpm PATH 与现有开发服务复用说明。S1 应新增实际单元用例，不把 passWithNoTests 当作校验器验收。Slice 整体验收还需验证本地生产构建启动及受保护页面行为；缺少环境时记录未运行项，不用内存数据库替代。

## 10. 演示与交付

继续使用两企业、一 Builder 的合成账号。fixture 至少包含一个可通过校验的完整 Spec、一个可脱敏的敏感标记示例和上述失败用例；不得提交真实客户需求、密钥或演示密码。演示文档说明模拟金额和预算含义，不显示未实现申请/开工能力。

完成后更新根 README 的实际演示步骤、PROJECT_STATUS 的真实实现/验证/提交状态，并维护本文件状态。交付应包含：

```text
完成：S1-xx 与实际可操作行为；累计到 OPEN，不宣称完整交易闭环
验证：实际命令/用例数、升级和重演结果、未执行项及原因
提交：实际 commit SHA；工作区剩余内容
远端：实际分支/PR/合并情况，不把本地 commit 写成已推送
剩余：已知限制；S2 申请、选择、Builder Mock 押金与开工尚未开始
```

S1 已于 2026-09-24 按上述六个任务实施完成，实施顺序、每个任务的 commit 与验收结果见 [PROJECT_STATUS](../../PROJECT_STATUS.md)。实施中形成并在实现里固定的补充契约：

- `ON DELETE RESTRICT` 无法被 `DEFERRABLE` 延迟检查，因此 `projects` 指向 `spec_versions` 的两个复合外键改为 `NO ACTION + DEFERRABLE INITIALLY DEFERRED`，使带历史的项目能在同一事务内删除；其余外键保持 `RESTRICT`。
- 空库重建的验证在独立 scratch 数据库上完成，仅用最小 `auth.users` 桩件替代 Supabase 平台对象；`supabase db reset --local` 未执行，以遵守「不擅自清空用户本地草稿」。
- E2E 对 `pnpm start` 的生产构建运行：`next dev` 冷启动会现场编译 Server Action 并造成首个用例假失败，生产服务无此抖动。

# Qianzo MVP V0 Engineering Blueprint — Simplification Pass

**版本：V0.2**

**远端仓库：[xuyuufan/QianZo](https://github.com/xuyuufan/QianZo)**
**Git remote URL：`https://github.com/xuyuufan/QianZo.git`**

本版保留原方案的模块化单体方向，替换上一版的实施优先级、首轮数据库范围和开发队列。

规划时仓库为空，没有产品文档能够支持将 Spec 可见性、报价方式、固定价格和二次接受流程视为定案。这四项统一恢复为 `Pending Product Decision`。

**第一阶段的完成标准：用真实登录、真实数据库和真实权限检查，在本地通过 Mock AIPM、Mock Payment 完成一个合成项目的交付闭环。**

本文是本轮工程总纲；施工切片见 [BUILD_SLICES.md](BUILD_SLICES.md)，开发、commit、push 与合并规则见 [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md)，Codex 入口见 [AGENTS.md](AGENTS.md)。附录 A 补全了沿用的 SpecDocumentV1，后续开发无需依赖聊天记录取得该结构。

## 实施等级

| 标记 | 含义 |
|---|---|
| `V0 REQUIRED` | 第一条本地 Vertical Slice 必须实现 |
| `V0 HARDENING` | 闭环之后补齐；其中安全与异常出口必须在外部试点前完成 |
| `V0.5` | 后续能力，不阻塞首次闭环 |
| `REAL PAYMENT` | 确定真实资金规则、接入真实收付时实施 |
| `LATER` | 出现明确需求后再评估，不预建代码和表 |

**等级表示实施门槛，不表示必须一次性创建该等级的所有文件和表。**

---

## 1. 保持不变的设计

| 设计 | 等级 | 本轮保留范围 |
|---|---|---|
| Next.js + TypeScript + PostgreSQL | `V0 REQUIRED` | 一套平台应用 |
| Supabase Auth、Drizzle | `V0 REQUIRED` | 真实登录，服务端访问数据库 |
| 模块化单体 | `V0 REQUIRED` | 清楚划分项目、Spec、申请、交付、支付、AIPM |
| UI 不直接读写业务数据库 | `V0 REQUIRED` | UI → 服务入口 → 授权与业务规则 → Repository |
| 明确的 Domain Action | `V0 REQUIRED` | 发布、选择、提交、验收、完成 |
| SpecVersion 不可变，锁定后不可修改 | `V0 REQUIRED` | JSONB 版本内容及锁定指针 |
| Submission 与验收历史 | `V0 REQUIRED` | 新提交新增记录，旧结论不覆盖 |
| 关键事务、唯一约束与状态检查 | `V0 REQUIRED` | 防止重复申请、并发选择、重复开工 |
| 版本化 AIPM HTTP Contract | `V0 REQUIRED` | 平台与开发者 B 可以并行 |
| PaymentProvider 接入边界 | `V0 REQUIRED` | 先有 Mock，不实现真实支付配套设施 |
| 可迁移 SQL migration | `V0 REQUIRED` | 按业务能力增加 |
| Docker、自部署能力 | `V0 HARDENING` | 本地闭环后验证，不绑定部署供应商 |

代码组织仍按业务模块，但**不要求每个模块预先创建 interface、factory、policy、rules、repository 等整套空文件**。从少量 `service.ts`、`repository.ts` 和必要类型开始，出现真实复杂度再拆分。

跨模块事务仍由应用层编排；不引入依赖注入容器、通用 CRUD 框架或事件总线。

---

## 2. 被简化的设计

### 2.1 Auth：直接使用 Supabase 用户 ID

**`V0 REQUIRED`**

采用：

```text
app.users.id = auth.users.id
```

具体规则：

- `app.users.id` 是主键，同时外键引用 `auth.users.id`。
- 删除 `auth_provider`、`auth_subject` 和独立 Identity Mapping。
- 认证后直接用已验证的用户 ID 查询平台资料、角色和资源关系。
- 平台仍检查用户是否被禁用。
- 角色来自平台受控数据，不能相信用户可编辑的 metadata。
- 用户记录在首次完成平台 onboarding 时幂等创建，不额外建设身份同步系统。
- 业务历史不随 Auth 用户级联删除；V0 不提供账号物理删除功能。

Supabase 官方支持通过 Auth 用户主键关联业务用户资料。本项目选择保留业务历史的删除策略，不照搬资料表的级联删除示例。[Supabase 用户管理](https://supabase.com/docs/guides/auth/managing-user-data)

**认证迁移适配层：`LATER`。**

### 2.2 数据库安全：一个授权中心

**`V0 REQUIRED`**

```text
Browser
→ Next.js 服务入口
→ 身份验证 + 资源授权
→ 业务服务
→ Drizzle
→ PostgreSQL
```

保留三个明确职责：

| 层次 | 职责 |
|---|---|
| 服务端授权 | 判断这个用户能否操作这个项目、申请或提交 |
| 数据库最小权限 | 限制应用账号能够执行哪些数据库操作 |
| 数据访问入口隔离 | 防止浏览器绕过服务端直接访问业务表 |

具体采用：

- 业务表放在不对 Data API 暴露的 `app` schema。
- anon、authenticated、PUBLIC 不具有业务对象访问权限。
- runtime 使用独立数据库账号，不使用 postgres 管理账号。
- runtime 无建表、迁移、TRUNCATE 等权限。
- 迁移凭据不进入应用运行环境。
- SpecVersion、Submission、SubmissionReview 等历史表不给 runtime UPDATE/DELETE 权限。
- **V0 不配置业务表 RLS policy，也不注入用户级数据库上下文。**

私有 schema 和 grants 是数据库入口限制，**不提供用户级资源隔离**。资源权限完全由服务端检查，必须通过越权测试证明。

因此，删除上一版“启用 RLS，再允许整个 runtime 访问”的配置。以后确实需要客户端直接查询业务数据或数据库级租户隔离时，再完整设计 RLS。[Supabase API 安全说明](https://supabase.com/docs/guides/api/securing-your-api)

### 2.3 一致性：先使用业务自身的约束

**`V0 REQUIRED`**

保留：

- Project 行锁。
- 同一项目只能选中一个 Builder。
- 同一 Builder 不能重复申请。
- 同一 Mock Payment 不能重复生效。
- 同一 Submission 只能正式审核一次。
- Spec 编辑与确认使用版本检查。
- 所有 Milestone 通过后才能完成项目。

延期：

- 通用 Command Framework：`LATER`。
- 通用 `idempotency_records` 表：`V0.5`，有跨请求重放需求时再建。
- 为所有操作统一保存响应、请求摘要和过期记录：`V0.5`。

首轮通过唯一约束、条件更新和少量操作专用 key 处理重复请求，不先建设通用基础设施。

### 2.4 Workspace、文件与交付

- Workspace 保持聚合页面，不建 Workspace 表：`V0 REQUIRED`。
- 首次成果提交使用 GitHub Repo、Demo URL 或其他交付链接：`V0 REQUIRED`。
- 文件上传、私有桶、下载授权、孤立文件清理：`V0 HARDENING`。
- 最终评价和站内通知不阻塞 Project → COMPLETED。

---

## 3. 被延期的机制

| 机制 | 等级 | 实施触发点 |
|---|---|---|
| 通用 AuditLog | `V0 HARDENING` | 本地闭环后、外部试点前 |
| 文件及私有下载 | `V0 HARDENING` | 增加文件交付能力时 |
| 管理员暂停、恢复、终止 | `V0 HARDENING` | 外部试点前补齐异常出口 |
| 撤销选择、重招 | `V0 HARDENING` | 核心选择流程稳定后 |
| 最终验收指定 Milestone 返工 | `V0 HARDENING` | 核心里程碑返工稳定后 |
| 企业、Builder 完整资料页 | `V0 HARDENING` | 从演示账号转入试点时 |
| 项目评价、站内通知 | `V0.5` | 完成主链后 |
| AIPMRun、UNKNOWN、恢复与重试管理 | `V0.5` | 需要可靠追踪真实 AI 调用时 |
| token、cost、缓存 token、定价版本 | `V0.5` | 开始管理模型成本时 |
| 完整调用计费、预算控制 | `LATER` | 有实际运营需求时 |
| PaymentEvent、Webhook 验签和去重 | `REAL PAYMENT` | 真实支付接入 |
| PaymentAttempt、订单对账 | `REAL PAYMENT` | 根据供应商订单和重试机制设计 |
| 退款、迟到成功、乱序事件 | `REAL PAYMENT` | 与真实资金规则一起实现 |
| 企业组织、成员邀请、复杂 RBAC | `LATER` | 企业多人协作成为明确需求时 |
| Auth 多供应商映射 | `LATER` | 确实引入第二认证来源或迁移时 |
| 生产 VPS、反向代理、监控、备份恢复演练 | `V0 HARDENING` | Deployment Phase |

延期通用审计，**不延期 Spec、Submission 和审核记录这些业务历史**。

延期异常操作时，首次本地版本不显示重招、退款、管理员终止等尚未实现的入口。它是受控演示版本，尚不满足外部试点条件。

---

## 4. Pending Product Decisions

以下四项均为正式产品决策待定，不能被演示代码或 seed 默认值反向确认为产品规则。

| 决策 | 尚需确定的内容 | 确认时点 |
|---|---|---|
| PPD-001：申请前 Spec 可见范围 | 完整 Spec、脱敏 Spec、逐项授权的具体边界 | 外部真实招募前 |
| PPD-002：Builder 报价能力 | 是否报价，报价是否包含工期，如何选定条款 | 正式申请流程定稿前 |
| PPD-003：价格模式 | 固定价、预算区间、协商价分别支持到什么程度 | 正式交易条款定稿前 |
| PPD-004：选择后的接受流程 | 是否二次接受、接受什么内容、何时取得 Workspace 权限 | 正式选人和开工流程定稿前 |
| PPD-005：真实资金规则 | 定金性质、收款方、退款、尾款和结算 | `REAL PAYMENT` 前 |

### 已明确的最低信息要求

**`V0 REQUIRED`**

申请前，Builder 应能判断：

- Scope。
- Features。
- 技术要求。
- Milestone 概览。
- Acceptance Criteria。
- 预算。
- 周期。

可以隐藏企业敏感数据、私有附件、完整 AI 对话、联系方式和保密信息。

因此，首轮提供的是**可用于评估项目的脱敏 Spec 展示**，不能缩减为几句招募文案。公开视图从锁定 Spec 派生，经企业预览确认；不得通过脱敏删掉影响工作量和验收的关键义务。

### 本地 Slice 的演示约定

用户已选择允许用以下约定完成本地合成数据演示：

- 展示包含上述判断信息的脱敏 Spec。
- 显示预算，不把预算视为已经成交的固定合同价。
- 暂不演示报价谈判。
- 暂不演示“被选择后再次接受 Spec”的步骤。
- 企业选择 Builder 后进入等待 Mock 押金阶段。
- Builder 模拟押金成功后激活 Workspace。

**这不表示“禁止报价”“只能固定价”，也不表示“付款即接受合同”。**

不建立报价策略引擎或接受流程配置系统。正式产品决策确定后，再修改相应表、动作和页面；本地演示约定仅记录在产品决策文档和 fixtures 中。

---

## 5. Simplified V0 Database

### 5.1 建表批次

首条本地 Slice 累计约 **11 张业务表**，随功能逐步创建。

| 批次 | 表 | 等级 |
|---|---|---|
| Foundation | `users`、`user_roles`、`projects` | `V0 REQUIRED` |
| 需求与 Spec | `aipm_sessions`、`aipm_messages`、`spec_versions` | `V0 REQUIRED` |
| 招募与 Mock 支付 | `applications`、`payments` | `V0 REQUIRED` |
| 交付与验收 | `milestones`、`submissions`、`submission_reviews` | `V0 REQUIRED` |
| Hardening | `audit_logs`、`files`、`submission_files`、`final_revision_requests`；需要时增加完整 profile 表 | `V0 HARDENING` |
| 后续增强 | `aipm_runs`、`notifications`、`project_reviews`；需要时增加幂等记录表 | `V0.5` |
| Real Payment | `payment_events`，以及经真实支付设计确认的 attempts、refunds 等表 | `REAL PAYMENT` |

Foundation 不创建后三批表。Hardening 也按功能逐项 migration，不一次性创建所有待用对象。

### 5.2 首轮通用规则

以下均为 `V0 REQUIRED`：

- 普通业务实体使用 UUID；User ID 复用 Auth UUID。
- 时间用 `timestamptz`。
- 历史表保存 `created_at`；可变表另有 `updated_at`。
- 外键、关键唯一约束和状态 CHECK 随表创建。
- 不级联删除交易和交付历史。
- 不给所有表预加 soft delete、通用 metadata 或未来状态。
- SQL migration 是结构变更入口。
- 状态操作先锁 Project，再处理 Application、Payment 或 Milestone。
- 网络调用不在数据库事务内执行。

### 5.3 Foundation tables

| 表 | 首轮主要字段 | 必需约束 |
|---|---|---|
| `users` | `id uuid`、`display_name text`、`status text`、时间戳 | id PK/FK → auth.users.id；status ACTIVE/DISABLED |
| `user_roles` | `user_id uuid`、`role text` | PK(user_id, role)；首轮 Enterprise/Builder；管理员能力随 Hardening 加入 |
| `projects` | `id`、`owner_id`、`title`、`original_requirement`、`status`、`version`、预算上下限及币种、current/locked Spec 指针、`published_spec_snapshot jsonb`、选中申请指针、锁定/发布/开工/完成时间 | owner FK；version>0；预算上下限合法；关联指针属于本项目 |

Project 调整：

- 移除首轮 `contract_amount_minor` 的固定成交价含义。
- 以预算字段表达参考金额；没有报价表不代表永久禁止报价。
- 移除首轮 `terms_hash`、`accepted_terms_hash`。
- Spec 锁定冻结开发范围；不自动构造尚未定义的交易合同。
- `on_hold`、取消原因、管理员字段随 Hardening 增加。
- 指向尚未创建表的字段和外键随对应 migration 增加，不在 Foundation 制造空依赖。

### 5.4 Vertical Slice tables

| 表 | 首轮主要字段 | 必需约束 |
|---|---|---|
| `aipm_sessions` | `id`、`project_id` | 每项目一个 Session |
| `aipm_messages` | `id`、`session_id`、`role`、`content`、`payload jsonb?`、时间戳 | USER/ASSISTANT；只追加；payload 仅保存必要的结构化回复和候选 Spec |
| `spec_versions` | `id`、`project_id`、`version_no`、`schema_version`、`content jsonb`、`created_by`、`source_message_id?` | 项目内版本号唯一；源候选消息最多采用一次；不可更新/删除 |
| `applications` | `id`、`project_id`、`builder_id`、`statement`、`status`、申请时 SpecVersion | UNIQUE(project,builder)；同项目最多一个 SELECTED/ENGAGED |
| `payments` | `id`、`project_id`、`application_id?`、`payer_id`、`purpose`、`amount_minor`、`currency`、`status`、`succeeded_at?` | 企业模拟定金每项目一单；Builder 模拟押金每申请一单 |
| `milestones` | `id`、`project_id`、`spec_version_id`、Spec 中的 milestone ID、顺序、标题、描述、deadline、交付物和验收标准 JSONB、status、当前提交指针 | 项目内顺序和 Spec milestone ID 唯一；当前提交属于本 Milestone |
| `submissions` | `id`、`milestone_id`、`builder_id`、序号、说明、成果链接、`submission_key uuid` | Milestone 内序号唯一；submission_key 防重复提交；不可覆盖 |
| `submission_reviews` | `id`、`submission_id`、`reviewer_id`、PASS/FAIL、逐条结果 JSONB、原因 | 每次提交只正式审核一次；FAIL 必须有原因 |

候选 Spec 可以保存在 assistant message 的结构化 payload 中，附带生成时的 Spec 版本信息。采用时检查当前版本和项目状态，再创建 SpecVersion。首轮不需要为此建设 AIPMRun 系统。

### 5.5 首轮状态范围

**`V0 REQUIRED`**

```text
Project:
DRAFT → OPEN → AWAITING_BUILDER
→ IN_PROGRESS → FINAL_REVIEW → COMPLETED
```

本地演示中的 AWAITING_BUILDER 仅表示等待 Builder Mock 押金，不预先定义二次接受规则。

```text
Application:
SUBMITTED → SELECTED → ENGAGED
         └→ REJECTED
```

Workspace 激活时，其他申请变为 REJECTED。

```text
Milestone:
PENDING → IN_PROGRESS → IN_REVIEW → APPROVED
                            └→ REVISION → IN_REVIEW
```

普通 Milestone 的 FAIL 与重新提交继续保留：它复用现有表，不需要额外基础设施。

项目取消、重招、暂停以及最终返工在 `V0 HARDENING` 中增加相应动作、字段和状态约束。

---

## 6. Simplified V0 AIPM Contract

### 6.1 V0 Required

**`V0 REQUIRED`**

平台保留一个小接口：

```ts
interface AipmGateway {
  invoke(request: AipmRequest): Promise<AipmResponse>;
}
```

第一条 Slice 使用 `MockAipmGateway`。HTTP 协议从现在确定，开发者 B 可以直接按协议进行第一次真实模型调用。

```http
POST /v1/invocations
Authorization: Bearer <service-token>
```

最小请求：

```ts
type AipmRequest = {
  contractVersion: "1";
  invocationId: string;
  operation: "INTERVIEW" | "GENERATE_SPEC";

  project: {
    id: string;
    title: string;
    originalRequirement: string;
  };

  sessionId: string;

  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;

  baseSpec: {
    versionId: string;
    document: SpecDocumentV1;
  } | null;

  instruction?: string;
};
```

最小响应：

```ts
type Completeness = {
  readyForReview: boolean;
  missingInformation: string[];
};

type AipmResponse =
  | {
      contractVersion: "1";
      invocationId: string;
      status: "SUCCESS";
      result: {
        assistantMessage: string;
        completeness: Completeness;
        specProposal?: SpecDocumentV1;
      };
    }
  | {
      contractVersion: "1";
      invocationId: string;
      status: "FAILED";
      error: {
        code: string;
        message: string;
      };
    };
```

规则：

- GENERATE_SPEC 成功必须返回合法 `specProposal`。
- INTERVIEW 不要求返回 Spec。
- completeness 是建议，不是自动锁定授权。
- Spec Schema 延续原方案的业务结构，完整定义见附录 A；不要求第一周实现复杂文档编辑器。
- 先支持企业手工编辑 Spec；专用 `REVISE_SPEC` 操作移至 `V0.5`。
- invocationId 用于关联请求和响应，不承诺供应商跨进程恰好执行一次。
- 平台持有 Session 和 Message；B 无需实现会话数据库。
- AIPM 只能提供候选结果，不能发布项目或锁定 Spec。

### 6.2 首轮最少保护

**`V0 REQUIRED`**

- 校验输入与输出 Schema。
- 校验返回的 invocationId 和 contractVersion。
- AI 调用放在数据库事务之外。
- 候选 Spec 采用时验证项目归属、Spec 未锁及版本仍匹配。
- 同一候选不能重复采用。
- 返回清楚的失败信息。
- 接 HTTP 时设置请求超时，不透明自动重试。

`FAILED` 表示平台本次没有取得可采用的成功结果，**不表示模型一定没有执行或没有计费**。不需要为表达这一点先建设 UNKNOWN 状态机。

### 6.3 V0.5 / Later

| 能力 | 等级 |
|---|---|
| 平台切换真实 HTTP Adapter | `V0.5`；可在本地闭环后立即安排 |
| AIPMRun 持久调用记录、UNKNOWN 和恢复 | `V0.5` |
| token usage、providerRequestId、cost | `V0.5` |
| cached tokens、pricing version | `V0.5`，有成本分析需求时 |
| 专用 AI 修订、流式输出 | `V0.5` |
| 自动重试、队列、后台执行 | `LATER`，根据实际延迟和失败情况决定 |
| 详细费用核算、预算控制 | `LATER` |

这些字段不作为 B 首次交付可用 AI 的验收条件。真实 HTTP 接入前也不要求先完成全部 V0.5 项目。

---

## 7. Simplified Mock Payment

### V0 只保留这些能力

**`V0 REQUIRED`**

```text
Payment
MockPaymentProvider

purpose:
ENTERPRISE_DEPOSIT
BUILDER_DEPOSIT

status:
PENDING
SUCCEEDED
```

平台服务：

```ts
createPayment(...)
getPayment(...)
simulatePaymentSuccess(paymentId)
```

保留小型 `PaymentProvider` 接口和 Mock 实现，首轮只表达创建模拟付款的能力。`simulatePaymentSuccess` 是 Mock 专用操作，不要求未来真实 Provider 实现“模拟成功”。

真实支付接入时再扩展 Provider Contract；不提前写空的退款、验签和对账方法。

### 模拟金额

- 使用明确标注的演示金额。
- 不按预算计算定金比例。
- 不表示已经确定了定金性质、合同预付或平台收费。
- Payment 保存金额快照，便于演示和测试。

### 模拟成功的事务

```text
验证登录用户
→ 锁 Project 与 Payment
→ 检查付款人、用途、项目阶段和当前申请
→ 若已成功，返回当前结果
→ PENDING 改为 SUCCEEDED
→ 必要时原子激活 Workspace
→ 提交事务
```

企业模拟定金成功后，仍由企业执行 `publishProject()`。

Builder 模拟押金成功时：

- 必须属于当前选中 Application。
- 企业模拟定金已成功。
- Project 仍处于等待开工阶段。
- 在同一事务中激活 Workspace、创建 Milestone、更新 Application。

重复点击不能重复建 Milestone；唯一约束和条件更新足够承担这一职责。

### V0 不创建

以下全部为 **`REAL PAYMENT`**：

- PaymentEvent。
- Webhook endpoint 和签名。
- provider event dedupe。
- providerPaymentId。
- 供应商订单对账。
- 乱序或迟到事件处理。
- 退款工作流。
- PaymentAttempt。

模拟成功通过已登录用户的应用命令完成，没有理由在第一周搭建外部支付回调链路。

---

## 8. Immediate Build Queue

以下 **10 项均为 `V0 REQUIRED`**，面向一名开发者和 Codex。

每项开始施工时，再拆成少量可以验证的小任务。原 TASK-001～029 仅保留为长期任务素材，不再作为立即执行清单。

| Queue | 目标与交付 | 依赖 | 验收 |
|---|---|---|---|
| IBQ-01 | 最小仓库、启动命令、精简文档、TypeScript 检查 | 无 | 应用可启动，当前范围和演示约定可查 |
| IBQ-02 | 本地 Supabase、受限连接、真实登录、企业与 Builder 演示账号 | 01 | 用户 ID 统一；客户端不能直接访问业务表 |
| IBQ-03 | 企业创建、编辑、查看自己的 Project | 02 | 刷新后保留；另一企业不能访问 |
| IBQ-04 | 最小 AIPM Contract、Mock 访谈、消息和候选 Spec | 03 | 可完成访谈并得到结构合法候选 |
| IBQ-05 | 企业审阅、编辑、采用、锁定 Spec | 04 | 有版本历史；锁定后不能修改 |
| IBQ-06 | 企业 Mock 定金、发布、申请前脱敏 Spec 展示 | 05 | 未锁或未模拟付款不能发布；展示足够评估信息 |
| IBQ-07 | Builder 申请、企业查看申请和选择 | 06 | 防自申请、重复申请、越权选择；最多选中一人 |
| IBQ-08 | Builder Mock 押金、激活 Workspace | 07 | 重复模拟不重复开工；未选 Builder 不能访问 |
| IBQ-09 | 链接成果提交、逐条验收、重新提交、最终完成 | 08 | 提交不覆盖；全部通过才能完成 |
| IBQ-10 | 固化完整演示、最小 E2E 和交接说明 | 09 | 新环境可重演，关键权限和一致性检查通过 |

### 最小测试门槛

**`V0 REQUIRED`，随相关任务实现，不全部拖到 IBQ-10。**

- 企业 A 无法读取或修改企业 B 的项目。
- 未选 Builder 无法访问 Workspace。
- 申请前可以读取经过确认的脱敏 Spec，不能读取 AI 对话。
- 锁定 Spec 不能修改。
- 并发选择只能选中一人。
- 重复模拟支付不重复开工。
- Submission 和审核历史不覆盖。
- 未全部通过不能完成项目。
- 一条完整成功 E2E。
- 一次 Milestone FAIL → 新提交 → PASS。

这里不要求覆盖率数字、全浏览器矩阵、生产压力测试或复杂测试报告平台。

---

## 9. Updated Phase Plan

| 阶段 | 目标 | 必须完成 | 明确不作为本阶段前置条件 |
|---|---|---|---|
| Phase 0：最小准备 | 能开始迭代 | IBQ-01～02 | 全量文档拆分、所有表、生产部署 |
| Phase 1：本地 Vertical Slice | 合成项目到 COMPLETED | IBQ-03～10 | 真实 AI、文件、通知、通用审计、真实支付 |
| Phase 2：V0 Hardening | 为外部试点补足权限和异常出口 | 产品决策确认、审计、重招、取消/暂停/终止、必要文件功能、异常测试 | 计费平台、队列、微服务 |
| Phase 3：AIPM 增强 | 接入 B 的真实服务 | HTTP Adapter、协议测试、基本超时与失败处理 | 完整 token/cost accounting |
| Phase 4：Deployment | 选定试点部署方式 | Docker、自部署验证、环境隔离、邮件、网络测试、备份恢复、基础监控 | 预先指定的 VPS 或海外云供应商 |
| 后续：Real Payment | 跑通真实资金流程 | 先确定资金规则，再设计并实现收付、退款和对账 | 不得直接把 Mock 改名为真实支付 |

Phase 2 与 Phase 3 可在本地闭环后并行。开发者 B 在 Phase 1 就可以依据 Contract 开发自己的模型实现。

### 第一阶段的部署约束

**`V0 REQUIRED`**

- 配置从环境变量读取。
- 数据库连接不写死。
- migration 可重建数据库。
- 应用不依赖特定云厂商 API。
- 采用标准 Node.js 运行方式。

**`V0 HARDENING / Deployment Phase`**

- Dockerfile 和容器启动验证。
- 选择主机或容器托管平台。
- 反向代理是否由平台提供。
- TLS、备份恢复、日志与监控。
- 中国目标用户网络测试。

Supabase 作为当前开发用数据库和认证服务保留；**应用部署供应商、主机地域和生产运维方案不在第一周锁定**。

---

## 10. 推荐的 Repository 文档结构

先创建少量权威文档，避免同一规则散落在十几份文件中。

当前已落盘的工程入口保留在根目录，可以直接使用；首项施工说明见 [S0 README](slices/S0-project-draft/README.md)。不为了开始 S0 强制移动现有文档。

```text
D:\Qianzo\
├── AGENTS.md
├── QIANZO_MVP_V0_ENGINEERING_BLUEPRINT.md
├── DEVELOPMENT_WORKFLOW.md
├── BUILD_SLICES.md
└── slices\
    └── S0-project-draft\
        └── README.md
```

后续应用施工时按实际需要逐步补充文档，或集中到以下目标结构；迁移时保留一个权威来源并更新链接：

```text
D:\Qianzo\
├── README.md
├── AGENTS.md
├── DEVELOPMENT_WORKFLOW.md
├── BUILD_SLICES.md
├── slices\
│   └── S0-project-draft\README.md
└── docs\
    ├── ENGINEERING_BLUEPRINT.md
    ├── PRODUCT_DECISIONS.md
    ├── AIPM_CONTRACT.md
    ├── BUILD_QUEUE.md
    └── PROJECT_STATUS.md
```

以上是 **`V0 REQUIRED`** 能力按需形成的目标文档结构，并非要求 IBQ-01 一次性创建所有文件。当前总纲在根目录即可作为权威来源；如以后移入 docs，更新全部入口链接，不长期维护两份并列权威副本。BUILD_QUEUE 细化任务并引用已有切片说明，不重复维护另一套冲突的实施顺序。

| 文档 | 内容 |
|---|---|
| README.md | 如何安装、启动、测试和运行本地演示 |
| AGENTS.md | 关键不变量、权限边界、命令、阅读顺序和当前禁止扩大的范围 |
| DEVELOPMENT_WORKFLOW.md | 分支、任务验收、commit 时点、消息格式、push/PR/merge 与交付规范 |
| BUILD_SLICES.md | S0～S3 的边界、依赖及分阶段验收 |
| slices/S0-project-draft/README.md | 首项可直接交给 Codex 执行的详细任务说明 |
| ENGINEERING_BLUEPRINT.md | 本版架构、实施等级、当前数据库、状态机和最小支付规则 |
| PRODUCT_DECISIONS.md | Pending、已决事项、演示约定及其适用范围 |
| AIPM_CONTRACT.md | 当前必需协议、示例；后续字段单列，不混入 required |
| BUILD_QUEUE.md | 10 项即时队列、当前任务的小拆分、后续 backlog |
| PROJECT_STATUS.md | 已实现能力、验证结果、未实现部分、下一项工作 |

暂不独立创建：

- 完整 PAYMENT_CONTRACT：当前最小 Mock 规则写入 Blueprint。
- DATABASE、STATE_MACHINE、AUTHORIZATION：当前集中在 Blueprint，篇幅增长或维护冲突出现后再拆。
- 29 个独立任务文件。
- 空的 ADR 目录和每模块模板文档。

后续按能力增加：

```text
docs/OPERATIONS.md          [V0 HARDENING / Deployment]
docs/PAYMENT_CONTRACT.md    [REAL PAYMENT]
模块 README                 [复杂模块实际需要独立说明时]
```

每次修改只更新权威来源，其他文档引用它。`PROJECT_STATUS.md` 必须区分“已实现”“本地演示假设”“正式产品待定”，不能把计划描述成现有能力。

---

## 第一周只关注哪条最短路径？

**一个企业账号、一个 Builder 账号、一个合成项目、一个 Milestone：**

```text
真实登录
→ 企业创建 Project
→ Mock AIPM 生成候选 Spec
→ 企业保存并锁定 Spec
→ 企业模拟定金
→ 发布可评估的脱敏 Spec
→ Builder 申请
→ 企业选择
→ Builder 模拟押金
→ Workspace
→ 提交 Demo / Repo 链接
→ 企业按标准验收
→ 最终确认
→ COMPLETED
```

建议安排：

| 时间 | 只关注的结果 |
|---|---|
| 第 1 天 | 登录、创建并持久化自己的 Project |
| 第 2 天 | Mock 访谈、Spec 保存与锁定 |
| 第 3 天 | 发布、申请、选择，串起两种 Mock 付款 |
| 第 4 天 | Workspace、链接提交、验收、完成 |
| 第 5 天 | 修复断点，验证权限、重复操作和一次返工，固化演示 |

这是工作顺序，不是交付时间保证。若进度不足，继续缩减页面装饰和辅助功能，保留权限检查、数据库约束及历史记录。

**第一周结束时最有价值的产物，是同一个项目从创建走到 COMPLETED，并能刷新、重演和解释每次状态变化。**

---

## 附录 A：沿用的 SpecDocumentV1

**`V0 REQUIRED`**。本附录补齐第 6 节使用的共享类型，不增加新的基础设施要求。存储采用不可变版本 JSONB；Milestone 执行记录从锁定版本生成。

```ts
type AcceptanceCriterion = {
  id: string;
  description: string;
  verificationMethod: string;
};

type Deliverable = {
  id: string;
  title: string;
  description: string;
};

type SpecDocumentV1 = {
  schemaVersion: 1;
  projectGoal: string;
  background: string;

  userRoles: Array<{
    id: string;
    name: string;
    description: string;
  }>;

  features: Array<{
    id: string;
    title: string;
    description: string;
    userRoleIds: string[];
  }>;

  pages: Array<{
    id: string;
    name: string;
    purpose: string;
    featureIds: string[];
  }>;

  userFlows: Array<{
    id: string;
    name: string;
    steps: string[];
  }>;

  integrations: Array<{
    id: string;
    name: string;
    purpose: string;
    constraints: string;
  }>;

  technicalConstraints: string[];
  deliverables: Deliverable[];

  milestones: Array<{
    id: string;
    title: string;
    description: string;
    dueAfterDays: number;
    deliverableIds: string[];
    acceptanceCriteria: AcceptanceCriterion[];
  }>;

  outOfScope: string[];
  assumptions: string[];
};
```

首轮必须验证：

- Project Goal、User Roles、Features、Deliverables、Milestones 有效且非空。
- Pages、Integrations 等无实际内容时可为空数组，不为充数虚构需求。
- 结构化元素 ID 稳定且无重复，所有引用 ID 有效。
- 每个 Milestone 至少有一条验收标准。
- Milestone 按文档顺序执行；`dueAfterDays` 是相对开工时间的累计自然日，必须为正整数并严格递增。
- 开工时计算 deadline；逾期不自动取消项目或判定验收失败。
- 锁定版本、执行 Milestone 和验收标准保持一致，执行过程中不单独改写范围。
- 逐条审核结果必须完整对应当前 Milestone 的验收标准。PASS 要求全部通过；FAIL 至少一条不通过并提供原因。
- V0 不提供已锁 Spec 解锁；相关异常处理不通过绕过锁定规则实现。

预算、报价、真实定金和成交条款不在本 Spec 结构中暗含确定，仍遵循第 4 节的产品决策边界。

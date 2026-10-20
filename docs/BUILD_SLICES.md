# Qianzo V0：施工切片与第一步

基准：[V0.2 Engineering Blueprint](QIANZO_MVP_V0_ENGINEERING_BLUEPRINT.md)。

开发与提交遵循 [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md)。首个 Slice 的独立施工说明见 [S0 README](slices/S0-project-draft/README.md)。

可以依据 V0.2 开始本地合成数据演示。无需重新设计架构，但开工前应把 Immediate Build Queue 分成下面四个可验收增量；每个增量都贯通页面、服务端业务规则与数据库。不要先把所有基础设施建完再做业务。

本文是施工组织说明，不变更 Blueprint 的产品范围。S0、S1、S2-01 与 S2-02 均已完成实现、本地验收和主模型审核；S3 本地实现、完整验证与主模型审查均已通过，尚未推送。S3 详细范围见 [S3 README](slices/S3-delivery-acceptance/README.md)；S2 规格见 [S2 README](slices/S2-applications-workspace/README.md)；实际状态、验证证据与提交记录见 [PROJECT_STATUS](PROJECT_STATUS.md)。

## S0：真实登录与自己的项目

**对应 IBQ-01～03；等级：V0 REQUIRED。**

- **目标：** 企业登录后可以创建、修改并查看自己的项目草稿。
- **范围：** 最小 Next.js / TypeScript 应用、本地 Supabase、服务端数据库连接、Auth、用户与角色、Project、草稿页面。
- **验收：** 项目刷新后仍存在；企业 A 无法读取或修改企业 B 的项目；浏览器不能绕过服务端直接读写业务表；应用数据库账号不具有迁移和建表权限。
- **交付：** 一个可操作的持久化项目草稿，以及可复现的本地启动和验证说明。

S0 开始时执行以下小任务：

1. 初始化最小应用和必要命令，写清启动、检查和本地环境变量说明，不预建全部模块与未来文档。
2. 配置本地 Supabase 和迁移入口，建立 Foundation 表及受限 runtime 账号；按需要增列，不预建后续业务表。
3. 接入真实登录和最小 onboarding，直接复用 Supabase Auth 用户 ID；准备企业与 Builder 演示账号。
4. 实现自己的项目列表、创建和编辑草稿，从页面到服务端授权再到数据库贯通。
5. 验证持久化、企业间越权和数据库权限，记录已完成能力与下一项 S1。

## S1：需求变成可招募项目

**对应 IBQ-04～06；等级：V0 REQUIRED；状态：2026-09-24 完成本地实现与验收。**

详细施工规格见 [S1 README](slices/S1-spec-publish/README.md)，包含六个任务、S0 接续点、数据与权限增量、并发规则及验收矩阵；实施结果见 [PROJECT_STATUS](PROJECT_STATUS.md)。

- **目标：** 企业经过 Mock AIPM 访谈，保存并锁定 Spec，模拟企业定金后发布。
- **范围：** 最小 AIPM Contract、Mock 回复与消息、候选 Spec、版本保存与锁定、Mock Payment、发布页面及申请前脱敏 Spec 展示。
- **验收：** 候选 Spec 合法；锁定后不可改写；旧版本保留；未锁定或企业 Mock 付款未成功时不可发布；重复模拟付款不重复生效。
- **信息要求：** 申请前展示 Scope、Features、技术要求、Milestone 概览、Acceptance Criteria、预算及周期；不暴露私有对话和敏感信息。

## S2：申请变成项目开工

**对应 IBQ-07～08；等级：V0 REQUIRED；状态：S2-01 与 S2-02 均已实现、本地验收并通过主模型审核。**

- **目标：** Builder 申请，企业选择；被选 Builder 完成本地模拟押金后开工并进入 Workspace。
- **范围：** S2-01 申请表单与列表及企业选择；S2-02 Builder Mock Payment、开工事务、Milestone 初始化和只读 Workspace 页面。
- **验收：** 禁止自申请和重复申请；并发选择最多成功一人；重复模拟付款不重复创建 Milestone；仅项目企业和选中且已开工的 Builder 可以进入 Workspace。
- **演示约定：** 本地合成项目暂不演示报价谈判和选择后二次接受；此约定不是正式交易规则。

## S3：成果变成已完成项目

**对应 IBQ-09～10；等级：V0 REQUIRED；状态：本地实现、完整验证与主模型审查均已通过，尚未推送；验收证据见 [S3 README](slices/S3-delivery-acceptance/README.md)。**

- **目标：** Builder 提交成果链接，企业验收，通过后完成项目。
- **范围：** Demo / Repo 链接提交、逐条验收、一次 FAIL → 新提交 → PASS、最终确认、完整 E2E 和交接说明。
- **验收：** 新提交不覆盖旧提交；每次提交的审核结论保留；旧提交不能误审核为新提交；全部 Milestone 通过后才可完成；非项目参与人不能操作。
- **总体验收：** 使用一个企业账号、一个 Builder 账号、一个合成项目和一个 Milestone，贯通 S0～S3，刷新可恢复状态，新环境可重演。

## 执行规则与范围

- 每次只细拆当前获授权规划或实施的 Slice；S0～S2-02 已完成，S3 当前实施规格见独立 README。
- 每个通过验收的小任务形成一个本地 commit；Slice 完成后按开发流程交付验证结果、提交记录和远端状态。
- 权限检查、关键唯一约束和相应测试随业务功能实现，不留到最后补。
- S0～S2 分别是可操作增量；四项完成后才构成第一条完整 Vertical Slice，不能把中间阶段称为完整交易闭环。
- 首轮使用真实登录、真实数据库与真实权限检查，AI 和 Payment 使用 Mock。
- 首轮不以真实 AI、真实支付、文件上传、Nginx、生产 VPS、备份演练或生产监控作为前置条件。
- 第一周只追踪上述最短项目链；进度不足时缩减页面装饰和辅助功能，保留权限、约束与历史。

## Pending Product Decisions

以下仍待产品确认，不能因演示实现而视为定案：

1. Builder 申请前是否看到完整 Spec，以及脱敏边界。
2. Builder 是否可以报价，报价是否包含工期。
3. 项目是否只能固定价格，或允许预算区间、协商价。
4. Builder 被选择后是否需要再次接受 Spec，以及接受的具体内容。

本地演示展示足够评估工作的脱敏 Spec，预算仅作参考，暂不演示谈判与二次接受。Mock 付款不代表合同接受或真实资金结算。

在外部真实用户试点前，必须确认上述产品决策并完成适用的 V0 HARDENING，包括异常退出、管理员处理、审计、权限与并发验证，以及 Deployment Phase 的必要准备。真实资金能力按 REAL PAYMENT 阶段另行设计和验收。

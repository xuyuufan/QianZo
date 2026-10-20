# Qianzo：Codex 工作入口

## 阅读顺序

1. [工程总纲 V0.2](docs/QIANZO_MVP_V0_ENGINEERING_BLUEPRINT.md)
2. [开发与 Git 工作流程](docs/DEVELOPMENT_WORKFLOW.md)
3. [S0～S3 施工切片](docs/BUILD_SLICES.md)
4. 当前 Slice README；[S2：申请与企业选择](docs/slices/S2-applications-workspace/README.md)（当前实施 S2-01）；已完成基线见 [S1：需求变成可招募项目](docs/slices/S1-spec-publish/README.md) 与 [S0](docs/slices/S0-project-draft/README.md)
5. 当前任务及已存在的项目状态、相关代码和测试；当前状态见 [PROJECT_STATUS](docs/PROJECT_STATUS.md)

远端仓库：`https://github.com/xuyuufan/QianZo.git`。

## 当前范围

- 先完成本地合成项目的完整交付链；AIPM 和 Payment 使用 Mock。
- 平台与 AIPM 由同一项目团队端到端负责；AIPM 契约是内部模块边界，为未来按需替换和验证真实 Provider 保留。
- `V0 REQUIRED` 表示优先级，不代表用户已经要求执行文档中的所有任务。
- 用户只要求规划、评审或文档时，不开始业务开发。
- 只细拆当前 Slice；不要预建全部数据库表、模块空壳或未来基础设施。
- 首次完整闭环不依赖真实 AI、真实支付、文件上传、通知、生产部署或复杂运维。

## 不变量

- UI 不直接读写业务数据库；每个服务端入口验证身份及资源关系。
- User ID 复用 Supabase Auth ID；数据库最小权限保留，不宣称当前有用户级 RLS 隔离。
- SpecVersion、Submission 和验收记录保留历史，锁定 Spec 不可改写。
- 状态转换使用明确 Domain Action；关键事务和唯一约束随功能实现。
- AIPM 只返回候选结果，不能锁定 Spec 或推进项目状态。
- 申请前提供足够评估的脱敏 Spec；不暴露私有对话或敏感信息。
- Spec 可见性细则、报价能力、价格模式、选择后二次接受仍是 Pending Product Decisions。本地演示不等于正式产品定案。
- Mock 支付不代表真实收付或合同接受。

## 工作与提交

- 修改前检查已有文件、分支和工作区状态；保留他人工作。
- 每项任务按 PLAN → EXECUTE → REVIEW 执行：主模型先指定范围和验收，GPT-6 Luna Max 负责实现、测试与文档，主模型审核并给出 PASS / REVISE / STOP；执行者提交验证证据，不以自审替代主审。指定模型不可用时如实报告，由主模型决定后续，不静默换模。
- 主模型可将相互独立的任务并行分配给多个 GPT-6 Luna Max 子 agent，并统一规划与审核；避免多人同时修改同一文件，共用数据库的验证串行执行。
- 先检查本地已有实现，再定向搜索 GitHub 上官方或维护良好的可复用代码，并记录链接及采用或不采用的原因。采用前核实许可证、版本兼容性、安全性和授权规则；不整仓照搬或引入无关依赖。没有合适候选时，做最小增量实现，不强行复用。
- 不预建当前需求以外的架构或通用框架；按本文件的不变量和开发流程完成授权、关键事务与唯一约束、相关验证、必要文档及本地提交。
- 涉及功能的授权、验证和测试与实现一起完成。
- 已建立 Git 工作区且用户已要求实施时，完成并验证一个小任务后默认创建本地 commit，具体规则见 DEVELOPMENT_WORKFLOW。
- 不全量暂存不明来源改动；不提交凭据、真实客户数据或生成垃圾。
- push、PR、merge 按任务中已有的授权范围执行；主审 PASS 并完成验证后，如需 merge，先向用户说明目标 PR、依赖与验证结果并等待明确授权；不得将本地提交声称为已推送。
- 交付时说明完成内容、实际验证、commit、远端状态和剩余工作。

## 文档维护

- Blueprint 负责范围与架构；Workflow 负责开发与提交；Slices 负责施工顺序。
- 根目录只保留 README 与本文件作为入口；其余权威文档集中在 `docs/`，切片说明在 `docs/slices/`。移动或重命名时必须同步修正本文件、README 和文档内部链接，避免两个并列权威版本。
- 架构和产品规则变动时更新对应权威文档，不能只改代码或依靠聊天记录解释。
- 应用脚本已经建立；启动、构建和测试命令以根 README 和 `package.json` 的当前实现为准，不虚构未运行的检查。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

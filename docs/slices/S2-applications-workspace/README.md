# S2：申请、选人和 Builder Workspace

本 Slice 承接 [S1 招募发布](../S1-spec-publish/README.md)，开发依据为[工程总纲](../../QIANZO_MVP_V0_ENGINEERING_BLUEPRINT.md)与[施工切片](../../BUILD_SLICES.md)。S2 只细化当前获准任务；实施状态与验证见[项目状态](../../PROJECT_STATUS.md)。

## 范围与边界

平台与 AIPM 由同一项目团队负责。当前闭环继续使用本地合成项目、Mock AIPM 和 Mock Payment；PPD 中的 Spec 可见范围、报价、价格模式和二次接受仍待产品决策。S2 不代表真实资金、正式合同或真实 Provider 已上线。

| Task | 范围 | 验收 |
|---|---|---|
| S2-01（当前） | ACTIVE Builder 对已发布 OPEN 项目申请；企业查看本项目申请并选择一人；双方可以查看各自允许的申请状态。 | 唯一申请、权限和 Spec 绑定在服务端与数据库验证；选择在 Project 锁内完成，旧版本与并发冲突可检测；选择后 Builder 看到等待 Mock 押金状态。 |
| S2-02（后续规划） | 被选 Builder 的 Mock 押金、项目开工和 Workspace 激活。 | 仅在另行实施和验收后进入工作区；本任务不创建付款、Milestone、Workspace 表、入口或按钮。 |

S2-01 只新增申请所需字段和约束：`applications`、项目当前选中申请指针及 `AWAITING_BUILDER` 状态。企业列表只返回申请陈述、状态与 Builder 展示名；Builder 只能读取自己的申请和已发布公开快照。Owner、角色、状态、Spec 指针均由服务端解析，不由表单控制。浏览器不访问 `app` schema；当前权限边界是服务端授权、受限数据库账号和 Data API 隔离，不宣称用户级 RLS。

选择后项目停留在 `AWAITING_BUILDER`，应用状态为 `SELECTED`，其他申请继续 `SUBMITTED` 至后续开工任务。S2-01 不添加报价、二次接受或取消/重招规则。

数据库触发器冻结已有 `SELECTED`/`ENGAGED` 申请的状态变化；当前服务只提供 `SUBMITTED` → `SELECTED`。S2-02 实施 IBQ-08 时须按真实押金/开工事务窄扩展至 `ENGAGED`，本任务不提供该动作。

## 本任务的复用检查

先检查并沿用仓库已有 `withProjectLock`、repository/service、`mapSharedActionError`、ActionState 和 Button 模式。定向参考：[Next.js 官方表单示例](https://github.com/vercel/next.js/blob/canary/examples/next-forms/app/add-form.tsx)展示 Server Action 表单的 pending 状态；[Drizzle 官方 PostgreSQL select builder](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/query-builders/select.ts)定义 `for` 行锁查询。复用现有项目模式，只参考 API 语义，不复制外部示例、引入依赖或扩展通用框架；不采用论坛片段作为实现依据。

## S2-01 验收记录

实现、本地验收与主模型审核均已通过；本地提交已创建，尚未推送。迁移 `20261020000000_s2_applications.sql` 已通过 `db:prepare` 应用，未执行 `db:reset`。运行时仅能读取申请所需数据、插入明确列并更新获准状态/项目指针；浏览器没有 `app` schema 访问权限，授权由服务端和数据库最小权限共同执行，不宣称用户级 RLS。

- `corepack pnpm typecheck`、`corepack pnpm lint`：通过。
- `corepack pnpm test`：12 个文件，100/100 通过。
- `corepack pnpm exec vitest run tests/integration --no-file-parallelism --maxWorkers=1`：10 个文件，122/122 通过；真实 PostgreSQL/Auth 测试串行执行。
- `corepack pnpm test:e2e`：生产构建与服务上的 17/17 通过。Next `app-paths-manifest` 有 14 项，其中 12 个产品路由和 2 个 Next 内部错误路由。覆盖申请、企业查看与选择、双方资源隔离、390px 导航无横向溢出及既有 S0/S1 回归。

当前完整 E2E 的命令输出、退出码与 Playwright 状态记录保存在本地忽略目录 `artifacts/ui-parity/s2/verification-20261020/full-production-e2e.log`、`full-production-e2e-exit.txt` 和 `full-production-e2e.last-run.json`；首次 E2E 夹具初始化和失败上下文也保存在同目录。该验证仅创建并清理本套件随机合成 Auth 用户及项目，没有重置数据库或改动演示用户角色。

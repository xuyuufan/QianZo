# S2：申请、选人和 Builder Workspace

本 Slice 承接 [S1 招募发布](../S1-spec-publish/README.md)，开发依据为[工程总纲](../../QIANZO_MVP_V0_ENGINEERING_BLUEPRINT.md)与[施工切片](../../BUILD_SLICES.md)。S2 只细化当前获准任务；实施状态与验证见[项目状态](../../PROJECT_STATUS.md)。

## 范围与边界

平台与 AIPM 由同一项目团队负责。当前闭环继续使用本地合成项目、Mock AIPM 和 Mock Payment；PPD 中的 Spec 可见范围、报价、价格模式和二次接受仍待产品决策。S2 不代表真实资金、正式合同或真实 Provider 已上线。

| Task | 范围 | 验收 |
|---|---|---|
| S2-01（已完成） | ACTIVE Builder 对已发布 OPEN 项目申请；企业查看本项目申请并选择一人；双方可以查看各自允许的申请状态。 | 唯一申请、权限和 Spec 绑定在服务端与数据库验证；选择在 Project 锁内完成，旧版本与并发冲突可检测；选择后 Builder 看到等待 Mock 押金状态。 |
| S2-02（已实现、本地验证通过、主模型审核 PASS） | 当前被选 Builder 创建并模拟支付固定本地押金；事务将项目开工、把选中申请转为 `ENGAGED`，并从锁定公开范围初始化 Milestone；双方从共享 Workspace 查看项目标题、里程碑、交付物和验收标准。 | 开工与押金成功、Milestone 初始化同事务且重放不重复；只有项目企业和当前 `ENGAGED` Builder 能访问 `IN_PROGRESS` Workspace；其他企业和 Builder 收到 404。 |

S2-01 新增申请所需字段和约束：`applications`、项目当前选中申请指针及 `AWAITING_BUILDER` 状态。企业列表只返回申请陈述、状态与 Builder 展示名；Builder 只能读取自己的申请和已发布公开快照。Owner、角色、状态、Spec 指针均由服务端解析，不由表单控制。浏览器不访问 `app` schema；当前权限边界是服务端授权、受限数据库账号和 Data API 隔离，不宣称用户级 RLS。

选择后项目停留在 `AWAITING_BUILDER`，被选申请为 `SELECTED`，其他申请暂时保持 `SUBMITTED`。S2-02 开工时，选中申请转为 `ENGAGED`，其他仍为 `SUBMITTED` 的申请转为 `REJECTED`。S2 不添加报价、二次接受或取消/重招规则。

S2-02 仅允许当前选中的 Builder 在 `AWAITING_BUILDER` 阶段创建及模拟其 Builder Mock 押金；固定本地演示金额为 ¥1.00，不发生真实收付或合同接受。成功操作以服务端确认的当前项目、申请与押金为准，在一个项目锁定事务中将项目推进到 `IN_PROGRESS`、选中申请推进到 `ENGAGED`、其他 `SUBMITTED` 申请推进到 `REJECTED`，并初始化锁定公开范围派生的 Milestone；重复成功不重复生成 Milestone。首个 Milestone 状态为 `IN_PROGRESS`，其余为 `PENDING`。所有截止时间以同一 `started_at` UTC epoch 为基点，按 Spec 中累计的 `dueAfterDays × 86400` 秒计算；接口返回 ISO 时间，页面按 Asia/Shanghai 显示。

本轮增量迁移 `20261020010000_s2_builder_start.sql` 只为此闭环扩展：付款绑定被选申请并保持 Enterprise/Builder 两种用途的唯一性，新增不可改写的 Milestone 范围快照、项目 `started_at` 与 `IN_PROGRESS` 阶段约束，并授予 runtime 创建快照和读取快照所需的窄权限。迁移应用状态与数据库验证结果以 [项目状态](../../PROJECT_STATUS.md) 的本轮记录为准。

共享路由 `/projects/[projectId]/workspace` 仅向项目企业和当前 `ENGAGED` Builder 返回白名单 DTO；非项目企业、非选中 Builder 和尚未开工项目按不存在处理。标题及 Milestone 来自已发布脱敏快照并绑定锁定 Spec 版本，不返回原始需求、AIPM 对话、私有 Spec、企业账号或付款明细。Milestone 展示计划截止日、交付物、验收标准及验证方法；当前不包含成果提交、审核或最终验收操作。

## 本任务的复用检查

先检查并沿用仓库已有 `withProjectLock`、repository/service、`mapSharedActionError`、ActionState 和 Button 模式。安全边界以仓库当前安装的 Next.js 16.3.5 本地 `node_modules/next/dist/docs/01-app/02-guides/data-security.md` 与 `server-actions.md` 为准：每个 Server Action 独立校验身份、角色和输入，只传回界面所需的白名单数据。[Next.js 官方安全指南源码](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/data-security.mdx)只用于交叉参考通用原则，不把 `canary` 视为本地版本契约。项目继续使用已安装 Drizzle 0.45.3；[官方事务文档](https://orm.drizzle.team/docs/transactions)和[官方包清单](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/package.json)用于核对现有事务 API；包清单声明 Apache-2.0 许可证。本任务不复制代码或添加依赖。[PostgreSQL 17 行锁文档](https://www.postgresql.org/docs/17/explicit-locking.html)用于核对固定锁顺序：Enterprise 定金为 Project → Payment，Builder 押金及开工为 Project → Application → Payment。只参考 API、安全与事务语义，不复制外部示例、引入依赖或扩展通用框架；不采用论坛片段作为实现依据。

## S2-01 验收记录

实现、本地验收与主模型审核均已通过；本地提交已创建，尚未推送。迁移 `20261020000000_s2_applications.sql` 已通过 `db:prepare` 应用，未执行 `db:reset`。运行时仅能读取申请所需数据、插入明确列并更新获准状态/项目指针；浏览器没有 `app` schema 访问权限，授权由服务端和数据库最小权限共同执行，不宣称用户级 RLS。

- `corepack pnpm typecheck`、`corepack pnpm lint`：通过。
- `corepack pnpm test`：12 个文件，100/100 通过。
- S2-01 当时的串行 PostgreSQL/Auth integration：10 个文件，122/122 通过；真实 PostgreSQL/Auth 测试串行执行。
- S2-01 当时的 production E2E：17/17 通过。其构建 manifest 有 14 项，其中 12 个产品路由和 2 个 Next 内部错误路由。覆盖申请、企业查看与选择、双方资源隔离、390px 导航无横向溢出及既有 S0/S1 回归。

S2-01 的 E2E 命令输出、退出码与 Playwright 状态记录保存在本地忽略目录 `artifacts/ui-parity/s2/verification-20261020/`。该验证仅创建并清理本套件随机合成 Auth 用户及项目，没有重置数据库或改动演示用户角色。

## S2-02 实现与验收

已实现 Builder 的“我的申请”Mock 押金创建与成功模拟、企业项目阶段状态和 Workspace 导航，以及共享只读 Workspace 页面。E2E 沿用单一申请流程，由 Builder 在 UI 中完成押金和开工，再分别验证 Builder 与企业访问、其他 Builder 与企业的 404、刷新后状态保持和 390px 布局。测试夹具只预置已成功的企业发布定金，没有直接种植 Builder 押金、`ENGAGED` 申请、`IN_PROGRESS` 项目或 Workspace Milestone。

本轮验证结果：`typecheck`、`lint` 均通过；unit 100/100 通过；串行 PostgreSQL/Auth integration 11 个文件、127/127 通过；Builder 开工 targeted integration 最终 3/3 通过。`db:prepare` exit 0，待应用列表为空，未执行 `db:reset`。fresh production build/start 上完整 E2E 为 17/17，exit 0（约 1.7 分钟）；manifest 共 15 项，其中 13 个产品路由、2 个内部错误路由。完整日志、退出码、Playwright 状态和路由清单在忽略目录 `artifacts/ui-parity/s2-02/verification-20261020/`。首次 targeted integration 中一条失败是 Drizzle 错误 `cause` 的断言层级，修正后 3/3 通过。两次早期完整 E2E 只因旧界面文案断言不匹配而失败，完整负结果保存在 `failed-first/` 与 `failed-second/`；修正断言后最终整套通过。pnpm 在切换 CI 环境时触发依赖目录重建，随后以 `corepack pnpm install --frozen-lockfile --force` 恢复成功，lockfile 未改；安装记录也在该忽略目录。

实现、本地验收与主模型审核均已通过；本地提交随本次变更创建，具体见 `git log`。S3 的成果提交、逐条验收与项目完成状态不属于本任务。

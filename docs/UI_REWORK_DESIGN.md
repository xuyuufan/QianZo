# Qianzo Flow UI 视觉还原与后端接入

**状态：修复进行中。** 当前接入版没有忠实迁移 Lovable 页面；此前以 CSS 几何图形替代机械海报的决定撤销。UI 外观以本地下载源码为准，现有 Next.js/S0/S1 服务端流程继续作为业务事实来源。

## 1. 设计源快照

- 只读设计源：D:/xyfdr/下载/qianzo-axis
- 下载目录没有 Git 元数据，无法核实此前文档记录的源码 commit。改用 SHA-256 清单冻结本次来源：115 个非环境文件，清单为 [qianzo-axis-source.sha256](ui-reference/qianzo-axis-source.sha256)，清单自身 SHA-256 为 cf509fc14c58458f8173896330eb2185d9d3c278750273cef982a8fd79669e67。源目录保持只读，.env 不复制进参考运行环境，也不进入哈希清单。
- 原版参考环境副本：C:/Users/xyfdr/AppData/Local/Temp/qianzo-axis-reference-20260925。Auth 请求只返回隔离演示响应，地址指向未启动的 loopback:59999；没有连接任何业务数据库。参考页面以 Lovable 源码自带的展示数据为准。
- 原版截图按相同字体等待并关闭动画后采集，首页固定显示海报帧；视口为 1440×900、768×1024、390×844。七页共 21 张截图位于 artifacts/ui-parity/original/，该目录由 .gitignore 排除。

### 素材清单

| 素材 | 来源与处理 | SHA-256 |
|---|---|---|
| 浅色机械海报 | 下载源码 src/assets/qianzo-mechanical-light-poster.webp；复制到 public/assets/qianzo-mechanical-light-poster.webp，字节校验一致 | c7945852cd36f1bcf57bfaaa14828a7f88bfba02e9dd9f003e020d9095aa4230 |
| 深色机械海报 | 保留在只读设计源中；原版首页固定使用浅色版本 | 0fb2d22fda2c5dc132918ab2f8f5d942879b04efbbe849438735d8399918c864 |
| 浅色首页视频 | 下载目录只有 .asset.json 描述文件；按描述文件中的 Lovable 地址核验为 HTTP 200、video/mp4、7,819,004 字节，已存入 public/assets/qianzo-mechanical-light.mp4；浏览器加载失败时隐藏视频并保留海报 | b2ee530763100e8677e7db87eb4f66a1e0e2b7b66d774238a6b948ffd9d3b888 |
| 字体 | 原版 root 从 Google Fonts 加载 IBM Plex Sans 与 Noto Sans SC，源码没有附带字体文件。接入版将以本地文件提供这两种字体及 300/400/500 字重，减少外部加载差异 | `public/fonts/`；字体及许可证的 SHA-256 见 [integrated-fonts.sha256](ui-reference/integrated-fonts.sha256) |

## 2. 原版页面与 Next.js 路由映射

| Lovable 页面与组件 | 现有 Next.js 页面 | 必须保留的业务适配 |
|---|---|---|
| src/routes/index.tsx | / | 原版首页 JSX、海报/视频、遮罩、颗粒、标题、双身份线轨及转场；身份只作为 intent 导航参数 |
| src/routes/auth.tsx | /sign-in | 原版窄卡片、留白、色点与输入框；表单提交到现有 signInAction，不提供任意邮箱演示登录 |
| ProductShell.tsx | 现有企业与大厅公共壳 | 迁入 56px 导航、品牌、身份色点和活动下划线；使用 Next Link、现有退出 Action 与服务端身份 |
| src/routes/requester.tsx / RequirementStudio.tsx | /enterprise/projects/new 与项目 /spec | 保留需求输入/Spec outline 双栏；先持久化草稿，接现有 AIPM 访谈与 Spec 服务 |
| src/routes/requester_.projects.index.tsx | /enterprise/projects | 保留状态计数与紧凑行列表；只呈现真实 DRAFT/OPEN 项目及服务端数据 |
| src/routes/builder.tsx | /projects | 保留搜索、计数、卡片密度与响应式三列/两列/单列；只显示真实 OPEN 项目，不伪造分类、技能或统计 |
| WorkspaceView.tsx | /enterprise/projects/[projectId]、/spec、/publish | 保留摘要、操作条、里程碑轴和标签页；真实预算、锁定、付款来自 S1。验收入口在 S0/S1 禁用，不接入本机演示状态 |
| SpecDocument.tsx | 企业 Spec 阅读、脱敏预览与招募详情 | 保留目录、编号、章节分隔和内容卡；数据取完整 SpecDocumentV1 或白名单快照 DTO |

允许的视觉适配仅限业务差异：真实身份与项目数据、单独的登录动作、先创建草稿、完整 Spec 字段、服务端预算/支付状态、招募脱敏快照，以及本轮尚未开放的验收入口。不得因此改写不相关的页面构图、字体、颜色、间距或断点。

## 3. 忠实还原规则

1. 原版 JSX 层次、Tailwind 类、尺寸、间距、字体、颜色、图标、按钮 variant 和响应式断点作为页面基准。
2. 使用原版 OKLCH tokens、IBM Plex Sans、Noto Sans SC、纸张网格、遮罩、颗粒及动画；不再用 CSS 圆环、额外标语或自绘机械图形替换来源素材。
3. 首页在可播放时用本地浅色视频，海报先行并作为加载/失败/减少动态效果的静态画面。视频从本站路径加载，不依赖 Lovable 私有地址。
4. 业务写入仍走现有 Server Actions、身份校验、资源授权、expectedVersion 和数据库约束；不引入 TanStack 路由、Lovable Auth、localStorage 业务状态或新 HTTP API。
5. 更新对应页面 E2E 断言：验证原版关键构图和素材，不再断言首页不存在图片/视频或必须绘制三个圆环。
6. 不因截图基线更新掩盖差异。截图固定字体、动画状态、视口与数据状态；动态视频另行验证。

## 4. 实施状态与验收

| 任务 | 状态 |
|---|---|
| 1. 来源冻结、页面映射、隔离原版环境与三视口基准截图 | 已完成：115 个文件哈希已记录；21 张基准截图采集成功；浅色视频资源可取得 |
| 2. 原版视觉基础、字体和实际使用的组件 | 已完成：迁入 OKLCH tokens、纸张/网格/动效样式、Button 组件与本地字体；typecheck、lint、91 项单元测试通过 |
| 3. 首页、真实登录和公共导航 | 已完成：逐页还原首页海报/视频、线轨与转场；真实登录窄卡、Onboarding 同视觉语言、56px 双身份导航与 Server Action 退出；5 项首页 E2E、4 项 Auth/Onboarding E2E 通过。原版与集成版截图位于 artifacts/ui-parity/{original,integrated}/ |
| 4. 我的项目与项目大厅 | 已完成：恢复紧凑项目行列表、真实 DRAFT/OPEN 筛选与计数，以及桌面三列/平板两列/手机单列大厅卡片；E2E 用一个真实流程项目加六条临时合成记录对照七行/七卡片布局，数据在用例结束后清理 |
| 5. 需求草稿工作台与项目详情 | 已完成：草稿页恢复输入/Spec outline 双栏；项目总览接入真实状态、预算、版本与计划里程碑，标签分屏展示 Overview、当前/历史 Spec、里程碑；验收标签禁用并注明开工交付后开放 |
| 6. 访谈编辑器、完整 Spec 与发布流程 | 实现完成，真实 Auth/PostgreSQL 端到端验收待环境恢复 |
| 7. 视觉、交互、业务、权限、移动端回归及交付记录 | 部分完成：静态检查、单元测试和生产构建通过；集成/E2E 被本地 Supabase 不可用阻断 |

本轮从集成分支 feat/lovable-ui-s0-s1 的 870ccb7 建立 codex/lovable-ui-parity。原有 docs/PROJECT_STATUS.md 与 next-env.d.ts 工作区改动必须原样保留，不能进入本轮 commit。默认只做本地 commit，不 push、PR、merge 或部署。

任务 6 已迁入原版细线章节和双栏工作区：访谈候选、当前 Spec、只读历史、结构化编辑分视图切换；锁定前展示版本、标题、原始需求和预算并要求确认；发布页以步骤条、定金区和完整脱敏预览承载现有 S1 动作。招募详情继续只读取安全快照 DTO，验收标准与验证方式逐条展示。编辑器仍复用现有字段往返、稳定 ID、引用约束、周期校验、错误定位、版本冲突和未保存修改保护逻辑。

任务 6 的视觉检查截图位于 `artifacts/ui-parity/integrated/task6/`：候选、编辑器（桌面/平板/手机）、脱敏编辑/预览和招募详情（桌面/手机）。截图使用临时合成数据预览入口渲染实际页面组件，采集后已删除该入口；截图仅用于布局审阅，不代表真实会话、数据库写入、权限或业务验收。原版同视口截图保留在 `artifacts/ui-parity/original/`。正式 Auth/PostgreSQL 不可用，因此本轮无法重跑真实浏览器完整流程。

### 本轮最终验证记录（2026-09-25）

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 通过 |
| `pnpm test` | 通过：10 个文件，91 项 |
| `pnpm build` | 通过；路由清单中没有临时预览入口 |
| `pnpm test:integration` | 未通过：8 个测试文件失败、1 个跳过；34 项失败、81 项跳过。Supabase Auth 请求失败，PostgreSQL `127.0.0.1:54322` 与 REST `127.0.0.1:54321` 连接被拒绝 |
| `pnpm test:e2e` | 11 项中 5 项通过、3 项在 Auth `beforeAll` 因 `AuthRetryableFetchError: fetch failed` 失败、3 项未运行；未触达完整 S0/S1 流程 |
| `pnpm db:start` | 失败：Docker Desktop 报告无法启动；没有重启可能承载用户容器的 Docker 进程 |

生产构建后将 `next-env.d.ts` 精确恢复到开工前快照 `.workbuddy/next-env-before-ui-restoration.d.ts`（SHA-256 `B8B3A344484B959AF5E4E3FC1A1609DAC3CB9ECE0CDEB6C145BE29BC4C491000`）；`docs/PROJECT_STATUS.md` 的既有用户修改保留且未暂存。任务 7 的业务、权限与完整响应脱敏验收仍待 Docker/Supabase 本地服务恢复后执行，不得以截图或静态检查替代。

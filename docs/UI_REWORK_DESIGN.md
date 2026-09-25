# Qianzo Flow UI 接入设计

**状态：已实施并通过本地整体验收（2026-09-25）；本地仓库是集成后应用的维护入口。**

## 设计来源快照

- Lovable 项目：[Qianzo Flow](https://lovable.dev/projects/7c709773-194a-416e-92a3-35135ccfccfc)
- Lovable 项目 ID：`7c709773-194a-416e-92a3-35135ccfccfc`
- 已核验源码提交：`a0c5a38a88db7768e84e13b51d263b0aebcd5acc`（2026-09-24）
- 预览地址：[静态预览](https://id-preview--7c709773-194a-416e-92a3-35135ccfccfc.lovable.app)
- 首页视频素材 HEAD 返回 HTTP 200；路径含 Lovable 专用 `/__l5e/assets-v1/`，不会作为本站必须资源。

接入保留纸张底色、克制配色、细线分隔、双身份入口、留白和项目/Spec 的编辑工作台视觉。TanStack Start 路由、Lovable 认证、演示会话、localStorage 业务状态、AI Gateway、Supabase 配置和示例业务类型都不进入本地应用。

## 已决定的集成约定

- 页面运行在现有 Next.js App Router；Server Components 继续调用现有带授权的服务层，写操作继续使用既有 Server Actions。
- Tailwind CSS v4 通过 Next.js/PostCSS 接入；按实际 UI 使用安装 shadcn/Radix 派生组件与 Lucide 图标，不复制 Lovable 全部组件和依赖。
- 首页访客公开可读。`intent=requester|builder` 只保留导航意图，最终目标由服务端核验的角色决定；没有意图时企业去自己的项目列表，其他有效用户去项目大厅。
- 页面数据从服务端 DTO 与 `SpecDocumentV1` 派生。数据库 schema、migration、Action 字段/错误码和 S0/S1 权限边界保持既有实现。
- Lovable 视频地址只用于设计来源核验；本站首页用渐变与 CSS 几何图形作为静态视觉，不请求视频、图片或 Lovable 私有素材路径。减少动态效果时动画降至近乎零时长，素材加载不再是登录前置条件。
- 本地项目作为唯一维护入口；不建立 Lovable 与本地代码的双向同步。

## 实施与验收切片

1. **设计基础与首页**：品牌样式、Tailwind v4/PostCSS、公开首页与身份意图入口。
2. **登录与草稿**：身份导航、登录/onboarding 视觉、真实项目列表、草稿与预算。
3. **访谈与 Spec**：访谈工作台、完整结构化编辑、候选、历史与锁定。
4. **发布与招募**：Mock 定金、脱敏编辑、发布预览、大厅和详情。
5. **整体验收与文档**：端到端链路、浏览器适配、验证记录和交接。

每个小任务完成对应验证后形成一个本地 commit。push、PR、merge 和部署不在本次授权范围。

## 当前完成度

- [x] 来源项目与源码提交已冻结。
- [x] 首页与品牌基础已迁入第一版。
- [x] 登录意图、onboarding 和 S0 项目列表/创建/详情入口。
- [x] 双栏访谈工作台、SpecDocumentV1 全字段结构化编辑、稳定 ID/引用管理、周期校验、未保存修改保护、候选采用、历史与锁定。
- [x] Mock 定金、结构化脱敏编辑、发布确认、标题/目标检索及白名单招募详情。
- [x] 浏览器整体验收（桌面、移动、键盘、减少动态效果与外部素材不可用）、全量回归和交接文档。

## 整体验收记录（2026-09-25）

- `corepack pnpm typecheck`：通过；`corepack pnpm lint`：通过。
- `corepack pnpm test`：10 个文件、91 个用例通过；`corepack pnpm test:integration`：9 个文件、115 个真实本地 Supabase/PostgreSQL 用例通过。
- `corepack pnpm build`：生产构建通过，共 11 条 App Router 路由。
- `$env:CI='true'; corepack pnpm test:e2e`：9 个真实浏览器用例通过（41.1 秒）；CI 设置让 Playwright 不复用现有服务，并由 `webServer` 新建生产构建与服务。
- 截图检查覆盖首页桌面 1440×900、首页手机 390×844、Spec 工作台桌面双栏/手机单栏、招募列表与详情的桌面和手机布局；E2E 断言手机宽度无横向溢出、首页身份入口竖排、键盘顺序导航、减少动态效果和结构完整的脱敏招募信息。截图只保存在 Git 忽略的 `test-results/`。
- 首页无图片、视频或 Lovable 私有素材请求；页面的 CSS 品牌图形可离线显示，身份链接仍能打开登录页。
- 本轮未添加 HTTP API、数据库表或 migration；读写继续经既有服务层、Server Actions 与权限校验。

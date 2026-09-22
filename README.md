# Qianzo

Qianzo 的第一阶段目标是用真实登录、真实数据库和真实权限检查，在本地完成一条合成项目交付链。当前施工范围是 S0：真实登录与自己的项目草稿。

## 本机要求

- Node.js 24 LTS（当前基线：24.13.1）
- pnpm 11.19.0（由 `packageManager` 固定）
- Git

本地 Supabase 与 Docker 要求将在 S0 数据库任务中补齐。

## 当前命令

```powershell
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

开发服务默认位于 <http://localhost:3000>。当前页面只是 S0-01 的应用基线；认证、数据库与项目草稿将在后续 S0 任务中按顺序接入。

## 权威文档

- [工程总纲](QIANZO_MVP_V0_ENGINEERING_BLUEPRINT.md)
- [开发与 Git 工作流程](DEVELOPMENT_WORKFLOW.md)
- [施工切片](BUILD_SLICES.md)
- [S0 施工规格](slices/S0-project-draft/README.md)

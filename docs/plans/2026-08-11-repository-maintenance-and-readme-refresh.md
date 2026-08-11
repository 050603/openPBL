# 仓库全面维护与 README 同步 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 以当前未提交的大版本改造为基线，修复可复现的错误、警告和回归，安全清理失效内容，并让 README 准确反映最终系统、迁移与验证方式。

**Architecture:** 不回滚或重写现有改造，先用静态检查、单元测试、Prisma 校验和生产构建建立证据，再做最小修复。清理仅覆盖可证明无引用、重复或已被新实现替代的内容；README 最后根据验证后的代码、环境变量、迁移和部署文件统一更新。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Vitest、ESLint、Prisma、PostgreSQL、Redis、Docker Compose

---

### Task 1: 建立可复现的质量基线

**Files:**
- Inspect: `package.json`
- Inspect: `tsconfig.check.json`
- Inspect: `eslint.config.mjs`
- Inspect: `prisma/schema.prisma`

**Steps:**
1. 运行 `pnpm lint:ci`，记录全部错误与警告。
2. 运行 `pnpm typecheck`，确认 Next 路由类型和 TypeScript 类型。
3. 使用非敏感占位 `DATABASE_URL` 运行 `pnpm exec prisma validate`。
4. 运行 `pnpm test:ci` 和 `pnpm build`，记录测试、运行时与打包问题。

### Task 2: 修复静态检查和测试暴露的问题

**Files:**
- Modify: `src/components/views/student/evidence-task/make-task.tsx`
- Modify: `src/lib/learning-evidence/readiness.test.ts`
- Modify: 由 Task 1 的后续诊断确定的实现或测试文件

**Steps:**
1. 调整作品版本列表的 memoization，使依赖与 React Compiler 推断一致，并保持分组筛选行为。
2. 删除测试文件中未使用的 `ArtifactSnapshot` 类型导入。
3. 为后续失败补充或收紧回归测试，再做最小实现修复。
4. 对每组修复运行定向测试和 `pnpm lint:ci` / `pnpm typecheck`。

### Task 3: 清理有证据确认失效的内容

**Files:**
- Inspect: `src/**/*`
- Inspect: `scripts/**/*`
- Inspect: `docs/**/*`
- Inspect: 根目录 Markdown 与配置文件

**Steps:**
1. 搜索 `TODO`、`FIXME`、弃用标记、乱码、调试输出、孤立入口和重复实现。
2. 结合 TypeScript/ESLint、`rg` 引用结果和 Git 历史确认候选项。
3. 只删除无运行时入口、无测试依赖且已有明确替代实现的内容。
4. 删除后重跑引用搜索、类型检查和相关测试，避免误删动态入口。

### Task 4: 更新 README 为最终系统说明

**Files:**
- Modify: `README.md`
- Inspect: `.env.example`
- Inspect: `docker-compose.prod.yml`
- Inspect: `deploy/README.md`
- Inspect: `prisma/migrations/**/*`

**Steps:**
1. 以最终代码核对系统能力、页面流程、生成架构、持久化和实时协作说明。
2. 更新版本日期、数据库迁移、环境变量、部署前置条件和生产运维说明。
3. 核对所有命令、路径、迁移名与文档链接确实存在。
4. 删除 README 中已失效、重复或与当前实现矛盾的信息。

### Task 5: 全量复验与差异审计

**Files:**
- Verify: 全部本次修改文件

**Steps:**
1. 运行 `pnpm lint:ci`、`pnpm typecheck`、`pnpm test:ci` 和 Prisma 校验。
2. 运行 `pnpm build`，确认 Next.js 生产构建成功且无警告。
3. 运行 `git diff --check` 并复查最终 diff，确认未覆盖用户的既有修改。
4. 汇总已修复问题、明确删除项、README 更新点和无法在本机执行的外部验证。

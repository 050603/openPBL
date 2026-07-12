# 教师 PPT、干预工作台与主动伴学增强实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将教师 PPT 预览切换为无播放、无 AI 朗读的轻量渲染器，补齐阶段三/四教师对话风险与处理闭环，增加阶段六课程总结演示，并实现三类主动伴学触发与差异化学生画像。

**Architecture:** 复用现有教师资源场景、伴学线程和学习信号模型。教师资源只使用 OpenMAIC 的场景渲染器，不初始化 PlaybackEngine/TTS；教师干预通过按学生聚合的持久化信号完成处理闭环；学生保存文档和上传文件通过浏览器事件通知伴学圆桌，由服务端 Director 按指定角色调度。课程总结演示使用独立的可持久化总结 deck，内容由过程评价证据填充，不预设学生结论。

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Zustand session store, Vitest, Tailwind utility classes.

---

### Task 1: PPT 轻量渲染器

**Files:** `src/components/openmaic/edit/PlaybackChromeRoot.tsx`, `src/components/openmaic/canvas/canvas-area.tsx`, `src/components/openmaic-bridge/openmaic-resource-player.tsx`, tests.

- 教师资源路径不创建 PlaybackEngine，不启用 TTS，不显示播放提示、播放按钮、音量/自动播放或 AI 朗读内容。
- 保留 SceneRenderer 对 slide/interactive 内容的展示和外层资源切换；投屏学生仍使用只读路径。
- 添加回归测试，断言 teacher-resource 不展示 Play/朗读控件，student-course 仍保留原行为。

### Task 2: 阶段三对话与风险入口

**Files:** `src/components/views/teacher/proposal-review.tsx`, `src/components/views/teacher/companion-monitor.tsx`, tests.

- 在学生方案详情中直接显示对话数量、风险数量和“查看 AI 对话/风险”入口。
- 让阶段三的学生卡片 badge 与当前未处理 learningSignals 同步，保证教师不会只看到方案文本。

### Task 3: 阶段四按学生处理闭环

**Files:** `src/components/views/teacher/companion-monitor.tsx`, `src/components/views/teacher/project-making.tsx`, `src/lib/classroom/stage-gates.ts`, tests.

- 删除旧的平铺干预队列，改为左侧学生网格/列表（进度条、风险 badge）+ 右侧选中详情。
- 教师提交处理后将相关信号和 TeacherIntervention 标记为 handled/resolved，badge 即时消失并持久化。
- 保留共性问题和对话时间线，空状态、无风险和高风险状态均可读。

### Task 4: 阶段六课程总结演示

**Files:** `src/lib/session/types.ts`, `src/lib/session/actions.ts`, `src/lib/session/store.tsx`, `src/components/views/teacher/reflection.tsx`, tests.

- 新增课程总结 deck 数据结构，包含 slide 标题/要点/讲稿/证据引用/状态。
- 教师在生成 AI 过程评价后可生成总结 PPT + 讲稿；内容来自班级评价、过程亮点和改进建议，缺证据时明确显示待补充，不虚构结论。
- 提供轻量 PPT 预览区和教师确认状态，不把学生自评或同伴互评写入评分。

### Task 5: 主动伴学事件与学生画像

**Files:** `src/lib/session/types.ts`, `src/lib/companion/orchestrator.ts`, `src/lib/companion/student-profile.ts`, `src/components/views/student/companion-roundtable.tsx`, student save/upload views, `/api/chat/companion`, tests.

- 新阶段无发言 60 秒由灵灵触发；保存文档由问问触发检验性问题；上传文件由评评触发用户视角反馈。
- 通过自定义浏览器事件监听文档保存/文件上传，不依赖轮询或输入框实现细节。
- 增加基于独立推进、核验、产物变化、直接代做模式的学生画像；画像只调整支架策略，不直接影响分数，也不按 AI 使用次数扣分。
- Director 支持 preferredCompanionId，确保上述事件由指定角色发言，并持久化触发类型与消息。

### Task 6: Verification

- 先跑新增单测，再跑 `pnpm test`、`pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm build`。
- 启动开发服务器，用浏览器检查教师 PPT 控件、阶段三对话入口、阶段四处理后 badge、阶段六总结区和学生端三类主动触发。

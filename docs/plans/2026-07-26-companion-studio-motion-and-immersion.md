# AI 伴学教室动作与沉浸体验 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在保留“点击人物或场景物件进入交互”的课堂隐喻下，提升六位伴学智能体的动作丰富度、流畅度、定位准确性，并统一优化学生端工作台与教师端观察界面。

**Architecture:** 角色层采用 192×208 统一画布的脚底锚点作为唯一世界坐标基准，在工位、通行、场景交互和人物对话上分别定义语义锚点。状态展示直接映射到现有 26 套 OpenPBL 动作素材；换色只识别高饱和围巾原色，保护深蓝灰身体。学生端维持 Pixi 场景为主界面，信息、设置和工作台按需浮现；教师端复用相同的状态标签和角色视觉语言。

**Tech Stack:** Next.js 16 App Router、React 19、PixiJS 8、TypeScript、CSS、Vitest、Playwright

---

### Task 1: 建立角色语义动作与稳定播放参数

**Files:**
- Modify: `src/assets/agent/index.ts`
- Modify: `src/pixi/resources.ts`
- Modify: `src/pixi/status-presentation.ts`
- Test: `src/pixi/resources.test.ts`
- Test: `src/pixi/status-presentation.test.ts`

**Steps:**
1. 为现有 26 套 OpenPBL 动作增加可直接调用的语义动作名。
2. 为基础、对话、学习、移动动作设置 8–12 FPS 的统一播放节奏。
3. 按伙伴职责把处理、等待、选择、完成和错误状态映射到可辨识动作。
4. 运行目标测试并确认所有动作资源 URL 可解析。

### Task 2: 修复帧内抖动、对话错位与动作关键点

**Files:**
- Modify: `src/assets/agent/roles.ts`
- Modify: `src/pixi/person.ts`
- Modify: `src/pixi/workstation.ts`
- Modify: `src/pixi/orchestrator.ts`
- Modify: `src/pixi/study-zones.ts`
- Test: `src/pixi/person.test.ts`
- Test: `src/pixi/orchestrator.test.ts`

**Steps:**
1. 将帧内修正从少量动作扩展为统一脚底基线策略。
2. 为每个工位定义座位、起身、候场和面对面交流四类独立锚点。
3. 让站立访问者停在与坐席角色视线一致的位置，并保持合理水平间距。
4. 修正资料角、项目白板和过程档案的接近点、交互点、朝向与遮挡关系。
5. 增加锚点与对话站位测试。

### Task 3: 修复围巾换色误伤身体

**Files:**
- Modify: `src/pixi/action-textures.ts`
- Test: `src/pixi/action-textures.test.ts`

**Steps:**
1. 将蓝色识别从宽泛通道判断改为色相、饱和度、亮度和色差联合门槛。
2. 保留围巾高光与阴影，同时排除低饱和深蓝灰身体。
3. 用代表性像素单测验证围巾命中、身体保护和透明像素跳过。

### Task 4: 优化沉浸式学生界面与交互工作台

**Files:**
- Modify: `src/components/views/student/companion-studio-workspace.tsx`
- Modify: `src/components/views/student/companion-studio-workspace.css`
- Test: `src/components/views/student/student-surface-cleanup.test.tsx`

**Steps:**
1. 规范舞台状态、设置、小组动态、输入框和任务提示的安全区，避免遮挡角色与场景热点。
2. 将侧栏改为更清晰的课堂速览、伙伴状态、空间入口和设置分组。
3. 增加键盘关闭、焦点可见、运动降级和课堂小屏适配。
4. 优化资料角、项目白板、档案与历史弹层的层级、留白和操作文案。

### Task 5: 同步教师端观察体验

**Files:**
- Modify: `src/components/views/teacher/companion-monitor.tsx`
- Test: `src/components/views/teacher/companion-monitor.test.tsx`

**Steps:**
1. 在学生列表中同步显示当前伙伴任务、待确认和风险数量。
2. 在学生详情中用同一套角色色与状态语义展示伴学任务流。
3. 保留教师干预、指令和对话证据功能，压缩不必要的信息层级。

### Task 6: 回归验证

**Steps:**
1. 运行 Pixi、学生伴学和教师观察目标测试。
2. 运行 TypeScript、ESLint 与生产构建。
3. 启动课堂页面，截取桌面与窄屏画面，验证人物站位、动作切换、换色、侧栏和工作台。
4. 修复所有可见抖动、遮挡、错位或交互回归后再交付。

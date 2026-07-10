# OpenPBL 设计规范 v2

> 本规范定义 OpenPBL 课堂平台的视觉语言、组件约定与交互模式，确保界面具有独特的身份感，避免通用 AI 模板化特征。

## 一、设计原则

1. **身份优先**：教师端（靛蓝 Indigo）、学生端（青绿 Teal）、AI（天蓝 Sky）三色贯穿全站，用户一眼可知当前角色
2. **克制专业**：去除过度渐变、模糊光晕、浮夸阴影；用几何元素和排版建立层次
3. **信息密度**：关键数据首屏可见，通过卡片分组、可视化图表代替冗长文字
4. **目的性动效**：动画服务于状态反馈，而非装饰；尊重 `prefers-reduced-motion`

## 二、色彩系统

### 2.1 身份色（CSS 变量）

| 角色 | 变量 | 色值 | 语义 |
|------|------|------|------|
| 教师 | `--pbl-teacher` | `#4338ca` 靛蓝 | 主控、权威 |
| 学生 | `--pbl-student` | `#0d9488` 青绿 | 探索、成长 |
| AI | `--pbl-ai` | `#0284c7` 天蓝 | 智能、辅助 |

每个身份色配套提供：
- `*-hover`：深一档，用于按钮 hover
- `*-soft`：浅一档背景（如 `#eef2ff`）
- `*-border`：边框色（如 `#c7d2fe`）

### 2.2 状态色

| 状态 | 变量 | 色值 | 场景 |
|------|------|------|------|
| 成功 | `--pbl-success` | `#059669` 翠绿 | 完成、在线、通过 |
| 警示 | `--pbl-warning` | `#d97706` 琥珀 | 待办、风险、提醒 |
| 危险 | `--pbl-danger` | `#e11d48` 玫瑰 | 错误、删除、结束 |
| 成就 | `--pbl-achievement` | `#b45309` 古铜 | 评分、徽章 |

### 2.3 中性色

- 背景：`--pbl-bg` `#f5f7fa`
- 表面：`--pbl-surface` `#ffffff` / `--pbl-surface-soft` `#f8fafc`
- 文本：`--pbl-text` `#0b1220` / `--pbl-text-muted` `#475569` / `--pbl-text-subtle` `#94a3b8`
- 边框：`--pbl-border` `#e2e8f0` / `--pbl-border-strong` `#cbd5e1`

### 2.4 角色背景

通过 `pbl-app-bg-role-teacher` / `pbl-app-bg-role-student` 类应用克制的径向渐变，让整个页面有角色归属感而不喧宾夺主。

## 三、圆角阶梯

| Token | 值 | 用途 |
|-------|----|------|
| `--radius-xs` | 6px | 小按钮、徽章、输入框 |
| `--radius-sm` | 8px | 标准按钮、工具栏 |
| `--radius-md` | 12px | 卡片、面板 |
| `--radius-lg` | 16px | 大卡片、Hero 区 |
| `--radius-xl` | 20px | 弹窗、特殊容器 |
| `--radius-pill` | 999px | 胶囊、状态点 |

**使用规则**：一律通过 `rounded-[var(--radius-xs)]` / `rounded-[var(--radius-sm)]` / `rounded-[var(--radius-md)]` / `rounded-[var(--radius-lg)]` / `rounded-[var(--radius-xl)]` 引用，禁止裸写 `rounded-[12px]` 等魔法数字。

## 四、阴影阶梯

| Token | 强度 | 用途 |
|-------|------|------|
| `--shadow-flat` | none | 紧贴布局 |
| `--shadow-soft` | 低 | 默认卡片 |
| `--shadow-raised` | 中 | 悬浮卡片、强调 |
| `--shadow-floating` | 高 | 弹窗、下拉菜单 |
| `--shadow-hero` | 最高 | Hero 横幅 |

## 五、字体阶梯

| Token | 值 | 用途 |
|-------|----|------|
| `--text-xs` | 12px | 辅助说明、时间戳 |
| `--text-sm` | 13px | 次要文本 |
| `--text-base` | 14px | 正文（默认） |
| `--text-md` | 15px | 卡片标题 |
| `--text-lg` | 17px | 区块标题 |
| `--text-xl` | 20px | 页面副标题 |
| `--text-2xl` | 24px | 页面主标题 |
| `--text-3xl` | 30px | Hero 副标题 |
| `--text-4xl` | 38px | Hero 主标题 |

**字重规则**：
- 日常文本：`font-medium` (500)
- 强调文本：`font-semibold` (600)
- 标题：`font-bold` (700)
- **禁止使用 `font-black` (900)**，避免过度强调导致视觉噪音

## 六、间距阶梯

4px 基准：`--space-1` (4) → `--space-2` (8) → `--space-3` (12) → `--space-4` (16) → `--space-5` (20) → `--space-6` (24) → `--space-8` (32) → `--space-10` (40) → `--space-12` (48)

## 七、组件规范

### 7.1 Card

```tsx
<Card>                  // 默认卡片，p-5, pbl-card
<Card compact>          // 紧凑卡片，p-4
<Card raised>           // 强调卡片，pbl-card-raised
```

### 7.2 Pill / StatusPill

```tsx
<Pill tone="indigo" size="sm">教师端</Pill>
<Pill tone="teal" size="md">学生端</Pill>

// 语义化状态徽章
<StatusPill status="teaching" label="授课中" />
```

支持的 tone：`blue` / `indigo` / `teal` / `green` / `orange` / `amber` / `gray` / `red`

### 7.3 PrimaryButton

```tsx
<PrimaryButton tone="indigo" size="md">教师操作</PrimaryButton>
<PrimaryButton tone="teal" size="lg">学生操作</PrimaryButton>
<PrimaryButton variant="outline" tone="slate">次要操作</PrimaryButton>
```

- 教师端主操作用 `tone="indigo"`
- 学生端主操作用 `tone="teal"`
- 危险操作用 `tone="red"`
- 次要操作用 `variant="outline"` + `tone="slate"`

### 7.4 ProgressBar

```tsx
<ProgressBar value={75} tone="indigo" className="h-2" />
```

tone 会自动匹配角色色：教师 `indigo`、学生 `teal`、AI `sky`、风险 `red`。

### 7.5 CircularProgress

圆环进度，基于 `conic-gradient` 实现，用于仪表盘统计卡。

```tsx
<CircularProgress value={75} tone="#4338ca" label="完成度" />
```

## 八、布局模式

### 8.1 教师仪表盘（teacher/page.tsx）

```
┌─────────────────────────────────────────────┐
│ 欢迎区 + 4 个统计卡（首屏可见）              │
├──────────────────────────┬──────────────────┤
│ 课程列表（带 tab 筛选）   │ 侧栏             │
│ - 增强课程卡             │ - 授课进度环     │
│ - 阶段时间轴 mini        │ - 待办列表       │
│ - 学生平均完成度         │ - AI 教学建议    │
└──────────────────────────┴──────────────────┘
```

### 8.2 授课主控台（teach/[id]/classroom）

三栏布局，信息密度最大化：

```
┌────────┬────────────────────────┬────────────┐
│ 左栏   │ 中栏（主区）           │ 右栏       │
│ 280px  │ flex-1                 │ 340px      │
│        │                        │            │
│ 计时器 │ AI 待刷新提示          │ 完成度分布 │
│ 邀请码 │ StageStepper           │ 柱图       │
│ 在线   │ TeacherClassroomBanner │            │
│ 学生   │ TeacherStageView       │ 风险预警   │
│        │                        │            │
│        │                        │ AI 建议    │
│        │                        │ AI 开关    │
└────────┴────────────────────────┴────────────┘
```

**关键改进**：浮动面板改为常驻侧栏，教师无需点击即可看到计时器、邀请码、在线学生，所有关键信息一屏可见。

### 8.3 学生入口（student/page.tsx）

双列布局，任务为核心视觉焦点：

```
┌────────────────────┬─────────────────────┐
│ 左：加入课堂       │ 右：学习路径预览    │
│ - 邀请码输入       │ - 5 个阶段任务预览  │
│ - 姓名输入         │ - 进度状态          │
│ - 重新加入入口     │ - 截止时间          │
└────────────────────┴─────────────────────┘
│ 底部：学习承诺卡片                       │
└──────────────────────────────────────────┘
```

## 九、交互模式

### 9.1 反馈机制

| 场景 | 反馈方式 |
|------|----------|
| 操作成功 | 状态徽章变化（如"已复制"） |
| 操作失败 | 顶部 Toast + 红色边框输入框 |
| 加载中 | `pbl-skeleton` 骨架屏，非 spinner |
| 数据更新 | `animate-fade-in` 淡入 |
| 风险预警 | 琥珀色 ring + `animate-pulse-soft` |

### 9.2 导航逻辑

- **教师端**：DashboardShell 顶栏 → 课程切换菜单 → 授课主控台
- **学生端**：DashboardShell 顶栏 → 邀请码加入 → 课堂同步
- **返回按钮**：Header 的 ArrowLeft 默认 `router.back()`，无历史时回首页兜底
- **授课界面不得有重叠的返回按钮**

### 9.3 可发现性

- 关键操作入口在首屏可见（统计卡、主按钮）
- 次级功能通过工具栏图标按钮聚合（计时器、邀请码、学生列表）
- 状态变化通过徽章、进度条、颜色变化即时反馈

## 十、动画规范

| 类名 | 用途 | 时长 |
|------|------|------|
| `animate-fade-in` | 内容切换淡入 | 200ms |
| `animate-scale-in` | 弹窗出现 | 200ms |
| `animate-pulse-soft` | 状态点呼吸 | 2s 循环 |
| `pbl-skeleton` | 骨架屏 shimmer | 1.6s 循环 |

**过渡曲线**：
- `--ease-out`: `cubic-bezier(0.16, 1, 0.3, 1)` — 元素进入
- `--ease-in-out`: `cubic-bezier(0.65, 0, 0.35, 1)` — 状态切换

所有动画在 `prefers-reduced-motion: reduce` 下自动降级为 0.01ms。

## 十一、响应式断点

| 断点 | 宽度 | 布局调整 |
|------|------|----------|
| `md` | ≥768px | 顶栏显示完整标题、双列布局生效 |
| `lg` | ≥1024px | 三栏布局生效、侧栏展开 |
| `xl` | ≥1280px | 授课主控台三栏全部展开 |

小于 `xl` 时，授课主控台的左右侧栏堆叠到主区下方，保证移动端可用性。

## 十二、反模式（避免）

1. **禁止 `font-black`**：过度强调导致视觉噪音，最多到 `font-bold`
2. **禁止裸写圆角**：`rounded-[12px]` 应改为 `rounded-[var(--radius-md)]`
3. **禁止多层渐变背景**：背景最多一层克制的径向渐变
4. **禁止过度模糊**：`backdrop-filter: blur()` 最多 12px
5. **禁止模板化 Hero**：避免 `bg-gradient-to-br from-via-to` 三色渐变横幅，改用 `pbl-hero-grid` 网格纹理 + 角色色径向渐变
6. **禁止浮动面板堆叠**：关键信息应常驻可见，而非隐藏在点击触发的浮层中
7. **禁止纯色 Avatar 渐变**：Avatar 使用纯色 `bg-slate-800`，不用渐变背景

## 十三、文件索引

| 文件 | 职责 |
|------|------|
| `src/app/globals.css` | 设计 token 定义、表面层、动画 |
| `src/components/ui.tsx` | 基础组件库（Card/Pill/Button/ProgressBar/Metric 等） |
| `src/components/dashboard-shell.tsx` | 全站外壳（顶栏、侧栏、Avatar、Logo） |
| `src/components/stage-stepper.tsx` | 阶段步进器（role-aware） |
| `src/components/classroom-ux.tsx` | 课堂 Hero 横幅、阶段帮助 |
| `src/app/teacher/page.tsx` | 教师仪表盘 |
| `src/app/teacher/teach/[id]/classroom/page.tsx` | 授课主控台 |
| `src/app/student/page.tsx` | 学生入口 |
| `src/app/student/classroom/[id]/page.tsx` | 学生课堂页 |
| `src/components/join-class-form.tsx` | 邀请码加入表单 |

---

本规范随系统迭代持续更新。新增组件须遵循 token 系统，新增页面须遵循布局模式。

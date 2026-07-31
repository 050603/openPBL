# Agent Motion System C Plan Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 OpenPBL 智能体补齐 16 项课堂动作，并通过统一节奏、身体主干锚点和可打断行为调度实现稳定流畅播放。

**Architecture:** 使用项目内动作目录作为素材和运行时的共同语义源；OpenPBL Sprite Maker 负责标准视图、canonical base、逐动作生成和 QA，Pixi `Person` 负责锚点稳定与切换，`orchestrator` 负责方向、移动节奏和空闲行为。所有移动速度由动作帧数、播放 FPS 和每循环步幅计算。

**Tech Stack:** TypeScript, PixiJS 8, Tween.js, Vitest, Node.js, Sharp, OpenPBL Sprite Maker, built-in imagegen.

---

### Task 1: 固化动作目录和质量规则

**Files:**
- Create: `config/openpbl-agent-actions.json`
- Modify: `src/assets/agent/index.ts`
- Test: `src/assets/agent/index.test.ts`

**Step 1: Write the failing test**

断言新增动作都有唯一 ID、3–8 帧、与帧数一致的时长数组、明确的 layer、authoredFacing 和 bodyCoreAnchor。

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/assets/agent/index.test.ts`

Expected: FAIL，提示 `walking_down` 等动作尚不存在。

**Step 3: Write minimal implementation**

新增 16 项动作定义，为行走动作设置 `authoredFps`、`pixelsPerCycle` 和方向，为电脑动作设置 `authoredFacing: "left"`。

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/assets/agent/index.test.ts`

Expected: PASS。

### Task 2: 建立项目专用可恢复素材运行

**Files:**
- Create: `scripts/openpbl-motion/prepare-run.py`
- Create: `scripts/openpbl-motion/process-action.py`
- Create: `scripts/openpbl-motion/README.md`
- Test: `scripts/openpbl-motion/test_motion_run.py`

**Step 1: Write the failing test**

使用临时目录验证项目 catalog 可以通过薄适配器调用官方 OpenPBL Sprite Maker，并创建新增动作的 prompt、layout guide 和 manifest。

**Step 2: Run test to verify it fails**

Run: `"$PYTHON" -m unittest scripts.openpbl-motion.test_motion_run -v`

Expected: FAIL，适配器尚不存在。

**Step 3: Write minimal implementation**

适配器只覆盖 catalog 路径，继续复用官方生成、拆帧、规范化、despill、预览和 QA 实现，不修改已安装 Skill。

**Step 4: Run test to verify it passes**

Run: `"$PYTHON" -m unittest scripts.openpbl-motion.test_motion_run -v`

Expected: PASS。

### Task 3: 生成 canonical base 与逐动作素材

**Files:**
- Create: `output/openpbl-sprite-maker/banxue-xiaoling-motion-c/actions/*`
- Create: `output/openpbl-sprite-maker/banxue-xiaoling-motion-c/qa/*`

**Step 1: Prepare run**

使用 `docs/research/character-redesign/banxue-xiaoling-user-standard.png` 创建新运行目录，chroma key 使用 `#FF00FF`。

**Step 2: Generate canonical base**

用 built-in imagegen 生成单人物 canonical base，处理后检查安全边距、透明角落、围巾与身体色差。

**Step 3: Generate one action at a time**

每次只生成一个完整动作 strip；将标准视图、canonical base 和当前 layout guide 一并作为输入。

**Step 4: Process and inspect**

对每个动作执行拆帧、规范化、despill、确定性 QA，并查看 Contact Sheet 和 Animated WebP。

**Step 5: Record visual verdict**

只有身体连接、基线、循环和小尺寸语义全部通过时记录 pass；否则将完整动作标记为 repair_required 并重新生成。

### Task 4: 打包通过 QA 的运行时素材

**Files:**
- Modify: `scripts/package-openpbl-agent-assets.mjs`
- Create: `scripts/package-openpbl-agent-assets.test.ts`
- Create/Modify: `public/assets/openpbl-agent/*.webp`
- Create/Modify: `public/assets/openpbl-agent/*.webp.json`

**Step 1: Write the failing test**

断言打包器从运行 manifest 读取 complete 动作，拒绝打包 pending、repair_required 或帧数不匹配的动作。

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/package-openpbl-agent-assets.test.ts`

Expected: FAIL，当前脚本仍使用硬编码 26 项数组。

**Step 3: Implement manifest-driven packaging**

只打包 visual QA 为 pass 的动作，生成无损 WebP atlas 和 Pixi JSON。

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/package-openpbl-agent-assets.test.ts`

Expected: PASS。

### Task 5: 实现动作节奏与方向模型

**Files:**
- Modify: `src/assets/agent/index.ts`
- Modify: `src/pixi/navigation.ts`
- Modify: `src/pixi/orchestrator.ts`
- Test: `src/pixi/navigation.test.ts`
- Test: `src/pixi/person.test.ts`

**Step 1: Write failing tests**

覆盖横向、上行和下行方向选择；覆盖 `speed = pixelsPerCycle × fps / frames`；覆盖短距离仍有最低播放时间。

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/pixi/navigation.test.ts src/pixi/person.test.ts`

Expected: FAIL，当前只有固定 140px/s 和横向/上行两种动作。

**Step 3: Implement cadence model**

从动作定义获取 FPS、帧数和步幅；路线按主方向选择动作；移动保持线性。

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/pixi/navigation.test.ts src/pixi/person.test.ts`

Expected: PASS。

### Task 6: 实现稳定动作切换

**Files:**
- Modify: `src/pixi/person.ts`
- Test: `src/pixi/person.test.ts`

**Step 1: Write failing tests**

覆盖同动作请求不重建、切换前后 bodyCore/foot anchor 不变、镜像后锚点不变和非循环动作完成回调。

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/pixi/person.test.ts`

Expected: FAIL。

**Step 3: Implement playback transition**

加入动作去重、120–180ms 双精灵淡入淡出和 bodyCore 优先锚点保持；清理被中断的动画与纹理引用。

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/pixi/person.test.ts`

Expected: PASS。

### Task 7: 接入电脑朝向和空闲行为

**Files:**
- Modify: `src/pixi/status-presentation.ts`
- Modify: `src/pixi/workstation.ts`
- Modify: `src/pixi/orchestrator.ts`
- Test: `src/pixi/orchestrator.test.ts`
- Test: `src/pixi/status-presentation.test.ts`

**Step 1: Write failing tests**

覆盖电脑动作强制左向、休息动作仅 idle/在座位触发、全局最多一名打瞌睡、任务可中断休息以及最近动作不重复。

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/pixi/orchestrator.test.ts src/pixi/status-presentation.test.ts`

Expected: FAIL。

**Step 3: Implement scheduler**

增加权重、冷却、连续空闲门槛和优先级中断；新任务从 `napping` 进入 `waking_up` 后再进入工作动作。

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/pixi/orchestrator.test.ts src/pixi/status-presentation.test.ts`

Expected: PASS。

### Task 8: 完整验证

**Files:**
- Modify: `docs/plans/2026-07-28-agent-motion-system-design.md`
- Create: `output/openpbl-sprite-maker/banxue-xiaoling-motion-c/qa/runtime-motion-report.json`

**Step 1: Run focused tests**

Run: `pnpm vitest run src/assets/agent src/pixi`

Expected: PASS。

**Step 2: Run static checks**

Run: `pnpm typecheck`

Expected: PASS。

**Step 3: Run browser visual QA**

在课堂页面连续观察横向、上行、下行、到站、电脑左向和空闲动作循环，记录身体核心与脚底最大偏差。

**Step 4: Fix and repeat**

任何身体核心偏差超过 2px、基线偏差超过 4px、循环闪烁或动作中断卡顿均视为失败，修复后重新验证。


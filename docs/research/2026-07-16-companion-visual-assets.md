# 伴学教室视觉素材与动画调研

## 结论

本轮采用“课堂场景由项目素材承载、角色由现有 SVG 角色资产承载、状态动画由 CSS 与项目已有 `motion` 运行时承载”的组合。这样可以保持课堂视觉统一，同时让角色仍然可以被点名、切换状态和响应实时对话。

已加入项目的课堂主视觉：

- `public/companions/classroom/pbl-classroom-stage.png`
- 生成方向：宽幅 PBL 教室、暖光、黑板、协作桌、植物与作品墙、中心留白、无文字、无人物

## 资源评估

### 采用

- 项目已有 `public/openmaic/avatars/*.svg`：作为六位伴学伙伴的统一基础立绘，避免新增不确定来源的角色包。
- 项目已有 `motion` 依赖：用于后续需要更细腻的入场、点名和状态过渡；当前舞台中的轻量自主行为优先使用 CSS，减少首屏成本。
- 当前舞台已进一步加入 `CompanionIllustration` 原创 SVG 角色层：六位角色共享比例、光影和手绘轮廓，但各自拥有不同发型、服装、肤色、姿态与课堂道具；原有 SVG 头像保留在项目资源中，供其他 OpenMAIC 页面继续使用。

### 可作为后续角色定制参考

- [Open Peeps](https://www.openpeeps.com/)：官方页面标注为 CC0，支持组合姿态、服饰和表情，适合制作一套更贴合课堂的小组成员立绘。
- [Humaaans](https://www.humaaans.com/)：官方页面标注为 CC0，适合快速组合发型、服装和身体姿态；如果将来导入，需要只保留项目实际使用的导出图，不把组件库本身作为独立资源分发。
- [Rive React runtime](https://rive.app/docs/runtimes/react/react)：运行时开源，但真正的 `.riv` 角色文件仍需自行设计或取得明确授权，因此本轮不直接引入第三方 Rive 角色文件。

## 开源实现检索补充（2026-07-16）

本轮再次检索了可直接嵌入 React 的课堂角色与动画实现。最接近当前需求的是 Rive 的 React runtime：官方文档确认 runtime 支持通过 state machine 播放和切换动画，但仍需要项目自己提供 `.riv` 角色文件与状态机设计，因此它更适合作为下一阶段的动画承载层，而不是现成的课堂美术素材。

当前没有找到同时满足“课堂场景、六位角色、可商用许可证、可直接接入现有状态模型”的成熟开源角色包。本轮继续使用项目自有 SVG 角色与 CSS 动画，避免将不匹配的第三方视觉硬拼进课堂主场景；下一阶段可以把现有 `idle / preparing / speaking / waiting / completed` 状态契约迁移到自制 Rive 资产。

## Open-source evaluation — continuation (2026-07-16)

- [Open Peeps](https://openpeeps.com/) is public-domain/CC0 and offers mix-and-match vector body parts, poses, clothing, and expressions. It is useful as a visual reference, but its hand-drawn monochrome language does not match the daylight classroom scene or the existing six role colors closely enough to ship as the primary characters.
- [Humaaans](https://www.humaaans.com/) is also a modular CC0 reference, but it is static artwork rather than a ready-to-use animated classroom character set.
- [Rive React](https://github.com/rive-app/rive-react) and the [Rive runtimes](https://rive.app/docs/runtimes/getting-started) are open-source/MIT runtime options. They still require a project-owned or explicitly licensed `.riv` file, so adding the runtime without an authored character state machine would increase bundle and maintenance cost without improving the current visual result.

Decision for this iteration: keep the project-owned inline SVG characters and CSS motion as the production path. Add environmental depth, role-specific desk grounding, stage color tokens, and short scene transitions first. Keep a future Rive migration possible by treating the current `CompanionIllustration` state names as the animation contract (`idle`, `preparing`, `speaking`, `waiting`, `completed`).

## 设计取舍

本轮没有直接使用 OpenMoji 作为角色主体。OpenMoji 官方授权为 CC BY-SA 4.0，适合做小道具或活动图标，但需要在产品中保留署名与相同方式共享要求；当前课堂道具由 Lucide 与 CSS 形状承载，后续若加入 OpenMoji 会同步补充归属说明。

## 下一步

若要继续向 Marvis 级别推进，优先级是：

1. 将当前原创 SVG 角色继续细化为更完整的 `idle / reading / writing / speaking / thinking` 五种姿态，而不是只依赖道具和微动效。
2. 评估把稳定的姿态导出成 SVG/Lottie/Rive，保留 CSS 动画作为低成本降级路径。
3. 将角色状态与 `CompanionTask.status`、`runtime.phase`、TTS 播放状态绑定，形成“看见角色正在做什么”的连续反馈。

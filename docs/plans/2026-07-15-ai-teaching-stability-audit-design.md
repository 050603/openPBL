# AI 授知全链路稳定性审查设计

## 审查边界

本次只审查当前 openPBL 产品实际可达链路：

```text
教师核查大纲
  -> 教师生成页
  -> /api/openmaic/generate (SSE)
  -> classroom-generation
  -> scene content/actions
  -> quality audit
  -> student/teacher classroom split
  -> course link
  -> Student AiLearningView
  -> StudentStageHost
  -> Stage / PlaybackChromeRoot / PlaybackEngine
  -> slide、quiz、interactive iframe
```

教师主持资源使用拆分后的 teacher classroom，经 `TeacherStageResources -> OpenMaicResourcePlayer` 播放；它与学生 AI 授知 classroom 隔离，但共享 Stage、场景渲染器和播放引擎，因此共享组件仍属于审查范围。仅存在于原版页面、没有从上述入口或共享组件抵达的代码，不作为本轮修复对象，只进入候选清理清单。

## 非功能目标

- **完整性**：确认的每一个场景必须生成并落盘；单页失败不得静默变成残缺课程。
- **播放正确性**：只有动作实际耗尽或教学活动明确完成，才能标记页面完成。
- **隔离性**：快速切课、切资源或组件卸载后，旧请求不得覆盖新的全局 Stage store。
- **可恢复性**：媒体后台任务失败不阻断正文；正文生成失败必须明确失败并可重试。
- **性能**：仅在媒体状态为 running 时轮询，完成后停止。
- **数据完整性**：服务端根据真实 classroom 校验进度，去重、过滤未知场景并防止完成状态回退。
- **可观测性**：错误应保留具体失败场景和原因，不只返回泛化错误。

## 已确认故障

1. `StudentStageHost` 在进入新场景时把新场景直接加入完成集合，导致未播放也能完成课程。
2. 最后一页没有独立的完成上报；当前实现依赖上述错误行为才会变成 completed。
3. `OpenMaicResourcePlayer` 在媒体已 completed/partial-failure 后仍每五秒请求一次，最多五分钟。
4. 资源/课程请求没有取消机制；快速切换时旧响应可能在新响应之后写入单例 Stage store。
5. 场景正文生成或 `createSceneWithActions` 失败时会被静默跳过，随后仍持久化并发布部分课程。
6. 进度 API 信任客户端提交的 `totalScenes`、重复/未知 scene id 和 classroom id，可造成错误完成率或状态回退。
7. SSE 客户端优先显示泛化错误，丢失服务端提供的具体 `details`。

## 架构决策（ADR）

### ADR-1：严格全量生成

**决定**：确认大纲进入正文生成后，场景数必须与确认大纲数一致；重试后仍失败则整个生成任务失败，不发布新 classroom 链接。

**取舍**：一次失败会让本次生成整体重试，但不会把缺页课程伪装成成功。媒体资产仍保持 best-effort，因为它们有正文占位与后台补全机制。

### ADR-2：完成事件来源唯一化

**决定**：场景完成以 PlaybackEngine 动作游标耗尽为准；场景切换只更新当前位置，不等于完成。

**取舍**：学生手动跳页不会增加完成率；自动播放和最后一页都能通过同一播放状态回调正确完成。

### ADR-3：服务端校验学习进度

**决定**：服务端读取课程绑定的真实 classroom，校验 student、classroom、场景集合与数量，并把已完成集合单调合并。

**取舍**：在当前轻量会话模型下不能替代完整身份认证，但能阻止损坏数据、跨课堂写入和完成状态回退。

## 验证方式

- 纯函数测试覆盖播放完成判定、全量生成断言和轮询条件。
- 路由测试覆盖跨课堂、未知场景、重复场景和进度回退。
- 组件测试覆盖学生/教师预览是否上报及资源加载生命周期。
- 全量 Vitest、TypeScript、ESLint、Next build。
- 本地页面冒烟检查加载、切页、最后一页完成、互动完成和资源轮询停止。

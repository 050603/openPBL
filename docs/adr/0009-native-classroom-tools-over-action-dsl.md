# ADR-0009：原生课堂工具调用编译到统一 Action DSL

## 状态

已接受

## 背景

实时课堂过去要求模型在文本响应中输出 JSON 数组，再由增量解析器从文本里识别白板和幻灯片动作。这种方式可以复用 Action DSL，但模型既要组织讲解，又要正确转义和闭合 JSON；工具元数据、参数校验和供应商原生 tool calling 能力也没有真正生效。结果是模型容易只讲不画，或在动作 JSON 不完整时退化为纯文本。

同时，白板只解决“推演过程可见”，仍缺少即时诊断学生是否理解、稳定保留 PBL 证据，以及控制互动模拟器变量等教学能力。新工具不能绕开现有动作权限、课堂流、回放和持久化契约另建协议。

## 决策

- 实时课堂默认使用 AI SDK 原生工具调用。模型的普通文本直接作为讲解；工具调用由服务端转换成现有 SSE `action` 事件。
- 所有原生工具仍以 `Action` 为唯一客户端执行协议。权限过滤、StreamBuffer 顺序、ActionEngine 执行、聊天动作记录和预生成回放继续共用同一条链路。
- 请求级工具集从角色 `allowedActions` 和当前 scene 类型共同计算。幻灯片动作只在可见画布上暴露，widget 动作只在互动 scene 暴露。
- 工具输入使用 Zod schema 在模型边界校验。客户端只执行已经通过工具 schema 和服务端 allowlist 的动作。
- 供应商不支持原生工具，且尚未输出任何文本或动作时，自动回退到原有结构化 JSON → Action DSL 生成；可通过 `OPENMAIC_NATIVE_CLASSROOM_TOOLS=false` 显式关闭原生模式。
- 预生成课件继续使用结构化动作脚本，以保证离线确定性；生成结果与实时工具调用落到同一个 Action union。
- 新增 `check_understanding` 与 `evidence_board_update` 两个动作。理解检查在预生成回放中暂停，在实时课堂中提交后触发下一轮模型反馈；证据板保留来源核验状态，禁止把无来源内容标成已核验。
- 现有 `widget_highlight`、`widget_setState`、`widget_annotation`、`widget_reveal` 纳入教师原生工具集，并补齐实时课堂到互动 iframe 的消息桥接。

## 教学工具职责

| 工具 | 主要职责 | 不负责 |
|---|---|---|
| 白板 | 分步推演、公式、代码变化、关系图 | 长期保存来源与结论 |
| 理解检查 | 获取当前概念的预测、选择或简答证据 | 代替正式评分测验 |
| 证据板 | 保存主张—证据—推理和来源状态 | 动态演算过程 |
| 互动 widget | 控制变量、观察变化、揭示结果 | 自动判断学生已经掌握 |

## 失败模式与缓解

| 失败模式 | 缓解 |
|---|---|
| 模型或供应商拒绝 tools 参数 | 首次输出前失败则回退结构化 Action 生成 |
| 模型调用未授权动作 | 请求只暴露有效工具，服务端发事件前再次 allowlist 检查 |
| 工具参数缺失或越界 | 原生 Zod schema 拒绝无效调用 |
| 理解检查后模型立即替学生作答 | 提示词要求调用后结束本轮，学生提交作为下一条用户消息 |
| 预生成理解检查后讲解继续播放 | ActionEngine 等待提交或关闭后才恢复 PlaybackEngine |
| widget 动作在实时课堂无效果 | ActionEngine 按当前 scene 动态查找 iframe postMessage 注册 |
| 证据板伪造来源 | `sourceStatus` 必填；未核验来源必须标记 `needs_verification` |
| 切换课程后工具状态串课 | Stage 切换和清空时重置课堂工具 store |

## 代价

- 实时生成同时维护原生路径与兼容回退路径，测试面更大。
- 新工具 UI 状态需要与课堂会话协调；理解检查的提交会开启或续接一次实时问答。
- 证据板当前通过动作记录可重建，但若未来要求跨设备直接查询，仍需把课堂工具快照升级为服务端持久化实体。

## 否决方案

### 继续让模型在文本中模拟工具 JSON

否决：无法利用原生 schema 校验和 tool choice，讲解文本与控制协议互相干扰。

### 原生工具直接操作 React store

否决：服务端无法直接操作浏览器状态，而且会绕开 Action DSL 的回放、权限和记录能力。

### 为每个新组件建立独立 SSE 协议

否决：会形成多套顺序、错误处理和持久化语义，课堂难以稳定回放。

## 关联实现

- `src/lib/openmaic/orchestration/native-teaching-tools.ts`
- `src/lib/openmaic/orchestration/director-graph.ts`
- `src/lib/openmaic/orchestration/ai-sdk-adapter.ts`
- `packages/@openmaic/dsl/src/action.ts`
- `src/lib/openmaic/action/engine.ts`
- `src/components/openmaic/canvas/teaching-tool-layer.tsx`

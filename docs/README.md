# 开发说明

这份文档是维护者和后续开发会话的入口。用户安装、配置示例和常规使用说明放在根目录 `README.md`；官方源码核对、Responses API 调用链路和证据链接放在 `docs/copilot-provider-responses-api-flow.md`。

后续重开会话时，先读本文件确认当前版本目标和实现边界，再读 `docs/copilot-provider-responses-api-flow.md` 核对官方依据。不要把没有官方源码或官方 schema 支撑的细节写成确定结论。

## 0.8.0 开发目标

0.8.0 的目标不是“基本稳定可用”，而是尽量复刻 VS Code 内置 Custom Endpoint/BYOK provider 在 Responses API 路径上的能力，使自定义 provider 能完整适配 Copilot 对 provider 的调用。

当前基线：

- VS Code/Copilot 行为基线：VS Code `1.121.0` 之后的 Custom Endpoint/BYOK provider。
- 不再兼容目标：`1.121.0` 之前 legacy `customOAI` / OpenAI Compatible provider 配置形状。
- API 路线：固定面向 OpenAI Responses API compatible endpoint，不在本扩展内同时实现 Chat Completions 或 Messages provider。
- 配置路线：保留本扩展 settings-based multi-profile 配置，不改成官方 Custom Endpoint 的单模型 `url` 配置形状。
- URL 行为：保留 `baseUrl` 自动补全能力，按官方 Custom Endpoint `responses` 路径规则解析到 `/v1/responses` 或 `/responses`。
- 推理强度：使用官方 BYOK 风格的 `configurationSchema.properties.reasoningEffort` 暴露 Copilot 原生 Thinking Effort picker。

实现优先级：

1. 先对齐官方 Custom Endpoint/BYOK provider 的公开能力声明和 Responses request 构造。
2. 再保留本扩展已经有价值的 settings 便利能力，例如 profiles、model-level `baseUrl`、SecretStorage key、`patch.dropTruncation`。
3. 对官方没有公开入口的内部能力，只记录缺口，不臆造等价实现。

## 官方公开文档确认的契约

最近核对：2026-05-28。官方文档入口是 VS Code `AI language models in VS Code` 的 BYOK / Custom Endpoint / Model configuration reference 部分：https://code.visualstudio.com/docs/copilot/customization/language-models

公开文档能确认的点：

- BYOK 模型可以不登录 GitHub、没有 Copilot plan 使用；但 BYOK 只覆盖 chat experience 和 utility tasks。semantic search、inline suggestions/code completions、embeddings 这类依赖 GitHub Copilot 服务的能力不属于 BYOK 离线/自带 key 覆盖范围。
- Custom Endpoint provider 替代 deprecated OpenAI Compatible provider；旧的 `github.copilot.chat.customOAIModels` setting 已废弃。
- Custom Endpoint provider 支持三类 API type，并可按 model 选择：`chat-completions`、`responses`、`messages`。
- 官方 `chatLanguageModels.json` 配置有 provider-level 和 model-level 两层。provider-level 包括 `vendor`、`name`、`models`。
- model-level 文档列出的字段包括：`id`、`name`、`url`、`apiType`、`toolCalling`、`vision`、`maxInputTokens`、`maxOutputTokens`、`editTools`、`thinking`、`streaming`、`zeroDataRetentionEnabled`、`supportsReasoningEffort`、`reasoningEffortFormat`、`requestHeaders`。
- `zeroDataRetentionEnabled: true` 的公开行为是 Responses API 请求不发送 `previous_response_id`。
- `supportsReasoningEffort` 设置后，model picker 显示 Thinking Effort picker；公开文档只举例 `minimal`、`low`、`medium`、`high` 这些常见值，不声明空数组会展开默认档位。
- `reasoningEffortFormat` 的公开行为是：`chat-completions` 写顶层 `reasoning_effort` 字符串，`responses` 写嵌套 `reasoning.effort` 对象；未设置时跟随 URL/API path。
- `requestHeaders` 是发给该 model 的额外 HTTP headers；官方文档只说明 forbidden、forwarding、internal headers 会被忽略，详细 sanitizer 规则需要看源码。

公开文档没有展开的点，例如 Responses body 精确字段、stateful marker 的 data part 形状、`tool_search` deferral、`prompt_cache_key`、WebSocket gate、header sanitizer 细节，都只能按 `docs/copilot-provider-responses-api-flow.md` 里的官方源码证据记录。

## 当前完成度结论

结论：截至 2026-05-28，不能写成“100% 已实现 VS Code 内置 Custom Endpoint/BYOK provider 在 Responses API 路径上的所有能力”。更准确的说法是：官方公开文档列出的 Responses 路径配置能力已经基本覆盖；源码级完整行为仍有缺口，尤其是 `tool_search` deferral、`prompt_cache_key`、reasoning summary 流式展示，以及若干内部 experiment/CAPI/telemetry/content-filter 行为。

| 能力面 | 当前状态 | 说明 |
| --- | --- | --- |
| 官方文档 model 字段 | 基本覆盖 | 本扩展覆盖 `id`、`name`、`toolCalling`、`vision`、`maxInputTokens`、`maxOutputTokens`、`editTools`、`thinking`、`streaming`、`zeroDataRetentionEnabled`、`supportsReasoningEffort`、`reasoningEffortFormat`、`requestHeaders`。`url` 在本扩展中对应 `baseUrl`；`apiType` 固定为 Responses 路线。 |
| Custom Endpoint 三 API type | 目标外 | 官方整体 provider 支持 `chat-completions`、`responses`、`messages`；0.8.0 只复刻 Responses-compatible 路径。 |
| URL 解析 | 已实现 | `baseUrl` 自动补全到 `/responses` 或 `/v1/responses`，并识别显式 `/responses`、`/chat/completions`、`/messages` 路径。 |
| Thinking Effort picker | 已实现 | 走 `configurationSchema.properties.reasoningEffort` 和 `options.modelConfiguration.reasoningEffort`。`supportsReasoningEffort: []` 展开默认五档是本扩展便利规则，不是官方公开契约。 |
| ZDR/stateful | 已实现主要行为 | ZDR 时 `store: false`、不发送 `previous_response_id`、不回传 stateful marker；非 ZDR 支持 `resp_` marker 复用和历史裁剪。 |
| Headers/auth | 基本覆盖 | model-level `requestHeaders` 支持 auth 覆盖和 `${apiKey}` 插值；profile-level `extraHeaders` 是本扩展附加能力。 |
| Responses request body | 接近但非字节级一致 | 覆盖主要 Responses 字段和 BYOK 清理逻辑；内部 experiment 控制的 truncation、prompt cache、context management gate 不可能完全一致。 |
| Streaming/response 解析 | 部分覆盖 | 文本、function tool call、usage、stateful marker、encrypted reasoning/context management round-trip 已覆盖；reasoning summary events 暂未作为 `LanguageModelThinkingPart` 进度展示，`image_generation_call` 输出也未做等价转换。 |
| `tool_search` | 未完整实现 | 当前只把 `tool_search` 当保留 tool name，不作为普通 function tool 转发；官方完整 deferral 依赖内部 `IToolDeferralService`。 |

## 文档分工

- `README.md`：面向使用者，说明怎么配置 profiles、models、API key、baseUrl、reasoning effort 和调试日志。
- `docs/README.md`：面向开发者，记录版本目标、实现原则、方案分类和容易混淆的结论。
- `docs/copilot-provider-responses-api-flow.md`：源码级证据文档。每次重新核对 VS Code/Copilot/OpenAI 官方来源，都应该把关键结论追加到这里。
- `CHANGELOG.md`：版本变更摘要，不承载完整设计推理。

## Provider 层级

本扩展实现的是公开 VS Code `LanguageModelChatProvider` 层。它不是 GitHub Copilot 内置模型的透明代理，也不会替换 GitHub 管理的内置模型。

简化链路：

```text
Copilot Chat / Agent
-> VS Code Language Model 服务
-> 本扩展 LanguageModelChatProvider
-> 本扩展 Responses request 适配层
-> 用户配置的 OpenAI-compatible /v1/responses endpoint
```

官方内置模型的关键差异：

```text
Copilot Chat / Agent
-> VS Code/Copilot 内置 ChatEndpoint
-> capiClientService.makeRequest(..., { type: ChatResponses })
-> GitHub CAPI /responses
-> GitHub 管理的模型后端
```

已确认的边界是：内置模型客户端侧发送的是 Responses 语义 body，但网络目标是 GitHub CAPI `/responses`，不是用户可直接替换的 OpenAI `/v1/responses`。GitHub CAPI 后端如何继续路由，不在公开客户端源码中，不能写成确定结论。

## 配置模型

当前只支持 multi-profile 配置：

- profile 表示一个 endpoint/key/header/body override 组；
- model 表示该 profile 下暴露给 Copilot 的一个模型能力声明；
- API key 优先存储在 VS Code SecretStorage，secret key 为 `copilotCustomProvider.apiKey.<profile id>`；
- `profiles[].apiKey` 只作为 inline fallback，SecretStorage 优先级更高。

模型 ID 分两层：

- `providerId`：VS Code/Copilot 看到的 provider 内唯一模型 ID，默认 `<profile id>/<model id>`。
- `id` / `apiModel`：发送给上游 Responses API 的模型 ID，可以在不同 profile 中重复。

这个分层是必要的，因为 VS Code 要求同一个 provider 内的模型 ID 唯一，但多个 endpoint 经常暴露相同上游模型名。

## URL 解析

`baseUrl` 不是简单字符串拼接，而是按官方 Custom Endpoint 的 Responses 路径规则处理：

- URL 已包含 `/responses`、`/chat/completions` 或 `/messages`：视为显式 API endpoint，原样使用。
- URL 以版本段结尾，例如 `/v1` 或 `/v2`：追加 `/responses`。
- 其他 URL：追加 `/v1/responses`。

同一规则适用于 profile-level `baseUrl` 和 model-level `baseUrl`。本扩展使用 `baseUrl` 字段，而官方 Custom Endpoint model config 使用 `url`；这属于配置字段名差异，不改变 Responses 请求目标语义。

## 鉴权和 Headers

profile 默认鉴权跟随官方 Custom Endpoint 行为：

- URL 包含 `openai.azure`：使用 `api-key: <key>`。
- 其他 URL：使用 `Authorization: Bearer <key>`。

字段分工：

- `extraHeaders`：profile-level 静态非鉴权 header，会过滤保留和不安全 header。
- `requestHeaders`：model-level header，模拟官方 Custom Endpoint 的能力；允许显式覆盖 `authorization` 和 `api-key`，支持 `${apiKey}` 插值。
- 如果 `requestHeaders` 中出现常见鉴权 header，扩展会抑制默认鉴权 header，避免重复发送。

## Request Body 构造

请求体按以下顺序构造和覆盖：

```text
provider defaults
-> global requestBodyOverrides
-> profile requestBodyOverrides
-> model extraBody
-> VS Code modelOptions
-> compatibility patches
```

Responses 兼容处理原则：

- 删除 Responses 路径不应带出的 `n` 和 `stream_options`。
- 非 thinking 模型删除 `reasoning` 和 `include`。
- thinking 模型删除 `temperature`。
- ZDR、非 `resp_` marker、显式 full-history retry 时删除 `previous_response_id`。
- 空 `tools` 和孤立 `tool_choice` 会被清理。
- `patch.dropTruncation` 只在模型显式开启时删除顶层 `truncation`，默认不改变官方语义。

这部分目标是对齐官方 BYOK `OpenAIEndpoint.createRequestBody` 和 `interceptBody` 的 Responses 路径行为，而不是把 GitHub CAPI request 原样转发给用户 endpoint。

## Reasoning Effort

推理强度要走官方 BYOK 风格能力声明，不靠自定义 UI：

- model 配置存在 `supportsReasoningEffort` 时，扩展贡献 `configurationSchema.properties.reasoningEffort`。
- Copilot UI 的 Thinking Effort picker 选择值会进入 `options.modelConfiguration.reasoningEffort`。
- 默认写入 Responses body 的位置是 `reasoning.effort`。
- 当 `reasoningEffortFormat` 为 `chat-completions` 时，写入顶层 `reasoning_effort`。

本扩展的三态规则：

- 省略 `supportsReasoningEffort`：不启用原生 Thinking Effort picker。
- `supportsReasoningEffort: []`：启用 picker，并展开为默认五档 `minimal`、`low`、`medium`、`high`、`xhigh`。
- `supportsReasoningEffort: ["low", "medium"]` 这类非空数组：按配置值原样作为 picker enum。

请求优先级：

```text
options.modelConfiguration.reasoningEffort
-> options.modelOptions.reasoningEffort
-> options.modelOptions.reasoning.effort
-> options.modelOptions.reasoning_effort
-> model.reasoningEffort
-> global defaultReasoningEffort
-> family preferred default
-> first advertised level
```

注意：`[]` 展开为默认五档是本扩展的配置便利规则，不要写成官方 VS Code 行为。官方依据只确认 `supportsReasoningEffort` 存在时会生成 `configurationSchema.properties.reasoningEffort`。

## Stateful、ZDR 和 WebSocket

HTTP/SSE 路径下，非 ZDR 模型会把上游返回的 Responses `response.id` 作为 stateful marker 通过 `LanguageModelDataPart` 回传给 VS Code。后续请求如果还能找到该 marker，可以发送 `previous_response_id` 并裁剪历史。

ZDR 模型行为：

- 请求体发送 `store: false`。
- 不发送 `previous_response_id`。
- 不复用 stateful marker。

WebSocket Responses v2 是显式 opt-in：

```json
{
  "supportedEndpoints": ["/responses", "ws:/responses"]
}
```

扩展不会根据 URL 探测 WebSocket 支持。只有模型声明 `ws:/responses` 时才允许走 WebSocket 路径。

## Internal Data Parts

VS Code/Copilot 会通过 `LanguageModelDataPart` 传递 provider 内部元数据。本扩展把以下 MIME type 视为内部数据，不作为用户输入转发给模型：

```text
usage
stateful_marker
cache_control
context_management
reasoning
```

其中：

- `usage` 用于 Copilot context usage 展示。
- `stateful_marker` 用于 Responses `previous_response_id` 复用。
- `reasoning` 和 `context_management` 用于 encrypted reasoning 和 compaction item round-trip。
- `image/*` 不属于内部数据；当模型 `vision: true` 时会转成 Responses `input_image`。

## Usage Reporting

Copilot 的 context usage 显示依赖 provider 回传 `mimeType: usage` 的 `LanguageModelDataPart`。

映射关系：

| Responses API | Reported usage |
| --- | --- |
| `input_tokens` | `prompt_tokens` |
| `output_tokens` | `completion_tokens` |
| `total_tokens` | `total_tokens` |
| `input_tokens_details.cached_tokens` | `prompt_tokens_details.cached_tokens` |
| `output_tokens_details.reasoning_tokens` | `completion_tokens_details.reasoning_tokens` |

流式 HTTP/SSE 在 `response.completed` 事件中读取 `response.usage`；非流式请求从最终 response payload 读取 usage。上游不返回 usage 时，Copilot 可能显示为 0。

## Tool Calling 和 Tool Search

`toolCalling` 决定是否向 VS Code 声明工具能力并把工具定义转发到 Responses request：

- `false`：不声明工具能力。
- `true`：声明工具能力。
- number：声明工具能力，并表示可接受的最大工具数量。

完整 `tool_search` 仍是已知缺口。官方内置 Responses 路径有 client-executed `tool_search` deferral 机制，但它依赖 Copilot 内部 `IToolDeferralService`，公开 provider API 目前不能等价取得这部分上下文。本扩展会把 `tool_search` 视为保留 tool name，避免误当普通 function tool 转发。

## 代理方案分类

### 推荐：Custom Endpoint 后置代理

让本扩展的 `baseUrl` 指向本地或远端适配代理，例如：

```text
http://127.0.0.1:8787/v1/responses
```

这种代理适合处理：

- OpenAI Responses API 到其他供应商 API 的转换。
- SSE/非流式格式转换。
- 网关鉴权、header 改写、模型 ID 映射。
- 请求/响应日志和回放。
- 供应商兼容性补丁。

仍应留在扩展里的事情：

- 模型列表和模型能力声明。
- Thinking Effort picker 的 `configurationSchema`。
- `toolCalling`、`vision`、`editTools`、`thinking`、`streaming` 等请求前能力。
- stateful marker 和 encrypted reasoning 这类 provider 上下文整理。

原因是这些能力在 HTTP 请求发出前已经影响 Copilot UI、模型选择和请求构造，后置代理无法补救。

### 不作为主线：拦截官方内置 Copilot/CAPI 流量

官方内置模型使用 `capiClientService.makeRequest(..., { type: ChatResponses })` 请求 GitHub CAPI `/responses`。这不是官方公开 provider 扩展点。

拦截 CAPI 流量可以用于网络调试，但不适合作为“能力一模一样”的主线：

- 它不能可靠改变模型选择 UI、Thinking Effort picker、vision、toolCalling、editTools 等请求前能力声明。
- GitHub CAPI 服务端私有契约不完整公开。
- 要稳定替换内置模型，通常还要兼容 `/models`、`/models/session`、policy、intent 等更多 CAPI endpoint。

如果明确要调试 CAPI base URL，源码里存在 `github.copilot.advanced.debug.overrideCapiUrl`。这会改变 Copilot CAPI base URL，例如把 ChatResponses 发到 `<overrideCapiUrl>/responses`。这个结论已经记录在 `docs/copilot-provider-responses-api-flow.md`，但它不改变本扩展主线目标。

## 已知缺口

这些缺口不要在实现或文档里伪装成已完整复刻：

- 完整 client-executed `tool_search` deferral。
- reasoning summary streaming events 到 Thinking progress 的等价展示。
- Responses `image_generation_call` 输出的等价回传。
- GitHub CAPI 内部模型后端路由和服务端策略。
- 内置模型的完整 telemetry、content filter、billing、SKU、premium、实验开关和 server-side feature gate。
- 基于内部 conversation id/experiment state 的 `prompt_cache_key` 生成。
- 官方 Custom Endpoint 在一个 provider 中同时支持 `chat-completions`、`responses`、`messages`；本扩展当前只做 Responses-compatible 服务。

## 调试

`copilotCustomProvider.logLevel` 控制输出日志：

- `off`：不记录请求日志。
- `info`：记录请求元数据。
- `debug`：记录出站请求 headers 和 JSON body，API key header 会脱敏。

debug 日志可能包含 prompt 和 workspace 内容，只应在诊断问题时开启。

`provideTokenCount()` 在 `debug` 级别也会输出 token estimate 诊断。

## 构建和打包

运行入口：

```text
dist/extension.js
```

修改 TypeScript 后运行：

```text
npm run compile
```

生成 VSIX：

```text
npm run package
```

测试已安装 VSIX 时，如果怀疑 VS Code 或 Copilot 缓存了旧模型 metadata，优先提升 package version 再重新安装。

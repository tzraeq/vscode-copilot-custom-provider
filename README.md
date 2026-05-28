# Copilot Custom Provider

Adds a VS Code language model provider named `Custom OpenAI Responses` for OpenAI **Responses API** compatible services.

This extension uses VS Code's public `LanguageModelChatProvider` extension API. It does not replace or proxy GitHub Copilot's built-in models, and it is not the built-in Custom Endpoint provider. It adds separate custom models to the VS Code/Copilot model picker and sends requests to the endpoints you configure.

VS Code also documents a built-in Custom Endpoint/BYOK path for compatible third-party endpoints. This extension does not target that implementation or require the built-in Custom Endpoint UI. Those docs are used only as a reference for common model capability names and Responses API conventions.

## Requirements

- VS Code `1.121.0` or newer with the `chatProvider` API available.
- One or more services compatible with the OpenAI Responses API.

## Quick Setup

Configure one or more profiles in User Settings or workspace `.vscode/settings.json`:

```json
{
  "copilotCustomProvider.profiles": [
    {
      "id": "host-a",
      "name": "Host A",
      "baseUrl": "https://host-a.example.com",
      "models": [
        {
          "id": "gpt-5.5",
          "name": "GPT-5.5 Medium",
          "toolCalling": true,
          "vision": true,
          "reasoningEffort": "medium",
          "patch": {
            "drop": {
              "truncation": true
            }
          }
        },
        {
          "id": "gpt-5.5",
          "providerId": "host-a/gpt-5.5-high",
          "name": "GPT-5.5 High",
          "toolCalling": true,
          "vision": true,
          "reasoningEffort": "high"
        }
      ]
    },
    {
      "id": "host-b",
      "name": "Host B",
      "baseUrl": "https://host-b.example.com",
      "models": [
        {
          "id": "gpt-5.5",
          "name": "GPT-5.5",
          "toolCalling": true,
          "vision": true,
          "reasoningEffort": "medium",
          "supportedEndpoints": ["/responses", "ws:/responses"]
        }
      ]
    }
  ]
}
```

Then run this command for each profile that requires a key:

```text
Custom OpenAI Responses: Set API Key
```

This step is important. `settings.json` defines the profiles and models, but the key is normally stored separately in VS Code SecretStorage. The command asks which profile to update. Custom models can appear in the Copilot/Chat model picker before a key is set, but a request will fail until the selected profile has a key or `requireApiKey` is `false`.

## Base URL

`baseUrl` is resolved to a Responses API URL:

- `https://host-a.example.com`: requests are sent to `https://host-a.example.com/v1/responses`.
- `https://host-a.example.com/v1`: requests are sent to `https://host-a.example.com/v1/responses`.
- `https://host-a.example.com/proxy`: requests are sent to `https://host-a.example.com/proxy/v1/responses`.
- URLs already containing `/responses`, `/chat/completions`, or `/messages` are treated as explicit endpoint URLs and used as configured.

The same rule applies to model-level `baseUrl`. If a model does not set `baseUrl`, it uses the profile `baseUrl`.

## API Keys

Keys should normally be set with `Custom OpenAI Responses: Set API Key`.

- Keys are stored in this extension's VS Code SecretStorage, not in `settings.json`.
- The secret is tied to `profiles[].id`. Internally it is stored as `copilotCustomProvider.apiKey.<profile id>`.
- If you change a profile `id`, run `Set API Key` again for the new id.
- `profiles[].apiKey` is supported as an inline fallback, but avoid it for real secrets, especially in workspace settings.
- SecretStorage takes priority over inline `apiKey`.
- Use `Custom OpenAI Responses: Clear API Key` to remove the stored key for one profile.

When `apiKeyHeader` is omitted, requests use common OpenAI/Azure auth defaults:

- URLs containing `openai.azure` use `api-key: <key>`.
- Other URLs use `Authorization: Bearer <key>`.

Set `apiKeyHeader` and `apiKeyPrefix` only when the whole profile needs a different default. For per-model gateways, use `models[].requestHeaders`; `authorization` and `api-key` can override the inferred auth header, and `${apiKey}` is replaced with the profile key.

## Profile Fields

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `id` | Yes | - | Stable profile id. Used for SecretStorage and default model ids. Must be unique. |
| `name` | No | `id` | Display name shown in model details and key prompts. |
| `baseUrl` | Usually | - | Service base URL for this profile. Unless it already contains `/responses`, `/chat/completions`, or `/messages`, `/v1/responses` is appended. Can be omitted if every model has its own `baseUrl`. |
| `apiKey` | No | - | Inline key fallback. Prefer the Set API Key command. |
| `requireApiKey` | No | `true` | Require a key when using this profile. Models still appear before a key is set. Set `false` for local/proxy endpoints that need no key. |
| `apiKeyHeader` | No | inferred | Optional profile-level auth header override. When omitted, `openai.azure` URLs use `api-key`; other URLs use `Authorization`. |
| `apiKeyPrefix` | No | `Bearer ` | Prefix used when `apiKeyHeader` is explicitly set. Use `""` for raw key headers. |
| `extraHeaders` | No | `{}` | Extra static headers for this profile. Reserved, unsafe, and auth-related header overrides are ignored. Do not put secrets here. |
| `requestBodyOverrides` | No | `{}` | JSON fields merged into every request for this profile. |
| `models` | No | GPT-5 default | Models shown under this profile. |

## Model Fields

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `id` | Yes | - | Upstream model id sent as `model` when `apiModel` is not set. May repeat across profiles. |
| `providerId` | No | `<profile id>/<model id>` | Unique VS Code/Copilot model id. Set this when one profile exposes the same `id` more than once. |
| `apiModel` | No | `id` | Actual model value sent to the Responses API request. |
| `name` | No | `id` | Base display name. Used as `${modelName}` in `modelNameTemplate`. |
| `baseUrl` | No | profile `baseUrl` | Per-model base URL or full Responses API URL override. Uses the same automatic `/v1/responses` rule, profile key, and headers. |
| `family` | No | `id` | Model family advertised to VS Code. |
| `version` | No | `1` | Model version advertised to VS Code. |
| `maxInputTokens` | No | `128000` | Input token budget advertised to VS Code. |
| `maxOutputTokens` | No | `16384` | Output token budget advertised and sent as `max_output_tokens`. |
| `toolCalling` | No | `false` | Advertise tool support and forward VS Code tools to the Responses API request. |
| `vision` | No | `false` | Advertise image input support. Image data is sent as Responses API `input_image`. |
| `thinking` | No | `false` | Advertise thinking support. When `true`, requests include `reasoning.encrypted_content`, encrypted reasoning items are round-tripped, and `temperature` is removed from the final body. |
| `streaming` | No | global setting | Set `false` to send `stream: false` for this model even when global streaming is enabled. |
| `editTools` | No | - | Edit tool hints exposed through VS Code model capabilities: `find-replace`, `multi-find-replace`, `apply-patch`, `code-rewrite`. |
| `reasoningEffort` | No | unset | Preferred/default reasoning effort for this model. The value can be any string, but it is sent only if included in the model's advertised effort list. |
| `supportsReasoningEffort` | No | default five levels | Reasoning effort levels accepted by the model. Because this provider is Responses-only, omit it or set `[]` to use the provider default five levels, or set a non-empty array to use those exact picker values. |
| `temperature` | No | - | Sent as `temperature` when set. Removed from the final request body for thinking models, matching VS Code BYOK behavior. |
| `topP` | No | - | Sent as `top_p` when set. |
| `zeroDataRetentionEnabled` | No | `false` | Uses the common BYOK/Custom Endpoint field name. When `true`, `previous_response_id` is not sent and requests use `store: false`. |
| `supportedEndpoints` | No | `["/responses"]` | Endpoint mode metadata for this extension. Keep the default for HTTP/SSE. Include `ws:/responses` when the model/endpoint supports Responses WebSocket v2. |
| `requestHeaders` | No | `{}` | Model-level request headers. Auth headers can override the inferred default, and `${apiKey}` is interpolated. |
| `extraBody` | No | `{}` | Extra JSON fields merged into requests for this model. |
| `patch.drop.truncation` | No | `false` | Deletes top-level `truncation` for third-party relay APIs that cannot handle it. Default `false` keeps request semantics unchanged. |

## Global Settings

| Field | Default | Meaning |
| --- | --- | --- |
| `copilotCustomProvider.enabled` | `true` | Enable or disable the provider. |
| `copilotCustomProvider.defaultReasoningEffort` | `medium` | Used when a model does not set `reasoningEffort`. It is sent only if the value is included in that model's advertised effort list. |
| `copilotCustomProvider.requestTimeoutMs` | `120000` | HTTP timeout in milliseconds. |
| `copilotCustomProvider.enableStreaming` | `true` | Request streaming responses. |
| `copilotCustomProvider.maxRetries` | `1` | Retry count for failed non-cancelled HTTP requests. |
| `copilotCustomProvider.tokenEstimateCharsPerToken` | `4` | Fallback token estimate used by VS Code. |
| `copilotCustomProvider.modelNameTemplate` | `${profileName}/${modelName}` | Template for model names shown in the picker. |
| `copilotCustomProvider.logLevel` | `off` | Output logging level. Set `debug` to log outgoing HTTP request headers and body. |
| `copilotCustomProvider.logRequests` | `false` | Legacy metadata logging switch. Prefer `logLevel`. |
| `copilotCustomProvider.requestBodyOverrides` | `{}` | JSON fields merged into every request. |

`modelNameTemplate` supports `${profileId}`, `${profileName}`, `${modelId}`, `${modelName}`, `${apiModel}`, `${reasoningEffort}`, and `${baseUrlHost}`.

## Model Names and IDs

By default, model names are shown as:

```text
Host A/GPT-5.5
```

This keeps models from different profiles distinguishable inside the single `Custom OpenAI Responses` provider group.

VS Code model ids must be unique inside this provider. Upstream model ids do not have to be unique.

For example, two profiles can both use:

```json
{ "id": "gpt-5.5" }
```

They appear to VS Code as `host-a/gpt-5.5` and `host-b/gpt-5.5`, while each service receives:

```json
{ "model": "gpt-5.5" }
```

If one profile exposes the same upstream model multiple times, set different `providerId` values.

## Reasoning Effort

This provider is Responses-only, so each configured model exposes Copilot's native Thinking Effort picker by default. Omit `supportsReasoningEffort` or set it to `[]` to use the provider default five levels, currently `minimal`, `low`, `medium`, `high`, and `xhigh`. Set a non-empty array to use those exact picker values. The selected value is received as `options.modelConfiguration.reasoningEffort` and sent to the Responses API as nested `reasoning.effort`.

Request priority is `options.modelConfiguration.reasoningEffort`, then `options.modelOptions.reasoningEffort`, then `options.modelOptions.reasoning.effort`, then model `reasoningEffort`. If no request value exists, the default is chosen from the advertised enum: model `reasoningEffort`, then global `defaultReasoningEffort`, then `high` for Claude families or `medium` for others, then the first advertised level.

## Relay Compatibility

`patch.drop.truncation` is a compatibility switch. Some third-party relay APIs do not correctly process Copilot's `truncation: "disabled"` field in Responses API requests. If debugging shows that this field causes the relay to reject or mishandle requests, set `patch.drop.truncation` to `true` for that model.

## Endpoint Modes

By default, this extension uses HTTP/SSE for Responses requests:

```json
{
  "supportedEndpoints": ["/responses"]
}
```

To use Responses WebSocket v2 for a model, declare:

```json
{
  "supportedEndpoints": ["/responses", "ws:/responses"]
}
```

Only add `ws:/responses` when your service explicitly supports the Responses WebSocket API. The setting is a capability declaration; the extension does not probe or guess WebSocket support from the URL.

## Debug Logs

For request debugging, set:

```json
{
  "copilotCustomProvider.logLevel": "debug"
}
```

Debug logs are written to the `Custom OpenAI Responses` output channel. API key headers are redacted, but request bodies can contain prompt and workspace content.

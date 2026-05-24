# Copilot Custom Provider

Adds a VS Code language model provider named `Custom OpenAI Responses` for OpenAI **Responses** API compatible endpoints.

This extension does not replace or proxy GitHub Copilot's built-in models. It adds separate custom models to the VS Code/Copilot model picker.

## Requirements

- VS Code `1.106.0` or newer.
- One or more endpoints compatible with the OpenAI Responses API, usually `/v1/responses`.

## Quick Setup

Configure one or more profiles in User Settings or workspace `.vscode/settings.json`:

```json
{
  "copilotCustomProvider.profiles": [
    {
      "id": "host-a",
      "name": "Host A",
      "endpoint": "https://host-a.example.com/v1/responses",
      "models": [
        {
          "id": "gpt-5.5",
          "name": "GPT-5.5 Medium",
          "toolCalling": true,
          "vision": true,
          "reasoningEffort": "medium",
          "patch": {
            "dropTruncation": true
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
      "endpoint": "https://host-b.example.com/v1/responses",
      "models": [
        {
          "id": "gpt-5.5",
          "name": "GPT-5.5",
          "toolCalling": true,
          "vision": true,
          "reasoningEffort": "medium"
        }
      ]
    }
  ]
}
```

Then run:

```text
Custom OpenAI Responses: Set API Key
```

The command asks which profile to update. After that, select the custom model from the Copilot/Chat model picker.

## API Keys

Keys should normally be set with `Custom OpenAI Responses: Set API Key`.

- Keys are stored in this extension's VS Code SecretStorage, not in `settings.json`.
- The secret is tied to `profiles[].id`. Internally it is stored as `copilotCustomProvider.apiKey.<profile id>`.
- If you change a profile `id`, run `Set API Key` again for the new id.
- `profiles[].apiKey` is supported as an inline fallback, but avoid it for real secrets, especially in workspace settings.
- SecretStorage takes priority over inline `apiKey`.
- Use `Custom OpenAI Responses: Clear API Key` to remove the stored key for one profile.

By default, requests use:

```text
Authorization: Bearer <key>
```

Change `apiKeyHeader` or `apiKeyPrefix` only if your endpoint requires a different auth header.

## Field Reference

Profile fields:

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `id` | Yes | - | Stable profile id. Used for SecretStorage and default model ids. Must be unique. |
| `name` | No | `id` | Display name shown in model details and key prompts. |
| `endpoint` | Usually | - | Responses API URL for this profile. Can be omitted if every model has its own `endpoint`. |
| `apiKey` | No | - | Inline key fallback. Prefer the Set API Key command. |
| `requireApiKey` | No | `true` | Set `false` for local/proxy endpoints that need no key. |
| `apiKeyHeader` | No | `Authorization` | Header name used for the key. |
| `apiKeyPrefix` | No | `Bearer ` | Prefix before the key. Use `""` for raw key headers. |
| `extraHeaders` | No | `{}` | Extra static headers for this profile. Do not put secrets here. |
| `requestBodyOverrides` | No | `{}` | JSON fields merged into every request for this profile. |
| `models` | No | GPT-5 default | Models shown under this profile. |

Model fields:

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `id` | Yes | - | Upstream model id sent as `model` when `apiModel` is not set. May repeat across profiles. |
| `providerId` | No | `<profile id>/<model id>` | Unique VS Code/Copilot model id. Set this when one profile exposes the same `id` more than once. |
| `apiModel` | No | `id` | Actual model value sent to the endpoint. |
| `name` | No | `id` | Display name in the model picker. |
| `endpoint` | No | profile `endpoint` | Per-model endpoint override. Uses the same profile key and headers. |
| `family` | No | `id` | Model family advertised to VS Code. |
| `version` | No | `1` | Model version advertised to VS Code. |
| `maxInputTokens` | No | `128000` | Input token budget advertised to VS Code. |
| `maxOutputTokens` | No | `16384` | Output token budget advertised and sent as `max_output_tokens`. |
| `toolCalling` | No | `false` | Advertise tool support and forward VS Code tools to the endpoint. |
| `vision` | No | `false` | Advertise image input support. Image data is sent as Responses API `input_image`. |
| `reasoningEffort` | No | global default | Sent as `reasoning.effort`. Values: `minimal`, `low`, `medium`, `high`. |
| `temperature` | No | - | Sent as `temperature` when set. |
| `topP` | No | - | Sent as `top_p` when set. |
| `extraBody` | No | `{}` | Extra JSON fields merged into requests for this model. |
| `patch.dropTruncation` | No | `false` | Deletes top-level `truncation` for third-party relay APIs that cannot handle it. Default `false` keeps request semantics unchanged. |

Global fields:

| Field | Default | Meaning |
| --- | --- | --- |
| `copilotCustomProvider.enabled` | `true` | Enable or disable the provider. |
| `copilotCustomProvider.defaultReasoningEffort` | `medium` | Used when a model does not set `reasoningEffort`. |
| `copilotCustomProvider.requestTimeoutMs` | `120000` | HTTP timeout in milliseconds. |
| `copilotCustomProvider.enableStreaming` | `true` | Request streaming responses. |
| `copilotCustomProvider.maxRetries` | `1` | Retry count for failed non-cancelled HTTP requests. |
| `copilotCustomProvider.tokenEstimateCharsPerToken` | `4` | Fallback token estimate used by VS Code. |
| `copilotCustomProvider.logRequests` | `false` | Log request metadata. Bodies and keys are not logged. |
| `copilotCustomProvider.requestBodyOverrides` | `{}` | JSON fields merged into every request. |

Request body merge order:

```text
provider defaults -> global requestBodyOverrides -> profile requestBodyOverrides -> model extraBody -> modelOptions
```

`patch.dropTruncation` is a compatibility switch. Some third-party relay APIs do not correctly process Copilot's `truncation: "disabled"` field in Responses API requests. If debugging shows that this field causes the relay to reject or mishandle requests, set `patch.dropTruncation` to `true` for that model.

## Model IDs

VS Code model ids must be unique inside this provider. Upstream model ids do not have to be unique.

For example, two profiles can both use:

```json
{ "id": "gpt-5.5" }
```

They appear to VS Code as `host-a/gpt-5.5` and `host-b/gpt-5.5`, while each endpoint receives:

```json
{ "model": "gpt-5.5" }
```

If one profile exposes the same upstream model multiple times, set different `providerId` values.

## Reasoning Effort

Third-party VS Code language model providers do not get Copilot's native Thinking Effort switch. Configure `reasoningEffort` per model instead.

To give users a picker-level choice, expose multiple entries with the same upstream `id` and different `providerId` values, such as `gpt-5-low`, `gpt-5-medium`, and `gpt-5-high`.

## HTTP Forwarding

Requests are sent with the VS Code extension runtime's built-in `fetch`, with `AbortController` for timeout and cancellation. No third-party HTTP client is used.

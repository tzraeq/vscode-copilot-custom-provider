# Engineering Notes

This document records implementation details and technical decisions for maintainers. End-user setup belongs in the root `README.md`.

## Provider Surface

The extension registers one VS Code language model provider:

```text
vendor: custom-openai-responses
displayName: Custom OpenAI Responses
```

All configured profiles and models are exposed under that single provider. Because Copilot groups by provider display name, the default visible model name includes the profile name through `copilotCustomProvider.modelNameTemplate`.

VS Code requires provider model ids to be unique within one provider. The extension therefore separates:

- `providerId`: unique VS Code/Copilot model id.
- `id` / `apiModel`: upstream model id sent to the OpenAI Responses API.

This allows multiple profiles to send the same upstream model id, for example `gpt-5.5`, while still exposing unique provider ids such as `host-a/gpt-5.5` and `host-b/gpt-5.5`.

## Configuration Model

The first supported configuration model is multi-profile only. There is no compatibility layer for an older single-endpoint shape.

Each profile owns:

- a stable `id`;
- a `baseUrl`;
- optional auth header settings;
- optional request body overrides;
- one or more model entries.

The API key is intentionally not a normal required settings field. The preferred flow stores keys in VS Code SecretStorage using:

```text
copilotCustomProvider.apiKey.<profile id>
```

Inline `profiles[].apiKey` remains available as a fallback for local or disposable setups, but SecretStorage wins when both are present.

## URL Resolution

`baseUrl` accepts either a host root or a full endpoint URL.

If the configured URL has no meaningful path, the extension appends:

```text
/v1/responses
```

If the configured URL includes a path, it is used exactly as configured. This supports relay services that mount OpenAI-compatible APIs under an extra path segment.

The same rule applies to profile-level and model-level `baseUrl`.

## Request Transport

The extension uses the VS Code extension host runtime's built-in `fetch` for HTTP/SSE requests. No third-party HTTP client is used.

Timeouts and cancellation are handled with `AbortController`.

For HTTP/SSE, non-ZDR models report the returned `response.id` back to VS Code as a state marker and can send `previous_response_id` on later turns when that marker is still present in chat history. If the upstream rejects that marker as invalid, expired, or missing, the extension retries once with full available history and without `previous_response_id`.

## WebSocket Responses API

Models opt into Responses WebSocket v2 by declaring:

```json
{
  "supportedEndpoints": ["/responses", "ws:/responses"]
}
```

This is a capability declaration. The extension does not probe or infer WebSocket support from the URL.

When WebSocket is selected:

- `https://.../v1/responses` is converted to `wss://.../v1/responses`;
- the client sends `response.create` messages;
- the HTTP-only `stream` field is omitted;
- the returned `response.id` is reported back to VS Code as a state marker;
- later turns on the same active chat connection can reuse that marker as `previous_response_id`.

If `zeroDataRetentionEnabled` is `true`, `previous_response_id` is suppressed on both HTTP/SSE and WebSocket paths, and the request body sends `store: false`.

If a WebSocket request fails because the upstream rejects `previous_response_id`, the extension retries once without that field.

## Request Body Construction

Requests are built in this order:

```text
provider defaults -> global requestBodyOverrides -> profile requestBodyOverrides -> model extraBody -> modelOptions -> patches
```

`patch.dropTruncation` runs after all body fields have been merged. It deletes the top-level `truncation` field only when a model explicitly enables it.

The default for `dropTruncation` is `false` so the extension does not change request semantics unless the user opts in.

## Internal Data Parts

VS Code and Copilot can pass provider-specific metadata through `LanguageModelDataPart`. The extension treats these MIME types as internal and does not forward them as model input:

```text
usage
stateful_marker
cache_control
context_management
reasoning
```

They are also excluded from fallback token estimation. Token counting should reflect user/model-visible input, not provider bookkeeping metadata.

`reasoning` and `context_management` are used to round-trip Responses API encrypted reasoning and compaction items through the public VS Code `LanguageModelDataPart` surface.

Image data parts are different: `image/*` data parts are real model input when the configured model has `vision: true`, so they are converted to Responses API `input_image` content.

## Usage Reporting

Copilot's context usage display depends on providers reporting a `LanguageModelDataPart` with:

```text
mimeType: usage
```

The extension maps OpenAI Responses API usage into Copilot's expected token field names:

| Responses API | Reported usage |
| --- | --- |
| `input_tokens` | `prompt_tokens` |
| `output_tokens` | `completion_tokens` |
| `total_tokens` | `total_tokens` |
| `input_tokens_details.cached_tokens` | `prompt_tokens_details.cached_tokens` |
| `output_tokens_details.reasoning_tokens` | `completion_tokens_details.reasoning_tokens` |

For streaming HTTP/SSE, usage is reported when `response.completed` contains `response.usage`. For non-streaming requests, usage is reported from the final response payload.

If the upstream service omits usage, Copilot may show context usage as zero.

## Tool Calling

When `toolCalling` is enabled for a model, VS Code tool definitions are forwarded to the Responses API request.

`toolCalling` can be:

- `false`: no tool support advertised;
- `true`: tool support advertised;
- a number: maximum number of tools accepted.

## Debugging

`copilotCustomProvider.logLevel` controls output logging:

- `off`: no request logs;
- `info`: request metadata;
- `debug`: outgoing request headers and JSON body, with API key headers redacted.

Debug logs can contain prompt and workspace content, so this setting should be used only while diagnosing a problem.

`provideTokenCount()` also emits token-estimation diagnostics when `logLevel` is `debug`.

## Build and Packaging

The runtime entrypoint is:

```text
dist/extension.js
```

After changing TypeScript source, run:

```text
npm run compile
```

To produce a VSIX:

```text
npm run package
```

When testing an installed VSIX, bumping the package version can help avoid stale extension or Copilot model metadata caches.

# Changelog

All notable changes to this extension are documented here.

## 0.8.0 - 2026-05-27

- Set the VS Code compatibility baseline to `1.121.0`, matching the Custom Endpoint/BYOK provider break point.
- Kept settings-based profile configuration and `baseUrl` automatic `/v1/responses` resolution.
- Aligned reasoning effort with the BYOK `configurationSchema` path: `supportsReasoningEffort` now drives the Copilot Thinking Effort picker enum.
- Default omitted or empty `supportsReasoningEffort` to the provider five-level Thinking Effort picker for the Responses-only path.
- Removed the fixed settings-schema enum for `reasoningEffort` so custom endpoint-specific effort names can be configured.
- Made the request default reasoning effort match the picker default derived from the configured effort list.

## 0.7.0 - 2026-05-25

- Added multi-profile configuration for multiple host/key groups.
- Added profile-scoped API key management through VS Code SecretStorage.
- Renamed endpoint-style configuration to `baseUrl`, with automatic `/v1/responses` resolution for host-root URLs.
- Added per-model `reasoningEffort`, including `minimal`, `low`, `medium`, `high`, and `xhigh`.
- Added per-model `providerId` so duplicate upstream model ids can be exposed safely.
- Added model name templating with profile-aware display names.
- Added Responses API image input support for `LanguageModelDataPart` image content.
- Added optional Responses WebSocket v2 support through `supportedEndpoints`.
- Added `patch.dropTruncation` for third-party relay APIs that cannot handle Copilot's `truncation: "disabled"` request field.
- Added Responses API usage reporting so Copilot can display context usage when upstream responses include usage data.
- Filtered internal provider data parts from outgoing model input and fallback token estimation.
- Improved request debugging through `copilotCustomProvider.logLevel`.
- Updated user-facing settings schema hints and examples.

## 0.6.0 - 2026-05-24

- Added the initial configurable OpenAI Responses API provider.
- Added profile/model settings, tool calling, streaming, retry, timeout, and request body override support.

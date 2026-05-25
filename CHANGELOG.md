# Changelog

All notable changes to this extension are documented here.

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

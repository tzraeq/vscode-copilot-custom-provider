import * as vscode from 'vscode';

const vendor = 'custom-openai-responses';
const configSection = 'copilotCustomProvider';
const secretPrefix = 'copilotCustomProvider.apiKey.';
const statefulMarkerMimeType = 'stateful_marker';
const usageMimeType = 'usage';
const reasoningMimeType = 'reasoning';
const contextManagementMimeType = 'context_management';
const responsesEndpoint = '/responses';
const webSocketResponsesEndpoint = 'ws:/responses';
const contextManagementCompactionType = 'compaction';
const toolSearchReservedName = 'tool_search';
const modelsWithoutResponsesContextManagement = new Set(['gpt-5', 'gpt-5.1', 'gpt-5.2']);
const defaultReasoningEffortLevels = ['minimal', 'low', 'medium', 'high', 'xhigh'];

type ReasoningEffort = string;
type LogLevel = 'off' | 'info' | 'debug';
type ModelSupportedEndpoint = typeof responsesEndpoint | typeof webSocketResponsesEndpoint;
type ReasoningEffortFormat = 'responses' | 'chat-completions';
type EndpointEditToolName = 'find-replace' | 'multi-find-replace' | 'apply-patch' | 'code-rewrite';
type TextVerbosity = 'low' | 'medium' | 'high';

interface LanguageModelConfigurationSchemaLike {
	readonly properties?: Record<string, Record<string, unknown>>;
}

interface LanguageModelChatCapabilitiesWithEditTools extends vscode.LanguageModelChatCapabilities {
	readonly editTools?: EndpointEditToolName[];
}

interface ProvideLanguageModelChatResponseOptionsWithConfiguration extends vscode.ProvideLanguageModelChatResponseOptions {
	readonly modelConfiguration?: Record<string, unknown>;
}

type LanguageModelThinkingPartLike = {
	readonly value?: string | string[];
	readonly id?: string;
	readonly metadata?: Record<string, unknown>;
};

interface ModelPatchConfig {
	dropTruncation: boolean;
}

interface ModelConfig {
	id: string;
	providerId?: string;
	apiModel?: string;
	name?: string;
	baseUrl?: string;
	family?: string;
	version?: string;
	maxInputTokens?: number;
	maxOutputTokens?: number;
	toolCalling?: boolean | number;
	vision?: boolean;
	thinking?: boolean;
	streaming?: boolean;
	editTools?: EndpointEditToolName[];
	reasoningEffort?: ReasoningEffort;
	supportsReasoningEffort?: string[];
	reasoningEffortFormat?: ReasoningEffortFormat;
	temperature?: number;
	topP?: number;
	zeroDataRetentionEnabled?: boolean;
	supportedEndpoints?: ModelSupportedEndpoint[];
	requestHeaders?: Record<string, string>;
	extraBody?: Record<string, unknown>;
	patch?: ModelPatchConfig;
}

interface ProviderProfileConfig {
	id: string;
	name: string;
	baseUrl: string;
	apiKey: string;
	requireApiKey: boolean;
	apiKeyHeader: string;
	apiKeyPrefix: string;
	extraHeaders: Record<string, string>;
	requestBodyOverrides: Record<string, unknown>;
	models: ModelConfig[];
}

interface ExtensionConfig {
	enabled: boolean;
	profiles: ProviderProfileConfig[];
	defaultReasoningEffort: ReasoningEffort;
	requestTimeoutMs: number;
	enableStreaming: boolean;
	maxRetries: number;
	tokenEstimateCharsPerToken: number;
	modelNameTemplate: string;
	logLevel: LogLevel;
	requestBodyOverrides: Record<string, unknown>;
}

interface SelectedModelConfig {
	readonly profileId: string;
	readonly profileName: string;
	readonly providerModelId: string;
	readonly model: ModelConfig;
}

interface CustomLanguageModel extends vscode.LanguageModelChatInformation {
	readonly isUserSelectable?: boolean;
	readonly configurationSchema?: LanguageModelConfigurationSchemaLike;
	readonly config: SelectedModelConfig;
}

interface ResponsesRequestBody {
	model: string;
	input: ResponsesInputItem[];
	previous_response_id?: string;
	stream?: boolean;
	max_output_tokens?: number;
	store?: boolean;
	truncation?: 'auto' | 'disabled';
	include?: string[];
	top_logprobs?: number;
	context_management?: ResponsesContextManagementRequest[];
	reasoning?: {
		effort?: string;
		summary?: string;
	};
	reasoning_effort?: string;
	temperature?: number;
	top_p?: number;
	text?: {
		verbosity?: TextVerbosity;
	};
	tools?: ResponsesTool[];
	tool_choice?: 'auto' | 'required' | { type: 'function'; name: string };
	[key: string]: unknown;
}

type ResponsesInputItem =
	| ResponsesInputMessage
	| ResponsesOutputMessage
	| ResponsesFunctionCall
	| ResponsesFunctionCallOutput
	| ResponsesReasoningItem
	| ResponsesContextManagementItem;

interface ResponsesInputMessage {
	role: 'user' | 'system';
	content: ResponsesInputContentPart[];
}

interface ResponsesOutputMessage {
	type: 'message';
	role: 'assistant';
	id?: string;
	status?: 'completed';
	phase?: string;
	content: ResponsesOutputContentPart[];
}

type ResponsesInputContentPart =
	| { type: 'input_text'; text: string }
	| { type: 'input_image'; image_url: string; detail?: 'auto' | 'low' | 'high' }
	| { type: 'input_file'; filename: string; file_data: string };

type ResponsesOutputContentPart =
	| { type: 'output_text'; text: string; annotations?: unknown[] }
	| { type: 'refusal'; refusal: string };

interface ResponsesFunctionCall {
	type: 'function_call';
	call_id: string;
	name: string;
	arguments: string;
}

interface ResponsesFunctionCallOutput {
	type: 'function_call_output';
	call_id: string;
	output: string;
}

interface ResponsesReasoningItem {
	type: 'reasoning';
	id: string;
	summary: unknown[];
	encrypted_content: string;
}

interface ResponsesContextManagementItem {
	type: 'compaction';
	id: string;
	encrypted_content: string;
}

interface ResponsesContextManagementRequest {
	type: 'compaction';
	compact_threshold: number;
}

interface ResponsesTool {
	type: 'function';
	name: string;
	description: string;
	parameters: object;
	strict: false;
}

interface ResponsesStreamEvent {
	type?: string;
	delta?: string;
	item?: unknown;
	response?: unknown;
	output_index?: number;
	content_index?: number;
	[key: string]: unknown;
}

interface ResponsesStreamProcessorContext {
	output: vscode.OutputChannel;
	requestId: string;
	logLevel: LogLevel;
}

interface ResponsesStreamReportState {
	lastTextDeltaOutputIndex?: number;
}

interface ResponsesHttpRequestOptions {
	requestId: string;
	ignoreStatefulMarker: boolean;
	allowPreviousResponseId: boolean;
	retryOnInvalidStatefulMarker?: boolean;
}

interface APIUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
	prompt_tokens_details?: {
		cached_tokens: number;
		cache_creation_input_tokens?: number;
	};
	completion_tokens_details?: {
		reasoning_tokens: number;
		accepted_prediction_tokens: number;
		rejected_prediction_tokens: number;
	};
}

interface ResponsesRequestStateOptions {
	ignoreStatefulMarker: boolean;
	webSocketStatefulMarker?: string;
	allowPreviousResponseId: boolean;
}

interface ResponsesStatefulMarkerReportOptions {
	enabled: boolean;
	connectionId?: string;
}

interface ResponsesTerminalOutcome {
	ok: boolean;
	message?: string;
}

interface StatefulMarkerData {
	modelId: string;
	marker: string;
	connectionId?: string;
}

type FetcherId = 'undici-fetch';
type FetchPhase = 'requestResponse' | 'responseStreaming';
type FetchOutcome = 'success' | 'error' | 'cancel';

interface FetchEvent {
	readonly requestId: string;
	readonly phase: FetchPhase;
	readonly outcome: FetchOutcome;
	readonly fetcher: FetcherId;
	readonly url: string;
	readonly status?: number;
	readonly reason?: unknown;
	readonly bytesReceived?: number;
}

class ResponsesApiError extends Error {
	public readonly code?: string;
	public readonly errorType?: string;
	public readonly status?: number;

	public constructor(message: string, options: { code?: string; errorType?: string; status?: number } = {}) {
		super(message);
		this.name = 'ResponsesApiError';
		this.code = options.code;
		this.errorType = options.errorType;
		this.status = options.status;
	}
}

class ResponsesWebSocketTransportError extends Error {
	public constructor(message: string, cause?: unknown) {
		super(message);
		this.name = 'ResponsesWebSocketTransportError';
		if (cause !== undefined) {
			(this as Error & { cause?: unknown }).cause = cause;
		}
	}
}

class ResponsesWebSocketRequestError extends Error {
	public constructor(message: string, public readonly didStream: boolean, cause?: unknown) {
		super(message);
		this.name = 'ResponsesWebSocketRequestError';
		if (cause !== undefined) {
			(this as Error & { cause?: unknown }).cause = cause;
		}
	}
}

export function activate(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel('Custom OpenAI Responses');
	const provider = new CustomOpenAIResponsesProvider(context, output);

	context.subscriptions.push(
		output,
		provider,
		vscode.lm.registerLanguageModelChatProvider(vendor, provider),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(configSection)) {
				provider.refresh();
			}
		}),
		vscode.commands.registerCommand('copilotCustomProvider.manage', () => showManagementMenu(context, provider)),
		vscode.commands.registerCommand('copilotCustomProvider.setApiKey', () => setApiKey(context, provider)),
		vscode.commands.registerCommand('copilotCustomProvider.clearApiKey', () => clearApiKey(context, provider)),
		vscode.commands.registerCommand('copilotCustomProvider.openSettings', () => openSettings())
	);
}

export function deactivate(): void {
	// No-op.
}

class CustomOpenAIResponsesProvider implements vscode.LanguageModelChatProvider<CustomLanguageModel>, vscode.Disposable {
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
	private readonly webSockets: ResponsesWebSocketManager;
	private readonly fetcher: CustomFetcherService;
	private readonly disposables: vscode.Disposable[] = [this.onDidChangeEmitter];

	public readonly onDidChangeLanguageModelChatInformation = this.onDidChangeEmitter.event;

	public constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly output: vscode.OutputChannel
	) {
		this.fetcher = new CustomFetcherService(output);
		this.webSockets = new ResponsesWebSocketManager(output);
		this.disposables.push(this.webSockets);
	}

	public dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}

	public refresh(): void {
		this.onDidChangeEmitter.fire();
	}

	public async provideLanguageModelChatInformation(
		options: vscode.PrepareLanguageModelChatModelOptions,
		token: vscode.CancellationToken
	): Promise<CustomLanguageModel[]> {
		if (token.isCancellationRequested) {
			return [];
		}

		const config = await readConfig(this.context);
		if (!config.enabled) {
			return [];
		}

		const missingBaseUrlProfiles = config.profiles.filter((profile) => !hasUsableBaseUrl(profile));
		const usableProfiles = config.profiles.filter((profile) => hasUsableBaseUrl(profile));
		if (config.profiles.length === 0) {
			if (!options.silent) {
				void vscode.window.showWarningMessage(
					'Custom OpenAI Responses provider has no profiles. Configure copilotCustomProvider.profiles.'
				);
			}
			return [];
		}
		if (usableProfiles.length === 0) {
			if (!options.silent) {
				void vscode.window.showWarningMessage(
					'Custom OpenAI Responses provider is missing a baseUrl. Configure copilotCustomProvider.profiles[].baseUrl.'
				);
			}
			return [];
		}

		if (!options.silent) {
			if (missingBaseUrlProfiles.length > 0) {
				this.output.appendLine(
					`Skipped profiles without baseUrl: ${missingBaseUrlProfiles.map((profile) => profile.id).join(', ')}`
				);
			}
		}

		const seenProviderModelIds = new Set<string>();
		return usableProfiles.flatMap((profile) =>
			profile.models
				.filter((model) => typeof model.id === 'string' && model.id.trim().length > 0)
				.map((model) => toLanguageModelInformation(profile, model, config, seenProviderModelIds))
		);
	}

	public async provideLanguageModelChatResponse(
		model: CustomLanguageModel,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		const config = await readConfig(this.context);
		const profile = findProfile(config, model.config.profileId);
		if (!profile) {
			throw new Error(`Profile "${model.config.profileId}" is no longer configured.`);
		}

		const baseUrl = model.config.model.baseUrl || profile.baseUrl;
		const requestUrl = resolveResponsesRequestUrl(baseUrl);
		if (!requestUrl) {
			throw new Error(`Missing baseUrl for profile "${profile.id}".`);
		}
		if (profile.requireApiKey && !profile.apiKey) {
			throw new Error(`Missing API key for profile "${profile.id}". Run "Custom OpenAI Responses: Set API Key".`);
		}

		const headers = buildHeaders(profile, model.config.model, requestUrl);
		const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		const useWebSocket = shouldUseWebSocketResponsesApi(model.config.model);

		if (useWebSocket) {
			await this.provideWebSocketResponsesChatResponse(
				model,
				profile,
				messages,
				options,
				progress,
				token,
				config,
				requestUrl,
				headers,
				requestId
			);
			return;
		}

		await this.provideHttpResponsesChatResponse(
			model,
			profile,
			messages,
			options,
			progress,
			token,
			config,
			requestUrl,
			headers,
			{
				requestId,
				ignoreStatefulMarker: Boolean(model.config.model.zeroDataRetentionEnabled),
				allowPreviousResponseId: !model.config.model.zeroDataRetentionEnabled,
				retryOnInvalidStatefulMarker: true
			}
		);
	}

	private async provideHttpResponsesChatResponse(
		model: CustomLanguageModel,
		profile: ProviderProfileConfig,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
		config: ExtensionConfig,
		requestUrl: string,
		headers: Record<string, string>,
		requestOptions: ResponsesHttpRequestOptions
	): Promise<void> {
		const body = buildResponsesRequestBody(model, profile, messages, options, config, {
			ignoreStatefulMarker: requestOptions.ignoreStatefulMarker,
			allowPreviousResponseId: requestOptions.allowPreviousResponseId
		});
		try {
			await this.sendHttpResponsesRequest(
				model,
				profile,
				progress,
				token,
				config,
				requestUrl,
				headers,
				requestOptions,
				body
			);
		} catch (error) {
			if (!requestOptions.retryOnInvalidStatefulMarker || !body.previous_response_id || !isInvalidStatefulMarkerError(error)) {
				throw error;
			}
			if (shouldLogInfo(config.logLevel)) {
				this.output.appendLine(`[${requestOptions.requestId}] retrying HTTP request without previous_response_id`);
			}
			await this.provideHttpResponsesChatResponse(
				model,
				profile,
				messages,
				options,
				progress,
				token,
				config,
				requestUrl,
				headers,
				{
					requestId: `${requestOptions.requestId}:retry`,
					ignoreStatefulMarker: true,
					allowPreviousResponseId: false
				}
			);
		}
	}

	private async sendHttpResponsesRequest(
		model: CustomLanguageModel,
		profile: ProviderProfileConfig,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
		config: ExtensionConfig,
		requestUrl: string,
		headers: Record<string, string>,
		requestOptions: ResponsesHttpRequestOptions,
		body: ResponsesRequestBody
	): Promise<void> {
		const requestBody = JSON.stringify(body);

		if (shouldLogInfo(config.logLevel)) {
			this.output.appendLine(
				`[${requestOptions.requestId}] ${body.stream ? 'stream' : 'non-stream'} request profile=${profile.id} model=${body.model} url=${requestUrl}`
			);
		}
		if (config.logLevel === 'debug') {
			logDebugHttpRequest(this.output, requestOptions.requestId, requestUrl, headers, requestBody);
		}

		const response = await this.fetcher.fetch(requestUrl, {
			requestId: requestOptions.requestId,
			method: 'POST',
			headers,
			body: requestBody,
			timeoutMs: config.requestTimeoutMs,
			maxRetries: config.maxRetries,
			token
		});

		if (!response.ok) {
			throw new Error(await formatHttpError(response));
		}

		const markerOptions = toStatefulMarkerReportOptions(model, requestOptions);
		if (body.stream) {
			await readResponsesStream(response, progress, token, model.config.providerModelId, markerOptions, {
				output: this.output,
				requestId: requestOptions.requestId,
				logLevel: config.logLevel
			});
		} else {
			const payload = await response.json() as unknown;
			reportNonStreamingResponse(payload, progress, model.config.providerModelId, markerOptions);
		}

		if (shouldLogInfo(config.logLevel)) {
			this.output.appendLine(`[${requestOptions.requestId}] completed status=${response.status}`);
		}
	}

	private async provideWebSocketResponsesChatResponse(
		model: CustomLanguageModel,
		profile: ProviderProfileConfig,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
		config: ExtensionConfig,
		requestUrl: string,
		headers: Record<string, string>,
		requestId: string
	): Promise<void> {
		const modelIds = responseStateModelIds(model);
		const messageMarker = getStatefulMarkerAndIndex(messages, modelIds)?.marker;
		const connectionId = messageMarker?.connectionId ?? crypto.randomUUID();
		this.webSockets.maybeResetForConversationRewrite(connectionId, countNonSystemMessages(messages), requestId);
		const wasActive = this.webSockets.hasActiveConnection(connectionId);
		const zeroDataRetentionEnabled = Boolean(model.config.model.zeroDataRetentionEnabled);
		const webSocketStatefulMarker = wasActive && !zeroDataRetentionEnabled
			? this.webSockets.getStatefulMarker(connectionId)
			: undefined;
		const body = buildResponsesRequestBody(model, profile, messages, options, config, {
			ignoreStatefulMarker: true,
			webSocketStatefulMarker,
			allowPreviousResponseId: wasActive && !zeroDataRetentionEnabled
		});
		const webSocketUrl = resolveResponsesWebSocketUrl(requestUrl);
		const connection = this.webSockets.getOrCreateConnection(connectionId, webSocketUrl, headers, requestId);

		if (shouldLogInfo(config.logLevel)) {
			this.output.appendLine(
				`[${requestId}] websocket request profile=${profile.id} model=${body.model} url=${webSocketUrl}`
			);
		}
		if (config.logLevel === 'debug') {
			logDebugWebSocketRequest(this.output, requestId, webSocketUrl, headers, toResponsesWebSocketCreateMessage(body));
		}

		try {
			await connection.connect(config.requestTimeoutMs, token);
			await connection.sendRequest(body, progress, token, model.config.providerModelId, {
				enabled: !zeroDataRetentionEnabled,
				connectionId
			}, {
				output: this.output,
				requestId,
				logLevel: config.logLevel
			});
		} catch (error) {
			if (shouldFallbackWebSocketToHttp(error)) {
				this.webSockets.disposeConnection(connectionId);
				if (shouldLogInfo(config.logLevel)) {
					this.output.appendLine(`[${requestId}] websocket failed before streaming output; falling back to HTTP: ${formatErrorForLog(error)}`);
				}
				await this.provideHttpResponsesChatResponse(
					model,
					profile,
					messages,
					options,
					progress,
					token,
					config,
					requestUrl,
					headers,
					{
						requestId: `${requestId}:http-fallback`,
						ignoreStatefulMarker: true,
						allowPreviousResponseId: false
					}
				);
				return;
			}
			if (!body.previous_response_id || !isInvalidStatefulMarkerError(error)) {
				throw error;
			}

			const retryBody = buildResponsesRequestBody(model, profile, messages, options, config, {
				ignoreStatefulMarker: true,
				allowPreviousResponseId: false
			});
			if (shouldLogInfo(config.logLevel)) {
				this.output.appendLine(`[${requestId}] retrying websocket request without previous_response_id`);
			}
			if (config.logLevel === 'debug') {
				logDebugWebSocketRequest(this.output, `${requestId}:retry`, webSocketUrl, headers, toResponsesWebSocketCreateMessage(retryBody));
			}
			try {
				await connection.sendRequest(retryBody, progress, token, model.config.providerModelId, {
					enabled: !zeroDataRetentionEnabled,
					connectionId
				}, {
					output: this.output,
					requestId: `${requestId}:retry`,
					logLevel: config.logLevel
				});
			} catch (retryError) {
				if (!shouldFallbackWebSocketToHttp(retryError)) {
					throw retryError;
				}
				this.webSockets.disposeConnection(connectionId);
				if (shouldLogInfo(config.logLevel)) {
					this.output.appendLine(`[${requestId}:retry] websocket retry failed before streaming output; falling back to HTTP: ${formatErrorForLog(retryError)}`);
				}
				await this.provideHttpResponsesChatResponse(
					model,
					profile,
					messages,
					options,
					progress,
					token,
					config,
					requestUrl,
					headers,
					{
						requestId: `${requestId}:http-fallback`,
						ignoreStatefulMarker: true,
						allowPreviousResponseId: false
					}
				);
				return;
			}
		}

		this.webSockets.setLastNonSystemMessageCount(connectionId, countNonSystemMessages(messages) + 1);
		if (shouldLogInfo(config.logLevel)) {
			this.output.appendLine(`[${requestId}] websocket completed`);
		}
	}

	public async provideTokenCount(
		model: CustomLanguageModel,
		text: string | vscode.LanguageModelChatRequestMessage,
		token: vscode.CancellationToken
	): Promise<number> {
		if (token.isCancellationRequested) {
			return 0;
		}

		const config = await readConfig(this.context);
		const charsPerToken = Math.max(1, config.tokenEstimateCharsPerToken);
		const extractedText = extractTextForTokenCount(text);
		const tokenCount = Math.ceil(extractedText.length / charsPerToken);
		if (config.logLevel === 'debug') {
			this.output.appendLine(
				`[token-count] model=${model.id} chars=${extractedText.length} charsPerToken=${charsPerToken} tokens=${tokenCount} input=${describeTokenCountInput(text)}`
			);
		}
		return tokenCount;
	}
}

async function showManagementMenu(
	context: vscode.ExtensionContext,
	provider: { refresh(): void }
): Promise<void> {
	const choice = await vscode.window.showQuickPick(
		[
			{ label: 'Set API Key', command: 'set' },
			{ label: 'Clear API Key', command: 'clear' },
			{ label: 'Open Settings', command: 'settings' }
		],
		{ placeHolder: 'Manage Custom OpenAI Responses provider' }
	);

	if (!choice) {
		return;
	}

	if (choice.command === 'set') {
		await setApiKey(context, provider);
	} else if (choice.command === 'clear') {
		await clearApiKey(context, provider);
	} else {
		await openSettings();
	}
}

async function setApiKey(
	context: vscode.ExtensionContext,
	provider?: { refresh(): void }
): Promise<void> {
	const config = await readConfig(context);
	const profile = await pickProfile(config.profiles, 'Select profile for API key');
	if (!profile) {
		return;
	}

	const apiKey = await vscode.window.showInputBox({
		title: `Custom OpenAI Responses API Key: ${profile.name}`,
		password: true,
		ignoreFocusOut: true,
		prompt: `Store API key for profile "${profile.id}" in this extension's VS Code SecretStorage.`
	});

	if (!apiKey) {
		return;
	}

	await context.secrets.store(secretKey(profile.id), apiKey);
	provider?.refresh();
	await vscode.window.showInformationMessage(`Custom OpenAI Responses API key stored for ${profile.name}.`);
}

async function clearApiKey(
	context: vscode.ExtensionContext,
	provider?: { refresh(): void }
): Promise<void> {
	const config = await readConfig(context);
	const profile = await pickProfile(config.profiles, 'Select profile to clear API key');
	if (!profile) {
		return;
	}

	await context.secrets.delete(secretKey(profile.id));
	provider?.refresh();
	await vscode.window.showInformationMessage(`Custom OpenAI Responses API key cleared for ${profile.name}.`);
}

async function openSettings(): Promise<void> {
	await vscode.commands.executeCommand('workbench.action.openSettings', configSection);
}

async function readConfig(context: vscode.ExtensionContext): Promise<ExtensionConfig> {
	const config = getWorkspaceConfig();
	const requestBodyOverrides = normalizeObject(config.get<Record<string, unknown>>('requestBodyOverrides', {}));
	const configuredProfiles = normalizeProfiles(
		config.get<Array<Record<string, unknown>>>('profiles', [])
	);

	return {
		enabled: config.get<boolean>('enabled', true),
		profiles: await hydrateProfileSecrets(context, configuredProfiles),
		defaultReasoningEffort: normalizeReasoningEffort(config.get<string>('defaultReasoningEffort', 'medium'), 'medium'),
		requestTimeoutMs: Math.max(1000, config.get<number>('requestTimeoutMs', 120000)),
		enableStreaming: config.get<boolean>('enableStreaming', true),
		maxRetries: Math.max(0, Math.min(5, config.get<number>('maxRetries', 1))),
		tokenEstimateCharsPerToken: Math.max(1, config.get<number>('tokenEstimateCharsPerToken', 4)),
		modelNameTemplate: config.get<string>('modelNameTemplate', '${profileName}/${modelName}'),
		logLevel: readLogLevel(config),
		requestBodyOverrides
	};
}

function getWorkspaceConfig(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration(configSection);
}

function readLogLevel(config: vscode.WorkspaceConfiguration): LogLevel {
	const rawLevel = config.get<string>('logLevel');
	if (rawLevel === 'debug' || rawLevel === 'info' || rawLevel === 'off') {
		return rawLevel;
	}

	const inspected = config.inspect<string>('logLevel');
	const hasConfiguredLogLevel = Boolean(
		inspected?.globalValue
		?? inspected?.workspaceValue
		?? inspected?.workspaceFolderValue
		?? inspected?.defaultLanguageValue
		?? inspected?.globalLanguageValue
		?? inspected?.workspaceLanguageValue
		?? inspected?.workspaceFolderLanguageValue
	);
	if (!hasConfiguredLogLevel && config.get<boolean>('logRequests', false)) {
		return 'info';
	}

	return 'off';
}

function shouldLogInfo(logLevel: LogLevel): boolean {
	return logLevel === 'info' || logLevel === 'debug';
}

function logDebugHttpRequest(
	output: vscode.OutputChannel,
	requestId: string,
	requestUrl: string,
	headers: Record<string, string>,
	body: string
): void {
	output.appendLine(`[${requestId}] HTTP request`);
	output.appendLine(`POST ${requestUrl}`);
	output.appendLine(`headers: ${stringifyJsonForLog(redactHeaders(headers))}`);
	output.appendLine(`body: ${formatJsonStringForLog(body)}`);
}

function logDebugWebSocketRequest(
	output: vscode.OutputChannel,
	requestId: string,
	requestUrl: string,
	headers: Record<string, string>,
	message: Record<string, unknown>
): void {
	output.appendLine(`[${requestId}] WebSocket request`);
	output.appendLine(`WS ${requestUrl}`);
	output.appendLine(`headers: ${stringifyJsonForLog(redactHeaders(headers))}`);
	output.appendLine(`message: ${stringifyJsonForLog(message)}`);
}

function logDebugResponsesStreamEvent(
	context: { output: vscode.OutputChannel; requestId: string; logLevel: LogLevel } | undefined,
	event: ResponsesStreamEvent
): void {
	if (!context || context.logLevel !== 'debug') {
		return;
	}

	if (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta') {
		return;
	}

	const item = asRecord(event.item);
	const response = asRecord(event.response);
	const summary = {
		type: event.type,
		output_index: event.output_index,
		item_type: stringValue(item?.type),
		item_name: stringValue(item?.name),
		item_call_id: stringValue(item?.call_id),
		response_status: stringValue(response?.status),
		response_output_count: Array.isArray(response?.output) ? response.output.length : undefined
	};
	context.output.appendLine(`[${context.requestId}] stream event ${stringifyJsonForLog(summary)}`);
}

function logDebugReportedToolCall(
	context: ResponsesStreamProcessorContext | undefined,
	callId: string,
	name: string,
	source: string
): void {
	if (!context || context.logLevel !== 'debug') {
		return;
	}
	context.output.appendLine(
		`[${context.requestId}] reported tool call ${stringifyJsonForLog({ source, call_id: callId, name })}`
	);
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
	const redacted: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		redacted[key] = isSensitiveHeader(key) ? redactHeaderValue(value) : value;
	}
	return redacted;
}

function isSensitiveHeader(headerName: string): boolean {
	const lower = headerName.toLowerCase();
	return lower === 'authorization'
		|| lower === 'api-key'
		|| lower === 'x-api-key'
		|| lower === 'openai-api-key'
		|| lower.includes('token')
		|| lower.includes('secret');
}

function redactHeaderValue(value: string): string {
	const prefix = value.match(/^(\S+\s+)/)?.[1] ?? '';
	return `${prefix}<redacted>`;
}

function formatJsonStringForLog(text: string): string {
	const parsed = safeJsonParse(text);
	return parsed === undefined ? text : stringifyJsonForLog(parsed);
}

function stringifyJsonForLog(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return String(value);
	}
}

function secretKey(name: string): string {
	return `${secretPrefix}${name || 'default'}`;
}

function hasUsableBaseUrl(profile: ProviderProfileConfig): boolean {
	return Boolean(profile.baseUrl || profile.models.some((model) => trim(model.baseUrl || '').length > 0));
}

function toLanguageModelInformation(
	profile: ProviderProfileConfig,
	model: ModelConfig,
	config: ExtensionConfig,
	seenProviderModelIds?: Set<string>
): CustomLanguageModel {
	const supportedReasoningEfforts = normalizeReasoningEffortLevels(model.supportsReasoningEffort);
	const effort = supportedReasoningEfforts.length > 0
		? pickDefaultReasoningEffort(supportedReasoningEfforts, model.reasoningEffort ?? config.defaultReasoningEffort, model.family || model.id) ?? normalizeReasoningEffort(model.reasoningEffort, config.defaultReasoningEffort)
		: normalizeReasoningEffort(model.reasoningEffort, config.defaultReasoningEffort);
	const baseUrl = model.baseUrl || profile.baseUrl;
	const requestUrl = resolveResponsesRequestUrl(baseUrl);
	const displayModelName = formatModelName(profile, model, effort, baseUrl, config.modelNameTemplate);

	const preferredProviderModelId = model.providerId || buildProviderModelId(profile.id, model.id);
	const providerModelId = seenProviderModelIds
		? uniqueId(preferredProviderModelId, seenProviderModelIds)
		: preferredProviderModelId;
	const tooltipLines = [
		`Reasoning effort: ${effort}`,
		`Base URL: ${baseUrl ? hostnameOrUrl(baseUrl) : 'not set'}`
	];
	if (requestUrl && requestUrl !== baseUrl) {
		tooltipLines.push(`Request URL: ${requestUrl}`);
	}
	if (profile.requireApiKey && !profile.apiKey) {
		tooltipLines.push('API key: not set');
	}
	const tooltip = formatModelTooltip(tooltipLines);

	const info: CustomLanguageModel = {
		id: providerModelId,
		name: displayModelName,
		family: model.family || model.id,
		version: model.version || '1',
		isUserSelectable: true,
		maxInputTokens: normalizePositiveNumber(model.maxInputTokens, 128000),
		maxOutputTokens: normalizePositiveNumber(model.maxOutputTokens, 16384),
		tooltip,
		capabilities: {
			imageInput: Boolean(model.vision),
			toolCalling: model.toolCalling ?? false,
			editTools: model.editTools
		} as LanguageModelChatCapabilitiesWithEditTools,
		config: {
			profileId: profile.id,
			profileName: profile.name,
			providerModelId,
			model
		}
	};
	if (supportedReasoningEfforts.length === 0) {
		return info;
	}
	return {
		...info,
		configurationSchema: {
			properties: {
				reasoningEffort: buildReasoningEffortSchemaProperty(supportedReasoningEfforts, effort, info.family)
			}
		}
	};
}

function formatModelName(
	profile: ProviderProfileConfig,
	model: ModelConfig,
	effort: ReasoningEffort,
	baseUrl: string,
	template: string
): string {
	const modelName = model.name || model.id;
	const values: Record<string, string> = {
		profileId: profile.id,
		profileName: profile.name,
		modelId: model.id,
		modelName,
		apiModel: model.apiModel || model.id,
		reasoningEffort: effort,
		baseUrlHost: baseUrl ? hostnameOrUrl(baseUrl) : ''
	};
	const rendered = (template || '${modelName}').replace(/\$\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, key) =>
		values[key] ?? match
	).trim();

	return rendered || modelName;
}

function formatModelTooltip(lines: string[]): string {
	return lines.join(' | ');
}

function buildReasoningEffortSchemaProperty(
	effortLevels: readonly string[],
	configuredDefault: string | undefined,
	family: string
): Record<string, unknown> {
	return {
		type: 'string',
		title: 'Thinking Effort',
		enum: effortLevels,
		enumItemLabels: effortLevels.map((level) => level.charAt(0).toUpperCase() + level.slice(1)),
		enumDescriptions: effortLevels.map(reasoningEffortDescription),
		default: pickDefaultReasoningEffort(effortLevels, configuredDefault, family),
		group: 'navigation'
	};
}

function pickDefaultReasoningEffort(
	effortLevels: readonly string[],
	configuredDefault: string | undefined,
	family: string
): string | undefined {
	if (effortLevels.length === 0) {
		return undefined;
	}
	if (configuredDefault && effortLevels.includes(configuredDefault)) {
		return configuredDefault;
	}
	const preferred = family.toLowerCase().startsWith('claude') ? 'high' : 'medium';
	return effortLevels.includes(preferred) ? preferred : effortLevels[0];
}

function reasoningEffortDescription(level: string): string {
	switch (level) {
		case 'none':
			return 'No reasoning applied';
		case 'minimal':
			return 'Minimal reasoning for fastest responses';
		case 'low':
			return 'Faster responses with less reasoning';
		case 'medium':
			return 'Balanced reasoning and speed';
		case 'high':
			return 'Greater reasoning depth but slower';
		case 'xhigh':
			return 'Highest reasoning depth but slowest';
		case 'max':
			return 'Absolute maximum capability with no constraints';
		default:
			return level;
	}
}

function buildResponsesRequestBody(
	model: CustomLanguageModel,
	profile: ProviderProfileConfig,
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	options: vscode.ProvideLanguageModelChatResponseOptions,
	config: ExtensionConfig,
	stateOptions: ResponsesRequestStateOptions
): ResponsesRequestBody {
	const modelOptions = normalizeObject(options.modelOptions);
	const modelConfiguration = normalizeObject((options as ProvideLanguageModelChatResponseOptionsWithConfiguration).modelConfiguration);
	const modelConfig = model.config.model;
	const effort = resolveRequestReasoningEffort(modelOptions, modelConfiguration, modelConfig, config.defaultReasoningEffort);
	const maxOutputTokens = normalizePositiveNumber(
		readNestedNumber(modelOptions, ['maxOutputTokens']) ?? readNestedNumber(modelOptions, ['max_output_tokens']) ?? modelConfig.maxOutputTokens,
		model.maxOutputTokens
	);

	const apiModel = modelConfig.apiModel || modelConfig.id;
	const body: ResponsesRequestBody = {
		model: apiModel,
		...toResponsesInput(messages, [model.config.providerModelId, apiModel], stateOptions),
		stream: config.enableStreaming && modelConfig.streaming !== false,
		max_output_tokens: maxOutputTokens,
		store: !modelConfig.zeroDataRetentionEnabled,
		truncation: 'disabled'
	};
	if (modelConfig.thinking) {
		body.include = ['reasoning.encrypted_content'];
	}
	const verbosity = getResponsesTextVerbosity(modelConfig);
	if (verbosity) {
		body.text = { verbosity };
	}
	const contextManagement = toResponsesContextManagement(modelConfig, model.maxInputTokens);
	if (contextManagement) {
		body.context_management = [contextManagement];
	}

	const temperature = readNestedNumber(modelOptions, ['temperature']) ?? modelConfig.temperature;
	if (typeof temperature === 'number') {
		body.temperature = temperature;
	}

	const topP = readNestedNumber(modelOptions, ['topP']) ?? readNestedNumber(modelOptions, ['top_p']) ?? modelConfig.topP;
	if (typeof topP === 'number') {
		body.top_p = topP;
	}

	if (readNestedBoolean(modelOptions, ['logprobs'])) {
		body.top_logprobs = 3;
	}

	if (modelConfig.toolCalling && options.tools?.length) {
		const tools = toResponsesTools(options.tools, modelConfig.toolCalling);
		if (tools.length > 0) {
			body.tools = tools;
			if (options.toolMode === vscode.LanguageModelChatToolMode.Required) {
				body.tool_choice = tools.length === 1
					? { type: 'function', name: tools[0].name }
					: 'required';
			} else {
				body.tool_choice = 'auto';
			}
		}
	}

	const bodyWithOverrides = mergeObjects(
		body,
		config.requestBodyOverrides,
		profile.requestBodyOverrides,
		normalizeObject(modelConfig.extraBody),
		sanitizeModelOptions(modelOptions)
	) as ResponsesRequestBody;

	return applyResponsesRequestCompatibility(bodyWithOverrides, {
		allowPreviousResponseId: stateOptions.allowPreviousResponseId,
		zeroDataRetentionEnabled: Boolean(modelConfig.zeroDataRetentionEnabled),
		modelConfig,
		reasoningEffort: effort,
		patch: modelConfig.patch
	});
}

function getResponsesTextVerbosity(modelConfig: ModelConfig): TextVerbosity | undefined {
	const family = (modelConfig.family || modelConfig.id).toLowerCase();
	return family === 'gpt-5.1' || family === 'gpt-5-mini' ? 'low' : undefined;
}

function toResponsesContextManagement(
	modelConfig: ModelConfig,
	modelMaxInputTokens: number | undefined
): ResponsesContextManagementRequest | undefined {
	const family = (modelConfig.family || modelConfig.id).toLowerCase();
	if (modelsWithoutResponsesContextManagement.has(family)) {
		return undefined;
	}

	const maxInputTokens = normalizePositiveNumber(modelConfig.maxInputTokens, modelMaxInputTokens || 0);
	const compactThreshold = maxInputTokens > 0 ? Math.floor(maxInputTokens * 0.9) : 50000;
	return {
		type: contextManagementCompactionType,
		compact_threshold: compactThreshold
	};
}

function toResponsesInput(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	modelIds: readonly string[],
	stateOptions: ResponsesRequestStateOptions
): { input: ResponsesInputItem[]; previous_response_id?: string } {
	const statefulMarker = getRequestStatefulMarker(messages, modelIds, stateOptions);
	const latestCompactionMessageIndex = getLatestCompactionMessageIndex(messages);
	const latestCompactionMessage = latestCompactionMessageIndex !== undefined
		? createCompactionRoundTripMessage(messages[latestCompactionMessageIndex])
		: undefined;
	let inputMessages: readonly vscode.LanguageModelChatRequestMessage[] = messages;
	if (statefulMarker) {
		inputMessages = messages.slice(statefulMarker.index + 1);
		if (latestCompactionMessageIndex !== undefined) {
			if (latestCompactionMessageIndex > statefulMarker.index) {
				inputMessages = inputMessages.slice(latestCompactionMessageIndex - (statefulMarker.index + 1));
			} else if (latestCompactionMessage) {
				inputMessages = [latestCompactionMessage, ...inputMessages];
			}
		}
	} else if (latestCompactionMessageIndex !== undefined) {
		inputMessages = messages.slice(latestCompactionMessageIndex);
	}
	const input: ResponsesInputItem[] = [];

	for (const message of inputMessages) {
		input.push(...toResponsesInputItems(message));
	}

	return {
		input,
		previous_response_id: statefulMarker?.marker.marker
	};
}

function getRequestStatefulMarker(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	modelIds: readonly string[],
	stateOptions: ResponsesRequestStateOptions
): { marker: StatefulMarkerData; index: number } | undefined {
	if (stateOptions.webSocketStatefulMarker) {
		const markerAndIndex = getStatefulMarkerAndIndex(messages, modelIds, stateOptions.webSocketStatefulMarker);
		if (markerAndIndex) {
			return markerAndIndex;
		}
		return undefined;
	}

	if (stateOptions.ignoreStatefulMarker) {
		return undefined;
	}

	return getStatefulMarkerAndIndex(messages, modelIds);
}

function getLatestCompactionMessageIndex(
	messages: readonly vscode.LanguageModelChatRequestMessage[]
): number | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (getCompactionDataParts(messages[index]).length > 0) {
			return index;
		}
	}
	return undefined;
}

function createCompactionRoundTripMessage(
	message: vscode.LanguageModelChatRequestMessage
): vscode.LanguageModelChatRequestMessage | undefined {
	if (message.role !== vscode.LanguageModelChatMessageRole.Assistant) {
		return undefined;
	}

	const content = getCompactionDataParts(message);
	return content.length > 0
		? { role: vscode.LanguageModelChatMessageRole.Assistant, content, name: message.name }
		: undefined;
}

function getCompactionDataParts(
	message: vscode.LanguageModelChatRequestMessage
): vscode.LanguageModelDataPart[] {
	if (message.role !== vscode.LanguageModelChatMessageRole.Assistant) {
		return [];
	}

	return message.content.filter((part): part is vscode.LanguageModelDataPart =>
		part instanceof vscode.LanguageModelDataPart
		&& part.mimeType === contextManagementMimeType
		&& decodeContextManagementDataPart(part) !== undefined
	);
}

function toResponsesInputItems(message: vscode.LanguageModelChatRequestMessage): ResponsesInputItem[] {
	const items: ResponsesInputItem[] = [];

	if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
		items.push(...message.content.map(toResponsesRoundTripItem).filter(isDefined));

		const outputContent = message.content
			.map(toResponsesOutputContentPart)
			.filter(isDefined);
		if (outputContent.length) {
			items.push({
				type: 'message',
				role: 'assistant',
				content: outputContent
			});
		}

		for (const part of message.content) {
			if (part instanceof vscode.LanguageModelToolCallPart) {
				items.push({
					type: 'function_call',
					call_id: part.callId,
					name: part.name,
					arguments: stringifyJson(part.input ?? {})
				});
			}
		}

		return items;
	}

	for (const part of message.content) {
		if (part instanceof vscode.LanguageModelToolResultPart) {
			items.push({
				type: 'function_call_output',
				call_id: part.callId,
				output: toolResultText(part)
			});
			const images = part.content
				.map(toResponsesInputContentPart)
				.filter((contentPart): contentPart is ResponsesInputContentPart & { type: 'input_image' } => contentPart?.type === 'input_image');
			if (images.length) {
				items.push({
					role: 'user',
					content: [{ type: 'input_text', text: 'Image associated with the above tool call:' }, ...images]
				});
			}
		}
	}

	const content = message.content
		.filter((part) => !(part instanceof vscode.LanguageModelToolResultPart))
		.map(toResponsesInputContentPart)
		.filter(isDefined);

	if (content.length) {
		items.push({
			role: isSystemMessageRole(message.role) ? 'system' : 'user',
			content
		});
	}

	return items;
}

function toResponsesInputContentPart(part: vscode.LanguageModelInputPart | unknown): ResponsesInputContentPart | undefined {
	if (part instanceof vscode.LanguageModelTextPart) {
		return { type: 'input_text', text: part.value };
	}

	if (part instanceof vscode.LanguageModelDataPart) {
		return dataPartToResponsesInput(part);
	}

	if (part instanceof vscode.LanguageModelToolCallPart || part instanceof vscode.LanguageModelToolResultPart) {
		return undefined;
	}

	return { type: 'input_text', text: stringifyUnknown(part) };
}

function toResponsesRoundTripItem(part: vscode.LanguageModelInputPart | unknown): ResponsesInputItem | undefined {
	if (part instanceof vscode.LanguageModelDataPart) {
		return dataPartToResponsesInputItem(part);
	}

	const thinking = toLanguageModelThinkingPartLike(part);
	if (!thinking?.id) {
		return undefined;
	}

	const encrypted = readMetadataString(thinking.metadata, 'encrypted_content')
		?? readMetadataString(thinking.metadata, 'encrypted')
		?? readMetadataString(thinking.metadata, 'reasoning_opaque');
	if (!encrypted) {
		return undefined;
	}

	return {
		type: 'reasoning',
		id: thinking.id,
		summary: [],
		encrypted_content: encrypted
	};
}

function toResponsesOutputContentPart(part: vscode.LanguageModelInputPart | unknown): ResponsesOutputContentPart | undefined {
	if (part instanceof vscode.LanguageModelTextPart && part.value.trim()) {
		return { type: 'output_text', text: part.value };
	}
	return undefined;
}

function dataPartToResponsesInputItem(part: vscode.LanguageModelDataPart): ResponsesInputItem | undefined {
	if (part.mimeType === contextManagementMimeType) {
		return decodeContextManagementDataPart(part);
	}

	if (part.mimeType === reasoningMimeType) {
		return decodeReasoningDataPart(part);
	}

	return undefined;
}

function decodeContextManagementDataPart(part: vscode.LanguageModelDataPart): ResponsesContextManagementItem | undefined {
	const value = safeJsonParse(decodeDataPart(part));
	const record = asRecord(value);
	if (record?.type !== 'compaction') {
		return undefined;
	}

	const id = stringValue(record.id);
	const encryptedContent = stringValue(record.encrypted_content);
	if (!id || !encryptedContent) {
		return undefined;
	}

	return {
		type: 'compaction',
		id,
		encrypted_content: encryptedContent
	};
}

function decodeReasoningDataPart(part: vscode.LanguageModelDataPart): ResponsesReasoningItem | undefined {
	const value = safeJsonParse(decodeDataPart(part));
	const record = asRecord(value);
	if (record?.type !== 'reasoning') {
		return undefined;
	}

	const id = stringValue(record.id);
	const encryptedContent = stringValue(record.encrypted_content);
	if (!id || !encryptedContent) {
		return undefined;
	}

	return {
		type: 'reasoning',
		id,
		summary: [],
		encrypted_content: encryptedContent
	};
}

function dataPartToResponsesInput(part: vscode.LanguageModelDataPart): ResponsesInputContentPart | undefined {
	if (isInternalDataPartMimeType(part.mimeType)) {
		return undefined;
	}

	if (part.mimeType.startsWith('image/')) {
		return {
			type: 'input_image',
			image_url: dataUrlFromDataPart(part),
			detail: 'auto'
		};
	}

	if (part.mimeType.startsWith('text/') || part.mimeType === 'application/json') {
		return { type: 'input_text', text: decodeDataPart(part) };
	}

	return {
		type: 'input_file',
		filename: `input.${extensionFromMimeType(part.mimeType)}`,
		file_data: dataUrlFromDataPart(part)
	};
}

function toolResultText(part: vscode.LanguageModelToolResultPart): string {
	return part.content
		.filter((contentPart) => !(contentPart instanceof vscode.LanguageModelDataPart && contentPart.mimeType.startsWith('image/')))
		.map(contentPartToText)
		.join('');
}

function toResponsesTools(tools: readonly vscode.LanguageModelChatTool[], toolCalling: boolean | number): ResponsesTool[] {
	const maxTools = typeof toolCalling === 'number' && Number.isFinite(toolCalling)
		? Math.max(0, Math.floor(toolCalling))
		: undefined;
	const converted = tools
		.filter((tool) => tool.name.length > 0 && tool.name !== toolSearchReservedName)
		.map((tool): ResponsesTool => ({
			type: 'function',
			name: tool.name,
			description: tool.description,
			parameters: normalizeToolParameters(tool.inputSchema),
			strict: false
		}));
	return maxTools === undefined ? converted : converted.slice(0, maxTools);
}

function normalizeToolParameters(parameters: object | undefined): object {
	if (!parameters || !isRecord(parameters)) {
		return {};
	}
	return parameters;
}

function buildHeaders(profile: ProviderProfileConfig, model: ModelConfig, requestUrl: string): Record<string, string> {
	const modelHeaders = sanitizeRequestHeaders(model.requestHeaders);
	const userSuppliedAuth = hasUserAuthHeader(modelHeaders);
	const auth = resolveProfileApiKeyAuth(profile, requestUrl);
	const headers: Record<string, string> = {
		'content-type': 'application/json',
		...sanitizeExtraHeaders(profile.extraHeaders)
	};

	if (profile.apiKey && !userSuppliedAuth) {
		headers[auth.header] = `${auth.prefix}${profile.apiKey}`;
	}
	for (const [key, value] of Object.entries(modelHeaders)) {
		headers[key] = interpolateApiKey(value, profile.apiKey);
	}

	return headers;
}

function resolveProfileApiKeyAuth(
	profile: ProviderProfileConfig,
	requestUrl: string
): { header: string; prefix: string } {
	if (profile.apiKeyHeader) {
		return {
			header: profile.apiKeyHeader,
			prefix: profile.apiKeyPrefix
		};
	}
	if (requestUrl.includes('openai.azure')) {
		return {
			header: 'api-key',
			prefix: ''
		};
	}
	return {
		header: 'Authorization',
		prefix: 'Bearer '
	};
}

const reservedExtraHeaderNames = new Set([
	'accept-charset',
	'accept-encoding',
	'access-control-request-headers',
	'access-control-request-method',
	'authorization',
	'connection',
	'content-length',
	'content-type',
	'cookie',
	'date',
	'dnt',
	'expect',
	'forwarded',
	'host',
	'keep-alive',
	'origin',
	'openai-intent',
	'permissions-policy',
	'referer',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'user-agent',
	'via',
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto'
]);

const validHeaderNamePattern = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/;
const overridableRequestAuthHeaderNames = new Set(['api-key', 'authorization']);
const userAuthHeaderSuppressionNames = new Set(['api-key', 'authorization', 'x-api-key', 'x-goog-api-key', 'apikey']);

function sanitizeExtraHeaders(headers: Record<string, string>): Record<string, string> {
	return sanitizeHeaders(headers, false);
}

function sanitizeRequestHeaders(headers: Record<string, string> | undefined): Record<string, string> {
	return sanitizeHeaders(headers ?? {}, true);
}

function sanitizeHeaders(headers: Record<string, string>, allowAuthHeaders: boolean): Record<string, string> {
	const sanitized: Record<string, string> = {};
	let count = 0;

	for (const [rawName, rawValue] of Object.entries(headers)) {
		if (count >= 20) {
			break;
		}

		const name = rawName.trim();
		const value = sanitizeHeaderValue(rawValue);
		if (value === undefined || !isAllowedHeaderName(name, value, allowAuthHeaders)) {
			continue;
		}

		sanitized[name] = value;
		count += 1;
	}

	return sanitized;
}

function isAllowedHeaderName(name: string, value: string, allowAuthHeaders: boolean): boolean {
	if (!name || name.length > 256 || !validHeaderNamePattern.test(name)) {
		return false;
	}

	const lower = name.toLowerCase();
	if (allowAuthHeaders && overridableRequestAuthHeaderNames.has(lower)) {
		return true;
	}

	const blockedAuthHeader = lower === 'api-key'
		|| lower === 'openai-api-key'
		|| lower === 'x-api-key'
		|| lower === 'x-goog-api-key'
		|| lower === 'apikey';

	return !reservedExtraHeaderNames.has(lower)
		&& (!blockedAuthHeader || allowAuthHeaders)
		&& lower !== 'x-github-api-version'
		&& lower !== 'x-initiator'
		&& lower !== 'x-interaction-id'
		&& lower !== 'x-interaction-type'
		&& lower !== 'x-onbehalf-extension-id'
		&& lower !== 'x-request-id'
		&& lower !== 'x-vscode-user-agent-library-version'
		&& !lower.startsWith('proxy-')
		&& !lower.startsWith('sec-')
		&& !isForbiddenHttpMethodOverrideHeader(lower, value);
}

function hasUserAuthHeader(headers: Record<string, string>): boolean {
	return Object.keys(headers).some((key) => userAuthHeaderSuppressionNames.has(key.toLowerCase()));
}

function interpolateApiKey(value: string, apiKey: string): string {
	return value.includes('${apiKey}') ? value.split('${apiKey}').join(apiKey) : value;
}

function isForbiddenHttpMethodOverrideHeader(lowerName: string, value: string): boolean {
	if (lowerName !== 'x-http-method' && lowerName !== 'x-http-method-override' && lowerName !== 'x-method-override') {
		return false;
	}
	const method = value.toLowerCase().trim();
	return method === 'connect' || method === 'trace' || method === 'track';
}

function sanitizeHeaderValue(value: string): string | undefined {
	const trimmed = value.trim();
	if (trimmed.length > 8192) {
		return undefined;
	}
	if (/[\x00-\x1F\x7F]/.test(trimmed) || /[\u200B-\u200D\u202A-\u202E\uFEFF]/.test(trimmed)) {
		return undefined;
	}
	return trimmed;
}

interface FetchOptions {
	requestId: string;
	method: 'POST';
	headers: Record<string, string>;
	body: string;
	timeoutMs: number;
	maxRetries: number;
	token: vscode.CancellationToken;
}

class CustomFetcherResponse {
	public readonly ok: boolean;
	private bytesReceived = 0;
	private streamOutcomeReported = false;

	public constructor(
		public readonly status: number,
		public readonly statusText: string,
		public readonly headers: Headers,
		public readonly body: ReadableStream<Uint8Array>,
		private readonly requestId: string,
		private readonly url: string,
		private readonly reportEvent: (event: FetchEvent) => void
	) {
		this.ok = status >= 200 && status < 300;
	}

	public recordChunk(chunk: Uint8Array): void {
		this.bytesReceived += chunk.byteLength;
	}

	public reportStreamSuccess(): void {
		this.reportStreamOutcome('success');
	}

	public reportStreamError(reason: unknown): void {
		this.reportStreamOutcome(isCancellationLikeError(reason) ? 'cancel' : 'error', reason);
	}

	public async text(): Promise<string> {
		const reader = this.body.getReader();
		const chunks: Uint8Array[] = [];
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				this.recordChunk(value);
				chunks.push(value);
			}
			this.reportStreamSuccess();
		} catch (error) {
			this.reportStreamError(error);
			throw error;
		} finally {
			reader.releaseLock();
		}

		const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
		const result = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			result.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return new TextDecoder().decode(result);
	}

	public async json(): Promise<unknown> {
		return JSON.parse(await this.text());
	}

	public async destroy(reason?: unknown): Promise<void> {
		try {
			await this.body.cancel(reason);
		} catch {
			// Stream may already be closed or locked by a reader; callers only need best-effort cleanup.
		}
	}

	private reportStreamOutcome(outcome: FetchOutcome, reason?: unknown): void {
		if (this.streamOutcomeReported) {
			return;
		}
		this.streamOutcomeReported = true;
		this.reportEvent({
			requestId: this.requestId,
			phase: 'responseStreaming',
			outcome,
			fetcher: 'undici-fetch',
			url: this.url,
			status: this.status,
			reason,
			bytesReceived: this.bytesReceived
		});
	}
}

class CustomFetcherService {
	public constructor(private readonly output: vscode.OutputChannel) {}

	public async fetch(requestUrl: string, options: FetchOptions): Promise<CustomFetcherResponse> {
		let lastError: unknown;

		for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
			if (options.token.isCancellationRequested) {
				throw new vscode.CancellationError();
			}

			try {
				return await this.fetchOnce(requestUrl, options);
			} catch (error) {
				lastError = error;
				if (options.token.isCancellationRequested || attempt >= options.maxRetries) {
					break;
				}
				await delay(300 * Math.pow(2, attempt), options.token);
			}
		}

		throw lastError instanceof Error ? lastError : new Error(String(lastError));
	}

	private async fetchOnce(requestUrl: string, options: FetchOptions): Promise<CustomFetcherResponse> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
		const cancellation = options.token.onCancellationRequested(() => controller.abort());

		try {
			const response = await fetch(requestUrl, {
				method: options.method,
				headers: options.headers,
				body: options.body,
				signal: controller.signal
			});

			this.reportEvent({
				requestId: options.requestId,
				phase: 'requestResponse',
				outcome: 'success',
				fetcher: 'undici-fetch',
				url: requestUrl,
				status: response.status
			});

			return new CustomFetcherResponse(
				response.status,
				response.statusText,
				response.headers,
				response.body ?? new ReadableStream<Uint8Array>({ start: (controller) => controller.close() }),
				options.requestId,
				requestUrl,
				(event) => this.reportEvent(event)
			);
		} catch (error) {
			const outcome: FetchOutcome = options.token.isCancellationRequested || isCancellationLikeError(error) ? 'cancel' : 'error';
			this.reportEvent({
				requestId: options.requestId,
				phase: 'requestResponse',
				outcome,
				fetcher: 'undici-fetch',
				url: requestUrl,
				reason: error
			});
			throw error;
		} finally {
			clearTimeout(timeout);
			cancellation.dispose();
		}
	}

	private reportEvent(event: FetchEvent): void {
		if (event.outcome === 'success') {
			return;
		}

		this.output.appendLine(
			`[${event.requestId}] fetch ${event.outcome} phase=${event.phase} status=${event.status ?? 'n/a'} bytes=${event.bytesReceived ?? 0} reason=${formatErrorForLog(event.reason)}`
		);
	}
}

async function readResponsesStream(
	response: CustomFetcherResponse,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	token: vscode.CancellationToken,
	modelId: string,
	statefulMarker: ResponsesStatefulMarkerReportOptions,
	context?: ResponsesStreamProcessorContext
): Promise<void> {
	if (!response.body) {
		throw new Error('Streaming response did not include a body.');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	const processor = new ResponsesStreamProcessor(progress, modelId, statefulMarker, context);
	const cancellation = token.onCancellationRequested(() => {
		void reader.cancel(new vscode.CancellationError()).catch(() => undefined);
	});
	const handleRawEvent = (rawEvent: string): void => {
		processor.handleRawSseEvent(rawEvent);
	};

	try {
		while (true) {
			if (token.isCancellationRequested) {
				throw new vscode.CancellationError();
			}

			let chunk: ReadableStreamReadResult<Uint8Array>;
			try {
				chunk = await reader.read();
			} catch (error) {
				if (token.isCancellationRequested) {
					throw new vscode.CancellationError();
				}
				throw formatResponsesStreamReadError(error, processor.eventCount, processor.lastEventType);
			}

			const { done, value } = chunk;
			if (done) {
				break;
			}

			response.recordChunk(value);
			buffer += decoder.decode(value, { stream: true });
			let separatorIndex = findSseSeparator(buffer);
			while (separatorIndex >= 0) {
				const rawEvent = buffer.slice(0, separatorIndex);
				buffer = buffer.slice(separatorIndex + sseSeparatorLength(buffer, separatorIndex));
				handleRawEvent(rawEvent);
				separatorIndex = findSseSeparator(buffer);
			}
		}

		buffer += decoder.decode();

		if (token.isCancellationRequested) {
			throw new vscode.CancellationError();
		}

		if (buffer.trim().length > 0) {
			handleRawEvent(buffer);
		}

		processor.finishFromStreamEnd('Responses HTTP/SSE stream');
		response.reportStreamSuccess();
	} catch (error) {
		response.reportStreamError(error);
		try {
			await reader.cancel(error);
		} catch {
			// The stream may already be closed after an abort or terminal event.
		}
		throw error;
	} finally {
		cancellation.dispose();
		reader.releaseLock();
	}
}

class ResponsesStreamProcessor {
	private readonly toolCalls = new Map<number, { callId?: string; name?: string; arguments: string }>();
	private readonly reportedToolCalls = new Set<string>();
	private readonly reportState: ResponsesStreamReportState = {};
	private readonly outputItems: unknown[] = [];
	private createdResponse: unknown;
	private terminalReceived = false;
	private didStream = false;
	private textDeltaReported = false;
	private count = 0;
	private lastType: string | undefined;
	private completedResponse: unknown;

	public constructor(
		private readonly progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		private readonly modelId: string,
		private readonly statefulMarker: ResponsesStatefulMarkerReportOptions,
		private readonly context?: ResponsesStreamProcessorContext
	) {}

	public get eventCount(): number {
		return this.count;
	}

	public get lastEventType(): string | undefined {
		return this.lastType;
	}

	public get terminalEventReceived(): boolean {
		return this.terminalReceived;
	}

	public get streamingStarted(): boolean {
		return this.didStream;
	}

	public get completedResponseId(): string | undefined {
		return stringValue(asRecord(this.completedResponse)?.id);
	}

	public handleRawSseEvent(rawEvent: string): ResponsesStreamEvent | undefined {
		const event = parseResponsesSseEvent(rawEvent);
		if (!event) {
			return undefined;
		}
		this.handleEvent(event);
		return event;
	}

	public handleEvent(event: ResponsesStreamEvent): void {
		this.count += 1;
		this.lastType = event.type;
		logDebugResponsesStreamEvent(this.context, event);

		if (event.type === 'error') {
			throw createResponsesApiError(event);
		}

		if (event.type === 'response.created') {
			this.createdResponse = event.response;
		}
		if (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta') {
			const hasDelta = typeof event.delta === 'string' && event.delta.length > 0;
			this.textDeltaReported ||= hasDelta;
			this.didStream ||= hasDelta;
		}
		if (isStreamingProgressEvent(event)) {
			this.didStream = true;
		}
		if (event.type === 'response.output_item.done' && event.item !== undefined) {
			this.outputItems.push(event.item);
		}

		reportResponsesStreamEvent(event, this.progress, this.toolCalls, this.reportedToolCalls, this.reportState, this.modelId, this.statefulMarker, this.context);

		if (!isResponsesTerminalEvent(event)) {
			return;
		}

		this.terminalReceived = true;
		this.completedResponse = event.response;
		const outcome = handleResponsesTerminalEvent(
			event,
			this.progress,
			this.reportedToolCalls,
			this.modelId,
			this.statefulMarker,
			this.context,
			!this.textDeltaReported
		);
		if (!outcome.ok) {
			throw new Error(outcome.message ?? formatResponsesTerminalEvent(event));
		}
	}

	public finishFromStreamEnd(streamName: string): void {
		if (this.terminalReceived) {
			return;
		}

		const fallbackResponse = this.resolveSnapshotFallback(streamName);
		this.completedResponse = fallbackResponse;
		this.terminalReceived = true;
		reportCompletedResponsePayload(
			fallbackResponse,
			this.progress,
			this.reportedToolCalls,
			this.modelId,
			this.statefulMarker,
			!this.textDeltaReported
		);
	}

	private resolveSnapshotFallback(streamName: string): unknown {
		const created = asRecord(this.createdResponse);
		const hasSubstantiveOutput = this.outputItems.some((item) => asRecord(item)?.type !== 'reasoning');
		const requestId = this.context?.requestId ?? 'unknown';

		if (created && hasSubstantiveOutput) {
			if (this.context && shouldLogInfo(this.context.logLevel)) {
				this.context.output.appendLine(
					`[${this.context.requestId}] ${streamName} ended without response.completed; using accumulated snapshot.`
				);
			}
			if (this.context?.logLevel === 'debug') {
				this.context.output.appendLine(
					`[${this.context.requestId}] accumulated output items: ${stringifyJsonForLog(this.outputItems)}`
				);
			}
			return {
				...created,
				output: this.outputItems
			};
		}

		const message = `${streamName} ended without a response.completed event; eventCount=${this.count} lastEvent=${this.lastType ?? 'none'} requestId=${requestId}`;
		if (this.context && shouldLogInfo(this.context.logLevel)) {
			this.context.output.appendLine(`[${this.context.requestId}] ${message}`);
		}
		throw new Error(message);
	}
}

class ResponsesWebSocketManager implements vscode.Disposable {
	private readonly connections = new Map<string, ResponsesWebSocketConnection>();
	private readonly lastNonSystemMessageCounts = new Map<string, number>();

	public constructor(private readonly output: vscode.OutputChannel) {}

	public getOrCreateConnection(
		connectionId: string,
		url: string,
		headers: Record<string, string>,
		initiatingRequestId: string
	): ResponsesWebSocketConnection {
		const existing = this.connections.get(connectionId);
		if (existing?.isOpen || existing?.isConnecting) {
			return existing;
		}
		existing?.dispose();

		const connection = new ResponsesWebSocketConnection(
			connectionId,
			url,
			headers,
			initiatingRequestId,
			this.output,
			() => {
				if (this.connections.get(connectionId) === connection) {
					this.connections.delete(connectionId);
				}
			}
		);
		this.connections.set(connectionId, connection);
		return connection;
	}

	public hasActiveConnection(connectionId: string): boolean {
		const connection = this.connections.get(connectionId);
		return Boolean(connection?.isOpen || connection?.isConnecting);
	}

	public getStatefulMarker(connectionId: string): string | undefined {
		const connection = this.connections.get(connectionId);
		return connection?.isOpen ? connection.statefulMarker : undefined;
	}

	public setLastNonSystemMessageCount(connectionId: string, count: number): void {
		this.lastNonSystemMessageCounts.set(connectionId, count);
	}

	public maybeResetForConversationRewrite(
		connectionId: string,
		currentNonSystemMessageCount: number,
		requestId: string
	): void {
		const connection = this.connections.get(connectionId);
		if (!connection?.statefulMarker) {
			return;
		}

		const lastNonSystemMessageCount = this.lastNonSystemMessageCounts.get(connectionId);
		if (lastNonSystemMessageCount === undefined || currentNonSystemMessageCount < lastNonSystemMessageCount) {
			this.output.appendLine(
				`[${requestId}] resetting websocket state for connection ${connectionId}; currentMessages=${currentNonSystemMessageCount} previousMessages=${lastNonSystemMessageCount ?? 'unknown'}`
			);
			this.disposeConnection(connectionId);
		}
	}

	public disposeConnection(connectionId: string): void {
		const connection = this.connections.get(connectionId);
		if (connection) {
			connection.dispose();
		}
		this.connections.delete(connectionId);
		this.lastNonSystemMessageCounts.delete(connectionId);
	}

	public dispose(): void {
		for (const connection of this.connections.values()) {
			connection.dispose();
		}
		this.connections.clear();
		this.lastNonSystemMessageCounts.clear();
	}
}

class ResponsesWebSocketConnection implements vscode.Disposable {
	private ws: WebSocket | undefined;
	private connectPromise: Promise<void> | undefined;
	private activeRequest: ResponsesWebSocketActiveRequest | undefined;
	private disposed = false;
	private open = false;
	private marker: string | undefined;

	public constructor(
		private readonly connectionId: string,
		private readonly url: string,
		private readonly headers: Record<string, string>,
		private readonly initiatingRequestId: string,
		private readonly output: vscode.OutputChannel,
		private readonly onDispose: () => void
	) {}

	public get isOpen(): boolean {
		return this.open && !this.disposed && this.ws !== undefined;
	}

	public get isConnecting(): boolean {
		return !this.disposed && this.connectPromise !== undefined && !this.open;
	}

	public get statefulMarker(): string | undefined {
		return this.marker;
	}

	public async connect(timeoutMs: number, token: vscode.CancellationToken): Promise<void> {
		if (this.isOpen) {
			return;
		}
		if (this.connectPromise) {
			await this.connectPromise;
			return;
		}

		this.connectPromise = this.connectOnce(timeoutMs, token);
		try {
			await this.connectPromise;
		} finally {
			if (!this.open) {
				this.connectPromise = undefined;
			}
		}
	}

	private async connectOnce(timeoutMs: number, token: vscode.CancellationToken): Promise<void> {
		if (typeof WebSocket === 'undefined') {
			throw new Error('WebSocket is not available in this VS Code extension host.');
		}

		const WebSocketCtor = WebSocket as unknown as {
			new(url: string, protocols?: string | string[] | { protocols?: string | string[]; headers?: Record<string, string> }): WebSocket;
		};
		const ws = new WebSocketCtor(this.url, { headers: this.headers });
		this.ws = ws;

		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				cleanup();
				this.dispose();
				reject(new ResponsesWebSocketTransportError(`WebSocket connection timed out after ${timeoutMs}ms.`));
			}, timeoutMs);
			const cancellation = token.onCancellationRequested(() => {
				cleanup();
				this.dispose();
				reject(new vscode.CancellationError());
			});
			const cleanup = () => {
				clearTimeout(timeout);
				cancellation.dispose();
				ws.removeEventListener('open', onOpen);
				ws.removeEventListener('error', onError);
				ws.removeEventListener('close', onClose);
			};
			const onOpen = () => {
				cleanup();
				if (this.disposed) {
					reject(new Error('WebSocket connection disposed during setup.'));
					return;
				}
				this.open = true;
				this.setupMessageHandlers(ws);
				resolve();
			};
			const onError = (event: Event) => {
				cleanup();
				this.open = false;
				reject(new ResponsesWebSocketTransportError(webSocketEventErrorMessage(event, 'WebSocket connection error'), event));
			};
			const onClose = (event: CloseEvent) => {
				cleanup();
				this.open = false;
				reject(new ResponsesWebSocketTransportError(`WebSocket closed during connection setup: ${formatWebSocketClose(event)}`, event));
			};

			ws.addEventListener('open', onOpen);
			ws.addEventListener('error', onError);
			ws.addEventListener('close', onClose);
		});
	}

	private setupMessageHandlers(ws: WebSocket): void {
		ws.addEventListener('message', (event: MessageEvent) => {
			if (typeof event.data !== 'string') {
				return;
			}

			const parsed = safeJsonParse(event.data);
			if (!isRecord(parsed)) {
				this.output.appendLine(`[${this.initiatingRequestId}] ignored invalid JSON from Responses WebSocket`);
				return;
			}

			if (parsed.type === 'response.completed' && this.activeRequest?.statefulMarkerEnabled) {
				const responseId = stringValue(asRecord(parsed.response)?.id);
				if (responseId) {
					this.marker = responseId;
				}
			}

			this.activeRequest?.handleEvent(parsed as ResponsesStreamEvent);
		});

		ws.addEventListener('error', (event: Event) => {
			const error = new ResponsesWebSocketTransportError(webSocketEventErrorMessage(event, 'WebSocket error'), event);
			this.activeRequest?.reject(error);
		});

		ws.addEventListener('close', (event: CloseEvent) => {
			this.open = false;
			this.ws = undefined;
			const request = this.activeRequest;
			this.activeRequest = undefined;
			if (request && !request.settled) {
				request.reject(new ResponsesWebSocketTransportError(`WebSocket closed: ${formatWebSocketClose(event)}`, event));
			}
			this.onDispose();
		});
	}

	public async sendRequest(
		body: ResponsesRequestBody,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
		modelId: string,
		statefulMarker: ResponsesStatefulMarkerReportOptions,
		context?: ResponsesStreamProcessorContext
	): Promise<void> {
		if (!this.ws || !this.isOpen) {
			throw new ResponsesWebSocketTransportError('WebSocket is not connected.');
		}

		this.activeRequest?.reject(new Error('Request superseded by new WebSocket request.'));
		const request = new ResponsesWebSocketActiveRequest(progress, modelId, statefulMarker, context);
		this.activeRequest = request;
		const cancellation = token.onCancellationRequested(() => request.reject(new vscode.CancellationError()));
		request.done.finally(() => cancellation.dispose()).catch(() => undefined);

		try {
			this.ws.send(JSON.stringify(toResponsesWebSocketCreateMessage(body)));
			await request.done;
		} catch (error) {
			if (error instanceof vscode.CancellationError || error instanceof ResponsesWebSocketRequestError) {
				throw error;
			}
			const cause = error instanceof Error ? error : new Error(String(error));
			throw new ResponsesWebSocketRequestError(cause.message, request.streamingStarted, cause);
		} finally {
			if (this.activeRequest === request) {
				this.activeRequest = undefined;
			}
		}
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.open = false;
		this.activeRequest?.reject(new Error('WebSocket connection disposed.'));
		this.activeRequest = undefined;
		if (this.ws) {
			this.ws.close();
			this.ws = undefined;
		}
		this.output.appendLine(`[${this.initiatingRequestId}] closed websocket connection ${this.connectionId}`);
		this.onDispose();
	}
}

class ResponsesWebSocketActiveRequest {
	private readonly processor: ResponsesStreamProcessor;
	private resolveDone!: () => void;
	private rejectDone!: (error: Error) => void;
	private isSettled = false;
	public readonly done: Promise<void>;

	public constructor(
		private readonly progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		private readonly modelId: string,
		private readonly statefulMarker: ResponsesStatefulMarkerReportOptions,
		private readonly context?: ResponsesStreamProcessorContext
	) {
		this.processor = new ResponsesStreamProcessor(progress, modelId, statefulMarker, context);
		this.done = new Promise<void>((resolve, reject) => {
			this.resolveDone = resolve;
			this.rejectDone = reject;
		});
	}

	public get settled(): boolean {
		return this.isSettled;
	}

	public get streamingStarted(): boolean {
		return this.processor.streamingStarted;
	}

	public get statefulMarkerEnabled(): boolean {
		return this.statefulMarker.enabled;
	}

	public handleEvent(event: ResponsesStreamEvent): void {
		if (this.isSettled) {
			return;
		}

		try {
			this.processor.handleEvent(event);
		} catch (error) {
			this.reject(error instanceof Error ? error : new Error(String(error)));
			return;
		}

		if (this.processor.terminalEventReceived) {
			this.isSettled = true;
			this.resolveDone();
		}
	}

	public reject(error: Error): void {
		if (this.isSettled) {
			return;
		}
		this.isSettled = true;
		if (error instanceof vscode.CancellationError || error instanceof ResponsesWebSocketRequestError) {
			this.rejectDone(error);
			return;
		}
		this.rejectDone(new ResponsesWebSocketRequestError(error.message, this.processor.streamingStarted, error));
	}
}

function parseResponsesSseEvent(rawEvent: string): ResponsesStreamEvent | undefined {
	const lines = rawEvent.split(/\r?\n/);
	let eventType: string | undefined;
	const dataLines: string[] = [];
	for (const line of lines) {
		if (line.startsWith('event:')) {
			eventType = line.slice(6).trim() || eventType;
		} else if (line.startsWith('data:')) {
			dataLines.push(line.slice(5).trimStart());
		}
	}

	if (dataLines.length === 0) {
		return undefined;
	}

	const data = dataLines.join('\n');
	if (data === '[DONE]') {
		return undefined;
	}

	const event = safeJsonParse(data);
	if (!isRecord(event)) {
		return undefined;
	}

	if (typeof event.type !== 'string' && eventType) {
		return { ...event, type: eventType } as ResponsesStreamEvent;
	}

	return event as ResponsesStreamEvent;
}

function reportResponsesStreamEvent(
	event: ResponsesStreamEvent,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	toolCalls: Map<number, { callId?: string; name?: string; arguments: string }>,
	reportedToolCalls: Set<string>,
	reportState: ResponsesStreamReportState,
	modelId: string,
	statefulMarker: ResponsesStatefulMarkerReportOptions,
	context?: ResponsesStreamProcessorContext
): void {
	switch (event.type) {
		case 'response.output_text.delta':
		case 'response.refusal.delta':
			if (typeof event.delta === 'string' && event.delta.length > 0) {
				if (typeof event.output_index === 'number'
					&& reportState.lastTextDeltaOutputIndex !== undefined
					&& reportState.lastTextDeltaOutputIndex !== event.output_index) {
					progress.report(new vscode.LanguageModelTextPart('\n\n'));
				}
				if (typeof event.output_index === 'number') {
					reportState.lastTextDeltaOutputIndex = event.output_index;
				}
				progress.report(new vscode.LanguageModelTextPart(event.delta));
			}
			break;
		case 'response.output_item.added':
			rememberToolCallStart(event, toolCalls);
			break;
		case 'response.function_call_arguments.delta':
			rememberToolCallArgumentsDelta(event, toolCalls);
			break;
		case 'response.output_item.done':
			reportToolCallDone(event, toolCalls, reportedToolCalls, progress, context);
			break;
		case 'response.function_call_arguments.done':
			rememberToolCallArgumentsDone(event, toolCalls);
			break;
		default:
			break;
	}
}

function handleResponsesTerminalEvent(
	event: ResponsesStreamEvent,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	reportedToolCalls: Set<string>,
	modelId: string,
	statefulMarker: ResponsesStatefulMarkerReportOptions,
	context?: ResponsesStreamProcessorContext,
	reportText = true
): ResponsesTerminalOutcome {
	const response = event.response;
	if (event.type === 'response.completed') {
		reportCompletedResponsePayload(response, progress, reportedToolCalls, modelId, statefulMarker, reportText);
		return { ok: true };
	}

	const responseRecord = asRecord(response);
	const incompleteReason = readNestedString(responseRecord ?? {}, ['incomplete_details', 'reason']);
	const isMaxOutputIncomplete = event.type === 'response.incomplete' && incompleteReason === 'max_output_tokens';
	reportCompletedResponsePayload(response, progress, reportedToolCalls, modelId, { enabled: false }, reportText);
	if (isMaxOutputIncomplete) {
		return { ok: true };
	}

	return {
		ok: false,
		message: formatResponsesTerminalEvent(event)
	};
}

function rememberToolCallStart(
	event: ResponsesStreamEvent,
	toolCalls: Map<number, { callId?: string; name?: string; arguments: string }>
): void {
	const item = asRecord(event.item);
	if (item?.type !== 'function_call') {
		return;
	}

	const index = typeof event.output_index === 'number' ? event.output_index : toolCalls.size;
	toolCalls.set(index, {
		callId: typeof item.call_id === 'string' ? item.call_id : undefined,
		name: typeof item.name === 'string' ? item.name : undefined,
		arguments: typeof item.arguments === 'string' ? item.arguments : ''
	});
}

function rememberToolCallArgumentsDelta(
	event: ResponsesStreamEvent,
	toolCalls: Map<number, { callId?: string; name?: string; arguments: string }>
): void {
	const index = typeof event.output_index === 'number' ? event.output_index : 0;
	const existing = toolCalls.get(index) ?? { arguments: '' };
	if (typeof event.delta === 'string') {
		existing.arguments += event.delta;
	}
	toolCalls.set(index, existing);
}

function rememberToolCallArgumentsDone(
	event: ResponsesStreamEvent,
	toolCalls: Map<number, { callId?: string; name?: string; arguments: string }>
): void {
	const index = typeof event.output_index === 'number' ? event.output_index : 0;
	const existing = toolCalls.get(index) ?? { arguments: '' };
	const item = asRecord(event.item);
	const callId = stringValue(event.call_id) ?? stringValue(item?.call_id);
	const name = stringValue(event.name) ?? stringValue(item?.name);
	const argumentsText = stringValue(event.arguments) ?? stringValue(item?.arguments);

	toolCalls.set(index, {
		callId: callId ?? existing.callId,
		name: name ?? existing.name,
		arguments: argumentsText ?? existing.arguments
	});
}

function reportToolCallDone(
	event: ResponsesStreamEvent,
	toolCalls: Map<number, { callId?: string; name?: string; arguments: string }>,
	reportedToolCalls: Set<string>,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	context?: ResponsesStreamProcessorContext
): void {
	const item = asRecord(event.item);
	if (item?.type !== 'function_call') {
		return;
	}

	const index = typeof event.output_index === 'number' ? event.output_index : 0;
	const existing = toolCalls.get(index) ?? { arguments: '' };
	const callId = stringValue(item.call_id) ?? existing.callId ?? crypto.randomUUID();
	const name = stringValue(item.name) ?? existing.name;
	const argsText = stringValue(item.arguments) ?? existing.arguments;

	if (!name) {
		return;
	}

	if (reportedToolCalls.has(callId)) {
		toolCalls.delete(index);
		return;
	}

	reportedToolCalls.add(callId);
	logDebugReportedToolCall(context, callId, name, 'output_item.done');
	progress.report(new vscode.LanguageModelToolCallPart(callId, name, safeJsonParseObject(argsText)));
	toolCalls.delete(index);
}

function reportCompletedResponsePayload(
	payload: unknown,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	reportedToolCalls: Set<string>,
	modelId: string,
	statefulMarker: ResponsesStatefulMarkerReportOptions,
	reportText = true
): void {
	if (reportText) {
		for (const text of extractTextFromResponsesPayload(payload)) {
			progress.report(new vscode.LanguageModelTextPart(text));
		}
	}
	reportToolCallsFromPayload(payload, reportedToolCalls, progress, undefined, 'completed-payload');
	reportRoundTripDataParts(payload, progress);
	reportResponseStatefulMarker(payload, modelId, progress, statefulMarker);
	reportUsagePart(payload, progress);
}

function reportRoundTripDataParts(
	payload: unknown,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
	for (const item of extractReasoningItemsFromResponsesPayload(payload)) {
		progress.report(new vscode.LanguageModelDataPart(encodeInternalDataPart(item), reasoningMimeType));
	}
	const compactionItem = extractLatestContextManagementItemFromResponsesPayload(payload);
	if (compactionItem) {
		progress.report(new vscode.LanguageModelDataPart(encodeInternalDataPart(compactionItem), contextManagementMimeType));
	}
}

function reportToolCallsFromPayload(
	payload: unknown,
	reportedToolCalls: Set<string>,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	context?: ResponsesStreamProcessorContext,
	source = 'payload'
): void {
	for (const toolCall of extractToolCallsFromResponsesPayload(payload)) {
		if (reportedToolCalls.has(toolCall.callId)) {
			continue;
		}
		reportedToolCalls.add(toolCall.callId);
		logDebugReportedToolCall(context, toolCall.callId, toolCall.name, source);
		progress.report(new vscode.LanguageModelToolCallPart(toolCall.callId, toolCall.name, toolCall.input));
	}
}

function reportNonStreamingResponse(
	payload: unknown,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	modelId: string,
	statefulMarker: ResponsesStatefulMarkerReportOptions
): void {
	const terminalEvent = asResponsesTerminalEvent(payload);
	if (terminalEvent) {
		const outcome = handleResponsesTerminalEvent(
			terminalEvent,
			progress,
			new Set<string>(),
			modelId,
			statefulMarker
		);
		if (!outcome.ok) {
			throw new Error(outcome.message ?? formatResponsesTerminalEvent(terminalEvent));
		}
		return;
	}

	reportCompletedResponsePayload(payload, progress, new Set<string>(), modelId, statefulMarker);
}

function extractTextFromResponsesPayload(payload: unknown): string[] {
	const texts: string[] = [];
	const record = asRecord(payload);
	const outputText = stringValue(record?.output_text);
	if (outputText) {
		texts.push(outputText);
	}

	const output = Array.isArray(record?.output) ? record.output : [];
	for (const item of output) {
		const itemRecord = asRecord(item);
		const content = Array.isArray(itemRecord?.content) ? itemRecord.content : [];
		for (const contentPart of content) {
			const contentRecord = asRecord(contentPart);
			const text = stringValue(contentRecord?.text) ?? stringValue(contentRecord?.refusal);
			if (text) {
				texts.push(text);
			}
		}
	}

	return texts;
}

function extractToolCallsFromResponsesPayload(payload: unknown): Array<{ callId: string; name: string; input: object }> {
	const toolCalls: Array<{ callId: string; name: string; input: object }> = [];
	const output = Array.isArray(asRecord(payload)?.output) ? asRecord(payload)?.output as unknown[] : [];

	for (const item of output) {
		const itemRecord = asRecord(item);
		if (itemRecord?.type !== 'function_call') {
			continue;
		}

		const name = stringValue(itemRecord.name);
		if (!name) {
			continue;
		}

		toolCalls.push({
			callId: stringValue(itemRecord.call_id) ?? crypto.randomUUID(),
			name,
			input: safeJsonParseObject(stringValue(itemRecord.arguments) ?? '{}')
		});
	}

	return toolCalls;
}

function extractReasoningItemsFromResponsesPayload(payload: unknown): ResponsesReasoningItem[] {
	const items: ResponsesReasoningItem[] = [];
	for (const item of extractResponsesOutputItems(payload)) {
		const record = asRecord(item);
		if (record?.type !== 'reasoning') {
			continue;
		}

		const id = stringValue(record.id);
		const encryptedContent = stringValue(record.encrypted_content);
		if (!id || !encryptedContent) {
			continue;
		}

		items.push({
			type: 'reasoning',
			id,
			summary: [],
			encrypted_content: encryptedContent
		});
	}
	return items;
}

function extractLatestContextManagementItemFromResponsesPayload(payload: unknown): ResponsesContextManagementItem | undefined {
	let latest: ResponsesContextManagementItem | undefined;
	for (const item of extractResponsesOutputItems(payload)) {
		const record = asRecord(item);
		if (record?.type !== 'compaction') {
			continue;
		}

		const id = stringValue(record.id);
		const encryptedContent = stringValue(record.encrypted_content);
		if (!id || !encryptedContent) {
			continue;
		}

		latest = {
			type: 'compaction',
			id,
			encrypted_content: encryptedContent
		};
	}
	return latest;
}

function extractResponsesOutputItems(payload: unknown): unknown[] {
	const record = asRecord(payload);
	const response = asRecord(record?.response);
	const output = response?.output ?? record?.output;
	return Array.isArray(output) ? output : [];
}

function encodeInternalDataPart(value: unknown): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(value));
}

function reportUsagePart(
	source: unknown,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
	const usage = extractResponsesUsage(source);
	if (!usage) {
		return;
	}

	progress.report(new vscode.LanguageModelDataPart(new TextEncoder().encode(JSON.stringify(usage)), usageMimeType));
}

function extractResponsesUsage(source: unknown): APIUsage | undefined {
	const record = asRecord(source);
	const response = asRecord(record?.response);
	const usage = asRecord(response?.usage) ?? asRecord(record?.usage);
	if (!usage) {
		return undefined;
	}

	const promptTokens = readUsageNumber(usage, 'input_tokens') ?? readUsageNumber(usage, 'prompt_tokens');
	const completionTokens = readUsageNumber(usage, 'output_tokens') ?? readUsageNumber(usage, 'completion_tokens');
	const totalTokens = readUsageNumber(usage, 'total_tokens') ?? (
		promptTokens !== undefined && completionTokens !== undefined
			? promptTokens + completionTokens
			: undefined
	);
	if (promptTokens === undefined || completionTokens === undefined || totalTokens === undefined) {
		return undefined;
	}

	const inputDetails = asRecord(usage.input_tokens_details) ?? asRecord(usage.prompt_tokens_details);
	const outputDetails = asRecord(usage.output_tokens_details) ?? asRecord(usage.completion_tokens_details);

	return {
		prompt_tokens: Math.max(0, promptTokens),
		completion_tokens: Math.max(0, completionTokens),
		total_tokens: Math.max(0, totalTokens),
		prompt_tokens_details: {
			cached_tokens: Math.max(0, readUsageNumber(inputDetails, 'cached_tokens') ?? 0)
		},
		completion_tokens_details: {
			reasoning_tokens: Math.max(0, readUsageNumber(outputDetails, 'reasoning_tokens') ?? 0),
			accepted_prediction_tokens: Math.max(0, readUsageNumber(outputDetails, 'accepted_prediction_tokens') ?? 0),
			rejected_prediction_tokens: Math.max(0, readUsageNumber(outputDetails, 'rejected_prediction_tokens') ?? 0)
		}
	};
}

function readUsageNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
	const value = record?.[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isResponsesTerminalEvent(event: ResponsesStreamEvent): boolean {
	return event.type === 'response.completed'
		|| event.type === 'response.failed'
		|| event.type === 'response.incomplete'
		|| event.type === 'response.cancelled';
}

function isStreamingProgressEvent(event: ResponsesStreamEvent): boolean {
	if (typeof event.delta === 'string' && event.delta.length > 0) {
		return event.type === 'response.output_text.delta'
			|| event.type === 'response.refusal.delta'
			|| event.type === 'response.function_call_arguments.delta'
			|| event.type === 'response.custom_tool_call_input.delta';
	}

	return event.type === 'response.output_item.done'
		&& asRecord(event.item)?.type === 'function_call';
}

function asResponsesTerminalEvent(source: unknown): ResponsesStreamEvent | undefined {
	const record = asRecord(source);
	if (!record) {
		return undefined;
	}

	const eventType = stringValue(record.type);
	if (eventType === 'response.completed'
		|| eventType === 'response.failed'
		|| eventType === 'response.incomplete'
		|| eventType === 'response.cancelled') {
		return record as ResponsesStreamEvent;
	}

	const response = asRecord(record.response) ?? record;
	const status = stringValue(response.status);
	if (!status || status === 'completed') {
		return undefined;
	}

	if (status === 'failed' || status === 'incomplete' || status === 'cancelled') {
		return {
			type: `response.${status}`,
			response
		};
	}

	return undefined;
}

function formatResponsesErrorEvent(event: ResponsesStreamEvent): string {
	const error = asRecord(event.error);
	const code = stringValue(error?.code) ?? stringValue(event.code);
	const message = stringValue(error?.message) ?? stringValue(event.message) ?? 'Responses WebSocket error';
	return code ? `${message} (${code})` : message;
}

function createResponsesApiError(event: ResponsesStreamEvent): ResponsesApiError {
	const error = asRecord(event.error);
	const code = stringValue(error?.code) ?? stringValue(event.code);
	const errorType = stringValue(error?.type) ?? stringValue(event.type);
	const status = typeof error?.status === 'number'
		? error.status
		: typeof event.status === 'number'
			? event.status
			: undefined;
	return new ResponsesApiError(formatResponsesErrorEvent(event), {
		code,
		errorType,
		status
	});
}

function formatResponsesTerminalEvent(event: ResponsesStreamEvent): string {
	const response = asRecord(event.response);
	const responseError = asRecord(response?.error);
	const incompleteDetails = asRecord(response?.incomplete_details);
	const code = stringValue(responseError?.code)
		?? stringValue(incompleteDetails?.reason)
		?? stringValue(response?.status);
	const message = stringValue(responseError?.message)
		?? stringValue(response?.message)
		?? `Responses request ended with ${event.type}`;
	return code ? `${message} (${code})` : message;
}

function formatResponsesStreamReadError(error: unknown, eventCount: number, lastEventType: string | undefined): Error {
	const message = error instanceof Error ? error.message : String(error);
	const name = error instanceof Error ? error.name : undefined;
	const original = name && message && !message.startsWith(name) ? `${name}: ${message}` : message;
	const suffix = `eventCount=${eventCount} lastEvent=${lastEventType ?? 'none'}`;
	return new Error(`Responses HTTP/SSE stream was terminated before a terminal event; ${suffix}; original=${original}`);
}

function isCancellationLikeError(error: unknown): boolean {
	if (error instanceof vscode.CancellationError) {
		return true;
	}

	const record = asRecord(error);
	const name = stringValue(record?.name);
	const code = stringValue(record?.code);
	const message = (stringValue(record?.message) ?? String(error)).toLowerCase();
	return name === 'AbortError'
		|| name === 'CancellationError'
		|| code === 'ABORT_ERR'
		|| message.includes('abort')
		|| message.includes('cancel');
}

function formatErrorForLog(error: unknown): string {
	if (error === undefined) {
		return 'n/a';
	}
	if (error instanceof Error) {
		return error.name && error.message ? `${error.name}: ${error.message}` : error.message || error.name;
	}
	return String(error);
}

function isInvalidStatefulMarkerError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	const normalized = message.toLowerCase();
	return normalized.includes('previous_response_id')
		&& (
			normalized.includes('not found')
			|| normalized.includes('invalid')
			|| normalized.includes('expired')
			|| normalized.includes('stateful')
			|| normalized.includes('conversation')
		);
}

function shouldFallbackWebSocketToHttp(error: unknown): boolean {
	if (isCancellationLikeError(error)) {
		return false;
	}

	const requestError = error instanceof ResponsesWebSocketRequestError ? error : undefined;
	if (requestError?.didStream) {
		return false;
	}

	const cause = requestError ? (requestError as Error & { cause?: unknown }).cause : error;
	if (cause instanceof ResponsesWebSocketTransportError) {
		return true;
	}
	if (cause instanceof ResponsesApiError) {
		return cause.errorType === 'websocket_error' && (
			cause.status === 429
			|| cause.status === 500
			|| cause.status === 503
		);
	}
	return false;
}

function webSocketEventErrorMessage(event: Event, fallback: string): string {
	const eventRecord = asRecord(event);
	const eventError = eventRecord?.error;
	const message = stringValue(eventRecord?.message)
		?? (eventError instanceof Error ? eventError.message : undefined)
		?? fallback;
	return message;
}

function formatWebSocketClose(event: CloseEvent): string {
	const reason = event.reason ? `, reason: ${event.reason}` : '';
	return `code=${event.code}${reason}, wasClean=${event.wasClean}`;
}

async function formatHttpError(response: CustomFetcherResponse): Promise<string> {
	const text = await response.text();
	const details = text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
	return `Custom OpenAI Responses request failed: HTTP ${response.status} ${response.statusText}${details ? `\n${details}` : ''}`;
}

function extractTextForTokenCount(text: string | vscode.LanguageModelChatRequestMessage): string {
	if (typeof text === 'string') {
		return text;
	}

	return [
		roleNameForTokenCount(text.role),
		text.name ?? '',
		...text.content.map(contentPartToText)
	].filter((part) => part.length > 0).join('\n');
}

function contentPartToText(part: vscode.LanguageModelInputPart | unknown): string {
	if (part instanceof vscode.LanguageModelTextPart) {
		return part.value;
	}

	if (part instanceof vscode.LanguageModelDataPart) {
		if (isInternalDataPartMimeType(part.mimeType)) {
			return '';
		}
		return decodeDataPart(part);
	}

	if (part instanceof vscode.LanguageModelToolCallPart) {
		return JSON.stringify({ tool_call: part.name, input: part.input });
	}

	if (part instanceof vscode.LanguageModelToolResultPart) {
		return JSON.stringify({ tool_result: part.callId, content: part.content.map(contentPartToText) });
	}

	const partRecord = asRecord(part);
	if (partRecord) {
		const valueText = textLikeValueToString(partRecord.value);
		if (valueText) {
			return valueText;
		}
		const text = stringValue(partRecord.text) ?? stringValue(partRecord.content);
		if (text) {
			return text;
		}
		const mimeType = stringValue(partRecord.mimeType);
		const data = partRecord.data;
		if (mimeType && data instanceof Uint8Array) {
			return decodeDataBytes(data, mimeType);
		}
	}

	return stringifyUnknown(part);
}

function decodeDataPart(part: vscode.LanguageModelDataPart): string {
	return decodeDataBytes(part.data, part.mimeType);
}

function isInternalDataPartMimeType(mimeType: string): boolean {
	return mimeType === statefulMarkerMimeType
		|| mimeType === usageMimeType
		|| mimeType === 'cache_control'
		|| mimeType === contextManagementMimeType
		|| mimeType === reasoningMimeType;
}

function decodeDataBytes(data: Uint8Array, mimeType: string): string {
	if (mimeType.startsWith('text/') || mimeType === 'application/json') {
		return new TextDecoder().decode(data);
	}

	return `[${mimeType} data, ${data.byteLength} bytes]`;
}

function textLikeValueToString(value: unknown): string | undefined {
	if (typeof value === 'string') {
		return value;
	}
	if (Array.isArray(value)) {
		const parts = value.map(textLikeValueToString).filter(isDefined);
		return parts.length > 0 ? parts.join('\n') : undefined;
	}
	return undefined;
}

function roleNameForTokenCount(role: vscode.LanguageModelChatMessageRole): string {
	switch (role) {
		case vscode.LanguageModelChatMessageRole.User:
			return 'user';
		case vscode.LanguageModelChatMessageRole.Assistant:
			return 'assistant';
		default:
			return isSystemMessageRole(role) ? 'system' : `role:${role}`;
	}
}

function describeTokenCountInput(text: string | vscode.LanguageModelChatRequestMessage): string {
	if (typeof text === 'string') {
		return `string(${text.length})`;
	}

	return `message(role=${roleNameForTokenCount(text.role)}, parts=${text.content.map(describeTokenCountPart).join(',')})`;
}

function describeTokenCountPart(part: vscode.LanguageModelInputPart | unknown): string {
	if (part instanceof vscode.LanguageModelTextPart) {
		return `text(${part.value.length})`;
	}
	if (part instanceof vscode.LanguageModelDataPart) {
		return `data(${part.mimeType},${part.data.byteLength})`;
	}
	if (part instanceof vscode.LanguageModelToolCallPart) {
		return `toolCall(${part.name})`;
	}
	if (part instanceof vscode.LanguageModelToolResultPart) {
		return `toolResult(${part.callId},${part.content.length})`;
	}

	const partRecord = asRecord(part);
	if (partRecord) {
		const constructorName = stringValue((part as { constructor?: { name?: unknown } }).constructor?.name);
		const type = stringValue(partRecord.type) ?? stringValue(partRecord.mimeType) ?? constructorName ?? 'object';
		return type;
	}

	return typeof part;
}

async function pickProfile(
	profiles: ProviderProfileConfig[],
	placeHolder: string
): Promise<ProviderProfileConfig | undefined> {
	if (profiles.length === 0) {
		await vscode.window.showWarningMessage('No Custom OpenAI Responses profiles are configured.');
		return undefined;
	}

	if (profiles.length === 1) {
		return profiles[0];
	}

	const choice = await vscode.window.showQuickPick(
		profiles.map((profile) => ({
			label: profile.name,
			description: profile.id,
			detail: profile.baseUrl || 'No baseUrl configured',
			profile
		})),
		{ placeHolder }
	);

	return choice?.profile;
}

function findProfile(config: ExtensionConfig, profileId: string): ProviderProfileConfig | undefined {
	return config.profiles.find((profile) => profile.id === profileId);
}

function normalizeProfiles(
	profiles: Array<Record<string, unknown>> | undefined
): ProviderProfileConfig[] {
	if (!Array.isArray(profiles) || profiles.length === 0) {
		return [];
	}

	const normalizedProfiles: ProviderProfileConfig[] = [];
	const seenProfileIds = new Set<string>();

	for (let index = 0; index < profiles.length; index += 1) {
		const profile = profiles[index];
		if (!isRecord(profile)) {
			continue;
		}

		const rawId = trim(profile.id) || `profile-${index + 1}`;
		const id = uniqueId(rawId, seenProfileIds);
		const name = trim(profile.name) || id;

		normalizedProfiles.push({
			id,
			name,
			baseUrl: trim(profile.baseUrl),
			apiKey: trim(profile.apiKey),
			requireApiKey: readBoolean(profile.requireApiKey, true),
			apiKeyHeader: trim(profile.apiKeyHeader),
			apiKeyPrefix: typeof profile.apiKeyPrefix === 'string' ? profile.apiKeyPrefix : 'Bearer ',
			extraHeaders: normalizeStringRecord(profile.extraHeaders as Record<string, unknown> | undefined),
			requestBodyOverrides: normalizeObject(profile.requestBodyOverrides),
			models: normalizeModels(profile.models as ModelConfig[] | undefined, id)
		});
	}

	return normalizedProfiles;
}

async function hydrateProfileSecrets(
	context: vscode.ExtensionContext,
	profiles: ProviderProfileConfig[]
): Promise<ProviderProfileConfig[]> {
	return Promise.all(profiles.map(async (profile) => {
		const secretApiKey = await context.secrets.get(secretKey(profile.id));
		return {
			...profile,
			apiKey: trim(secretApiKey || profile.apiKey || '')
		};
	}));
}

function normalizeModels(models: ModelConfig[] | undefined, profileId: string): ModelConfig[] {
	if (!Array.isArray(models) || models.length === 0) {
		return [{
			id: 'gpt-5',
			providerId: buildProviderModelId(profileId, 'gpt-5'),
			apiModel: 'gpt-5',
			name: 'GPT-5 Custom',
			family: 'gpt-5',
			version: '1',
			maxInputTokens: 128000,
			maxOutputTokens: 16384,
			toolCalling: true,
			vision: true,
			reasoningEffort: 'medium',
			supportsReasoningEffort: [...defaultReasoningEffortLevels],
			streaming: true,
			zeroDataRetentionEnabled: false,
			supportedEndpoints: [responsesEndpoint],
			patch: {
				dropTruncation: false
			}
		}];
	}

	const seenProviderIds = new Set<string>();
	return models
		.filter((model) => isRecord(model) && typeof model.id === 'string')
		.map((model) => {
			const upstreamId = model.id.trim();
			const configuredProviderId = trim(model.providerId);
			const providerId = uniqueId(
				configuredProviderId || buildProviderModelId(profileId, upstreamId),
				seenProviderIds
			);
			return {
				...model,
				id: upstreamId,
				providerId,
				apiModel: trim(model.apiModel) || upstreamId,
				name: typeof model.name === 'string' && model.name.trim() ? model.name.trim() : upstreamId,
				baseUrl: trim(model.baseUrl),
				family: trim(model.family) || upstreamId,
				version: trim(model.version) || '1',
				maxInputTokens: normalizePositiveNumber(model.maxInputTokens, 128000),
				maxOutputTokens: normalizePositiveNumber(model.maxOutputTokens, 16384),
				toolCalling: model.toolCalling ?? false,
				vision: Boolean(model.vision),
				thinking: readBoolean(model.thinking, false),
				streaming: typeof model.streaming === 'boolean' ? model.streaming : undefined,
				editTools: normalizeEditTools(model.editTools),
				reasoningEffort: normalizeOptionalReasoningEffort(model.reasoningEffort),
				supportsReasoningEffort: normalizeOptionalReasoningEffortLevels(model.supportsReasoningEffort),
				reasoningEffortFormat: normalizeReasoningEffortFormat(model.reasoningEffortFormat),
				zeroDataRetentionEnabled: readBoolean(model.zeroDataRetentionEnabled, false),
				supportedEndpoints: normalizeSupportedEndpoints(model.supportedEndpoints),
				requestHeaders: normalizeStringRecord(model.requestHeaders as Record<string, unknown> | undefined),
				extraBody: normalizeObject(model.extraBody),
				patch: normalizeModelPatch(model.patch)
			};
		});
}

function normalizeEditTools(value: unknown): EndpointEditToolName[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const seen = new Set<EndpointEditToolName>();
	const tools: EndpointEditToolName[] = [];
	for (const entry of value) {
		if (entry !== 'find-replace' && entry !== 'multi-find-replace' && entry !== 'apply-patch' && entry !== 'code-rewrite') {
			continue;
		}
		if (!seen.has(entry)) {
			seen.add(entry);
			tools.push(entry);
		}
	}
	return tools.length > 0 ? tools : undefined;
}

function normalizeReasoningEffortFormat(value: unknown): ReasoningEffortFormat | undefined {
	return value === 'responses' || value === 'chat-completions' ? value : undefined;
}

function normalizeSupportedEndpoints(value: unknown): ModelSupportedEndpoint[] {
	if (!Array.isArray(value)) {
		return [responsesEndpoint];
	}
	const supported = value.filter((entry): entry is ModelSupportedEndpoint =>
		entry === responsesEndpoint || entry === webSocketResponsesEndpoint
	);
	return supported.length > 0 ? supported : [responsesEndpoint];
}

function normalizeModelPatch(value: unknown): ModelPatchConfig {
	const patch = isRecord(value) ? value : {};
	return {
		dropTruncation: readBoolean(patch.dropTruncation, false)
	};
}

function normalizeStringRecord(value: Record<string, unknown> | undefined): Record<string, string> {
	if (!isRecord(value)) {
		return {};
	}

	const result: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof key === 'string' && key.length > 0 && entry !== undefined && entry !== null) {
			result[key] = String(entry);
		}
	}
	return result;
}

function normalizeObject(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

function normalizeReasoningEffortLevels(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const seen = new Set<string>();
	const levels: string[] = [];
	for (const entry of value) {
		if (typeof entry !== 'string') {
			continue;
		}
		const level = entry.trim();
		if (!level || seen.has(level)) {
			continue;
		}
		seen.add(level);
		levels.push(level);
	}
	return levels;
}

function normalizeOptionalReasoningEffortLevels(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const levels = normalizeReasoningEffortLevels(value);
	return levels.length > 0 ? levels : [...defaultReasoningEffortLevels];
}

function normalizeReasoningEffort(value: unknown, fallback: ReasoningEffort): ReasoningEffort {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeOptionalReasoningEffort(value: unknown): ReasoningEffort | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function resolveRequestReasoningEffort(
	modelOptions: Record<string, unknown>,
	modelConfiguration: Record<string, unknown>,
	modelConfig: ModelConfig,
	defaultReasoningEffort: string
): string | undefined {
	const supported = normalizeReasoningEffortLevels(modelConfig.supportsReasoningEffort);
	const requested = readNestedString(modelConfiguration, ['reasoningEffort'])
		?? readNestedString(modelOptions, ['reasoningEffort'])
		?? readNestedString(modelOptions, ['reasoning', 'effort'])
		?? readNestedString(modelOptions, ['reasoning_effort']);
	if (supported.length > 0) {
		if (requested) {
			return supported.includes(requested) ? requested : undefined;
		}
		return pickDefaultReasoningEffort(
			supported,
			modelConfig.reasoningEffort ?? defaultReasoningEffort,
			modelConfig.family || modelConfig.id
		);
	}
	return normalizeOptionalReasoningEffort(requested ?? modelConfig.reasoningEffort);
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function buildProviderModelId(profileId: string, modelId: string): string {
	return `${profileId}/${modelId}`;
}

function uniqueId(preferredId: string, seenIds: Set<string>): string {
	const baseId = preferredId.trim() || 'item';
	let id = baseId;
	let suffix = 2;
	while (seenIds.has(id)) {
		id = `${baseId}-${suffix}`;
		suffix += 1;
	}
	seenIds.add(id);
	return id;
}

function resolveResponsesRequestUrl(baseUrl: string): string {
	const rawBaseUrl = trim(baseUrl);
	if (!rawBaseUrl) {
		return '';
	}

	if (hasExplicitResponsesApiPath(rawBaseUrl)) {
		return rawBaseUrl;
	}

	const normalizedBaseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
	return /\/v\d+$/.test(normalizedBaseUrl)
		? `${normalizedBaseUrl}/responses`
		: `${normalizedBaseUrl}/v1/responses`;
}

function hasExplicitResponsesApiPath(url: string): boolean {
	return url.includes('/responses') || url.includes('/chat/completions') || url.includes('/messages');
}

function resolveResponsesWebSocketUrl(requestUrl: string): string {
	const rawRequestUrl = trim(requestUrl);
	if (!rawRequestUrl) {
		return '';
	}

	try {
		const url = new URL(rawRequestUrl);
		if (url.protocol === 'https:') {
			url.protocol = 'wss:';
		} else if (url.protocol === 'http:') {
			url.protocol = 'ws:';
		}
		url.hash = '';
		return url.toString();
	} catch {
		return rawRequestUrl
			.replace(/^https:\/\//i, 'wss://')
			.replace(/^http:\/\//i, 'ws://');
	}
}

function shouldUseWebSocketResponsesApi(model: ModelConfig): boolean {
	return model.supportedEndpoints?.includes(webSocketResponsesEndpoint) ?? false;
}

function toStatefulMarkerReportOptions(
	model: CustomLanguageModel,
	requestOptions: ResponsesHttpRequestOptions
): ResponsesStatefulMarkerReportOptions {
	return {
		enabled: !model.config.model.zeroDataRetentionEnabled
	};
}

function toResponsesWebSocketCreateMessage(body: ResponsesRequestBody): Record<string, unknown> {
	const { stream: _stream, ...rest } = body;
	return {
		type: 'response.create',
		...rest,
		initiator: 'user'
	};
}

function responseStateModelIds(model: CustomLanguageModel): string[] {
	const apiModel = model.config.model.apiModel || model.config.model.id;
	return [model.config.providerModelId, apiModel];
}

function hostnameOrUrl(urlValue: string): string {
	try {
		const url = new URL(urlValue);
		return url.port ? `${url.hostname}:${url.port}` : url.hostname;
	} catch {
		return urlValue;
	}
}

function mergeObjects(...objects: Array<Record<string, unknown>>): Record<string, unknown> {
	return objects.reduce<Record<string, unknown>>((merged, object) => ({ ...merged, ...object }), {});
}

function sanitizeModelOptions(modelOptions: Record<string, unknown>): Record<string, unknown> {
	const sanitized = { ...modelOptions };
	delete sanitized.reasoningEffort;
	const reasoning = asRecord(sanitized.reasoning);
	if (reasoning) {
		const { effort: _effort, ...rest } = reasoning;
		if (Object.keys(rest).length > 0) {
			sanitized.reasoning = rest;
		} else {
			delete sanitized.reasoning;
		}
	} else {
		delete sanitized.reasoning;
	}
	delete sanitized.max_output_tokens;
	delete sanitized.maxOutputTokens;
	delete sanitized.top_p;
	delete sanitized.topP;
	return sanitized;
}

function applyResponsesRequestCompatibility(
	body: ResponsesRequestBody,
	options: {
		allowPreviousResponseId: boolean;
		zeroDataRetentionEnabled: boolean;
		modelConfig: ModelConfig;
		reasoningEffort: string | undefined;
		patch: ModelPatchConfig | undefined;
	}
): ResponsesRequestBody {
	delete body.n;
	delete body.stream_options;
	if (!options.modelConfig.thinking) {
		delete body.reasoning;
		delete body.include;
	}
	applyResponsesReasoningEffort(body, options.modelConfig, options.reasoningEffort);
	if (options.modelConfig.thinking) {
		delete body.temperature;
	}
	if (!options.modelConfig.toolCalling) {
		delete body.tools;
	}
	if (Array.isArray(body.tools) && body.tools.length === 0) {
		delete body.tools;
	}
	if (!body.tools) {
		delete body.tool_choice;
	}
	if (options.zeroDataRetentionEnabled) {
		body.store = false;
	}
	if ('previous_response_id' in body && (
		!options.allowPreviousResponseId
		|| options.zeroDataRetentionEnabled
		|| typeof body.previous_response_id !== 'string'
		|| !body.previous_response_id.startsWith('resp_')
	)) {
		delete body.previous_response_id;
	}
	if (options.patch?.dropTruncation) {
		delete body.truncation;
	}
	return body;
}

function applyResponsesReasoningEffort(
	body: ResponsesRequestBody,
	modelConfig: ModelConfig,
	requested: string | undefined
): void {
	const supported = normalizeReasoningEffortLevels(modelConfig.supportsReasoningEffort);
	const hasNativeReasoningEffort = supported.length > 0;
	const effort = hasNativeReasoningEffort
		? requested && supported.includes(requested) ? requested : undefined
		: requested;

	if (body.reasoning) {
		const { effort: _drop, ...rest } = body.reasoning;
		body.reasoning = Object.keys(rest).length > 0 ? rest : undefined;
	}
	delete body.reasoning_effort;

	if (!effort) {
		return;
	}
	if ((modelConfig.reasoningEffortFormat ?? 'responses') === 'chat-completions') {
		body.reasoning_effort = effort;
		return;
	}
	body.reasoning = { ...body.reasoning, effort };
}

function readNestedString(object: Record<string, unknown>, path: string[]): string | undefined {
	const value = readNestedValue(object, path);
	return typeof value === 'string' ? value : undefined;
}

function readNestedNumber(object: Record<string, unknown>, path: string[]): number | undefined {
	const value = readNestedValue(object, path);
	return typeof value === 'number' ? value : undefined;
}

function readNestedBoolean(object: Record<string, unknown>, path: string[]): boolean | undefined {
	const value = readNestedValue(object, path);
	return typeof value === 'boolean' ? value : undefined;
}

function readNestedValue(object: Record<string, unknown>, path: string[]): unknown {
	let current: unknown = object;
	for (const segment of path) {
		if (!isRecord(current)) {
			return undefined;
		}
		current = current[segment];
	}
	return current;
}

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
	const value = metadata?.[key];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function trim(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function isDefined<T>(value: T | undefined | null): value is T {
	return value !== undefined && value !== null;
}

function stringifyJson(value: unknown): string {
	try {
		return JSON.stringify(value) ?? '{}';
	} catch {
		return '{}';
	}
}

function stringifyUnknown(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

function dataUrlFromDataPart(part: vscode.LanguageModelDataPart): string {
	return `data:${part.mimeType};base64,${Buffer.from(part.data).toString('base64')}`;
}

function extensionFromMimeType(mimeType: string): string {
	const normalized = mimeType.toLowerCase().split(';', 1)[0].trim();
	const known: Record<string, string> = {
		'application/json': 'json',
		'application/pdf': 'pdf',
		'text/html': 'html',
		'text/markdown': 'md',
		'text/plain': 'txt',
		'image/gif': 'gif',
		'image/jpeg': 'jpg',
		'image/png': 'png',
		'image/webp': 'webp'
	};
	return known[normalized] ?? normalized.split('/').pop()?.replace(/[^a-z0-9.+-]/g, '') ?? 'bin';
}

function isSystemMessageRole(role: vscode.LanguageModelChatMessageRole): boolean {
	const systemRole = (vscode.LanguageModelChatMessageRole as unknown as Record<string, number>).System ?? 3;
	return role === systemRole;
}

function countNonSystemMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): number {
	return messages.filter((message) => !isSystemMessageRole(message.role)).length;
}

function encodeStatefulMarker(modelId: string, marker: string, connectionId?: string): Uint8Array {
	return new TextEncoder().encode(JSON.stringify({ modelId, marker, connectionId }));
}

function decodeStatefulMarker(data: Uint8Array): StatefulMarkerData | undefined {
	const decoded = new TextDecoder().decode(data);
	const parsed = safeJsonParse(decoded);
	if (isRecord(parsed)) {
		const modelId = stringValue(parsed.modelId);
		const marker = stringValue(parsed.marker);
		const connectionId = stringValue(parsed.connectionId);
		return modelId && marker ? { modelId, marker, connectionId } : undefined;
	}

	const separator = decoded.indexOf('\\');
	if (separator < 0) {
		return undefined;
	}
	const modelId = decoded.slice(0, separator);
	const marker = decoded.slice(separator + 1);
	return modelId && marker ? { modelId, marker } : undefined;
}

function getStatefulMarkerAndIndex(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	modelIds: readonly string[],
	expectedMarker?: string
): { marker: StatefulMarkerData; index: number } | undefined {
	const expectedModelIds = new Set(modelIds.filter((modelId) => modelId.length > 0));
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message.role !== vscode.LanguageModelChatMessageRole.Assistant) {
			continue;
		}
		for (const part of message.content) {
			if (!(part instanceof vscode.LanguageModelDataPart) || part.mimeType !== statefulMarkerMimeType) {
				continue;
			}
			const marker = decodeStatefulMarker(part.data);
			if (marker && expectedModelIds.has(marker.modelId) && (!expectedMarker || marker.marker === expectedMarker)) {
				return { marker, index };
			}
		}
	}
	return undefined;
}

function reportStatefulMarker(
	response: unknown,
	modelId: string,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	connectionId?: string
): void {
	const responseId = stringValue(asRecord(response)?.id);
	if (!responseId) {
		return;
	}
	progress.report(new vscode.LanguageModelDataPart(encodeStatefulMarker(modelId, responseId, connectionId), statefulMarkerMimeType));
}

function reportResponseStatefulMarker(
	response: unknown,
	modelId: string,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	options: ResponsesStatefulMarkerReportOptions
): void {
	if (!options.enabled) {
		return;
	}
	reportStatefulMarker(response, modelId, progress, options.connectionId);
}

function toLanguageModelThinkingPartLike(part: unknown): LanguageModelThinkingPartLike | undefined {
	if (!isRecord(part) || !('value' in part)) {
		return undefined;
	}

	const value = part.value;
	if (typeof value !== 'string' && !Array.isArray(value)) {
		return undefined;
	}

	const id = typeof part.id === 'string' ? part.id : undefined;
	const metadata = isRecord(part.metadata) ? part.metadata : undefined;
	return { value, id, metadata };
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function safeJsonParseObject(text: string): object {
	const value = safeJsonParse(text);
	return isRecord(value) ? value : {};
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return isRecord(value) ? value : undefined;
}

function findSseSeparator(text: string): number {
	const separators = ['\r\n\r\n', '\n\n', '\r\r'];
	const indexes = separators
		.map((separator) => text.indexOf(separator))
		.filter((index) => index >= 0);
	return indexes.length ? Math.min(...indexes) : -1;
}

function sseSeparatorLength(text: string, index: number): number {
	if (text.startsWith('\r\n\r\n', index)) {
		return 4;
	}
	return 2;
}

async function delay(ms: number, token: vscode.CancellationToken): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(resolve, ms);
		const cancellation = token.onCancellationRequested(() => {
			clearTimeout(timeout);
			cancellation.dispose();
			reject(new vscode.CancellationError());
		});
	});
}

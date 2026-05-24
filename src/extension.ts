import * as vscode from 'vscode';

const vendor = 'custom-openai-responses';
const configSection = 'copilotCustomProvider';
const secretPrefix = 'copilotCustomProvider.apiKey.';

type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

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
	reasoningEffort?: ReasoningEffort;
	temperature?: number;
	topP?: number;
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
	logRequests: boolean;
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
	readonly config: SelectedModelConfig;
}

interface ResponsesRequestBody {
	model: string;
	input: ResponsesInputMessage[];
	stream?: boolean;
	max_output_tokens?: number;
	reasoning?: {
		effort: ReasoningEffort;
	};
	temperature?: number;
	top_p?: number;
	tools?: ResponsesTool[];
	tool_choice?: 'auto' | 'required';
	[key: string]: unknown;
}

interface ResponsesInputMessage {
	role: 'user' | 'assistant';
	content: ResponsesContentPart[];
}

type ResponsesContentPart =
	| { type: 'input_text'; text: string }
	| { type: 'output_text'; text: string }
	| { type: 'input_image'; image_url: string }
	| { type: 'function_call'; call_id: string; name: string; arguments: string }
	| { type: 'function_call_output'; call_id: string; output: string };

interface ResponsesTool {
	type: 'function';
	name: string;
	description: string;
	parameters: object;
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
	private readonly disposables: vscode.Disposable[] = [this.onDidChangeEmitter];

	public readonly onDidChangeLanguageModelChatInformation = this.onDidChangeEmitter.event;

	public constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly output: vscode.OutputChannel
	) {}

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

		const requestUrl = resolveResponsesRequestUrl(model.config.model.baseUrl || profile.baseUrl);
		if (!requestUrl) {
			throw new Error(`Missing baseUrl for profile "${profile.id}".`);
		}
		if (profile.requireApiKey && !profile.apiKey) {
			throw new Error(`Missing API key for profile "${profile.id}". Run "Custom OpenAI Responses: Set API Key".`);
		}

		const body = buildResponsesRequestBody(model, profile, messages, options, config);
		const headers = buildHeaders(profile);
		const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

		if (config.logRequests) {
			this.output.appendLine(
				`[${requestId}] ${body.stream ? 'stream' : 'non-stream'} request profile=${profile.id} model=${body.model} url=${requestUrl}`
			);
		}

		const response = await fetchWithRetry(requestUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			timeoutMs: config.requestTimeoutMs,
			maxRetries: config.maxRetries,
			token
		});

		if (!response.ok) {
			throw new Error(await formatHttpError(response));
		}

		if (body.stream) {
			await readResponsesStream(response, progress, token);
		} else {
			const payload = await response.json() as unknown;
			reportNonStreamingResponse(payload, progress);
		}

		if (config.logRequests) {
			this.output.appendLine(`[${requestId}] completed status=${response.status}`);
		}
	}

	public async provideTokenCount(
		_model: CustomLanguageModel,
		text: string | vscode.LanguageModelChatRequestMessage,
		token: vscode.CancellationToken
	): Promise<number> {
		if (token.isCancellationRequested) {
			return 0;
		}

		const config = await readConfig(this.context);
		const charsPerToken = Math.max(1, config.tokenEstimateCharsPerToken);
		return Math.ceil(extractTextForTokenCount(text).length / charsPerToken);
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
		logRequests: config.get<boolean>('logRequests', false),
		requestBodyOverrides
	};
}

function getWorkspaceConfig(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration(configSection);
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
	const effort = normalizeReasoningEffort(model.reasoningEffort, config.defaultReasoningEffort);
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

	return {
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
			toolCalling: model.toolCalling ?? false
		},
		config: {
			profileId: profile.id,
			profileName: profile.name,
			providerModelId,
			model
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

function buildResponsesRequestBody(
	model: CustomLanguageModel,
	profile: ProviderProfileConfig,
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	options: vscode.ProvideLanguageModelChatResponseOptions,
	config: ExtensionConfig
): ResponsesRequestBody {
	const modelOptions = normalizeObject(options.modelOptions);
	const modelConfig = model.config.model;
	const effort = normalizeReasoningEffort(
		readNestedString(modelOptions, ['reasoningEffort']) ?? readNestedString(modelOptions, ['reasoning', 'effort']) ?? modelConfig.reasoningEffort,
		config.defaultReasoningEffort
	);
	const maxOutputTokens = normalizePositiveNumber(
		readNestedNumber(modelOptions, ['maxOutputTokens']) ?? readNestedNumber(modelOptions, ['max_output_tokens']) ?? modelConfig.maxOutputTokens,
		model.maxOutputTokens
	);

	const body: ResponsesRequestBody = {
		model: modelConfig.apiModel || modelConfig.id,
		input: messages.map(toResponsesInputMessage),
		stream: config.enableStreaming,
		max_output_tokens: maxOutputTokens,
		reasoning: { effort }
	};

	const temperature = readNestedNumber(modelOptions, ['temperature']) ?? modelConfig.temperature;
	if (typeof temperature === 'number') {
		body.temperature = temperature;
	}

	const topP = readNestedNumber(modelOptions, ['topP']) ?? readNestedNumber(modelOptions, ['top_p']) ?? modelConfig.topP;
	if (typeof topP === 'number') {
		body.top_p = topP;
	}

	if (modelConfig.toolCalling && options.tools?.length) {
		body.tools = options.tools.map(toResponsesTool);
		if (options.toolMode === vscode.LanguageModelChatToolMode.Required) {
			body.tool_choice = 'required';
		} else {
			body.tool_choice = 'auto';
		}
	}

	const bodyWithOverrides = mergeObjects(
		body,
		config.requestBodyOverrides,
		profile.requestBodyOverrides,
		normalizeObject(modelConfig.extraBody),
		sanitizeModelOptions(modelOptions)
	) as ResponsesRequestBody;

	return applyModelPatch(bodyWithOverrides, modelConfig.patch);
}

function toResponsesInputMessage(message: vscode.LanguageModelChatRequestMessage): ResponsesInputMessage {
	return {
		role: message.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' : 'user',
		content: message.content.flatMap((part) => toResponsesContentParts(message.role, part))
	};
}

function toResponsesContentParts(
	role: vscode.LanguageModelChatMessageRole,
	part: vscode.LanguageModelInputPart | unknown
): ResponsesContentPart[] {
	if (part instanceof vscode.LanguageModelTextPart) {
		return [
			{
				type: role === vscode.LanguageModelChatMessageRole.Assistant ? 'output_text' : 'input_text',
				text: part.value
			}
		];
	}

	if (part instanceof vscode.LanguageModelDataPart) {
		if (part.mimeType.startsWith('image/')) {
			const base64 = Buffer.from(part.data).toString('base64');
			return [
				{
					type: 'input_image',
					image_url: `data:${part.mimeType};base64,${base64}`
				}
			];
		}

		return [
			{
				type: role === vscode.LanguageModelChatMessageRole.Assistant ? 'output_text' : 'input_text',
				text: decodeDataPart(part)
			}
		];
	}

	if (part instanceof vscode.LanguageModelToolCallPart) {
		return [
			{
				type: 'function_call',
				call_id: part.callId,
				name: part.name,
				arguments: JSON.stringify(part.input ?? {})
			}
		];
	}

	if (part instanceof vscode.LanguageModelToolResultPart) {
		return [
			{
				type: 'function_call_output',
				call_id: part.callId,
				output: part.content.map(contentPartToText).join('\n')
			}
		];
	}

	return [
		{
			type: role === vscode.LanguageModelChatMessageRole.Assistant ? 'output_text' : 'input_text',
			text: stringifyUnknown(part)
		}
	];
}

function toResponsesTool(tool: vscode.LanguageModelChatTool): ResponsesTool {
	return {
		type: 'function',
		name: tool.name,
		description: tool.description,
		parameters: tool.inputSchema ?? { type: 'object', properties: {} }
	};
}

function buildHeaders(profile: ProviderProfileConfig): Record<string, string> {
	const headers: Record<string, string> = {
		'content-type': 'application/json',
		...profile.extraHeaders
	};

	if (profile.apiKey) {
		headers[profile.apiKeyHeader] = `${profile.apiKeyPrefix}${profile.apiKey}`;
	}

	return headers;
}

interface FetchOptions {
	method: 'POST';
	headers: Record<string, string>;
	body: string;
	timeoutMs: number;
	maxRetries: number;
	token: vscode.CancellationToken;
}

async function fetchWithRetry(requestUrl: string, options: FetchOptions): Promise<Response> {
	let lastError: unknown;

	for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
		if (options.token.isCancellationRequested) {
			throw new vscode.CancellationError();
		}

		try {
			return await fetchOnce(requestUrl, options);
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

async function fetchOnce(requestUrl: string, options: FetchOptions): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
	const cancellation = options.token.onCancellationRequested(() => controller.abort());

	try {
		return await fetch(requestUrl, {
			method: options.method,
			headers: options.headers,
			body: options.body,
			signal: controller.signal
		});
	} finally {
		clearTimeout(timeout);
		cancellation.dispose();
	}
}

async function readResponsesStream(
	response: Response,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	token: vscode.CancellationToken
): Promise<void> {
	if (!response.body) {
		throw new Error('Streaming response did not include a body.');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	const toolCalls = new Map<number, { callId?: string; name?: string; arguments: string }>();

	while (true) {
		if (token.isCancellationRequested) {
			await reader.cancel();
			throw new vscode.CancellationError();
		}

		const { done, value } = await reader.read();
		if (done) {
			break;
		}

		buffer += decoder.decode(value, { stream: true });
		let separatorIndex = findSseSeparator(buffer);
		while (separatorIndex >= 0) {
			const rawEvent = buffer.slice(0, separatorIndex);
			buffer = buffer.slice(separatorIndex + sseSeparatorLength(buffer, separatorIndex));
			handleSseEvent(rawEvent, progress, toolCalls);
			separatorIndex = findSseSeparator(buffer);
		}
	}

	if (buffer.trim().length > 0) {
		handleSseEvent(buffer, progress, toolCalls);
	}
}

function handleSseEvent(
	rawEvent: string,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	toolCalls: Map<number, { callId?: string; name?: string; arguments: string }>
): void {
	const dataLines = rawEvent
		.split(/\r?\n/)
		.filter((line) => line.startsWith('data:'))
		.map((line) => line.slice(5).trimStart());

	if (dataLines.length === 0) {
		return;
	}

	const data = dataLines.join('\n');
	if (data === '[DONE]') {
		return;
	}

	const event = safeJsonParse(data);
	if (!isRecord(event)) {
		return;
	}

	reportResponsesStreamEvent(event as ResponsesStreamEvent, progress, toolCalls);
}

function reportResponsesStreamEvent(
	event: ResponsesStreamEvent,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	toolCalls: Map<number, { callId?: string; name?: string; arguments: string }>
): void {
	switch (event.type) {
		case 'response.output_text.delta':
		case 'response.refusal.delta':
			if (typeof event.delta === 'string' && event.delta.length > 0) {
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
			reportToolCallDone(event, toolCalls, progress);
			break;
		default:
			break;
	}
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

function reportToolCallDone(
	event: ResponsesStreamEvent,
	toolCalls: Map<number, { callId?: string; name?: string; arguments: string }>,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>
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

	progress.report(new vscode.LanguageModelToolCallPart(callId, name, safeJsonParseObject(argsText)));
	toolCalls.delete(index);
}

function reportNonStreamingResponse(payload: unknown, progress: vscode.Progress<vscode.LanguageModelResponsePart>): void {
	for (const text of extractTextFromResponsesPayload(payload)) {
		progress.report(new vscode.LanguageModelTextPart(text));
	}
	for (const toolCall of extractToolCallsFromResponsesPayload(payload)) {
		progress.report(new vscode.LanguageModelToolCallPart(toolCall.callId, toolCall.name, toolCall.input));
	}
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
			const text = stringValue(contentRecord?.text);
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

async function formatHttpError(response: Response): Promise<string> {
	const text = await response.text();
	const details = text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
	return `Custom OpenAI Responses request failed: HTTP ${response.status} ${response.statusText}${details ? `\n${details}` : ''}`;
}

function extractTextForTokenCount(text: string | vscode.LanguageModelChatRequestMessage): string {
	if (typeof text === 'string') {
		return text;
	}

	return text.content.map(contentPartToText).join('\n');
}

function contentPartToText(part: vscode.LanguageModelInputPart | unknown): string {
	if (part instanceof vscode.LanguageModelTextPart) {
		return part.value;
	}

	if (part instanceof vscode.LanguageModelDataPart) {
		return decodeDataPart(part);
	}

	if (part instanceof vscode.LanguageModelToolCallPart) {
		return JSON.stringify({ tool_call: part.name, input: part.input });
	}

	if (part instanceof vscode.LanguageModelToolResultPart) {
		return JSON.stringify({ tool_result: part.callId, content: part.content.map(contentPartToText) });
	}

	return stringifyUnknown(part);
}

function decodeDataPart(part: vscode.LanguageModelDataPart): string {
	if (part.mimeType.startsWith('text/') || part.mimeType === 'application/json') {
		return new TextDecoder().decode(part.data);
	}

	return `[${part.mimeType} data, ${part.data.byteLength} bytes]`;
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
			apiKeyHeader: trim(profile.apiKeyHeader) || 'Authorization',
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
				reasoningEffort: normalizeReasoningEffort(model.reasoningEffort, 'medium'),
				extraBody: normalizeObject(model.extraBody),
				patch: normalizeModelPatch(model.patch)
			};
		});
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

function normalizeReasoningEffort(value: unknown, fallback: ReasoningEffort): ReasoningEffort {
	return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh'
		? value
		: fallback;
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

	try {
		const url = new URL(rawBaseUrl);
		const hasSubPath = url.pathname.length > 0 && url.pathname !== '/';
		if (hasSubPath) {
			return rawBaseUrl;
		}

		url.pathname = '/v1/responses';
		url.hash = '';
		return url.toString();
	} catch {
		return rawBaseUrl;
	}
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
	delete sanitized.maxOutputTokens;
	delete sanitized.topP;
	return sanitized;
}

function applyModelPatch(body: ResponsesRequestBody, patch: ModelPatchConfig | undefined): ResponsesRequestBody {
	if (patch?.dropTruncation) {
		delete body.truncation;
	}
	return body;
}

function readNestedString(object: Record<string, unknown>, path: string[]): string | undefined {
	const value = readNestedValue(object, path);
	return typeof value === 'string' ? value : undefined;
}

function readNestedNumber(object: Record<string, unknown>, path: string[]): number | undefined {
	const value = readNestedValue(object, path);
	return typeof value === 'number' ? value : undefined;
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

function trim(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function stringifyUnknown(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
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

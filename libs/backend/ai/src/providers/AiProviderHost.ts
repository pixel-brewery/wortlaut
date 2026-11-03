// #region Imports

import type { IFileSystem } from '@pixel-brewery/utilities';
import { installHintOf, type LocalAssistantId, type LocalAssistants } from '../assistants/LocalAssistants.js';
import { ChatGptResourceGeneratorStrategy } from '../generator/strategies/ChatGptResourceGeneratorStrategy.js';
import { GeminiResourceGeneratorStrategy } from '../generator/strategies/GeminiResourceGeneratorStrategy.js';
import type { IResourceGeneratorStrategy } from '../generator/strategies/interfaces/IResourceGeneratorStrategy.js';
import { LocalAssistantResourceGeneratorStrategy } from '../generator/strategies/LocalAssistantResourceGeneratorStrategy.js';
import { knownModels, listModels, testKey, type FetchLike, type IKeyTest, type KeyProviderId } from './KeyProviders.js';

// #endregion

/**
 * How long a state of a local assistant counts as known. Asking starts a process.
 */
const STATE_TTL_MS = 60_000;

/**
 * The true state of a provider: `ready` can start a run, and every other state says what is missing.
 *
 * @public
 */
export type AiProviderState = 'ready' | 'not-installed' | 'signed-out' | 'no-key' | 'unknown';

/**
 * A provider with its true state.
 *
 * @public
 */
export interface IAiProviderInfo {

    /**
     * What the command line calls it.
     */
    id: string;
    name: string;
    kind: 'local' | 'key';
    state: AiProviderState;

    /**
     * What the state means, in a sentence.
     */
    description: string;
}

/**
 * Where the keys of a surface come from: the keychain of the app or the environment of the command line.
 *
 * @public
 */
export interface IApiKeySource {
    get(provider: KeyProviderId): Promise<string | null>;
    has(provider: KeyProviderId): Promise<boolean>;
}

/**
 * What it takes to make a strategy of a provider.
 *
 * @public
 */
export interface IAiStrategyConfig {
    model: string;
    temperature: number;
    instructions?: string | Array<string>;
}

/**
 * A strategy, with what must stay out of everything a run stores.
 *
 * @public
 */
export interface IPreparedStrategy {
    strategy: IResourceGeneratorStrategy;
    secrets: ReadonlyArray<string>;
}

/**
 * What a surface knows about the providers. Engine and generator receive it, so they stay testable with a fake.
 *
 * @public
 */
export interface IAiProviderHost {
    list(): Promise<Array<IAiProviderInfo>>;

    /**
     * Returns a provider, and with `refresh` asks it anew. This starts no login.
     */
    get(id: string, refresh?: boolean): Promise<IAiProviderInfo>;
    prepare(id: string, config: IAiStrategyConfig): Promise<IPreparedStrategy>;
    models(id: string): Promise<Array<string>>;
    testKey(id: string): Promise<IKeyTest>;
    installHint(id: string): string;
    dispose(): Promise<void>;
}

/**
 * What a provider host is composed of.
 *
 * @public
 */
export interface IAiProviderHostInit {
    fileSystem: IFileSystem;
    local: LocalAssistants;
    keys: IApiKeySource;

    /**
     * Other addresses of the providers, such as a proxy of a company.
     */
    baseUrls?: Partial<Record<KeyProviderId, string>>;
    fetch?: FetchLike;
    now?: () => number;
}

/**
 * The providers, in the order the boards show them.
 */
const PROVIDERS: ReadonlyArray<{ id: string; name: string; kind: 'local' | 'key' }> = [
    { id: 'claude-code', name: 'Claude Code', kind: 'local' },
    { id: 'codex', name: 'Codex', kind: 'local' },
    { id: 'opencode', name: 'OpenCode', kind: 'local' },
    { id: 'openai', name: 'OpenAI', kind: 'key' },
    { id: 'google', name: 'Google Gemini', kind: 'key' }
];

/**
 * The names of a key provider on the command line.
 */
const KEY_PROVIDER_NAMES: Readonly<Record<string, KeyProviderId>> = { openai: 'openai', chatgpt: 'openai', google: 'google', gemini: 'google' };

/**
 * Returns whether a name is one of the local assistants.
 *
 * @public
 * @param id The name.
 * @returns `true` for a local assistant.
 */
export function isLocalAssistant(id: string): id is LocalAssistantId {
    return id === 'claude-code' || id === 'codex' || id === 'opencode';
}

/**
 * Returns the provider a name stands for: `chatgpt` is another name for `openai`, and `gemini` for `google`.
 *
 * @public
 * @param id The name.
 * @returns The id of the provider.
 */
export function canonicalProviderId(id: string): string {
    return KEY_PROVIDER_NAMES[id] ?? id;
}

/**
 * The one list of providers: their true state, how to make a strategy of one, and what a surface can do about one that is not
 * set up. Which assistants and which keys it works with is the choice of the surface that composes it.
 *
 * @public
 */
export class AiProviderHost implements IAiProviderHost {

    // #region Fields

    private readonly _init: IAiProviderHostInit;
    private readonly _states: Map<LocalAssistantId, { info: IAiProviderInfo; at: number }>;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `AiProviderHost` class.
     *
     * @public
     * @param init What the host is composed of.
     */
    public constructor(init: IAiProviderHostInit) {
        this._init = init;
        this._states = new Map();
    }

    // #endregion

    // #region Methods

    /**
     * @override
     */
    public list(): Promise<Array<IAiProviderInfo>> {
        return Promise.all(PROVIDERS.map(({ id }) => this.get(id)));
    }

    /**
     * @override
     */
    public async get(id: string, refresh = false): Promise<IAiProviderInfo> {
        const canonical = canonicalProviderId(id);
        const provider = PROVIDERS.find((candidate) => candidate.id === canonical);

        if (!provider) {
            throw new Error(`The provider '${id}' is not known.`);
        }

        return isLocalAssistant(canonical) ? this.localState(canonical, provider.name, refresh) : this.keyState(canonical as KeyProviderId, provider.name);
    }

    /**
     * @override
     */
    public async prepare(id: string, config: IAiStrategyConfig): Promise<IPreparedStrategy> {
        const canonical = canonicalProviderId(id);

        if (isLocalAssistant(canonical)) {
            return { strategy: new LocalAssistantResourceGeneratorStrategy(this._init.fileSystem, this._init.local.assistant(canonical), config.instructions), secrets: [] };
        }

        const provider = canonical as KeyProviderId;
        const apiKey = await this._init.keys.get(provider);

        if (!apiKey) {
            throw new Error(`No API key is set for ${PROVIDERS.find((candidate) => candidate.id === provider)?.name ?? provider}.`);
        }

        const strategyConfig = { apiKey, model: config.model, temperature: config.temperature, instructions: config.instructions ?? '', baseUrl: this._init.baseUrls?.[provider] };

        return {
            strategy: provider === 'openai' ? new ChatGptResourceGeneratorStrategy(this._init.fileSystem, strategyConfig) : new GeminiResourceGeneratorStrategy(this._init.fileSystem, strategyConfig),
            secrets: [apiKey]
        };
    }

    /**
     * @override
     */
    public async models(id: string): Promise<Array<string>> {
        const canonical = canonicalProviderId(id);

        if (isLocalAssistant(canonical)) {
            return [];
        }

        const provider = canonical as KeyProviderId;
        const apiKey = await this._init.keys.get(provider);

        return apiKey ? listModels({ provider, apiKey, baseUrl: this._init.baseUrls?.[provider], fetch: this._init.fetch }) : knownModels(provider);
    }

    /**
     * @override
     */
    public async testKey(id: string): Promise<IKeyTest> {
        const provider = canonicalProviderId(id) as KeyProviderId;
        const apiKey = await this._init.keys.get(provider);

        return apiKey ? testKey({ provider, apiKey, baseUrl: this._init.baseUrls?.[provider], fetch: this._init.fetch }) : { ok: false, message: 'No API key is set.' };
    }

    /**
     * @override
     */
    public installHint(id: string): string {
        return isLocalAssistant(id) ? installHintOf(id) : 'Create an API key in the account of the provider and enter it here. It goes to the system keychain and never into the project.';
    }

    /**
     * @override
     */
    public dispose(): Promise<void> {
        return this._init.local.dispose();
    }

    /**
     * @private
     */
    private async localState(id: LocalAssistantId, name: string, refresh: boolean): Promise<IAiProviderInfo> {
        const now = this._init.now?.() ?? Date.now();
        const known = this._states.get(id);

        if (!this._init.local.locate(id)) {
            return { id, name, kind: 'local', state: 'not-installed', description: 'Not installed' };
        }

        if (!refresh && known && now - known.at < STATE_TTL_MS) {
            return known.info;
        }

        const status = await this._init.local.status(id);
        const description = status.state === 'ready'
            ? 'Found on this computer · signed in'
            : status.state === 'signed-out'
                ? 'Found on this computer · not signed in'
                : status.state === 'not-installed' ? 'Not installed' : 'Found on this computer · the login could not be checked';
        const info: IAiProviderInfo = { id, name, kind: 'local', state: status.state, description };

        this._states.set(id, { info, at: now });

        return info;
    }

    /**
     * @private
     */
    private async keyState(id: KeyProviderId, name: string): Promise<IAiProviderInfo> {
        return await this._init.keys.has(id)
            ? { id, name, kind: 'key', state: 'ready', description: `${id === 'openai' ? 'gpt-4o-mini and other models' : 'Gemini models'}, with your API key.` }
            : { id, name, kind: 'key', state: 'no-key', description: `${id === 'openai' ? 'gpt-4o-mini and other models' : 'Gemini models'}, with your API key. No key is set.` };
    }

    // #endregion

}

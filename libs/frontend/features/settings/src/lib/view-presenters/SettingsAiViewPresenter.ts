// #region Imports

import { computed, inject, Injectable, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import type { AiDefaults, AiDefaultsChanges, AiProvider, AiProviderId, WriteOutcome } from '@pixel-brewery/wortlaut-contracts';
import { AsyncValue, DesktopApi, localeName, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * What the default provider field holds for none.
 */
const NO_DEFAULT = 'none';

/**
 * Says how a provider stands, for its badge.
 *
 * @param provider The provider.
 * @returns The label and the variant.
 */
export function describeProviderBadge(provider: Pick<AiProvider, 'state'>): { label: string; variant: 'success' | 'neutral' | 'warning' } {
    switch (provider.state) {
        case 'ready':
            return { label: 'Connected', variant: 'success' };
        case 'signed-out':
            return { label: 'Not signed in', variant: 'warning' };
        case 'unknown':
            return { label: 'Unknown', variant: 'warning' };
        default:
            return { label: 'Not set up', variant: 'neutral' };
    }
}

/**
 * Owns Settings: AI. Keys go to the keychain through main, and the renderer learns only whether one exists. The default provider
 * goes to the profile, and everything else to the configuration of the repository, as a change set.
 */
@Injectable()
export class SettingsAiViewPresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _shell = inject(ShellSession);
    private readonly _keys = signal<Readonly<Record<string, string>>>({});
    private readonly _tests = signal<Readonly<Record<string, { ok: boolean; message: string }>>>({});
    private readonly _hints = signal<Readonly<Record<string, string>>>({});
    private readonly _busyProvider = signal<string | null>(null);
    private readonly _providerMessage = signal<string | null>(null);
    private readonly _model = signal({ defaultProvider: NO_DEFAULT, model: '', temperature: '0.7', chunkSize: '10', limit: '', instructions: '' });
    private readonly _localeInstructions = signal<Readonly<Record<string, string>>>({});
    private readonly _safety = signal<AiDefaults['safety']>({ reviewBeforeWriting: true, protectPlaceholders: true, keepPartialResults: true, keepRawOutput: false });
    private readonly _outcome = signal<WriteOutcome | null>(null);
    private readonly _message = signal<string | null>(null);
    private readonly _busy = signal(false);
    private readonly _modelsOfProvider = signal<ReadonlyArray<string>>([]);

    // #endregion

    // #region Properties

    /**
     * Gets the providers with their true state.
     *
     * @readonly
     */
    public readonly providers = new AsyncValue<ReadonlyArray<AiProvider>>(() => this._api.request('ai.providers', {}));

    /**
     * Gets the saved values of the open project, or `null` without a project.
     *
     * @readonly
     */
    public readonly defaults = new AsyncValue<AiDefaults | null>(async () => {
        const project = this._shell.project();

        return project ? this._api.request('ai.defaults', { projectId: project.id }) : null;
    });

    /**
     * Gets the form of the plain values.
     *
     * @readonly
     */
    public readonly form = form(this._model);

    /**
     * Gets the local assistants.
     *
     * @readonly
     */
    public readonly assistants = computed(() => (this.providers.value() ?? []).filter((provider) => provider.kind === 'local').map((provider) => ({
        ...provider,
        badge: describeProviderBadge(provider),
        action: provider.state === 'not-installed' ? 'Show how to install' : 'Check login',
        hint: this._hints()[provider.id] ?? null,
        isBusy: this._busyProvider() === provider.id
    })));

    /**
     * Gets the providers that work with a key.
     *
     * @readonly
     */
    public readonly keyed = computed(() => (this.providers.value() ?? []).filter((provider) => provider.kind === 'key').map((provider) => {
        const typed = this._keys()[provider.id] ?? '';
        const hasKey = provider.state === 'ready';

        return {
            ...provider,
            badge: describeProviderBadge(provider),
            typed,
            hasKey,
            keyLabel: `${provider.name} API key`,
            placeholder: hasKey ? 'Saved' : 'Paste your API key',
            action: typed ? 'Set key' : 'Test connection',
            canAct: typed.length > 0 || hasKey,
            test: this._tests()[provider.id] ?? null,
            isBusy: this._busyProvider() === provider.id
        };
    }));

    /**
     * Gets why the last action on a provider failed.
     *
     * @readonly
     */
    public readonly providerMessage = this._providerMessage.asReadonly();

    /**
     * Gets the models of the default provider.
     *
     * @readonly
     */
    public readonly models = this._modelsOfProvider.asReadonly();

    /**
     * Gets whether the default provider is a local assistant, which uses its own model and temperature.
     *
     * @readonly
     */
    public readonly isLocalDefault = computed(() => {
        const provider = this.providers.value()?.find((candidate) => candidate.id === this._model().defaultProvider);

        return !provider || provider.kind === 'local';
    });

    /**
     * Gets the fields of the instructions per locale.
     *
     * @readonly
     */
    public readonly localeFields = computed(() => (this.defaults.value()?.locales ?? []).map((code) => ({ code, name: localeName(code), value: this._localeInstructions()[code] ?? '' })));

    /**
     * Gets the switches of the section Safety.
     *
     * @readonly
     */
    public readonly safety = this._safety.asReadonly();

    /**
     * Gets the file the values go to.
     *
     * @readonly
     */
    public readonly sourceFile = computed(() => this.defaults.value()?.sourceFile ?? '');

    /**
     * Gets what the last save did.
     *
     * @readonly
     */
    public readonly outcome = this._outcome.asReadonly();

    /**
     * Gets why the last save failed.
     *
     * @readonly
     */
    public readonly message = this._message.asReadonly();

    /**
     * Gets whether a save is going on.
     *
     * @readonly
     */
    public readonly busy = this._busy.asReadonly();

    /**
     * Gets what is wrong with the values.
     *
     * @readonly
     */
    public readonly error = computed(() => {
        const { temperature, chunkSize, limit } = this._model();
        const size = Number(chunkSize);
        const heat = Number(temperature);

        if (!Number.isInteger(size) || size < 1 || size > 100) {
            return 'A chunk holds 1 to 100 keys.';
        }

        if (Number.isNaN(heat) || heat < 0 || heat > 1) {
            return 'The temperature lies between 0.0 and 1.0.';
        }

        return limit.trim() && !(/^[1-9]\d*$/).test(limit.trim()) ? 'A limit is a whole number, or empty for no limit.' : null;
    });

    /**
     * Gets whether the values differ from what is saved.
     *
     * @readonly
     */
    public readonly isDirty = computed(() => {
        const saved = this.defaults.value();

        return saved !== null && (this._model().defaultProvider !== (saved.defaultProvider ?? NO_DEFAULT) || JSON.stringify(this.changesFrom(saved)) !== JSON.stringify(this.savedChanges(saved)));
    });

    /**
     * Gets whether the values can be saved.
     *
     * @readonly
     */
    public readonly canSave = computed(() => this.isDirty() && this.error() === null && !this._busy());

    // #endregion

    // #region Methods

    /**
     * Loads the view.
     *
     * @returns When it is loaded.
     */
    public async load(): Promise<void> {
        await Promise.all([this.providers.reload(), this.defaults.reload()]);
        this.discard();
    }

    /**
     * Asks a local assistant for its login, or shows how to install it. It starts no login and installs nothing.
     *
     * @param provider The provider.
     * @returns When the answer is there.
     */
    public async actOnAssistant(provider: AiProvider): Promise<void> {
        this._busyProvider.set(provider.id);
        this._providerMessage.set(null);

        try {
            if (provider.state === 'not-installed') {
                const { text } = await this._api.request('ai.installHint', { providerId: provider.id });

                this._hints.update((hints) => ({ ...hints, [provider.id]: text }));
            } else {
                const checked = await this._api.request('ai.checkLogin', { providerId: provider.id });

                this._hints.update((hints) => ({ ...hints, [provider.id]: checked.state === 'ready' ? 'Signed in.' : '' }));

                if (checked.state !== 'ready') {
                    const { text } = await this._api.request('ai.installHint', { providerId: provider.id });

                    this._hints.update((hints) => ({ ...hints, [provider.id]: text }));
                }

                await this.providers.reload();
            }
        } catch (error) {
            this._providerMessage.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._busyProvider.set(null);
        }
    }

    /**
     * Takes what the user typed as a key. It stays here until it goes to the keychain, and it is forgotten right after.
     *
     * @param providerId The provider.
     * @param key What was typed.
     */
    public typeKey(providerId: string, key: string): void {
        this._keys.update((keys) => ({ ...keys, [providerId]: key }));
    }

    /**
     * Sets the typed key, or tests the saved one.
     *
     * @param providerId The provider.
     * @returns When it is done.
     */
    public async actOnKey(providerId: 'openai' | 'google'): Promise<void> {
        const typed = (this._keys()[providerId] ?? '').trim();

        this._busyProvider.set(providerId);
        this._providerMessage.set(null);
        this._tests.update(({ [providerId]: _old, ...others }) => others);

        try {
            if (typed) {
                await this._api.request('ai.setKey', { providerId, key: typed });
                this._keys.update(({ [providerId]: _typed, ...others }) => others);
                await this.providers.reload();
            } else {
                const test = await this._api.request('ai.testKey', { providerId });

                this._tests.update((tests) => ({ ...tests, [providerId]: test }));
            }
        } catch (error) {
            this._providerMessage.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._busyProvider.set(null);
        }
    }

    /**
     * Removes a key from the keychain.
     *
     * @param providerId The provider.
     * @returns When it is done.
     */
    public async clearKey(providerId: 'openai' | 'google'): Promise<void> {
        this._busyProvider.set(providerId);
        this._providerMessage.set(null);
        this._tests.update(({ [providerId]: _old, ...others }) => others);

        try {
            await this._api.request('ai.clearKey', { providerId });
            await this.providers.reload();
        } catch (error) {
            this._providerMessage.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._busyProvider.set(null);
        }
    }

    /**
     * Sets the instructions of a locale.
     *
     * @param code The locale.
     * @param text The instructions.
     */
    public setLocaleInstructions(code: string, text: string): void {
        this._localeInstructions.update((current) => ({ ...current, [code]: text }));
    }

    /**
     * Sets a switch of the section Safety.
     *
     * @param name The switch.
     * @param value The new value.
     */
    public setSafety(name: keyof AiDefaults['safety'], value: boolean): void {
        this._safety.update((safety) => ({ ...safety, [name]: value }));
    }

    /**
     * Goes back to what is saved.
     */
    public discard(): void {
        const saved = this.defaults.value();

        if (saved) {
            this._model.set({
                defaultProvider: saved.defaultProvider ?? NO_DEFAULT,
                model: saved.model,
                temperature: String(saved.temperature),
                chunkSize: String(saved.chunkSize),
                limit: saved.limit === null ? '' : String(saved.limit),
                instructions: saved.instructions
            });
            this._localeInstructions.set(saved.localeInstructions);
            this._safety.set(saved.safety);
            void this.loadModels();
        }

        this._outcome.set(null);
        this._message.set(null);
    }

    /**
     * Saves: the default provider to the profile, and the rest as one change set for the repository.
     *
     * @returns When it is done.
     */
    public async save(): Promise<void> {
        const project = this._shell.project();
        const saved = this.defaults.value();

        if (!project || !saved || !this.canSave()) {
            return;
        }

        const provider = this._model().defaultProvider;

        this._busy.set(true);
        this._message.set(null);
        this._outcome.set(null);

        try {
            if (provider !== (saved.defaultProvider ?? NO_DEFAULT)) {
                await this._api.request('ai.setDefaultProvider', { providerId: provider === NO_DEFAULT ? null : provider as AiProviderId });
                await this._shell.refresh();
            }

            this._outcome.set(await this._api.request('ai.saveDefaults', { projectId: project.id, changes: this.changesFrom(saved) }));
            await this.defaults.reload();
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._busy.set(false);
        }
    }

    /**
     * Lists the models of the default provider.
     *
     * @returns When they are known.
     */
    public async loadModels(): Promise<void> {
        const provider = this._model().defaultProvider;

        this._modelsOfProvider.set(provider === NO_DEFAULT ? [] : (await this._api.request('ai.models', { providerId: provider as AiProviderId })).models);
    }

    /**
     * @private
     */
    private changesFrom(saved: AiDefaults): AiDefaultsChanges {
        const { model, temperature, chunkSize, limit, instructions } = this._model();

        return {
            model: this.isLocalDefault() ? saved.model : model,
            temperature: this.isLocalDefault() ? saved.temperature : Number(temperature),
            chunkSize: Number(chunkSize),
            limit: limit.trim() ? Number(limit) : null,
            instructions,
            localeInstructions: Object.fromEntries(Object.entries(this._localeInstructions()).filter(([, text]) => text.trim().length > 0)),
            safety: this._safety()
        };
    }

    /**
     * @private
     */
    private savedChanges(saved: AiDefaults): AiDefaultsChanges {
        return {
            model: saved.model,
            temperature: saved.temperature,
            chunkSize: saved.chunkSize,
            limit: saved.limit,
            instructions: saved.instructions,
            localeInstructions: saved.localeInstructions,
            safety: saved.safety
        };
    }

    // #endregion

}

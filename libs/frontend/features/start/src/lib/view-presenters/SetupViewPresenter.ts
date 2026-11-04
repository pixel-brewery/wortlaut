// #region Imports

import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { form, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import type { AiProviderId, ProjectInspection, WorkspaceColor } from '@pixel-brewery/wortlaut-contracts';
import { describeProviderState, AsyncValue, CONTENT_LANGUAGE_CODES, countOf, DesktopApi, localeName, presetName, workspaceCodeOf } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * The step of the setup. The folder was chosen before this view.
 */
export type SetupStep = 'catalogs' | 'locales' | 'ai';

/**
 * The value of the workspace select that stands for a new workspace.
 */
export const NEW_WORKSPACE = 'new';

/**
 * The presets a project can choose.
 */
export const PRESETS = ['angular', 'lit', 'react', 'stencil', 'vue'] as const;

/**
 * The steps of the rail in their order.
 */
const STEPS: ReadonlyArray<{ id: SetupStep | 'folder'; label: string; description: string }> = [
    { id: 'folder', label: 'Folder', description: 'Your repository' },
    { id: 'catalogs', label: 'Catalogs', description: 'Source and translation files' },
    { id: 'locales', label: 'Locales', description: 'Base and target languages' },
    { id: 'ai', label: 'AI provider', description: 'An optional connection' }
];

/**
 * A target locale to choose, with its true state.
 */
export interface ILocaleChoice {
    code: string;
    name: string;
    note: string;
    isChecked: boolean;
}

/**
 * Owns Project setup: what was found in the folder, the choices and the registration. Finishing keeps the choices in the
 * user's profile, and for a project without a configuration of its own proposes `wortlaut.config.json` as a change set.
 */
@Injectable()
export class SetupViewPresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    private readonly _folderToken = this._route.snapshot.queryParamMap.get('folder');
    private readonly _preselected = this._route.snapshot.queryParamMap.get('workspace');
    private readonly _step = signal<SetupStep>('catalogs');
    private readonly _catalogFolders = signal<ReadonlyArray<string>>([]);
    private readonly _sourceRootToken = signal<string | null>(null);
    private readonly _choosingSourceRoot = signal(false);
    private readonly _targets = signal<ReadonlySet<string> | null>(null);
    private readonly _message = signal<string | null>(null);
    private readonly _busy = signal(false);
    private readonly _aiProvider = signal<AiProviderId | null>(null);
    private readonly _aiKey = signal('');
    private readonly _model = signal({ workspace: '', preset: '', baseLocale: '', newName: '' });
    private readonly _color: WorkspaceColor = 'teal';
    private readonly _dryRun = signal(true);
    private _chosenPreset: string | null = null;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `SetupViewPresenter` class.
     */
    public constructor() {
        // The source root follows the preset, so a preset the user picks means another look at the folder.
        effect(() => {
            const { preset } = this._model();

            untracked(() => {
                if (preset && this.inspection.value() && preset !== this.inspection.value()?.preset.value) {
                    this._chosenPreset = preset;
                    void this.inspection.reload();
                }
            });
        });
    }

    // #endregion

    // #region Properties

    /**
     * Gets what was found in the folder.
     *
     * @readonly
     */
    public readonly inspection = new AsyncValue<ProjectInspection>(async () => {
        if (!this._folderToken) {
            throw new Error('No folder was chosen. Go back and choose one.');
        }

        const inspection = await this._api.request('project.inspectFolder', { folderToken: this._folderToken, catalogFolderTokens: [...this._catalogFolders()], sourceRootToken: this._sourceRootToken(), preset: this._chosenPreset as ProjectInspection['preset']['value'] });

        this.adoptInspection(inspection);

        return inspection;
    });

    /**
     * Gets the workspaces a project can be added to.
     *
     * @readonly
     */
    public readonly workspaces = new AsyncValue(() => this._api.request('workspace.list', {}));

    /**
     * Gets the AI providers with their true state.
     *
     * @readonly
     */
    public readonly providers = new AsyncValue(() => this._api.request('ai.providers', {}));

    /**
     * Gets the providers as the step shows them, each with its true state.
     *
     * @readonly
     */
    public readonly providerChoices = computed(() => (this.providers.value() ?? []).map((provider) => ({ ...provider, note: describeProviderState(provider), isChecked: provider.id === this._aiProvider() })));

    /**
     * Gets whether the chosen provider asks for a key.
     *
     * @readonly
     */
    public readonly needsKey = computed(() => this.providers.value()?.find((provider) => provider.id === this._aiProvider())?.kind === 'key');

    /**
     * Gets what the user has typed as a key. It stays in this view until it goes to the keychain.
     *
     * @readonly
     */
    public readonly aiKey = computed(() => this._aiKey());

    /**
     * Gets what the chosen provider lacks.
     *
     * @readonly
     */
    public readonly providerHint = computed(() => {
        const provider = this.providers.value()?.find((candidate) => candidate.id === this._aiProvider());

        return provider && provider.kind === 'local' && provider.state !== 'ready' ? `${provider.name}: ${provider.description}. Wortlaut installs nothing and starts no login, so sign in with the tool itself. You can choose it now and use it later.` : null;
    });

    /**
     * Gets the form of the choices.
     *
     * @readonly
     */
    public readonly form = form(this._model, (schema) => {
        required(schema.workspace);
        required(schema.baseLocale);
    });

    /**
     * Gets the current step.
     *
     * @readonly
     */
    public readonly step = this._step.asReadonly();

    /**
     * Gets the current step number, including the folder selected before setup.
     *
     * @readonly
     */
    public readonly stepNumber = computed(() => STEPS.findIndex((step) => step.id === this._step()) + 1);

    /**
     * Gets whether the native source-folder dialog is active.
     *
     * @readonly
     */
    public readonly choosingSourceRoot = this._choosingSourceRoot.asReadonly();

    /**
     * Gets the presets with their names.
     *
     * @readonly
     */
    public readonly presets = PRESETS.map((id) => ({ id, name: presetName(id) }));

    /**
     * Gets the steps of the rail with their states.
     *
     * @readonly
     */
    public readonly steps = computed(() => {
        const current = STEPS.findIndex((step) => step.id === this._step());

        return STEPS.map((step, index) => ({
            ...step,
            number: index + 1,
            isDone: index < current,
            isCurrent: index === current
        }));
    });

    /**
     * Gets the title of the step.
     *
     * @readonly
     */
    public readonly title = computed(() => {
        switch (this._step()) {
            case 'catalogs':
                return (this.inspection.value()?.catalogs.length ?? 0) > 0 ? 'We found your catalogs' : 'No catalogs found';
            case 'locales':
                return 'Choose your locales';
            default:
                return 'Connect AI';
        }
    });

    /**
     * Gets the lead of the step.
     *
     * @readonly
     */
    public readonly lead = computed(() => {
        const inspection = this.inspection.value();

        switch (this._step()) {
            case 'catalogs':
                return (inspection?.catalogs.length ?? 0) > 0
                    ? `Check what Wortlaut found in ${inspection?.displayPath}. You can change everything later.`
                    : `Wortlaut found no catalog files in ${inspection?.displayPath ?? 'this folder'}. You can add a folder, or continue and add them later.`;
            case 'locales': {
                const existing = inspection?.locales.filter((locale) => locale.code !== this._model().baseLocale).map((locale) => localeName(locale.code)) ?? [];

                return existing.length > 0
                    ? `${existing.join(', ')} already ${existing.length === 1 ? 'exists' : 'exist'}. New locales start empty and create no file yet.`
                    : 'New locales start empty and create no file yet.';
            }
            default:
                return 'Only Generate and the AI suggestions need a provider. Everything else works without one.';
        }
    });

    /**
     * Gets whether the project goes into a new workspace.
     *
     * @readonly
     */
    public readonly isNewWorkspace = computed(() => this._model().workspace === NEW_WORKSPACE);

    /**
     * Gets the base locale choices.
     *
     * @readonly
     */
    public readonly baseLocales = computed(() => {
        const found = this.inspection.value()?.locales.map((locale) => locale.code) ?? [];
        const current = this._model().baseLocale;
        const codes = Array.from(new Set([...CONTENT_LANGUAGE_CODES, ...found, ...current ? [current] : []]));

        return codes.map((code) => ({ code, label: `${localeName(code)} (${code})` })).sort((a, b) => a.label.localeCompare(b.label, 'en'));
    });

    /**
     * Gets the target locale chips, each marked as existing or new.
     *
     * @readonly
     */
    public readonly localeChoices = computed<Array<ILocaleChoice>>(() => {
        const inspection = this.inspection.value();
        const base = this._model().baseLocale;
        const targets = this._targets() ?? new Set<string>();
        const existing = new Map((inspection?.locales ?? []).map((locale) => [locale.code, locale]));
        const codes = new Set([...existing.keys(), ...(inspection?.suggestedLocales ?? []), ...targets]);

        return [...codes].filter((code) => code !== base).map((code) => ({
            code,
            name: localeName(code),
            note: existing.has(code) ? `Exists, ${countOf(existing.get(code)?.keys ?? 0, 'key')}` : 'New',
            isChecked: targets.has(code)
        }));
    });

    /**
     * Gets the locales that the add-language dialog must not offer again.
     *
     * @readonly
     */
    public readonly localePickerExcludedCodes = computed(() => [this._model().baseLocale, ...this._targets() ?? []]);

    /**
     * Gets the selected target count, with the base locale excluded.
     *
     * @readonly
     */
    public readonly targetLocaleCount = computed(() => this.localeChoices().filter((locale) => locale.isChecked).length);

    /**
     * Gets whether a request is running.
     *
     * @readonly
     */
    public readonly busy = this._busy.asReadonly();

    /**
     * Gets what went wrong with a folder or the registration.
     *
     * @readonly
     */
    public readonly message = this._message.asReadonly();

    /**
     * Gets whether the setup can finish.
     *
     * @readonly
     */
    public readonly canFinish = computed(() => {
        const model = this._model();

        return !this._busy() && !this._choosingSourceRoot() && !this.inspection.isLoading() && !this.inspection.isFailed() && this.inspection.value() !== null && model.workspace.length > 0 && model.baseLocale.length > 0 && (model.workspace !== NEW_WORKSPACE || workspaceCodeOf(model.newName).length > 0);
    });

    /**
     * Gets the value of the select that stands for a new workspace.
     *
     * @readonly
     */
    public readonly newWorkspaceValue = NEW_WORKSPACE;

    /**
     * Gets what finishing does to the repository, or `null` for a project that brings its configuration.
     *
     * @readonly
     */
    public readonly writeNote = computed(() => {
        if (this.inspection.value()?.configuration) {
            return null;
        }

        return this._dryRun()
            ? { variant: 'info', header: 'Dry run is on', content: 'wortlaut.config.json waits in Review until you turn off dry run in the title bar. Nothing is written to your repository.' }
            : { variant: 'info', header: 'Finishing writes wortlaut.config.json', content: 'The file holds these choices, so the CLI and Nx read the same values. Your repository gets a normal diff.' };
    });

    // #endregion

    // #region Methods

    /**
     * Loads what the view shows.
     *
     * @returns When it is loaded.
     */
    public async load(): Promise<void> {
        const [state] = await Promise.all([this._api.request('shell.state', {}), this.workspaces.reload(), this.providers.reload()]);

        this._dryRun.set(state.dryRun);
        await this.inspection.reload();
    }

    /**
     * Sets whether a locale is a target. Setting what is already set changes nothing, because a chip also reports the
     * state it was bound to.
     *
     * @param code The locale.
     * @param isTarget Whether it is a target.
     */
    public setLocale(code: string, isTarget: boolean): void {
        if (code === this._model().baseLocale) {
            return;
        }

        const targets = this._targets() ?? new Set<string>();

        if (targets.has(code) !== isTarget) {
            const next = new Set(targets);

            if (isTarget) {
                next.add(code);
            } else {
                next.delete(code);
            }

            this._targets.set(next);
        }
    }

    /**
     * Adds languages chosen in the language dialog without duplicating existing targets.
     *
     * @param codes The selected language codes.
     */
    public addLocales(codes: readonly string[]): void {
        for (const code of codes) {
            if (CONTENT_LANGUAGE_CODES.some((language) => language === code)) {
                this.setLocale(code, true);
            }
        }
    }

    /**
     * Chooses a source folder through main. The renderer retains only its opaque grant.
     *
     * @returns When the chosen folder has been inspected, or the dialog was cancelled.
     */
    public async chooseSourceRoot(): Promise<void> {
        if (!this._folderToken || this.inspection.value()?.configuration || this._choosingSourceRoot() || this._busy()) {
            return;
        }

        this._choosingSourceRoot.set(true);
        this._message.set(null);

        try {
            const { folder } = await this._api.request('dialog.chooseFolder', { insideToken: this._folderToken });

            if (folder) {
                this._sourceRootToken.set(folder.token);
                await this.inspection.reload();
            }
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._choosingSourceRoot.set(false);
        }
    }

    /**
     * Adds a further folder with catalogs, which must lie inside the project.
     *
     * @returns When it is done.
     */
    public async addCatalogFolder(): Promise<void> {
        this._message.set(null);

        try {
            const { folder } = await this._api.request('dialog.chooseFolder', { insideToken: this._folderToken });

            if (folder) {
                this._catalogFolders.update((folders) => [...folders, folder.token]);
                await this.inspection.reload();
            }
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Goes to the next step.
     */
    public next(): void {
        if (!this.canFinish()) {
            return;
        }

        this._step.set(this._step() === 'catalogs' ? 'locales' : 'ai');
    }

    /**
     * Opens a setup step from the rail. Folder selection stays on the preceding screen.
     *
     * @param index The zero-based rail index.
     */
    public goToStep(index: number): void {
        const step = STEPS[index];

        if (step && step.id !== 'folder' && !this._busy() && !this._choosingSourceRoot()) {
            this._step.set(step.id);
        }
    }

    /**
     * Goes back a step, or on the first step to the screen that chose the folder.
     *
     * @returns When it is done.
     */
    public async back(): Promise<void> {
        switch (this._step()) {
            case 'ai':
                this._step.set('locales');
                break;
            case 'locales':
                this._step.set('catalogs');
                break;
            default:
                await this._router.navigate([this._preselected ? '/workspaces' : '/welcome']);
        }
    }

    /**
     * Chooses a provider.
     *
     * @param provider The provider.
     */
    public pickProvider(provider: AiProviderId): void {
        this._aiProvider.set(provider);
    }

    /**
     * Keeps keyboard deselection consistent with the connection that finishing would save.
     * A deselection emitted while another provider is selected must not clear the new choice.
     *
     * @param provider The provider that became unchecked.
     */
    public deselectProvider(provider: AiProviderId): void {
        if (this._aiProvider() === provider) {
            this._aiProvider.set(null);
        }
    }

    /**
     * Takes what the user typed as a key.
     *
     * @param key The key.
     */
    public typeKey(key: string): void {
        this._aiKey.set(key);
    }

    /**
     * Registers the project in the user's profile and opens it.
     *
     * @returns When it is done.
     */
    public async finish(skipAi = false): Promise<void> {
        if (!this.canFinish() || !this._folderToken) {
            return;
        }

        const model = this._model();

        this._busy.set(true);
        this._message.set(null);

        try {
            await this._api.request('project.register', {
                folderToken: this._folderToken,
                catalogFolderTokens: [...this._catalogFolders()],
                sourceRootToken: this._sourceRootToken(),
                workspace: model.workspace === NEW_WORKSPACE
                    ? { kind: 'new', name: model.newName, code: workspaceCodeOf(model.newName), color: this._color }
                    : { kind: 'existing', id: model.workspace },
                preset: (model.preset || null) as ProjectInspection['preset']['value'],
                baseLocale: model.baseLocale,
                targetLocales: Array.from(this._targets() ?? []).filter((code) => code !== model.baseLocale)
            });

            if (!skipAi) {
                await this.saveProvider();
            }

            await this._router.navigate(['/overview']);
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._busy.set(false);
        }
    }

    /**
     * The key goes to the keychain and the choice to the profile. Neither reaches the project.
     *
     * @private
     */
    private async saveProvider(): Promise<void> {
        const provider = this._aiProvider();
        const key = this._aiKey().trim();
        const chosen = this.providers.value()?.find((candidate) => candidate.id === provider);

        if (!provider || !chosen) {
            return;
        }

        if (chosen.kind === 'key' && key) {
            await this._api.request('ai.setKey', { providerId: provider as 'openai' | 'google', key });
        }

        await this._api.request('ai.setDefaultProvider', { providerId: provider });
    }

    /**
     * Fills in the choices the first time, and keeps what the user changed afterwards.
     *
     * @private
     */
    private adoptInspection(inspection: ProjectInspection): void {
        if (this._targets() === null) {
            this._targets.set(new Set(inspection.locales.map((locale) => locale.code).filter((code) => code !== inspection.baseLocale)));
        }

        this._model.update((model) => ({
            workspace: model.workspace || this.chooseWorkspace(),
            preset: model.preset || (inspection.preset.value ?? ''),
            baseLocale: model.baseLocale || inspection.baseLocale,
            newName: model.newName || inspection.name
        }));
    }

    /**
     * @private
     */
    private chooseWorkspace(): string {
        const workspaces = this.workspaces.value() ?? [];

        return this._preselected && workspaces.some((workspace) => workspace.id === this._preselected)
            ? this._preselected
            : workspaces[0]?.id ?? NEW_WORKSPACE;
    }

    // #endregion

}

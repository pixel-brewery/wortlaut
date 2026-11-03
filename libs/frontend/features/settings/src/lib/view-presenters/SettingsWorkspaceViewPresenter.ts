// #region Imports

import { computed, inject, Injectable, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { Router } from '@angular/router';
import type { WorkspaceColor, WorkspaceDetail, WorkspaceImportPreview, WorkspaceImportResult } from '@pixel-brewery/wortlaut-contracts';
import { AsyncValue, countOf, DesktopApi, presetName, ShellSession, WORKSPACE_COLORS } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * The presets a workspace can start new projects from.
 */
const PRESETS = ['angular', 'lit', 'react', 'stencil', 'vue'] as const;

/**
 * What a short code looks like.
 */
const CODE = /^[\p{Lu}\p{Nd}]{1,3}$/u;

/**
 * Says what became of a pack of an imported file.
 *
 * @param pack The pack.
 * @returns The text.
 */
export function describePackImport(pack: WorkspaceImportResult['packs'][number]): string {
    const words = { pinned: 'already pinned', written: 'pinned', pending: 'waits in Review', skipped: 'not added', refused: 'refused' };

    return pack.detail ? `${words[pack.state]}. ${pack.detail}` : words[pack.state];
}

/**
 * Owns Settings: workspace. Its values live in the user's profile, so saving touches no repository. New projects start from
 * the shared defaults, which never join the resolution of a project's configuration.
 */
@Injectable()
export class SettingsWorkspaceViewPresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _shell = inject(ShellSession);
    private readonly _router = inject(Router);
    private readonly _model = signal({ name: '', code: '', baseLocale: '', preset: '', targetLocales: '' });
    private readonly _color = signal<WorkspaceColor>('teal');
    private readonly _scan = signal(true);
    private readonly _removed = signal<ReadonlySet<number>>(new Set());
    private readonly _added = signal<ReadonlyArray<{ token: string; displayPath: string }>>([]);
    private readonly _message = signal<string | null>(null);
    private readonly _saved = signal(false);
    private readonly _busy = signal(false);
    private readonly _confirmingRemove = signal(false);
    private readonly _exported = signal<string | null>(null);
    private readonly _importPreview = signal<WorkspaceImportPreview | null>(null);
    private readonly _importFolders = signal<Readonly<Record<number, { token: string; displayPath: string }>>>({});
    private readonly _importResult = signal<WorkspaceImportResult | null>(null);
    private readonly _importing = signal(false);
    private readonly _importMessage = signal<string | null>(null);

    // #endregion

    // #region Properties

    /**
     * Gets the open workspace.
     *
     * @readonly
     */
    public readonly workspace = new AsyncValue<WorkspaceDetail>(() => {
        const workspace = this._shell.workspace();

        if (!workspace) {
            throw new Error('No workspace is open.');
        }

        return this._api.request('workspace.get', { workspaceId: workspace.id });
    });

    /**
     * Gets the form of the values.
     *
     * @readonly
     */
    public readonly form = form(this._model);

    /**
     * Gets the presets with their names.
     *
     * @readonly
     */
    public readonly presets = PRESETS.map((id) => ({ id, name: presetName(id) }));

    /**
     * Gets the colors with the workspace's one.
     *
     * @readonly
     */
    public readonly colors = computed(() => WORKSPACE_COLORS.map((color) => ({ ...color, isChecked: color.id === this._color() })));

    /**
     * Gets whether the scan for projects is on.
     *
     * @readonly
     */
    public readonly scanForProjects = this._scan.asReadonly();

    /**
     * Gets the repositories to show.
     *
     * @readonly
     */
    public readonly repositories = computed(() => [
        ...(this.workspace.value()?.repositories ?? []).flatMap((repository, index) => this._removed().has(index) ? [] : [{ id: `existing-${index}`, label: repository.displayPath, missing: repository.missing, index, token: null }]),
        ...this._added().map((folder) => ({ id: folder.token, label: folder.displayPath, missing: false, index: -1, token: folder.token }))
    ]);

    /**
     * Gets the AI assistant for showing.
     *
     * @readonly
     */
    public readonly provider = computed(() => this.workspace.value()?.defaults.provider ?? 'Not set up');

    /**
     * Gets the rule packs for showing.
     *
     * @readonly
     */
    public readonly rulePacks = computed(() => {
        const count = this.workspace.value()?.rulePackCount ?? 0;

        return count === 0 ? 'No packs enabled' : `${countOf(count, 'pack')} enabled`;
    });

    /**
     * Gets why the short code cannot be saved.
     *
     * @readonly
     */
    public readonly codeError = computed(() => CODE.test(this._model().code) ? null : 'One to three capital letters or digits.');

    /**
     * Gets whether anything changed.
     *
     * @readonly
     */
    public readonly isDirty = computed(() => {
        const workspace = this.workspace.value();
        const model = this._model();

        return workspace !== null && (
            model.name !== workspace.name ||
            model.code !== workspace.code ||
            this._color() !== workspace.color ||
            this._scan() !== workspace.scanForProjects ||
            model.baseLocale !== (workspace.defaults.baseLocale ?? '') ||
            model.preset !== (workspace.defaults.preset ?? '') ||
            model.targetLocales !== workspace.defaults.targetLocales.join(', ') ||
            this._removed().size > 0 ||
            this._added().length > 0
        );
    });

    /**
     * Gets whether the values can be saved.
     *
     * @readonly
     */
    public readonly canSave = computed(() => this.isDirty() && this.codeError() === null && this._model().name.trim().length > 0 && !this._busy());

    /**
     * Gets why the last action failed.
     *
     * @readonly
     */
    public readonly message = this._message.asReadonly();

    /**
     * Gets whether the last save went through.
     *
     * @readonly
     */
    public readonly saved = this._saved.asReadonly();

    /**
     * Gets whether a save is going on.
     *
     * @readonly
     */
    public readonly busy = this._busy.asReadonly();

    /**
     * Gets whether the question about removing the workspace is open.
     *
     * @readonly
     */
    public readonly confirmingRemove = this._confirmingRemove.asReadonly();

    /**
     * Gets where the last export went.
     *
     * @readonly
     */
    public readonly exported = this._exported.asReadonly();

    /**
     * Gets what a checked file would add, while the question is open.
     *
     * @readonly
     */
    public readonly importPreview = this._importPreview.asReadonly();

    /**
     * Gets the repositories of the file with the folders chosen for them.
     *
     * @readonly
     */
    public readonly importRepositories = computed(() => (this._importPreview()?.repositories ?? []).map((repository, index) => ({ index, name: repository.name, folder: this._importFolders()[index]?.displayPath ?? null })));

    /**
     * Gets what the file holds besides its repositories and packs, as it reads.
     *
     * @readonly
     */
    public readonly importFacts = computed(() => {
        const preview = this._importPreview();

        if (!preview) {
            return [];
        }

        return [
            { label: 'Short code', value: preview.code },
            { label: 'Base locale', value: preview.defaults.baseLocale ?? 'Not set' },
            { label: 'Target locales', value: preview.defaults.targetLocales.join(', ') || 'None' },
            { label: 'Framework preset', value: preview.defaults.preset ? presetName(preview.defaults.preset) : 'Not set' },
            { label: 'Scan for projects', value: preview.scanForProjects ? 'On' : 'Off' }
        ];
    });

    /**
     * Gets whether the file is being added.
     *
     * @readonly
     */
    public readonly importing = this._importing.asReadonly();

    /**
     * Gets why the file could not be read or added.
     *
     * @readonly
     */
    public readonly importMessage = this._importMessage.asReadonly();

    /**
     * Gets what the last import did.
     *
     * @readonly
     */
    public readonly importResult = this._importResult.asReadonly();

    /**
     * Gets what the last import did, one line per pack.
     *
     * @readonly
     */
    public readonly importResultLines = computed(() => (this._importResult()?.packs ?? []).map((pack) => `${pack.name}: ${describePackImport(pack)}`));

    // #endregion

    // #region Methods

    /**
     * Saves the settings and the pinned packs of the workspace to a file of the user's choice. Keys and logins stay here.
     *
     * @returns When it is done.
     */
    public async exportWorkspace(): Promise<void> {
        const workspace = this.workspace.value();

        if (!workspace) {
            return;
        }

        this._message.set(null);
        this._exported.set(null);

        try {
            this._exported.set((await this._api.request('workspace.export', { workspaceId: workspace.id })).file);
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Asks for a file, checks it in main and shows what it would add. Nothing changes yet.
     *
     * @returns When the question is open.
     */
    public async chooseImport(): Promise<void> {
        this._message.set(null);
        this._importResult.set(null);
        this._importMessage.set(null);

        try {
            const { preview } = await this._api.request('workspace.chooseImport', {});

            this._importFolders.set({});
            this._importPreview.set(preview);
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Chooses the folder of a repository of the file, through a native dialog. The file itself names no path.
     *
     * @param index The repository.
     * @returns When it is done.
     */
    public async chooseImportFolder(index: number): Promise<void> {
        this._importMessage.set(null);

        try {
            const { folder } = await this._api.request('dialog.chooseFolder', { insideToken: null });

            if (folder) {
                this._importFolders.update((folders) => ({ ...folders, [index]: folder }));
            }
        } catch (error) {
            this._importMessage.set(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Closes the question without changing anything.
     */
    public cancelImport(): void {
        this._importPreview.set(null);
        this._importFolders.set({});
        this._importMessage.set(null);
    }

    /**
     * Adds the file as a new workspace, with the folders the user chose.
     *
     * @returns When it is done.
     */
    public async confirmImport(): Promise<void> {
        const preview = this._importPreview();

        if (!preview) {
            return;
        }

        this._importing.set(true);
        this._importMessage.set(null);

        try {
            this._importResult.set(await this._api.request('workspace.import', { importId: preview.importId, folderTokens: Object.values(this._importFolders()).map((folder) => folder.token) }));
            this._importPreview.set(null);
            this._importFolders.set({});
        } catch (error) {
            this._importMessage.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._importing.set(false);
        }
    }

    /**
     * Opens the workspace that was just imported.
     *
     * @returns When it is open.
     */
    public async openImported(): Promise<void> {
        const workspaceId = this._importResult()?.workspaceId;

        if (workspaceId) {
            const { next } = await this._api.request('workspace.open', { workspaceId });

            await this._shell.refresh();
            await this._router.navigate([next === 'overview' ? '/overview' : '/projects']);
        }
    }

    /**
     * Loads the workspace and starts from its values.
     *
     * @returns When it is loaded.
     */
    public async load(): Promise<void> {
        await this.workspace.reload();
        this.discard();
    }

    /**
     * Goes back to the values of the workspace.
     */
    public discard(): void {
        const workspace = this.workspace.value();

        if (workspace) {
            this._model.set({
                name: workspace.name,
                code: workspace.code,
                baseLocale: workspace.defaults.baseLocale ?? '',
                preset: workspace.defaults.preset ?? '',
                targetLocales: workspace.defaults.targetLocales.join(', ')
            });
            this._color.set(workspace.color);
            this._scan.set(workspace.scanForProjects);
            this._removed.set(new Set());
            this._added.set([]);
        }
    }

    /**
     * Saves what changed, in the user's profile.
     *
     * @returns When it is done.
     */
    public async save(): Promise<void> {
        const workspace = this.workspace.value();

        if (!workspace || !this.canSave()) {
            return;
        }

        const model = this._model();

        this._busy.set(true);
        this._message.set(null);
        this._saved.set(false);

        try {
            await this._api.request('workspace.update', {
                workspaceId: workspace.id,
                name: model.name,
                code: model.code,
                color: this._color(),
                scanForProjects: this._scan(),
                defaults: {
                    baseLocale: model.baseLocale.trim() || null,
                    targetLocales: model.targetLocales.split(',').map((locale) => locale.trim())
                        .filter((locale) => locale.length > 0),
                    preset: (model.preset || null) as WorkspaceDetail['defaults']['preset']
                },
                removeRepositories: Array.from(this._removed()),
                addRepositoryTokens: this._added().map((folder) => folder.token)
            });
            await this._shell.refresh();
            await this.load();
            this._saved.set(true);
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._busy.set(false);
        }
    }

    /**
     * Picks the color.
     *
     * @param color The color.
     */
    public pickColor(color: WorkspaceColor): void {
        this._color.set(color);
    }

    /**
     * Turns the scan for projects on or off.
     *
     * @param isOn The new state.
     */
    public setScan(isOn: boolean): void {
        this._scan.set(isOn);
    }

    /**
     * Adds a folder through a native dialog.
     *
     * @returns When it is done.
     */
    public async addFolder(): Promise<void> {
        this._message.set(null);

        try {
            const { folder } = await this._api.request('dialog.chooseFolder', { insideToken: null });

            if (folder) {
                this._added.update((folders) => [...folders, folder]);
            }
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Takes a repository out of the workspace. Its files stay where they are.
     *
     * @param repository The chip of the repository.
     * @param repository.index The position of an existing repository.
     * @param repository.token The token of a folder that was just added.
     */
    public removeRepository(repository: { index: number; token: string | null }): void {
        if (repository.token) {
            this._added.update((folders) => folders.filter((folder) => folder.token !== repository.token));
        } else {
            this._removed.update((removed) => new Set([...removed, repository.index]));
        }
    }

    /**
     * Asks before the workspace goes.
     */
    public askRemove(): void {
        this._confirmingRemove.set(true);
    }

    /**
     * Keeps the workspace.
     */
    public cancelRemove(): void {
        this._confirmingRemove.set(false);
    }

    /**
     * Removes the workspace from Wortlaut. The user's files stay where they are.
     *
     * @returns When it is done.
     */
    public async remove(): Promise<void> {
        const workspace = this.workspace.value();

        if (!workspace) {
            return;
        }

        this._busy.set(true);

        try {
            await this._api.request('workspace.remove', { workspaceId: workspace.id });
            await this._router.navigate(['/workspaces']);
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._busy.set(false);
            this._confirmingRemove.set(false);
        }
    }

    // #endregion

}

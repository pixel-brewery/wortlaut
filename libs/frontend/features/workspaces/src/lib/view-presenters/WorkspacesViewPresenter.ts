// #region Imports

import { computed, inject, Injectable, signal } from '@angular/core';
import { form, maxLength, required } from '@angular/forms/signals';
import { Router } from '@angular/router';
import type { FolderSelection, WorkspaceCard, WorkspaceColor } from '@pixel-brewery/wortlaut-contracts';
import type { IWorkspaceFact, IWorkspaceTag } from '../contracts/IWorkspaceCardModels';
import { AsyncValue, countOf, DesktopApi, formatCount, WORKSPACE_COLORS, workspaceCodeOf } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * Owns the list of workspaces and the form for a new one. Creating one writes only to the user's profile.
 */
@Injectable()
export class WorkspacesViewPresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _router = inject(Router);
    private readonly _model = signal({ name: '' });
    private readonly _color = signal<WorkspaceColor>('violet');
    private readonly _folder = signal<FolderSelection | null>(null);
    private readonly _message = signal<string | null>(null);
    private readonly _busy = signal(false);

    // #endregion

    // #region Properties

    /**
     * Gets the workspaces.
     *
     * @readonly
     */
    public readonly workspaces = new AsyncValue(() => this._api.request('workspace.list', {}));

    /**
     * Gets the form of a new workspace.
     *
     * @readonly
     */
    public readonly form = form(this._model, (schema) => {
        required(schema.name);
        maxLength(schema.name, 80);
    });

    /**
     * Gets the short code that follows from the name.
     *
     * @readonly
     */
    public readonly code = computed(() => workspaceCodeOf(this._model().name));

    /**
     * Gets the chosen folder.
     *
     * @readonly
     */
    public readonly folder = this._folder.asReadonly();

    /**
     * Gets the colors with the chosen one.
     *
     * @readonly
     */
    public readonly colors = computed(() => WORKSPACE_COLORS.map((color) => ({ ...color, isChecked: color.id === this._color() })));

    /**
     * Gets whether Create workspace can run: a name that gives a code, and a folder.
     *
     * @readonly
     */
    public readonly canCreate = computed(() => this.code().length > 0 && this._folder() !== null && !this._busy());

    /**
     * Gets whether a request is running.
     *
     * @readonly
     */
    public readonly busy = this._busy.asReadonly();

    /**
     * Gets what went wrong with the folder or the new workspace.
     *
     * @readonly
     */
    public readonly message = this._message.asReadonly();

    // #endregion

    // #region Methods

    /**
     * Writes the facts of a card, from the last known state.
     *
     * @param workspace The workspace.
     * @returns The facts.
     */
    public factsOf(workspace: WorkspaceCard): Array<IWorkspaceFact> {
        return [
            { label: 'Projects', value: workspace.nxTarget ? `${formatCount(workspace.projectCount)} from Nx` : formatCount(workspace.projectCount) },
            { label: 'Keys', value: formatCount(workspace.keyCount) },
            { label: 'Locales', value: workspace.locales.length > 0 ? workspace.locales.join(', ') : 'None yet' },
            { label: 'AI', value: workspace.provider ?? 'Not set up' }
        ];
    }

    /**
     * Writes the tags of a card, from the last known state.
     *
     * @param workspace The workspace.
     * @returns The tags.
     */
    public tagsOf(workspace: WorkspaceCard): Array<IWorkspaceTag> {
        const tags: Array<IWorkspaceTag> = [{ label: 'This computer', variant: 'neutral' }];

        if (workspace.nxTarget) {
            tags.push({ label: `Nx target ${workspace.nxTarget}`, variant: 'info' });
        }

        if (workspace.folderMissing) {
            tags.push({ label: 'The folder is gone', variant: 'danger' });
        }

        if (workspace.failingProjects > 0) {
            tags.push({ label: `${countOf(workspace.failingProjects, 'project')} with open problems`, variant: 'warning' });
        }

        return tags;
    }

    /**
     * Picks a color.
     *
     * @param id The color.
     */
    public pickColor(id: WorkspaceColor): void {
        this._color.set(id);
    }

    /**
     * Opens the native dialog for the repository. A cancelled dialog keeps what was chosen before.
     *
     * @returns When it is done.
     */
    public async chooseFolder(): Promise<void> {
        this._message.set(null);

        try {
            const { folder } = await this._api.request('dialog.chooseFolder', { insideToken: null });

            if (folder) {
                this._folder.set(folder);
            }
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Creates the workspace. Projects with their own configuration are ready, anything else goes to Project setup.
     *
     * @returns When it is done.
     */
    public async create(): Promise<void> {
        const folder = this._folder();

        if (!folder || !this.canCreate()) {
            return;
        }

        this._busy.set(true);
        this._message.set(null);

        try {
            const created = await this._api.request('workspace.create', { name: this._model().name, code: this.code(), color: this._color(), folderToken: folder.token });

            if (created.next === 'projects') {
                await this._router.navigate(['/projects']);
            } else {
                await this._router.navigate(['/setup'], { queryParams: { folder: folder.token, workspace: created.workspaceId } });
            }
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._busy.set(false);
        }
    }

    /**
     * Opens a workspace.
     *
     * @param id The workspace.
     * @returns When it is done.
     */
    public async open(id: string): Promise<void> {
        this._message.set(null);

        try {
            const { next } = await this._api.request('workspace.open', { workspaceId: id });

            await this._router.navigate([`/${next}`]);
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Opens the settings of a workspace.
     *
     * @param id The workspace.
     * @returns When it is done.
     */
    public async openSettings(id: string): Promise<void> {
        this._message.set(null);

        try {
            await this._api.request('workspace.open', { workspaceId: id });
            await this._router.navigate(['/settings/workspace']);
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        }
    }

    // #endregion

}

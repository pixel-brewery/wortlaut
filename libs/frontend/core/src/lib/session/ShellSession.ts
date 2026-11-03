// #region Imports

import { computed, inject, Injectable, signal } from '@angular/core';
import type { AppInfo, ShellState } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi } from '../ipc/DesktopApi';
import { ShortcutCenter } from '../shortcuts/ShortcutCenter';

// #endregion

/**
 * The open workspace and project as the renderer knows them. The state itself lives in main, so a reload of the renderer
 * keeps it.
 */
@Injectable({ providedIn: 'root' })
export class ShellSession {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _shortcuts = inject(ShortcutCenter);
    private readonly _state = signal<ShellState>({ workspace: null, project: null, provider: null, dryRun: true, pendingChanges: 0 });
    private readonly _info = signal<AppInfo | null>(null);

    // #endregion

    // #region Properties

    /**
     * Gets the open workspace.
     *
     * @readonly
     */
    public readonly workspace = computed(() => this._state().workspace);

    /**
     * Gets the open project.
     *
     * @readonly
     */
    public readonly project = computed(() => this._state().project);

    /**
     * Gets the name of the active AI provider, or the honest answer that none is set up.
     *
     * @readonly
     */
    public readonly providerLabel = computed(() => this._state().provider ?? 'No AI provider');

    /**
     * Gets whether controls that write only leave a change set in Review.
     *
     * @readonly
     */
    public readonly dryRun = computed(() => this._state().dryRun);

    /**
     * Gets how many change sets wait in Review.
     *
     * @readonly
     */
    public readonly pendingChanges = computed(() => this._state().pendingChanges);

    /**
     * Gets what the app says about itself.
     *
     * @readonly
     */
    public readonly info = this._info.asReadonly();

    // #endregion

    // #region Methods

    /**
     * Reads the state from main.
     *
     * @returns The state.
     */
    public async refresh(): Promise<ShellState> {
        const state = await this._api.request('shell.state', {});

        this._state.set(state);

        return state;
    }

    /**
     * Reads what the app says about itself, once, and tells the page the platform for its window controls.
     *
     * @returns When it is read.
     */
    public async loadInfo(): Promise<void> {
        if (!this._info()) {
            const info = await this._api.request('app.getInfo', {});

            this._info.set(info);
            document.documentElement.dataset['platform'] = info.platform;
            this._shortcuts.setPlatform(info.platform);
        }
    }

    /**
     * Turns Dry run on or off. Setting what is already set changes nothing, because a switch also reports the state it was
     * bound to.
     *
     * @param dryRun The new value.
     * @returns When main knows.
     */
    public async setDryRun(dryRun: boolean): Promise<void> {
        if (this._state().dryRun !== dryRun) {
            this._state.set(await this._api.request('app.setDryRun', { dryRun }));
        }
    }

    /**
     * Opens or closes a project.
     *
     * @param projectId The project, or `null` to close it.
     * @returns When main knows.
     */
    public async setProject(projectId: string | null): Promise<void> {
        this._state.set(await this._api.request('shell.setProject', { projectId }));
    }

    // #endregion

}

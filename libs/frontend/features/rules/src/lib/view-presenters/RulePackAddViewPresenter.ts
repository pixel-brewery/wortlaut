// #region Imports

import { computed, inject, Injectable, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import type { FolderSelection, RulePackAccess, RulePackCheck, RulePackSourceRequest } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi } from '@pixel-brewery/wortlaut-frontend-core';
import { RulePacksViewPresenter, shortHash } from './RulePacksViewPresenter';

// #endregion

/**
 * Where a pack comes from in this dialog.
 */
export type RulePackKind = 'github' | 'npm' | 'folder' | 'shipped';

/**
 * What the field of each kind says.
 */
const KINDS: Readonly<Record<RulePackKind, { name: string; label: string; placeholder: string }>> = {
    github: { name: 'GitHub', label: 'GitHub repository', placeholder: 'github:owner/repository' },
    npm: { name: 'npm', label: 'npm package', placeholder: '@scope/package' },
    folder: { name: 'Folder', label: 'Folder', placeholder: './rules/our-pack' },
    shipped: { name: 'Included', label: 'Included with Wortlaut', placeholder: 'wortlaut:message-checks' }
};

/**
 * Writes "What this pack may do".
 *
 * @param access What the pack may do, derived from its definitions.
 * @returns The lines with their icons.
 */
export function accessLines(access: RulePackAccess): Array<{ label: string; icon: string; variant: 'neutral' | 'success' | 'warning' }> {
    const check = 'checkmarkCircle';

    return [
        { label: access.readsCatalogs ? 'Reads your catalogs' : 'Does not read your catalogs', icon: access.readsCatalogs ? 'info' : check, variant: access.readsCatalogs ? 'neutral' : 'success' },
        { label: access.readsSource ? 'Reads source code' : 'Does not read source code', icon: access.readsSource ? 'info' : check, variant: access.readsSource ? 'neutral' : 'success' },
        { label: access.network ? 'Uses the network' : 'No network access', icon: access.network ? 'warning' : check, variant: access.network ? 'warning' : 'success' },
        { label: access.ai ? 'Uses AI' : 'Does not use AI', icon: access.ai ? 'warning' : check, variant: access.ai ? 'warning' : 'success' }
    ];
}

/**
 * Owns Add a rule pack: where a pack comes from, its check and where it goes. Check pack fetches and parses without running
 * anything, and Install and pin builds change sets from exactly what was checked.
 */
@Injectable()
export class RulePackAddViewPresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    private readonly _packs = inject(RulePacksViewPresenter);
    private readonly _prefilled = this._route.snapshot.queryParamMap.get('source');
    private readonly _kind = signal<RulePackKind>(this._prefilled ? 'shipped' : 'github');
    private readonly _model = signal({ source: this._prefilled ?? '', target: '' });
    private readonly _folder = signal<FolderSelection | null>(null);
    private readonly _check = signal<RulePackCheck | null>(null);
    private readonly _checking = signal(false);
    private readonly _installing = signal(false);
    private readonly _message = signal<string | null>(null);

    // #endregion

    // #region Properties

    /**
     * Gets the form of the source and the target.
     *
     * @readonly
     */
    public readonly form = form(this._model);

    /**
     * Gets the kinds of the segment. The kind of a pack that ships with Wortlaut only shows for such a pack.
     *
     * @readonly
     */
    public readonly kinds = computed(() => (this._prefilled ? ['github', 'npm', 'folder', 'shipped'] as const : ['github', 'npm', 'folder'] as const)
        .map((id) => ({ id, name: KINDS[id].name, isOn: id === this._kind() })));

    /**
     * Gets what the field of the current kind says.
     *
     * @readonly
     */
    public readonly field = computed(() => KINDS[this._kind()]);

    /**
     * Gets whether the source is a folder, which only a native dialog names.
     *
     * @readonly
     */
    public readonly isFolder = computed(() => this._kind() === 'folder');

    /**
     * Gets the chosen folder for showing.
     *
     * @readonly
     */
    public readonly folderPath = computed(() => this._folder()?.displayPath ?? '');

    /**
     * Gets whether a check can start.
     *
     * @readonly
     */
    public readonly canCheck = computed(() => !this._checking() && (this.isFolder() ? this._folder() !== null : this._model().source.trim().length > 0));

    /**
     * Gets whether the check is going on.
     *
     * @readonly
     */
    public readonly checking = this._checking.asReadonly();

    /**
     * Gets why the pack cannot be installed, for showing inline.
     *
     * @readonly
     */
    public readonly problem = computed(() => this._check()?.problem ?? null);

    /**
     * Gets the checked pack.
     *
     * @readonly
     */
    public readonly pack = computed(() => this._check()?.pack ?? null);

    /**
     * Gets the line beside the name of the pack: how it is pinned.
     *
     * @readonly
     */
    public readonly pinLine = computed(() => {
        const pack = this.pack();

        return pack ? `${pack.commit ? `Commit ${pack.commit.slice(0, 7)}` : `Version ${pack.version}`} · ${shortHash(pack.hash)}` : '';
    });

    /**
     * Gets "What this pack may do".
     *
     * @readonly
     */
    public readonly access = computed(() => {
        const pack = this.pack();

        return pack ? accessLines(pack.access) : [];
    });

    /**
     * Gets the choices of Add to.
     *
     * @readonly
     */
    public readonly targets = computed(() => (this._check()?.targets ?? []).map((choice, index) => ({ ...choice, id: String(index) })));

    /**
     * Gets why the pack can go nowhere.
     *
     * @readonly
     */
    public readonly targetsNote = computed(() => this._check()?.targetsNote ?? null);

    /**
     * Gets the command that does the same.
     *
     * @readonly
     */
    public readonly sameAs = computed(() => this._check()?.sameAs ?? '');

    /**
     * Gets how the checked pack is pinned, in the words of the dialog.
     *
     * @readonly
     */
    public readonly pinNote = computed(() => this.isFolder() ? 'A folder has no commit, so it is pinned by its content hash for everyone in' : 'Pinned for everyone in');

    /**
     * Gets whether Install and pin can start.
     *
     * @readonly
     */
    public readonly canInstall = computed(() => !this._installing() && Boolean(this._check()?.checkId) && this.chosenTarget() !== null);

    /**
     * Gets whether Install and pin is going on.
     *
     * @readonly
     */
    public readonly installing = this._installing.asReadonly();

    /**
     * Gets why the last action failed.
     *
     * @readonly
     */
    public readonly message = this._message.asReadonly();

    // #endregion

    // #region Methods

    /**
     * Chooses where a pack comes from. What was checked before no longer counts.
     *
     * @param kind The kind.
     */
    public setKind(kind: RulePackKind): void {
        if (kind !== this._kind()) {
            this._kind.set(kind);
            this._model.update((model) => ({ ...model, source: kind === 'shipped' ? this._prefilled ?? '' : '' }));
            this._folder.set(null);
            this._check.set(null);
            this._message.set(null);
        }
    }

    /**
     * Chooses a folder through a native dialog. Main keeps the path and hands back a token.
     *
     * @returns When it is done.
     */
    public async chooseFolder(): Promise<void> {
        this._message.set(null);

        try {
            const { folder } = await this._api.request('dialog.chooseFolder', { insideToken: null });

            if (folder) {
                this._folder.set(folder);
                this._check.set(null);
            }
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Fetches the pack and checks it. Nothing of it runs.
     *
     * @returns When it is done.
     */
    public async checkPack(): Promise<void> {
        const source = this.sourceOf();

        if (!source || !this.canCheck()) {
            return;
        }

        this._checking.set(true);
        this._message.set(null);
        this._check.set(null);

        try {
            const check = await this._api.request('rulePack.check', { source });

            this._check.set(check);
            this._model.update((model) => ({ ...model, target: check.targets.length > 0 ? '0' : '' }));
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._checking.set(false);
        }
    }

    /**
     * Builds the change sets of the checked pack, and goes back to Rule packs, which says what became of them.
     *
     * @returns When it is done.
     */
    public async install(): Promise<void> {
        const checkId = this._check()?.checkId;
        const target = this.chosenTarget();

        if (!checkId || !target || !this.canInstall()) {
            return;
        }

        this._installing.set(true);
        this._message.set(null);

        try {
            await this._packs.showWrite(await this._api.request('rulePack.install', { checkId, target }));
            await this.close();
        } catch (error) {
            this._message.set(error instanceof Error ? error.message : String(error));
        } finally {
            this._installing.set(false);
        }
    }

    /**
     * Closes the dialog without writing anything.
     *
     * @returns When Rule packs shows.
     */
    public async close(): Promise<void> {
        await this._router.navigate(['/rule-packs']);
    }

    /**
     * @private
     */
    private chosenTarget(): RulePackCheck['targets'][number]['target'] | null {
        return this._check()?.targets[Number(this._model().target)]?.target ?? null;
    }

    /**
     * @private
     */
    private sourceOf(): RulePackSourceRequest | null {
        const kind = this._kind();
        const value = this._model().source.trim();

        if (kind === 'folder') {
            const folder = this._folder();

            return folder ? { kind, folderToken: folder.token } : null;
        }

        return value ? { kind, value } : null;
    }

    // #endregion

}

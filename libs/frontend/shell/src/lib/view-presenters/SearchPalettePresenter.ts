// #region Imports

import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { form } from '@angular/forms/signals';
import { Router } from '@angular/router';
import type { SearchResults } from '@pixel-brewery/wortlaut-contracts';
import { bindShortcuts, DesktopApi, ShellSession, ShortcutCenter } from '@pixel-brewery/wortlaut-frontend-core';
import { SHELL_NAVIGATION } from '../contracts/shellTokens';

// #endregion

/**
 * How long the search waits after a key press before it asks main.
 */
const SEARCH_DELAY_MS = 120;

/**
 * The views that the sidebar does not name, or names under another word.
 */
const OTHER_COMMANDS: ReadonlyArray<{ label: string; icon: string; route: string; needsProject: boolean }> = [
    { label: 'Run on all projects', icon: 'play', route: '/projects', needsProject: false },
    { label: 'Settings: workspace', icon: 'folder', route: '/settings/workspace', needsProject: false },
    { label: 'Settings: project', icon: 'folderOpen', route: '/settings/project', needsProject: true },
    { label: 'Settings: AI', icon: 'sparkle', route: '/settings/ai', needsProject: false },
    { label: 'Settings: application', icon: 'settings', route: '/settings/application', needsProject: false }
];

/**
 * A result of the search.
 */
export type SearchPaletteItem =
    { id: string; kind: 'command'; label: string; detail: string; icon: string; route: string } |
    { id: string; kind: 'key'; label: string; detail: string; icon: string; key: string; projectId: string } |
    { id: string; kind: 'file'; label: string; detail: string; icon: string; fileId: string };

/**
 * Owns the search of the title bar: commands come from the routes of the app, keys and files from main. A result opens what it names.
 */
@Injectable()
export class SearchPalettePresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _session = inject(ShellSession);
    private readonly _router = inject(Router);
    private readonly _groups = inject(SHELL_NAVIGATION);
    private readonly _shortcuts = inject(ShortcutCenter);
    private readonly _isOpen = signal(false);
    private readonly _model = signal({ text: '' });

    /**
     * What the box holds. It may report no text at all when the dialog takes it away.
     */
    private readonly _text = computed(() => ((this._model().text as string | null) ?? '').trim());
    private readonly _results = signal<SearchResults | null>(null);
    private readonly _busy = signal(false);
    private readonly _message = signal<string | null>(null);
    private readonly _activeIndex = signal(0);
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _asked = 0;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `SearchPalettePresenter` class.
     */
    public constructor() {
        bindShortcuts({
            search: () => {
                this.open();
            }
        });

        effect(() => {
            const text = this._text();

            untracked(() => {
                this.schedule(text);
            });
        });
        inject(DestroyRef).onDestroy(() => {
            if (this._timer) {
                clearTimeout(this._timer);
            }
        });
    }

    // #endregion

    // #region Properties

    /**
     * Gets whether the search is open.
     *
     * @readonly
     */
    public readonly isOpen = this._isOpen.asReadonly();

    /**
     * Gets the form of the text.
     *
     * @readonly
     */
    public readonly form = form(this._model);

    /**
     * Gets whether main is looking.
     *
     * @readonly
     */
    public readonly isBusy = this._busy.asReadonly();

    /**
     * Gets why the last search or result failed.
     *
     * @readonly
     */
    public readonly message = this._message.asReadonly();

    /**
     * Gets the placeholder of the search box, with the shortcut of this platform.
     *
     * @readonly
     */
    public readonly placeholder = computed(() => {
        this._session.info();

        return `Search keys, files and commands  ${this._shortcuts.labelOf('search').replace(' ', '')}`;
    });

    /**
     * Gets the results in their groups, in the order the arrow keys walk them.
     *
     * @readonly
     */
    public readonly groups = computed(() => {
        const text = this._text().toLocaleLowerCase('en');
        const results = this._results();
        const commands: Array<SearchPaletteItem> = this.commands().filter((command) => command.label.toLocaleLowerCase('en').includes(text));
        const keys: Array<SearchPaletteItem> = text ? (results?.keys ?? []).map((result) => ({ id: `key:${result.projectId}:${result.key}`, kind: 'key', label: result.key, detail: `${result.value}${this.projectSuffix(result.projectName)}`, icon: 'comment', key: result.key, projectId: result.projectId })) : [];
        const files: Array<SearchPaletteItem> = text ? (results?.files ?? []).map((result) => ({ id: `file:${result.id}`, kind: 'file', label: result.file, detail: `${result.kind === 'catalog' ? 'Catalog' : result.kind === 'settings' ? 'Settings' : 'Source'}${this.projectSuffix(result.projectName)}`, icon: 'open', fileId: result.id })) : [];

        return [{ label: 'Commands', items: commands }, { label: 'Keys', items: keys }, { label: 'Files', items: files }].filter((group) => group.items.length > 0);
    });

    /**
     * Gets the results in the order the arrow keys walk them.
     *
     * @readonly
     */
    public readonly items = computed(() => this.groups().flatMap((group) => group.items));

    /**
     * Gets the id of the result that Enter opens.
     *
     * @readonly
     */
    public readonly activeId = computed(() => this.items()[Math.min(this._activeIndex(), this.items().length - 1)]?.id ?? null);

    /**
     * Gets whether a search found nothing.
     *
     * @readonly
     */
    public readonly isEmpty = computed(() => this._text().length > 0 && this.items().length === 0 && !this._busy() && this._results() !== null);

    /**
     * Gets whether main holds more results than it handed over.
     *
     * @readonly
     */
    public readonly isTruncated = computed(() => this._results()?.truncated ?? false);

    // #endregion

    // #region Methods

    /**
     * Opens the search.
     */
    public open(): void {
        if (this._session.workspace()) {
            this._model.set({ text: '' });
            this._results.set(null);
            this._message.set(null);
            this._activeIndex.set(0);
            this._isOpen.set(true);
        }
    }

    /**
     * Closes the search.
     */
    public close(): void {
        this._isOpen.set(false);
    }

    /**
     * Answers a key while the search is open.
     *
     * @param event The key.
     * @returns When what it opens is open.
     */
    public async onKey(event: KeyboardEvent): Promise<void> {
        const count = this.items().length;

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();

            if (count > 0) {
                const step = event.key === 'ArrowDown' ? 1 : -1;

                this._activeIndex.set((Math.min(this._activeIndex(), count - 1) + step + count) % count);
            }
        } else if (event.key === 'Enter') {
            event.preventDefault();

            const active = this.items().find((item) => item.id === this.activeId());

            if (active) {
                await this.choose(active);
            }
        }
    }

    /**
     * Opens a result: a command goes to its view, a key to Translations and a file to the application the system has for it.
     *
     * @param item The result.
     * @returns When it is open.
     */
    public async choose(item: SearchPaletteItem): Promise<void> {
        this._message.set(null);

        try {
            switch (item.kind) {
                case 'command':
                    this.close();
                    await this._router.navigateByUrl(item.route);
                    break;
                case 'key':
                    this.close();

                    if (this._session.project()?.id !== item.projectId) {
                        await this._session.setProject(item.projectId);
                    }

                    await this._router.navigate(['/translations'], { queryParams: { key: item.key } });
                    break;
                default:
                    await this._api.request('search.openFile', { id: item.fileId });
                    this.close();
                    break;
            }
        } catch (error) {
            this._isOpen.set(true);
            this._message.set(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * @private
     */
    private commands(): Array<Extract<SearchPaletteItem, { kind: 'command' }>> {
        const hasProject = this._session.project() !== null;
        const fromSidebar = this._groups.flatMap((group) => group.items.filter(() => hasProject || !group.needsProject).map((item) => ({ label: item.label, icon: item.icon, route: item.route, detail: group.label })));
        const others = OTHER_COMMANDS.filter((command) => hasProject || !command.needsProject).map((command) => ({ label: command.label, icon: command.icon, route: command.route, detail: 'Workspace' }));

        return [...fromSidebar, ...others].map((command) => ({ ...command, id: `command:${command.label}`, kind: 'command' as const }));
    }

    /**
     * @private
     */
    private projectSuffix(projectName: string): string {
        return this._session.project()?.name === projectName ? '' : ` · ${projectName}`;
    }

    /**
     * @private
     */
    private schedule(text: string): void {
        if (this._timer) {
            clearTimeout(this._timer);
        }

        this._activeIndex.set(0);

        if (!text || !this._isOpen()) {
            this._results.set(null);
            this._busy.set(false);

            return;
        }

        this._busy.set(true);
        this._timer = setTimeout(() => {
            void this.ask(text);
        }, SEARCH_DELAY_MS);
    }

    /**
     * Asks main. An answer to a text that changed meanwhile is dropped.
     *
     * @private
     */
    private async ask(text: string): Promise<void> {
        const asked = ++this._asked;
        const workspace = this._session.workspace();

        if (!workspace) {
            return;
        }

        try {
            const results = await this._api.request('search.query', { text, workspaceId: workspace.id, projectId: this._session.project()?.id ?? null });

            if (asked === this._asked) {
                this._results.set(results);
                this._message.set(null);
            }
        } catch (error) {
            if (asked === this._asked) {
                this._results.set({ keys: [], files: [], truncated: false });
                this._message.set(error instanceof Error ? error.message : String(error));
            }
        } finally {
            if (asked === this._asked) {
                this._busy.set(false);
            }
        }
    }

    // #endregion

}

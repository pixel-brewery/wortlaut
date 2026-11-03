// #region Imports

import { mkdirSync, watch, type FSWatcher } from 'node:fs';

// #endregion

/**
 * How long a burst of changes is waited out before anyone is told. Writing one file takes a temporary file and a rename.
 */
const DEBOUNCE_MS = 120;

/**
 * Tells the app when another process changed a folder of the profile, such as the MCP server leaving a proposal in the review
 * list. Each folder holds one file per entry, written atomically, so looking at the folder is enough. Nobody has to say what
 * changed: the views read again.
 *
 * @public
 */
export class ProfileWatcher {

    // #region Fields

    private readonly _watchers: Array<FSWatcher>;
    private readonly _timers: Set<ReturnType<typeof setTimeout>>;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `ProfileWatcher` class.
     *
     * @public
     */
    public constructor() {
        this._watchers = [];
        this._timers = new Set();
    }

    // #endregion

    // #region Methods

    /**
     * Watches a folder, and creates it when it does not exist yet.
     *
     * @public
     * @param folder The folder.
     * @param onChange Called once for a burst of changes.
     */
    public watch(folder: string, onChange: () => void): void {
        mkdirSync(folder, { recursive: true, mode: 0o700 });

        let timer: ReturnType<typeof setTimeout> | null = null;
        const watcher = watch(folder, () => {
            if (timer) {
                clearTimeout(timer);
                this._timers.delete(timer);
            }

            timer = setTimeout(() => {
                if (timer) {
                    this._timers.delete(timer);
                }

                timer = null;
                onChange();
            }, DEBOUNCE_MS);
            this._timers.add(timer);
        });

        // A folder that goes away only ends the telling. The views still read what is there.
        watcher.on('error', () => watcher.close());
        this._watchers.push(watcher);
    }

    /**
     * Stops watching.
     *
     * @public
     */
    public close(): void {
        for (const watcher of this._watchers.splice(0)) {
            watcher.close();
        }

        for (const timer of this._timers) {
            clearTimeout(timer);
        }

        this._timers.clear();
    }

    // #endregion

}

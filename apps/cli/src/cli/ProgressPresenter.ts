// #region Imports

import { logProgress, type ILogger, type ILogProgressHandle } from '@pixel-brewery/utilities';
import type { RunProgressEvent } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * Shows the progress events of the engine as a progress bar in the terminal, one per locale.
 *
 * @internal
 */
export class ProgressPresenter {

    // #region Fields

    private readonly _logger: ILogger;
    private _handle: ILogProgressHandle | null;
    private _current: string | null;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `ProgressPresenter` class.
     *
     * @param logger The logger.
     */
    public constructor(logger: ILogger) {
        this._logger = logger;
        this._handle = null;
        this._current = null;
    }

    // #endregion

    // #region Methods

    /**
     * Shows a progress event.
     *
     * @param event The event.
     */
    public report(event: RunProgressEvent): void {
        const current = `${event.phase}:${event.detail}`;

        if (this._current !== current) {
            this.dispose();
            this._current = current;
            this._handle = logProgress(this._logger, event.total, { prefixSpaceLength: 5 });
        }

        this._handle?.report(event.completed);
    }

    /**
     * Ends the progress bar.
     */
    public dispose(): void {
        this._handle?.dispose();
        this._handle = null;
        this._current = null;
    }

    // #endregion

}

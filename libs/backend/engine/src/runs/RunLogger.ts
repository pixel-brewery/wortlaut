// #region Imports

import { format, stripVTControlCharacters } from 'node:util';
import type { ILogger } from '@pixel-brewery/utilities';
import type { RunLogEntry } from '@pixel-brewery/wortlaut-contracts';
import type { SecretScrubber } from '../security/SecretScrubber.js';

// #endregion

/**
 * The most log entries a run keeps. When it logs more, the newest ones stay, because they explain how a run ended.
 *
 * @internal
 */
export const MAX_LOG_ENTRIES = 2000;

/**
 * The longest log entry a run keeps.
 */
const MAX_LOG_ENTRY_LENGTH = 4000;

/**
 * The logger of a run: it removes secrets, keeps a bounded log for the run's record and forwards every line to the
 * surface's logger. The engine has no other way to log.
 *
 * @internal
 */
export class RunLogger implements ILogger {

    // #region Fields

    private readonly _target: ILogger;
    private readonly _scrubber: SecretScrubber;
    private readonly _entries: Array<RunLogEntry>;
    private readonly _onEntry: ((entry: RunLogEntry) => void) | undefined;
    private readonly _keepsDebug: boolean;
    private _dropped: number;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `RunLogger` class.
     *
     * @param target The surface's logger.
     * @param scrubber The scrubber of the run.
     * @param onEntry Receives each entry while the run goes on.
     * @param keepsDebug Whether debug output joins the log of the run.
     */
    public constructor(target: ILogger, scrubber: SecretScrubber, onEntry?: (entry: RunLogEntry) => void, keepsDebug = true) {
        this._target = target;
        this._scrubber = scrubber;
        this._onEntry = onEntry;
        this._keepsDebug = keepsDebug;
        this._entries = [];
        this._dropped = 0;
    }

    // #endregion

    // #region Properties

    /**
     * Gets the kept log entries.
     *
     * @readonly
     */
    public get entries(): Array<RunLogEntry> {
        return this._entries;
    }

    /**
     * Gets how many entries the bound dropped.
     *
     * @readonly
     */
    public get dropped(): number {
        return this._dropped;
    }

    // #endregion

    // #region Methods

    public log(message?: unknown, ...optionalParams: Array<unknown>): void {
        this._target.log(this.capture('info', message, optionalParams));
    }

    public debug(message?: unknown, ...optionalParams: Array<unknown>): void {
        if (this._keepsDebug) {
            this._target.debug(this.capture('debug', message, optionalParams));
        }
    }

    public info(message?: unknown, ...optionalParams: Array<unknown>): void {
        this._target.info(this.capture('info', message, optionalParams));
    }

    public warn(message?: unknown, ...optionalParams: Array<unknown>): void {
        this._target.warn(this.capture('warn', message, optionalParams));
    }

    public error(message?: unknown, ...optionalParams: Array<unknown>): void {
        this._target.error(this.capture('error', message, optionalParams));
    }

    /**
     * @private
     */
    private capture(level: RunLogEntry['level'], message: unknown, optionalParams: Array<unknown>): string {
        const text = this._scrubber.scrub(format(message, ...optionalParams));

        if (this._entries.length >= MAX_LOG_ENTRIES) {
            this._entries.shift();
            this._dropped++;
        }

        const entry: RunLogEntry = { level, message: stripVTControlCharacters(text).slice(0, MAX_LOG_ENTRY_LENGTH) };

        this._entries.push(entry);
        this._onEntry?.(entry);

        return text;
    }

    // #endregion

}

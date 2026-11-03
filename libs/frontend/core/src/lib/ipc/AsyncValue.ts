// #region Imports

import { computed, signal, type Signal, type WritableSignal } from '@angular/core';

// #endregion

/**
 * What a view can say about a value that comes from main.
 */
export type AsyncStatus = 'loading' | 'ready' | 'failed';

/**
 * A value that is loaded through IPC, with its true loading and failure states. Only the latest load counts, so a slow
 * answer cannot overwrite a newer one, and a value stays visible while it is loaded again.
 *
 * @typeParam T The value.
 */
export class AsyncValue<T> {

    // #region Fields

    private readonly _load: () => Promise<T>;
    private readonly _status: WritableSignal<AsyncStatus>;
    private readonly _value: WritableSignal<T | null>;
    private readonly _error: WritableSignal<string | null>;
    private _version: number;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `AsyncValue` class.
     *
     * @param load Loads the value.
     */
    public constructor(load: () => Promise<T>) {
        this._load = load;
        this._status = signal('loading');
        this._value = signal(null);
        this._error = signal(null);
        this._version = 0;
        this.status = this._status.asReadonly();
        this.value = this._value.asReadonly();
        this.error = this._error.asReadonly();
        this.isLoading = computed(() => this._status() === 'loading' && this._value() === null);
        this.isFailed = computed(() => this._status() === 'failed');
    }

    // #endregion

    // #region Properties

    /**
     * Gets the status of the latest load.
     *
     * @readonly
     */
    public readonly status: Signal<AsyncStatus>;

    /**
     * Gets the latest value.
     *
     * @readonly
     */
    public readonly value: Signal<T | null>;

    /**
     * Gets the message of the failure.
     *
     * @readonly
     */
    public readonly error: Signal<string | null>;

    /**
     * Gets whether there is nothing to show yet.
     *
     * @readonly
     */
    public readonly isLoading: Signal<boolean>;

    /**
     * Gets whether the latest load failed.
     *
     * @readonly
     */
    public readonly isFailed: Signal<boolean>;

    // #endregion

    // #region Methods

    /**
     * Loads the value.
     *
     * @returns When the load finished. It never rejects: a failure is a state.
     */
    public async reload(): Promise<void> {
        const version = ++this._version;

        this._status.set('loading');

        try {
            const value = await this._load();

            if (version === this._version) {
                this._value.set(value);
                this._error.set(null);
                this._status.set('ready');
            }
        } catch (error) {
            if (version === this._version) {
                this._value.set(null);
                this._error.set(error instanceof Error ? error.message : String(error));
                this._status.set('failed');
            }
        }
    }

    // #endregion

}

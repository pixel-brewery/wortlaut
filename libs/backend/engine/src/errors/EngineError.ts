/**
 * The machine-readable reason of an engine failure.
 *
 * @public
 */
export type EngineErrorCode =
  | 'assistant-refused'
  | 'change-set-conflict'
  | 'change-set-not-found'
  | 'change-set-write-failed'
  | 'generation-failed'
  | 'invalid-arguments'
  | 'invalid-configuration'
  | 'outside-known-roots'
  | 'project-folder-missing'
  | 'project-not-found'
  | 'provider-not-ready'
  | 'review-list-full'
  | 'review-list-unavailable'
  | 'rule-pack-invalid'
  | 'rule-pack-refused'
  | 'run-stopped'
  | 'secret-refused'
  | 'workspace-not-found'
  | 'workspace-store-invalid';

/**
 * A failure the engine knows about, with a stable code and the files it concerns.
 *
 * @public
 */
export class EngineError extends Error {
  // #region Fields

  private readonly _code: EngineErrorCode;
  private readonly _files: ReadonlyArray<string>;
  private _changeSetId: string | null;
  private _runId: string | null;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `EngineError` class.
   *
   * @public
   * @param code The reason of the failure.
   * @param message The message, which names what the user has to know.
   * @param files The files the failure concerns.
   */
  public constructor(code: EngineErrorCode, message: string, files: ReadonlyArray<string> = []) {
    super(message);

    this.name = 'EngineError';
    this._code = code;
    this._files = files;
    this._changeSetId = null;
    this._runId = null;
  }

  // #endregion

  // #region Properties

  /**
   * Gets the reason of the failure.
   *
   * @public
   * @readonly
   */
  public get code(): EngineErrorCode {
    return this._code;
  }

  /**
   * Gets the files the failure concerns.
   *
   * @public
   * @readonly
   */
  public get files(): ReadonlyArray<string> {
    return this._files;
  }

  /**
   * Gets the pending change set that holds the finished work of a failed or stopped run.
   *
   * @public
   */
  public get changeSetId(): string | null {
    return this._changeSetId;
  }

  public set changeSetId(value: string | null) {
    this._changeSetId = value;
  }

  /**
   * Gets the recorded run that failed.
   *
   * @public
   */
  public get runId(): string | null {
    return this._runId;
  }

  public set runId(value: string | null) {
    this._runId = value;
  }

  // #endregion
}

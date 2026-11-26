/**
 * Selects the trusted dependency workflow operation.
 *
 * @internal
 */
export interface IDependabotExecutorOptions {
  /**
   * Selects an external workflow operation that must never be cached.
   *
   * @internal
   */
  readonly mode: 'merge' | 'reconcile' | 'continue';
}

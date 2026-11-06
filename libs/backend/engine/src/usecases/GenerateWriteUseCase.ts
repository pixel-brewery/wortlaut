// #region Imports

import { composeTargets } from '../generate/composeTargets.js';
import type { TranslationSession } from '../generate/TranslationSession.js';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * The options of Write N accepted, as a run record keeps them.
 *
 * @internal
 */
export interface IGenerateWriteOptions {
  locales: Array<string>;
  strategy: string;
  count: number;
  runId: string;
}

/**
 * Proposes the accepted rows of a locale as one change set: Write N accepted.
 *
 * @internal
 */
export class GenerateWriteUseCase implements IUseCase<IGenerateWriteOptions, Array<string>> {
  // #region Fields

  public readonly command = 'generate';

  private readonly _session: TranslationSession;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `GenerateWriteUseCase` class.
   *
   * @param session The session.
   */
  public constructor(session: TranslationSession) {
    this._session = session;
  }

  // #endregion

  // #region Methods

  /**
   * @override
   */
  public detail(options: IGenerateWriteOptions): string {
    return `Write ${options.count} accepted for ${options.locales.join(', ')}`;
  }

  /**
   * @override
   */
  public async execute(
    options: IGenerateWriteOptions,
    context: IUseCaseContext,
  ): Promise<IUseCaseOutput<Array<string>>> {
    const targets = await composeTargets(this._session, options.locales[0] ?? null);

    for (const { path, content } of targets) {
      context.changes.propose(path, content);
    }

    context.logger.log(`Writing ${options.count} accepted for ${options.locales.join(', ')}`);

    return {
      result: targets.map((target) => target.path),
      data: { count: options.count, locale: options.locales[0] },
    };
  }

  // #endregion
}

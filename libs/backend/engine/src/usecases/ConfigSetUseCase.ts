// #region Imports

import { isSecretName } from '@pixel-brewery/wortlaut-contracts';
import { ConfigurationWriter } from '../configuration/ConfigurationWriter.js';
import type { IResolvedConfiguration } from '../configuration/ConfigurationResolver.js';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * The options of `config set`.
 *
 * @public
 */
export interface IConfigSetOptions {
  key: string;
  value: unknown;
}

/**
 * Proposes one changed setting in the file it comes from.
 *
 * @internal
 */
export class ConfigSetUseCase implements IUseCase<IConfigSetOptions, string> {
  // #region Fields

  public readonly command = 'config.set';

  private readonly _configuration: IResolvedConfiguration;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ConfigSetUseCase` class.
   *
   * @param configuration The resolved configuration.
   */
  public constructor(configuration: IResolvedConfiguration) {
    this._configuration = configuration;
  }

  // #endregion

  // #region Methods

  /**
   * @override
   */
  public execute(
    options: IConfigSetOptions,
    context: IUseCaseContext,
  ): Promise<IUseCaseOutput<string>> {
    // A refused secret must not reach the record of this run through its options.
    if (isSecretName(options.key.split('.').at(-1) ?? '')) {
      context.scrubber.add(String(options.value));
    }

    const edit = ConfigurationWriter.edit(this._configuration, options.key, options.value);

    context.changes.propose(edit.file, edit.content);

    return Promise.resolve({ result: edit.file, data: { key: options.key, file: edit.file } });
  }

  // #endregion
}

// #region Imports

import {
  bold,
  t,
  type IFileSystem,
  type ILogger,
  type IProgramArg,
} from '@pixel-brewery/utilities';
import type { IAiProviderHost, IAiProviderInfo } from '@pixel-brewery/wortlaut-ai';
import type { CommandReport } from '@pixel-brewery/wortlaut-contracts';
import {
  EngineError,
  type IEngineOutcome,
  type WortlautEngine,
} from '@pixel-brewery/wortlaut-engine';
import { createCliProviders } from '../ai/CliProviders.js';
import { AI_COMMAND_ARGS } from '../arguments/AiCommandArgs.js';
import {
  DEFAULT_AI_COMMAND_ARGS_CONFIG,
  type IAiCommandArgsConfig,
} from '../arguments/configurations/IAiCommandArgsConfig.js';
import { EngineCommand } from './abstracts/EngineCommand.js';

// #endregion

/**
 * `wortlaut ai status`: the true state of every provider. It starts no login, installs nothing and reads keys from the
 * environment, and only to learn whether one exists.
 *
 * @internal
 */
export class AiCommand extends EngineCommand<IAiCommandArgsConfig, Array<IAiProviderInfo>> {
  // #region Fields

  private readonly _createHost: () => IAiProviderHost;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `AiCommand` class.
   *
   * @public
   */
  public constructor(
    config: IAiCommandArgsConfig,
    logger: ILogger,
    fileSystem: IFileSystem,
    createHost: () => IAiProviderHost = () => createCliProviders(),
  ) {
    super(config, logger, fileSystem);

    this._createHost = createHost;
  }

  // #endregion

  // #region Properties

  public get name(): string {
    return 'ai';
  }

  public get args(): Array<IProgramArg> {
    return AI_COMMAND_ARGS;
  }

  /**
   * @protected
   * @override
   */
  protected override get settingNames(): Readonly<Record<string, string>> {
    return {};
  }

  /**
   * @protected
   * @override
   */
  protected override get defaults(): IAiCommandArgsConfig {
    return DEFAULT_AI_COMMAND_ARGS_CONFIG;
  }

  // #endregion

  // #region Methods

  /**
   * @protected
   * @override
   */
  protected override async run(
    engine: WortlautEngine,
  ): Promise<IEngineOutcome<Array<IAiProviderInfo>>> {
    if (this.positionals[0] !== 'status') {
      throw new EngineError('invalid-arguments', 'Usage: wortlaut ai status');
    }

    const host = this._createHost();

    try {
      return await engine.aiStatus(this.cwd, host);
    } finally {
      await host.dispose();
    }
  }

  /**
   * @protected
   * @override
   */
  protected override presentText(report: CommandReport): void {
    for (const provider of (report.data as { providers: Array<IAiProviderInfo> }).providers) {
      this.logger.log(
        t`${bold(provider.name.padEnd(14))} ${provider.state.padEnd(14)} ${provider.description}`,
      );
    }
  }

  // #endregion
}

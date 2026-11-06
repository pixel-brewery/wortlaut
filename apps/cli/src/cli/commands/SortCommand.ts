// #region Imports

import type { IFileSystem, ILogger, IProgramArg } from '@pixel-brewery/utilities';
import type { IResourceInfo } from '@pixel-brewery/wortlaut-core';
import {
  CommandOptions,
  type IEngineOutcome,
  type WortlautEngine,
} from '@pixel-brewery/wortlaut-engine';
import {
  DEFAULT_SORT_COMMAND_ARGS_CONFIG,
  type ISortCommandArgsConfig,
} from '../arguments/configurations/ISortCommandArgsConfig';
import { SORT_COMMAND_ARGS } from '../arguments/SortCommandArgs.js';
import { EngineCommand } from './abstracts/EngineCommand.js';

// #endregion

/**
 * A command that sorts the resources.
 *
 * @internal
 */
export class SortCommand extends EngineCommand<ISortCommandArgsConfig, Array<IResourceInfo>> {
  // #region Ctor

  /**
   * Constructs a new instance of the `SortCommand` class.
   *
   * @public
   */
  public constructor(config: ISortCommandArgsConfig, logger: ILogger, fileSystem: IFileSystem) {
    super(config, logger, fileSystem);
  }

  // #endregion

  // #region Properties

  /**
   * Gets the command name.
   *
   * @public
   * @readonly
   */
  public override get name(): string {
    return 'sort';
  }

  /**
   * Gets the optional arguments.
   *
   * @public
   * @readonly
   */
  public override get args(): Array<IProgramArg> | undefined {
    return SORT_COMMAND_ARGS;
  }

  /**
   * @protected
   * @override
   */
  protected override get settingNames(): Readonly<Record<string, string>> {
    return {
      dryRun: 'dryRun',
      review: 'review',
      debug: 'verbose',
      order: 'actions.sort.order',
      type: 'actions.detect.type',
      resourceRoot: 'actions.detect.resourceRoot',
    };
  }

  /**
   * @protected
   * @override
   */
  protected override get defaults(): ISortCommandArgsConfig {
    return DEFAULT_SORT_COMMAND_ARGS_CONFIG;
  }

  // #endregion

  // #region Methods

  /**
   * @protected
   * @override
   */
  protected override run(engine: WortlautEngine): Promise<IEngineOutcome<Array<IResourceInfo>>> {
    const configuration = this.resolveConfiguration(engine);

    return engine.sort({
      cwd: this.cwd,
      options: CommandOptions.forSort(configuration),
      writeMode: CommandOptions.writeMode(configuration),
    });
  }

  // #endregion
}

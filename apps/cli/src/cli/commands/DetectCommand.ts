// #region Imports

import {
  gray,
  yellow,
  type IFileSystem,
  type ILogger,
  type IProgramArg,
} from '@pixel-brewery/utilities';
import type { ILocalizationProcessorResult } from '@pixel-brewery/wortlaut-core';
import type { CommandReport } from '@pixel-brewery/wortlaut-contracts';
import {
  CommandOptions,
  type IEngineOutcome,
  type WortlautEngine,
} from '@pixel-brewery/wortlaut-engine';
import {
  DEFAULT_DETECT_COMMAND_ARGS_CONFIG,
  type IDetectCommandArgsConfig,
} from '../arguments/configurations/IDetectCommandArgsConfig';
import { DETECT_COMMAND_ARGS } from '../arguments/DetectCommandArgs.js';
import { EngineCommand } from './abstracts/EngineCommand.js';

// #endregion

/**
 * The part of a detect report this command prints.
 */
interface IDetectReportData {
  files: Array<{
    file: string;
    strings: Array<{ value: string; hardCoded: boolean; line: number; column: number }>;
  }>;
}

/**
 * A command that detects static resources.
 *
 * @internal
 */
export class DetectCommand extends EngineCommand<
  IDetectCommandArgsConfig,
  Array<ILocalizationProcessorResult> | Array<string>
> {
  // #region Ctor

  /**
   * Constructs a new instance of the `DetectCommand` class.
   *
   * @public
   */
  public constructor(config: IDetectCommandArgsConfig, logger: ILogger, fileSystem: IFileSystem) {
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
  public get name(): string {
    return 'detect';
  }

  /**
   * Gets the optional arguments.
   *
   * @public
   * @readonly
   */
  public get args(): Array<IProgramArg> {
    return DETECT_COMMAND_ARGS;
  }

  /**
   * @protected
   * @override
   */
  protected override get settingNames(): Readonly<Record<string, string>> {
    return {
      dryRun: 'dryRun',
      debug: 'verbose',
      type: 'actions.detect.type',
      root: 'actions.detect.root',
      preset: 'actions.detect.preset',
      resourceKeyPrefix: 'actions.detect.resourceKey.prefix',
      resourceKeySuffix: 'actions.detect.resourceKey.suffix',
      resourceRoot: 'actions.detect.resourceRoot',
      baseLocale: 'actions.analyze.baseLocale',
      review: 'review',
    };
  }

  /**
   * @protected
   * @override
   */
  protected override get defaults(): IDetectCommandArgsConfig {
    return DEFAULT_DETECT_COMMAND_ARGS_CONFIG;
  }

  // #endregion

  // #region Methods

  /**
   * @protected
   * @override
   */
  protected override run(
    engine: WortlautEngine,
  ): Promise<IEngineOutcome<Array<ILocalizationProcessorResult> | Array<string>>> {
    const configuration = this.resolveConfiguration(engine);
    const writeMode = CommandOptions.writeMode(configuration);

    if (this.config.apply) {
      return engine.detectApply({
        cwd: this.cwd,
        options: {
          ...CommandOptions.forDetectScan(configuration, this.config.skipTests),
          count: 0,
        },
        writeMode,
      });
    }

    return engine.detect({
      cwd: this.cwd,
      options: {
        ...CommandOptions.forDetect(configuration),
        ...(this.config.skipTests ? { skipTests: true } : {}),
      },
      writeMode,
      ...this.cacheRequest,
    });
  }

  /**
   * @protected
   * @override
   */
  protected override presentText(report: CommandReport): void {
    if (report.command === 'detect.apply') {
      this.logger.log(
        `${(report.data as { keys: Array<string> }).keys.length} string(s) replaced with keys.`,
      );

      return;
    }

    const { files } = report.data as IDetectReportData;
    let count = 0;

    for (const { file, strings } of files) {
      for (const { value, line, column } of strings.filter((string) => string.hardCoded)) {
        this.logger.log(`${yellow(value)} ${gray(`${file}:${line}:${column}`)}`);
        count++;
      }
    }

    this.logger.log(`${count} hard-coded string(s) in ${files.length} file(s).`);
  }

  // #endregion
}

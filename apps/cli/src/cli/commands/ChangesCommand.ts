// #region Imports

import {
  bold,
  gray,
  type IFileSystem,
  type ILogger,
  type IProgramArg,
} from '@pixel-brewery/utilities';
import { createTwoFilesPatch } from 'diff';
import type { ChangeSet, ChangeSetSummary, CommandReport } from '@pixel-brewery/wortlaut-contracts';
import {
  EngineError,
  type IEngineOutcome,
  type WortlautEngine,
} from '@pixel-brewery/wortlaut-engine';
import { CHANGES_COMMAND_ARGS } from '../arguments/ChangesCommandArgs.js';
import {
  DEFAULT_CHANGES_COMMAND_ARGS_CONFIG,
  type IChangesCommandArgsConfig,
} from '../arguments/configurations/IChangesCommandArgsConfig.js';
import { EngineCommand } from './abstracts/EngineCommand.js';

// #endregion

/**
 * A command that works on the review list: `list`, `show <id>`, `apply <id>` and `discard <id>`.
 *
 * @internal
 */
export class ChangesCommand extends EngineCommand<IChangesCommandArgsConfig, unknown> {
  // #region Ctor

  /**
   * Constructs a new instance of the `ChangesCommand` class.
   *
   * @public
   */
  public constructor(config: IChangesCommandArgsConfig, logger: ILogger, fileSystem: IFileSystem) {
    super(config, logger, fileSystem);
  }

  // #endregion

  // #region Properties

  public get name(): string {
    return 'changes';
  }

  public get args(): Array<IProgramArg> {
    return CHANGES_COMMAND_ARGS;
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
  protected override get defaults(): IChangesCommandArgsConfig {
    return DEFAULT_CHANGES_COMMAND_ARGS_CONFIG;
  }

  // #endregion

  // #region Methods

  /**
   * @public
   * @override
   */
  public override configure(config: IChangesCommandArgsConfig): IChangesCommandArgsConfig {
    const [action, id] = this.positionals;

    return Object.assign(super.configure(config), {
      action: action ?? DEFAULT_CHANGES_COMMAND_ARGS_CONFIG.action,
      id: id ?? DEFAULT_CHANGES_COMMAND_ARGS_CONFIG.id,
    });
  }

  /**
   * @protected
   * @override
   */
  protected override run(
    engine: WortlautEngine,
  ): Promise<IEngineOutcome<unknown> | { result: unknown; report: CommandReport }> {
    switch (this.config.action) {
      case 'list':
        return Promise.resolve(this.report('changes.list', engine.listChangeSets()));
      case 'show':
        return Promise.resolve(this.report('changes.show', engine.getChangeSet(this.requireId())));
      case 'apply':
        return engine.applyChangeSet(this.requireId(), this.cwd);
      case 'discard':
        return engine.discardChangeSet(this.requireId(), this.cwd);
      default:
        throw new EngineError(
          'invalid-arguments',
          `Unknown action '${this.config.action}'. Use list, show <id>, apply <id> or discard <id>.`,
        );
    }
  }

  /**
   * @protected
   * @override
   */
  protected override presentText(report: CommandReport): void {
    switch (report.command) {
      case 'changes.list':
        this.presentList(report.data as Array<ChangeSetSummary>);
        break;
      case 'changes.show':
        this.presentChangeSet(report.data as ChangeSet);
        break;
      case 'changes.apply':
        this.logger.log(
          `Applied change set ${(report.changeSet as ChangeSetSummary).id} with ${(report.changeSet as ChangeSetSummary).files.length} file(s).`,
        );
        break;
      default:
        this.logger.log(
          `Discarded change set ${(report.changeSet as ChangeSetSummary).id}. Nothing was written.`,
        );
    }
  }

  /**
   * @private
   */
  private presentList(changeSets: Array<ChangeSetSummary>): void {
    if (changeSets.length === 0) {
      this.logger.log('The review list is empty.');
    }

    for (const changeSet of changeSets) {
      const partial = changeSet.partial ? ' (partial)' : '';

      this.logger.log(
        `${bold(changeSet.id)} ${changeSet.source.command}${partial} ${gray(changeSet.createdAt)} ${changeSet.files.length} file(s): ${changeSet.files.map((file) => file.displayPath).join(', ')}`,
      );
    }
  }

  /**
   * @private
   */
  private presentChangeSet(changeSet: ChangeSet): void {
    this.logger.log(
      `${bold(changeSet.id)} ${changeSet.source.command} ${gray(changeSet.createdAt)}${changeSet.source.detail ? ` ${changeSet.source.detail}` : ''}`,
    );

    for (const finding of changeSet.findings) {
      this.logger.log(`  ${finding.severity}: ${finding.message}`);
    }

    for (const file of changeSet.files) {
      this.logger.log(`${bold(file.action)} ${file.path}`);
      this.logger.log(
        createTwoFilesPatch(
          file.displayPath,
          file.displayPath,
          file.oldContent ?? '',
          file.newContent,
        ),
      );
    }
  }

  /**
   * @private
   */
  private requireId(): string {
    if (!this.config.id) {
      throw new EngineError(
        'invalid-arguments',
        `Name the change set: wortlaut changes ${this.config.action} <id>. 'wortlaut changes list' shows the ids.`,
      );
    }

    return this.config.id;
  }

  /**
   * @private
   */
  private report(command: string, data: unknown): { result: unknown; report: CommandReport } {
    return {
      result: data,
      report: {
        ok: true,
        command,
        runId: null,
        state: 'succeeded',
        writeMode: null,
        changeSet: null,
        findings: [],
        data,
      },
    };
  }

  // #endregion
}

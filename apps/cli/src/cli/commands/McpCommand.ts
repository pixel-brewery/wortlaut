// #region Imports

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  IFileSystem,
  ILogger,
  IProgramArg,
  ProgramCommandResult,
} from '@pixel-brewery/utilities';
import type { CommandReport } from '@pixel-brewery/wortlaut-contracts';
import type { IEngineOutcome, WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { reserveStdoutForProtocol, runMcpServer } from '@pixel-brewery/wortlaut-mcp';
import {
  DEFAULT_MCP_COMMAND_ARGS_CONFIG,
  type IMcpCommandArgsConfig,
} from '../arguments/configurations/IMcpCommandArgsConfig.js';
import { MCP_COMMAND_ARGS } from '../arguments/McpCommandArgs.js';
import { EngineCommand } from './abstracts/EngineCommand.js';

// #endregion

/**
 * Returns whether a command line starts the MCP server. It runs outside of the program around the other commands, which prints
 * to stdout when a command ends, and stdout belongs to the protocol.
 *
 * @internal
 * @param argv The command line.
 * @returns `true` for `wortlaut mcp`. Its help stays a normal command.
 */
export function asksForMcpServer(argv: ReadonlyArray<string>): boolean {
  return argv[2] === 'mcp' && !argv.includes('--help') && !argv.includes('-h');
}

/**
 * Starts the MCP server and returns when its client went away. From its first line on, only the protocol reaches stdout. An
 * argument changes nothing: what assistants may do comes from the user's profile.
 *
 * @internal
 * @param argv The command line.
 * @returns When the server ended.
 */
export async function startMcpServer(argv: ReadonlyArray<string>): Promise<void> {
  const output = reserveStdoutForProtocol();

  if (argv.length > 3) {
    console.error(
      'wortlaut mcp takes no arguments. What assistants may do is set in the app, under MCP and plugins.',
    );
  }

  await runMcpServer({
    cwd: process.cwd(),
    env: process.env,
    version: (
      JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8')) as {
        version: string;
      }
    ).version,
    output,
  });
}

/**
 * `wortlaut mcp`: the stdio server for assistants. The command exists for the help of the program, and `CliRun` starts the
 * server without that program.
 *
 * @internal
 */
export class McpCommand extends EngineCommand<IMcpCommandArgsConfig, undefined> {
  // #region Ctor

  /**
   * Constructs a new instance of the `McpCommand` class.
   *
   * @public
   */
  public constructor(config: IMcpCommandArgsConfig, logger: ILogger, fileSystem: IFileSystem) {
    super(config, logger, fileSystem);
  }

  // #endregion

  // #region Properties

  public get name(): string {
    return 'mcp';
  }

  public get args(): Array<IProgramArg> {
    return MCP_COMMAND_ARGS;
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
  protected override get defaults(): IMcpCommandArgsConfig {
    return DEFAULT_MCP_COMMAND_ARGS_CONFIG;
  }

  // #endregion

  // #region Methods

  /**
   * @public
   * @override
   */
  public override async execute(): Promise<ProgramCommandResult<undefined>> {
    await startMcpServer(process.argv);

    return { canceled: false, result: undefined };
  }

  /**
   * @protected
   * @override
   */
  protected override run(
    _engine: WortlautEngine,
  ): Promise<IEngineOutcome<undefined> | { result: undefined; report: CommandReport }> {
    throw new Error('The MCP server does not run as a command of the program.');
  }

  // #endregion
}

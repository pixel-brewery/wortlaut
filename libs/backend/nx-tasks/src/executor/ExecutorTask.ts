// #region Imports

import {
  ArrayExtensions,
  bold,
  ConsoleLogger,
  gray,
  logSeparator,
  logTree,
  magenta,
  Path,
  symbol,
  t,
  yellow,
  type ILogger,
} from '@pixel-brewery/utilities';
import { run, type IRunConfig, type IRunResult } from '@pixel-brewery/wortlaut-app';
import type { DotenvExpandOutput } from 'dotenv-expand';
import { loadAndExpandDotEnvFile, resolveOptionTree, type IEnvOptions } from './Environment.js';

// #endregion

/**
 * The commands a target can run.
 *
 * @public
 */
export type WortlautTaskMode = 'sort' | 'analyze' | 'transform' | 'generate' | 'detect';

const MODES: ReadonlyArray<WortlautTaskMode> = [
  'sort',
  'analyze',
  'transform',
  'generate',
  'detect',
];

/**
 * The options of a run through a target.
 *
 * @public
 */
export interface IWortlautTaskOptions extends IRunConfig, IEnvOptions {
  mode: WortlautTaskMode;
}

/**
 * Runs the command of a target and logs what it found.
 *
 * @public
 * @param options The options.
 * @returns The result of the run.
 * @throws When the options are invalid, the .env file cannot be read or the run fails.
 */
export async function runTask(options: IWortlautTaskOptions): Promise<IRunResult> {
  const logger = new ConsoleLogger();

  logSeparator(logger, 'Wortlaut');

  if (!options.cwd) {
    throw new Error('No cwd provided.');
  }

  if (!MODES.includes(options.mode)) {
    throw new Error(`Invalid mode "${String(options.mode)}". Use one of ${MODES.join(', ')}.`);
  }

  const resolved = resolveOptionTree(options, readEnvironment(options));
  const result = await run({
    verbose: resolved.verbose,
    cwd: resolved.cwd,
    dryRun: resolved.dryRun,
    cache: resolved.cache,
    actions: narrowToMode(resolved),
  });

  present(logger, resolved, result);
  logSeparator(logger);

  return result;
}

function readEnvironment(options: IWortlautTaskOptions): DotenvExpandOutput {
  if (!options.envFile) {
    return {};
  }

  const environment = loadAndExpandDotEnvFile(
    Path.combine(options.cwd, options.envFile),
    process.env,
  );

  if (environment.error) {
    throw new Error(`Failed to load environment variables: ${environment.error.message}`);
  }

  return environment;
}

/**
 * Keeps the options of the command, and those of detect, which the others read too.
 */
function narrowToMode({ mode, actions }: IWortlautTaskOptions): IRunConfig['actions'] {
  return mode === 'detect'
    ? { detect: actions.detect, analyze: actions.analyze }
    : { [mode]: actions[mode], detect: actions.detect };
}

function present(logger: ILogger, { cwd, mode }: IWortlautTaskOptions, result: IRunResult): void {
  switch (mode) {
    case 'analyze':
      presentAnalysis(logger, result);
      break;
    case 'generate':
      presentGeneration(logger, result);
      break;
    case 'detect':
      presentDetection(logger, cwd, result);
      break;
    default:
      break;
  }
}

function presentAnalysis(logger: ILogger, { analyze, gate }: IRunResult): void {
  if (analyze?.length) {
    logger.log(t`  ${magenta('analyzing the project...')}`);

    for (const [key, value] of Object.entries(
      ArrayExtensions.groupBy(analyze, (x) => x.resource.name),
    )) {
      logTree(
        logger,
        key,
        (value ?? []).map((y) => ({
          label: `${symbol(y.success ? 'success' : 'error')} ${y.message}`,
        })),
        { prefixSpaceLength: 4 },
      );
    }
  }

  if (gate) {
    logger.log(t`    ${gate.errors} with severity error, ${gate.warnings} with severity warning`);

    for (const { pack, reason } of gate.refusedPacks) {
      logger.log(t`    ${symbol('error')} the pack ${pack} was refused: ${reason}`);
    }
  }
}

function presentGeneration(logger: ILogger, { generate }: IRunResult): void {
  if (generate?.length) {
    logger.log(t`  ${magenta('generating resources...')}`);

    for (const [key, value] of Object.entries(
      ArrayExtensions.groupBy(generate, (x) => x.resource.name),
    )) {
      logTree(
        logger,
        key,
        (value ?? []).map((y) => ({ label: `${gray(y.resource.name)} -> ${bold(y.locale)}` })),
        { prefixSpaceLength: 4 },
      );
    }
  }
}

function presentDetection(logger: ILogger, cwd: string, { localizations }: IRunResult): void {
  for (const localization of (localizations ?? []).filter(
    (x) => Object.entries(x.extraction.changes).length > 0,
  )) {
    for (const parsing of localization.parsings.filter((x) => x.isStatic)) {
      logTree(
        logger,
        yellow(`${parsing.match.value}`),
        [
          {
            label: `${yellow('at')}: ${Path.relative(cwd, localization.filePath)}:${parsing.lineNumber}`,
          },
        ],
        { prefixSpaceLength: 4 },
      );
    }
  }
}

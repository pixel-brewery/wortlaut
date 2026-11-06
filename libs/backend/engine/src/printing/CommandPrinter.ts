// #region Imports

import { isAbsolute } from 'node:path';
import type { LabeledCommand, ProjectOptions, RunRecord } from '@pixel-brewery/wortlaut-contracts';
import { DEFAULT_PROJECT_OPTIONS, isSecretName } from '@pixel-brewery/wortlaut-contracts';
import type { IResolvedConfiguration } from '../configuration/ConfigurationResolver.js';
import { DisplayPath } from '../paths/DisplayPath';

// #endregion

/**
 * The start of every printed command.
 */
const BINARY = 'npx wortlaut';

/**
 * Text that a shell reads as it is.
 */
const PLAIN_SHELL_WORD = /^[A-Za-z0-9_\-./:@%+=,~]+$/;

/**
 * Option names that hold a path.
 */
const PATH_OPTIONS = new Set(['root', 'resourceRoot']);

/**
 * How many explicit keys a command shows on a screen. The command itself always holds all of them.
 */
const MAX_SHOWN_KEYS = 3;

/**
 * The longest list of keys a screen shows in characters, whatever the number of keys.
 */
const MAX_SHOWN_KEYS_LENGTH = 120;

/**
 * The flag of each option a command prints, in the order the command line reads best.
 */
const FLAGS: Readonly<Record<string, ReadonlyArray<readonly [option: string, flag: string]>>> = {
  detect: [
    ['preset', '--preset'],
    ['root', '--root'],
    ['type', '--type'],
    ['resourceKeyPrefix', '--resource-key-prefix'],
    ['resourceKeySuffix', '--resource-key-suffix'],
    ['skipTests', '--skip-tests'],
  ],
  analyze: [
    ['type', '--type'],
    ['resourceRoot', '--resource-root'],
    ['root', '--root'],
    ['preset', '--preset'],
    ['baseLocale', '--base-locale'],
    ['resourceKeyPrefix', '--resource-key-prefix'],
    ['resourceKeySuffix', '--resource-key-suffix'],
    ['rules', '--rules'],
    ['usedKeys', '--used-keys'],
    ['identicalKeys', '--identical-keys'],
    ['identicalValues', '--identical-values'],
  ],
  generate: [
    ['strategy', '--strategy'],
    ['model', '--model'],
    ['baseLocale', '--base-locale'],
    ['locales', '--locales'],
    ['temperature', '--temperature'],
    ['chunkSize', '--chunk-size'],
    ['limit', '--limit'],
    ['scope', '--scope'],
    ['namespace', '--namespace'],
    ['keys', '--keys'],
    ['instructions', '--instructions'],
    ['onlyNew', '--only-new'],
    ['type', '--type'],
    ['resourceRoot', '--resource-root'],
  ],
  transform: [
    ['types', '--types'],
    ['type', '--type'],
    ['resourceRoot', '--resource-root'],
  ],
  sort: [
    ['order', '--order'],
    ['type', '--type'],
    ['resourceRoot', '--resource-root'],
  ],
};

/**
 * Prints the command lines behind "Same as" and Copy command. They never hold a key: secret options are never printed,
 * and a token such as `{env.NAME}` stays a token.
 *
 * @public
 */
export namespace CommandPrinter {
  /**
   * Returns the flags each command prints, so the CLI can prove that it accepts every one of them.
   *
   * @public
   * @returns The flags by command.
   */
  export function flagsByCommand(): Readonly<Record<string, ReadonlyArray<string>>> {
    return Object.fromEntries(
      Object.entries(FLAGS).map(([command, flags]) => [command, flags.map(([, flag]) => flag)]),
    );
  }

  /**
   * Prints the command that repeats a run, relative to its working directory.
   *
   * @public
   * @param run The run.
   * @returns The command line. Several resource roots, which one flag cannot name, become one command per root.
   */
  export function printRun(
    run: Pick<RunRecord, 'command' | 'cwd' | 'options' | 'writeMode'>,
  ): string {
    const mode = run.writeMode === 'apply' ? '' : ` --${run.writeMode}`;

    switch (run.command) {
      case 'info':
        return `${BINARY} info`;
      case 'mcp.read':
      case 'translations.propose':
        return `${BINARY} mcp`;
      case 'ai.status':
        return `${BINARY} ai status`;
      case 'init':
        return `${BINARY} init${mode}`;
      case 'config.set':
        return printConfigEdits(run.options, mode);
      case 'detect.apply':
        return printCommand('detect', run.options, run.cwd, ` --apply${mode}`);
      case 'catalog.edit':
        return printCatalogEdit(run.options.edit as Record<string, unknown>, mode);
      case 'changes.apply':
        return `${BINARY} changes apply ${quote(String(run.options.id))}`;
      case 'changes.discard':
        return `${BINARY} changes discard ${quote(String(run.options.id))}`;
      case 'changes.recover':
        return `${BINARY} changes list`;
      case 'rules.install':
        return `${printRulesAdd(String(run.options.source))}${mode}`;
      case 'rules.update':
        return `${BINARY} rules update ${quote(String(run.options.pack))}${mode}`;
      case 'rules.settings':
        return printRuleSetting(run.options, mode);
      default:
        return printCommand(run.command, run.options, run.cwd, mode);
    }
  }

  /**
   * Prints the command behind "Same as" of Add a rule pack.
   *
   * @public
   * @param source The source, as a lock file names it.
   * @returns The command line. A folder reads as a path, relative to its repository.
   */
  export function printRulesAdd(source: string): string {
    const text = source.startsWith('folder:')
      ? toFolderPath(source.slice('folder:'.length))
      : source;

    return `${BINARY} rules add ${quote(text)}`;
  }

  /**
   * Prints a command from options.
   *
   * @public
   * @param command The command.
   * @param options The options by their names.
   * @param cwd The working directory that paths are shown relative to.
   * @param suffix What follows the flags.
   * @returns The command line.
   */
  export function printCommand(
    command: string,
    options: Readonly<Record<string, unknown>>,
    cwd: string,
    suffix = '',
  ): string {
    const roots = (FLAGS[command] ?? []).some(([option]) => option === 'resourceRoot')
      ? options.resourceRoot
      : undefined;
    const eachRoot =
      Array.isArray(roots) && roots.length > 1 ? roots : [Array.isArray(roots) ? roots[0] : roots];

    return eachRoot
      .map((root) => {
        const flags = (FLAGS[command] ?? []).flatMap(([option, flag]) =>
          printFlag(option, flag, option === 'resourceRoot' ? root : options[option], cwd),
        );

        return [`${BINARY} ${command}`, ...flags].join(' ') + suffix;
      })
      .join(' && ');
  }

  /**
   * Shortens a command line for a screen: a long `--keys` shows its first keys and how many follow. What it returns is for reading,
   * not for running, so a screen that shows it also offers the whole command to copy.
   *
   * @public
   * @param command The command line that runs.
   * @returns What fits on a screen. A command with few keys stays as it is.
   */
  export function shorten(command: string): string {
    return command.replace(/--keys ('(?:[^']|'\\'')*'|\S+)/gu, (flag: string, list: string) => {
      const keys = unquote(list).split(',');

      if (keys.length <= MAX_SHOWN_KEYS && list.length <= MAX_SHOWN_KEYS_LENGTH) {
        return flag;
      }

      const shown = keys.slice(0, MAX_SHOWN_KEYS).join(',').slice(0, MAX_SHOWN_KEYS_LENGTH);
      const rest = keys.length - MAX_SHOWN_KEYS;

      return rest > 0 ? `--keys ${quote(shown)} … and ${rest} more` : `--keys ${quote(shown)} …`;
    });
  }

  /**
   * Lists the commands of the CLI for the table of the CLI and Nx view. With a project they carry its settings.
   *
   * @public
   * @param configuration The resolved configuration of a project, if one is open.
   * @returns The commands. Every one of them exists in the CLI.
   */
  export function listCommands(
    configuration: IResolvedConfiguration | null,
  ): Array<LabeledCommand> {
    const options = configuration ? commandOptions(configuration) : null;
    const line = (command: string): string =>
      options ? printCommand(command, options, configuration?.cwd ?? '') : `${BINARY} ${command}`;

    return [
      { label: 'Detect', command: line('detect') },
      { label: 'Analyze', command: line('analyze') },
      { label: 'Generate', command: line('generate') },
      { label: 'Sort', command: line('sort') },
      { label: 'Transform', command: line('transform') },
      { label: 'Environment', command: `${BINARY} info` },
      { label: 'AI providers', command: `${BINARY} ai status` },
      { label: 'Set up a project', command: `${BINARY} init` },
      {
        label: 'Read or change a setting',
        command: `${BINARY} config get actions.analyze.rules\n${BINARY} config set actions.detect.preset angular`,
      },
      { label: 'Review list', command: `${BINARY} changes list\n${BINARY} changes apply <id>` },
      {
        label: 'Rule packs',
        command: `${BINARY} rules list\n${BINARY} rules add github:owner/repository\n${BINARY} rules update`,
      },
      { label: 'MCP server', command: `${BINARY} mcp` },
    ];
  }

  /**
   * @private
   */
  function toFolderPath(path: string): string {
    return path === '.' || path.startsWith('../') ? path : `./${path}`;
  }

  /**
   * @private
   */
  function printRuleSetting(options: Record<string, unknown>, mode: string): string {
    if (options.action === 'severity') {
      return `${BINARY} rules severity ${quote(String(options.rule))} ${quote(String(options.severity))}${mode}`;
    }

    return `${BINARY} rules ${quote(String(options.action))} ${quote(String(options.pack))}${mode}`;
  }

  /**
   * Prints the command that runs a target on all projects of a workspace.
   *
   * @public
   * @param runner The package manager's way to run a binary.
   * @param target The Nx target.
   * @param configuration The Nx configuration.
   * @returns The command line.
   */
  export function printRunMany(runner: string, target: string, configuration: string): string {
    return `${runner} nx run-many --target=${quote(target)} --configuration=${quote(configuration)}`;
  }

  /**
   * @private
   */
  function printConfigEdits(options: Readonly<Record<string, unknown>>, mode: string): string {
    const edits = Array.isArray(options.edits)
      ? (options.edits as Array<{ key: string; value: unknown }>)
      : [{ key: String(options.key), value: options.value }];

    return edits
      .map(
        ({ key, value }) =>
          `${BINARY} config set ${quote(key)} ${quote(typeof value === 'string' ? value : JSON.stringify(value))}${mode}`,
      )
      .join(' && ');
  }

  /**
   * @private
   */
  function printCatalogEdit(edit: Readonly<Record<string, unknown>>, mode: string): string {
    const words: Array<string> = [];

    switch (edit.kind) {
      case 'set-value':
        words.push('set', String(edit.key), String(edit.value), '--locale', String(edit.locale));
        break;
      case 'set-comment':
        words.push(
          'comment',
          String(edit.key),
          String(edit.comment),
          '--locale',
          String(edit.locale),
        );
        break;
      case 'delete-key':
        words.push('delete', String(edit.key));
        break;
      case 'merge-keys':
        words.push('merge', String(edit.keep), ...(edit.remove as Array<string>));
        break;
      default:
        words.push('add-locale', String(edit.locale));
    }

    return `${BINARY} catalog ${words.map((word) => (word.startsWith('--') ? word : quote(word))).join(' ')}${mode}`;
  }

  /**
   * Flattens the options of a project into the options of the commands. Tokens stay tokens.
   *
   * @private
   */
  function commandOptions(configuration: IResolvedConfiguration): Record<string, unknown> {
    const { detect, analyze, generate, sort, transform } = (configuration.options.actions ??
      {}) as NonNullable<ProjectOptions['actions']>;

    return {
      preset: detect?.preset,
      root: configuration.root,
      type: detect?.type,
      resourceRoot: configuration.resourceRoots,
      resourceKeyPrefix: detect?.resourceKey?.prefix,
      resourceKeySuffix: detect?.resourceKey?.suffix,
      baseLocale: analyze?.baseLocale,
      rules: analyze?.rules,
      usedKeys: analyze?.usedKeys,
      identicalKeys: analyze?.identicalKeys,
      identicalValues: analyze?.identicalValues,
      order: sort?.order,
      types: transform?.types,
      strategy:
        generate?.strategy === DEFAULT_PROJECT_OPTIONS.actions.generate.strategy
          ? undefined
          : generate?.strategy,
      model:
        generate?.model === DEFAULT_PROJECT_OPTIONS.actions.generate.model
          ? undefined
          : generate?.model,
      locales: generate?.locales,
    };
  }

  /**
   * @private
   */
  function printFlag(option: string, flag: string, value: unknown, cwd: string): Array<string> {
    if (
      isSecretName(option) ||
      value === undefined ||
      value === null ||
      value === '' ||
      value === false
    ) {
      return [];
    }

    if (value === true) {
      return [flag];
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? [flag, quote(value.join(','))] : [];
    }

    return [
      flag,
      quote(PATH_OPTIONS.has(option) ? relativeToCwd(String(value), cwd) : String(value)),
    ];
  }

  /**
   * @private
   */
  function relativeToCwd(path: string, cwd: string): string {
    return isAbsolute(path) && cwd ? DisplayPath.relativeTo(cwd, path) : path;
  }

  /**
   * @private
   */
  function unquote(word: string): string {
    return word.startsWith("'") ? word.slice(1, -1).split("'\\''").join("'") : word;
  }

  /**
   * @private
   */
  function quote(word: string): string {
    return PLAIN_SHELL_WORD.test(word) ? word : `'${word.split("'").join("'\\''")}'`;
  }
}

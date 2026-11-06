// #region Imports

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import {
  DEFAULT_PROJECT_OPTIONS,
  isSecretName,
  ProjectOptionsSchema,
  readEnvToken,
  type EffectiveSetting,
  type ProjectOptions,
  type SettingSource,
} from '@pixel-brewery/wortlaut-contracts';
import { parse, type ParseError } from 'jsonc-parser';
import { EngineError } from '../errors/EngineError.js';
import { PathResolver } from '../paths/PathResolver.js';

// #endregion

/**
 * The Nx executors that run Wortlaut, under the scopes they were published with.
 */
const EXECUTOR = /nx-tasks:(localizator|wortlaut)$/;

/**
 * Returns whether an Nx executor runs Wortlaut, under any of the scopes it was published with.
 *
 * @public
 * @param executor The name of the executor.
 * @returns `true` when the executor runs Wortlaut.
 */
export function isWortlautExecutor(executor: string | undefined): boolean {
  return EXECUTOR.test(executor ?? '');
}

/**
 * The configuration files of a project. The first one that exists is read, the other one stays a fallback.
 */
const CONFIG_FILES = [
  { name: 'wortlaut.config.json', kind: 'wortlaut-config' },
  { name: 'localizator.config.json', kind: 'localizator-config' },
] as const;

/**
 * The name of the configuration file `init` creates.
 *
 * @public
 */
export const CONFIG_FILE_NAME = CONFIG_FILES[0].name;

/**
 * What the configuration should be resolved for.
 *
 * @public
 */
export interface IConfigurationRequest {
  /**
   * The working directory of the command.
   */
  cwd: string;

  /**
   * The options given as arguments of this call. `root` and `resourceRoot` among them are relative to `cwd`.
   */
  arguments?: ProjectOptions;

  /**
   * Whether to read `nx.json` and `project.json`.
   *
   * @default true
   */
  readNx?: boolean;

  /**
   * The name of the Nx target. By default the first target that runs Wortlaut's executor.
   */
  target?: string;

  /**
   * The name of the Nx configuration. By default the target's default configuration.
   */
  configuration?: string;
}

/**
 * The Nx target a configuration was resolved from, for writing a setting back.
 *
 * @public
 */
export interface IResolvedNxTarget {
  projectFile: string;
  targetName: string;
  configuration: string | null;

  /**
   * The options after Nx's own merge of target defaults, options and configuration.
   */
  options: Record<string, unknown>;

  /**
   * Whether `project.json` sets this top-level option itself, so a change below it needs no copy of the inherited value.
   */
  ownOptions: Array<string>;
}

/**
 * A project's configuration: every value with its source, the merged options and the resolved paths.
 *
 * @public
 */
export interface IResolvedConfiguration {
  cwd: string;
  workspaceRoot: string;
  projectRoot: string;
  configFile: string | null;
  configKind: 'wortlaut-config' | 'localizator-config' | null;
  nxTarget: IResolvedNxTarget | null;

  /**
   * The merged options. Tokens stay unresolved until a command needs their value.
   */
  options: ProjectOptions;

  settings: Array<EffectiveSetting>;

  /**
   * What is wrong without being fatal, such as options nobody reads.
   */
  warnings: Array<string>;

  /**
   * The directory of `root`, empty when none is set.
   */
  root: string;

  resourceRoots: Array<string>;

  /**
   * Fills a value's tokens from `.env` and the environment.
   */
  fill: <T>(value: T) => T;
}

/**
 * A layer of the resolution.
 */
interface ILayer {
  source: SettingSource;
  options: ProjectOptions;
  directory: string;
}

/**
 * Resolves the configuration of a project with a source for every value.
 *
 * @remarks
 * The order is target defaults in `nx.json`, the target in `project.json`, its configuration, then `wortlaut.config.json`
 * or else `localizator.config.json`, then the arguments. The Nx layers merge like Nx merges them, whole top-level options
 * at a time, so a CLI run and an Nx run of one configuration read the same values. `.env` only fills tokens.
 *
 * @public
 */
export class ConfigurationResolver {
  // #region Fields

  private readonly _env: NodeJS.ProcessEnv;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ConfigurationResolver` class.
   *
   * @public
   * @param env The environment that fills tokens after `.env`.
   */
  public constructor(env: NodeJS.ProcessEnv) {
    this._env = env;
  }

  // #endregion

  // #region Methods

  /**
   * Resolves the configuration.
   *
   * @public
   * @param request What to resolve it for.
   * @returns The resolved configuration.
   * @throws EngineError when a file cannot be read, holds invalid values or points outside of the workspace.
   */
  public resolve(request: IConfigurationRequest): IResolvedConfiguration {
    const cwd = resolve(request.cwd);
    const workspaceRoot = this.findWorkspaceRoot(cwd);
    const warnings = new Array<string>();
    const nx =
      request.readNx === false ? null : this.readNxLayers(cwd, workspaceRoot, request, warnings);
    const config = this.readConfigFile(cwd, workspaceRoot, warnings);
    const argumentOptions = request.arguments ?? {};
    const provenance = new Map<string, SettingSource>();
    const directories = new Map<string, string>();
    let merged: Record<string, unknown> = {};

    // Nx hands over whole top-level options: a later layer replaces what an earlier one set below the same option.
    for (const layer of nx?.layers ?? []) {
      for (const [key, value] of Object.entries(layer.options)) {
        merged[key] = value;
        this.forgetBelow(provenance, directories, key);
        this.remember(provenance, directories, value, key, layer);
      }
    }

    // The defaults only fill what the Nx layers leave open, and the files above them override value by value.
    merged = this.mergeDeep(DEFAULT_PROJECT_OPTIONS, merged);
    this.rememberMissing(provenance, DEFAULT_PROJECT_OPTIONS, '');

    const fileLayers = config ? [config] : [];
    const argumentLayer: ILayer = {
      source: { kind: 'arguments', file: null },
      options: argumentOptions,
      directory: cwd,
    };

    for (const layer of fileLayers) {
      merged = this.mergeDeep(merged, layer.options);
      this.remember(provenance, directories, layer.options, '', layer);
    }

    const fileRoot = this.readPath(merged, 'actions.detect.root');
    const fileResourceRoot = this.readPath(merged, 'actions.detect.resourceRoot');
    const fileRootDirectory = directories.get('actions.detect.root');
    const fileResourceRootDirectory = directories.get('actions.detect.resourceRoot');

    merged = this.mergeDeep(merged, argumentLayer.options);
    this.remember(provenance, directories, argumentLayer.options, '', argumentLayer);

    const options = merged as ProjectOptions;
    const root = this.resolveRoot(cwd, argumentOptions, fileRoot, fileRootDirectory, workspaceRoot);
    const resourceRoots = this.resolveResourceRoots(
      cwd,
      argumentOptions,
      fileRoot,
      fileResourceRoot,
      fileRootDirectory ?? fileResourceRootDirectory,
      workspaceRoot,
    );
    const projectRoot = nx?.projectRoot ?? config?.directory ?? cwd;

    return {
      cwd,
      workspaceRoot,
      projectRoot,
      configFile: config?.source.file ?? null,
      configKind: config ? (config.source.kind as 'wortlaut-config' | 'localizator-config') : null,
      nxTarget: nx?.target ?? null,
      options,
      settings: this.createSettings(merged, provenance),
      warnings,
      root,
      resourceRoots,
      fill: this.createFiller(options, projectRoot, workspaceRoot),
    };
  }

  /**
   * @private
   */
  private findWorkspaceRoot(cwd: string): string {
    for (const directory of this.ancestors(cwd)) {
      if (existsSync(join(directory, 'nx.json')) || existsSync(join(directory, '.git'))) {
        return directory;
      }
    }

    return cwd;
  }

  /**
   * @private
   */
  private ancestors(from: string, until?: string): Array<string> {
    const directories = new Array<string>();
    let directory = from;

    while (true) {
      directories.push(directory);

      const parent = dirname(directory);

      if (directory === until || parent === directory) {
        return directories;
      }

      directory = parent;
    }
  }

  /**
   * Reads the Nx layers of the nearest project with a target that runs Wortlaut.
   *
   * @private
   */
  private readNxLayers(
    cwd: string,
    workspaceRoot: string,
    request: IConfigurationRequest,
    warnings: Array<string>,
  ): { layers: Array<ILayer>; projectRoot: string; target: IResolvedNxTarget } | null {
    const nxFile = join(workspaceRoot, 'nx.json');

    if (!existsSync(nxFile)) {
      return null;
    }

    const projectDirectory = this.ancestors(cwd, workspaceRoot).find((directory) =>
      existsSync(join(directory, 'project.json')),
    );

    if (!projectDirectory) {
      return null;
    }

    const projectFile = join(projectDirectory, 'project.json');
    const project = this.readJson(projectFile) as { targets?: Record<string, INxTarget> };
    const targetEntry = Object.entries(project.targets ?? {}).find(([name, target]) =>
      request.target ? name === request.target : EXECUTOR.test(target.executor ?? ''),
    );

    if (!targetEntry) {
      if (request.target) {
        throw new EngineError(
          'invalid-configuration',
          `The project ${projectFile} has no target '${request.target}'.`,
          [projectFile],
        );
      }

      return null;
    }

    const [targetName, target] = targetEntry;
    const nxConfig = this.readJson(nxFile) as { targetDefaults?: Record<string, INxTarget> };
    const defaults =
      (target.executor ? nxConfig.targetDefaults?.[target.executor] : undefined) ??
      nxConfig.targetDefaults?.[targetName];
    const configurationName =
      request.configuration ??
      defaults?.defaultConfiguration ??
      target.defaultConfiguration ??
      null;
    const layers = new Array<ILayer>();
    const push = (kind: SettingSource['kind'], file: string, options: unknown): void => {
      if (options) {
        layers.push({
          source: { kind, file },
          options: this.validate(options, file, warnings),
          directory: projectDirectory,
        });
      }
    };

    push('nx-target-defaults', nxFile, defaults?.options);
    push('project-json', projectFile, target.options);

    if (configurationName) {
      const fromProject = target.configurations?.[configurationName];
      const fromDefaults = defaults?.configurations?.[configurationName];

      if (!fromProject && !fromDefaults && request.configuration) {
        throw new EngineError(
          'invalid-configuration',
          `The target '${targetName}' has no configuration '${configurationName}'.`,
          [projectFile],
        );
      }

      push('nx-configuration', nxFile, fromDefaults);
      push('nx-configuration', projectFile, fromProject);
    }

    return {
      layers,
      projectRoot: projectDirectory,
      target: {
        projectFile,
        targetName,
        configuration: configurationName,
        options: Object.assign({}, ...layers.map((layer) => layer.options)) as Record<
          string,
          unknown
        >,
        ownOptions: Object.keys(target.options ?? {}),
      },
    };
  }

  /**
   * Finds the nearest configuration file, up to the workspace root.
   *
   * @private
   */
  private readConfigFile(
    cwd: string,
    workspaceRoot: string,
    warnings: Array<string>,
  ): ILayer | null {
    for (const directory of this.ancestors(cwd, workspaceRoot)) {
      for (const { name, kind } of CONFIG_FILES) {
        const file = join(directory, name);

        if (existsSync(file)) {
          return {
            source: { kind, file },
            options: this.validate(this.readJson(file), file, warnings),
            directory,
          };
        }
      }
    }

    return null;
  }

  /**
   * @private
   */
  private readJson(file: string): unknown {
    const errors = new Array<ParseError>();
    const value = parse(readFileSync(file, 'utf8'), errors) as unknown;

    if (errors.length > 0) {
      throw new EngineError('invalid-configuration', `The file ${file} is not valid JSON.`, [file]);
    }

    return value ?? {};
  }

  /**
   * Validates the options of a file. Unknown options are removed with a warning, because Nx targets may carry their own.
   *
   * @private
   */
  private validate(options: unknown, file: string, warnings: Array<string>): ProjectOptions {
    const result = ProjectOptionsSchema.safeParse(options);

    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');

      throw new EngineError(
        'invalid-configuration',
        `The file ${file} holds invalid settings: ${issues}`,
        [file],
      );
    }

    for (const key of this.unknownKeys(options, result.data, '')) {
      warnings.push(`The file ${file} sets '${key}', which Wortlaut does not read.`);
    }

    return result.data;
  }

  /**
   * @private
   */
  private unknownKeys(raw: unknown, parsed: unknown, path: string): Array<string> {
    if (!this.isRecord(raw) || !this.isRecord(parsed)) {
      return [];
    }

    return Object.entries(raw).flatMap(([key, value]) => {
      const keyPath = path ? `${path}.${key}` : key;

      return key in parsed ? this.unknownKeys(value, parsed[key], keyPath) : [keyPath];
    });
  }

  /**
   * @private
   */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /**
   * @private
   */
  private mergeDeep(base: unknown, over: unknown): Record<string, unknown> {
    const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };

    for (const [key, value] of Object.entries(over as Record<string, unknown>)) {
      result[key] =
        this.isRecord(value) && this.isRecord(result[key])
          ? this.mergeDeep(result[key], value)
          : value;
    }

    return result;
  }

  /**
   * @private
   */
  private remember(
    provenance: Map<string, SettingSource>,
    directories: Map<string, string>,
    value: unknown,
    path: string,
    layer: ILayer,
  ): void {
    if (this.isRecord(value)) {
      for (const [key, item] of Object.entries(value)) {
        this.remember(provenance, directories, item, path ? `${path}.${key}` : key, layer);
      }
    } else if (value !== undefined) {
      provenance.set(path, layer.source);
      directories.set(path, layer.directory);
    }
  }

  /**
   * @private
   */
  private rememberMissing(
    provenance: Map<string, SettingSource>,
    value: unknown,
    path: string,
  ): void {
    if (this.isRecord(value)) {
      for (const [key, item] of Object.entries(value)) {
        this.rememberMissing(provenance, item, path ? `${path}.${key}` : key);
      }
    } else if (!provenance.has(path)) {
      provenance.set(path, { kind: 'default', file: null });
    }
  }

  /**
   * @private
   */
  private forgetBelow(
    provenance: Map<string, SettingSource>,
    directories: Map<string, string>,
    key: string,
  ): void {
    for (const path of provenance.keys()) {
      if (path === key || path.startsWith(`${key}.`)) {
        provenance.delete(path);
        directories.delete(path);
      }
    }
  }

  /**
   * @private
   */
  private readPath(value: unknown, path: string): unknown {
    return path
      .split('.')
      .reduce<unknown>(
        (current, key) => (this.isRecord(current) ? current[key] : undefined),
        value,
      );
  }

  /**
   * @private
   */
  private resolveRoot(
    cwd: string,
    argumentOptions: ProjectOptions,
    fileRoot: unknown,
    directory: string | undefined,
    workspaceRoot: string,
  ): string {
    const argument = argumentOptions.actions?.detect?.root;

    if (argument !== undefined) {
      return PathResolver.fromArgument(cwd, argument);
    }

    if (!fileRoot || !directory) {
      return '';
    }

    const path = join(directory, fileRoot as string);

    this.assertInsideWorkspace(path, workspaceRoot, 'root');

    return path;
  }

  /**
   * @private
   */
  private resolveResourceRoots(
    cwd: string,
    argumentOptions: ProjectOptions,
    fileRoot: unknown,
    fileResourceRoot: unknown,
    directory: string | undefined,
    workspaceRoot: string,
  ): Array<string> {
    const argument = argumentOptions.actions?.detect?.resourceRoot;

    if (argument !== undefined) {
      return (typeof argument === 'string' ? [argument] : argument).map((entry) =>
        PathResolver.fromArgument(cwd, entry),
      );
    }

    if (!directory) {
      return [''];
    }

    const paths = PathResolver.resourceRootsFromOptions(
      join(directory, (fileRoot as string | undefined) ?? ''),
      fileResourceRoot as string | Array<string>,
    );

    for (const path of paths) {
      this.assertInsideWorkspace(path, workspaceRoot, 'resourceRoot');
    }

    return paths;
  }

  /**
   * A repository's own files may not point a command outside of the repository; an argument is the user's own choice.
   *
   * @private
   */
  private assertInsideWorkspace(path: string, workspaceRoot: string, name: string): void {
    if (!PathResolver.isInside(workspaceRoot, path)) {
      throw new EngineError(
        'invalid-configuration',
        `The configured ${name} ${path} is outside of the workspace ${workspaceRoot}. Pass it as an argument to use it.`,
      );
    }
  }

  /**
   * @private
   */
  private createSettings(
    merged: Record<string, unknown>,
    provenance: Map<string, SettingSource>,
  ): Array<EffectiveSetting> {
    return Array.from(provenance.entries())
      .map(([key, source]) => {
        const value = this.readPath(merged, key);
        const secret = isSecretName(key.split('.').at(-1) ?? '');

        return { key, value: secret ? this.maskSecret(value) : value, secret, source };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  /**
   * A token names a variable and is safe to show; anything else in a secret setting is the secret itself.
   *
   * @private
   */
  private maskSecret(value: unknown): unknown {
    return typeof value !== 'string' || value === '' || readEnvToken(value) ? value : '***';
  }

  /**
   * Creates the function that fills tokens: `.env` first, as the Nx executor does, then the environment.
   *
   * @private
   */
  private createFiller(
    options: ProjectOptions,
    projectRoot: string,
    workspaceRoot: string,
  ): <T>(value: T) => T {
    const envPath = join(projectRoot, options.envFile ?? '.env');
    let fromFile: Record<string, string | undefined> | null = null;
    const readFile = (): Record<string, string | undefined> => {
      if (!PathResolver.isInside(workspaceRoot, envPath)) {
        throw new EngineError(
          'invalid-configuration',
          `The configured envFile ${envPath} is outside of the workspace ${workspaceRoot}.`,
        );
      }

      return (fromFile ??= existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {});
    };
    const fill = <T>(value: T, setting?: string): T => {
      if (typeof value === 'string') {
        const name = readEnvToken(value);

        if (!name) {
          return value;
        }

        // The settings of a repository must not lift a secret of the user into a prompt, a key or a file.
        if (setting !== undefined && isSecretName(name) && !isSecretName(setting)) {
          throw new EngineError(
            'invalid-configuration',
            `The setting ${setting} must not read the secret variable ${name}. Only a setting that holds a secret may.`,
          );
        }

        const filled = readFile()[name] ?? this._env[name];

        if (filled === undefined) {
          throw new EngineError(
            'invalid-configuration',
            `The environment variable ${name} is not set.`,
          );
        }

        return filled as T;
      }

      if (Array.isArray(value)) {
        return value.map((item: unknown) => fill(item, setting)) as T;
      }

      if (this.isRecord(value)) {
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, fill(item, key)]),
        ) as T;
      }

      return value;
    };

    return fill;
  }

  // #endregion
}

/**
 * The part of an Nx target that the resolution reads.
 */
interface INxTarget {
  executor?: string;
  defaultConfiguration?: string;
  options?: unknown;
  configurations?: Record<string, unknown>;
}

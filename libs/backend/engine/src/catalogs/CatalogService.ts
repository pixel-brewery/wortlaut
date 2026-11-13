// #region Imports

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import type {
  CatalogKeyDetail,
  CatalogKeyRow,
  CatalogKeys,
  CatalogOverview,
  ProjectRecord,
} from '@pixel-brewery/wortlaut-contracts';
import {
  CatalogComments,
  COMMENTS_FILE_NAME,
  isTestFile,
  KeyPatternStoppedError,
  PoText,
  MissingTranslationsRule,
  placeholdersOf,
  Presets,
  ResourceTransformer,
  UsedKeysFinder,
  type IKeyUsage,
  type IMissingTranslationsRuleResultData,
  type IResourceInfo,
  type ResourceMode,
} from '@pixel-brewery/wortlaut-core';
import type { IResolvedConfiguration } from '../configuration/ConfigurationResolver.js';
import { EngineError } from '../errors/EngineError.js';
import { QUIET_LOGGER } from '../io/QuietLogger.js';
import { DisplayPath } from '../paths/DisplayPath.js';
import { PathResolver } from '../paths/PathResolver.js';
import { countNamespaces, createNamespaceOf, withoutPrefix } from '../projects/Namespaces.js';
import type { ProjectService } from '../projects/ProjectService.js';
import { walkRepository } from '../projects/RepositoryWalker.js';
import { readCatalogs } from '../usecases/DetectScanUseCase.js';
import type { WorkspaceService } from '../workspaces/WorkspaceService.js';
import type { IFileSystem } from '@pixel-brewery/utilities';

// #endregion

/**
 * The most projects whose catalogs stay in memory.
 */
const MAX_INDEXES = 4;

/**
 * Everything the queries of Translations read, built once per look at a project.
 */
interface ICatalogIndex {
  signature: string;
  configuration: IResolvedConfiguration;
  format: ResourceMode;
  baseLocale: string;
  prefix: string;
  catalogs: Array<IResourceInfo>;

  /**
   * The folder and the text of the comments file of a JSON project.
   */
  comments: { folder: string; text: string | null };
  keys: Array<string>;
  values: Map<string, Map<string, string>>;
  used: Set<string> | null;
  usages: Map<string, Array<IKeyUsage>>;
  duplicates: Map<string, Array<string>>;
  namespaceOf: (key: string) => string;
}

/**
 * What a surface needs to look at the catalogs of a project.
 *
 * @internal
 */
export interface ICatalogServiceInit {
  workspaces: WorkspaceService;
  projects: ProjectService;
  fileSystem: IFileSystem;
}

/**
 * The reads behind Translations and the key patterns of the test lab: namespaces, search, filters and the details of a key.
 * Reading the sources of a project takes a moment, so what it finds stays in memory until a catalog changes or a view asks
 * for a fresh look.
 *
 * @public
 */
export class CatalogService {
  // #region Fields

  private readonly _init: ICatalogServiceInit;
  private readonly _indexes: Map<string, ICatalogIndex>;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `CatalogService` class.
   *
   * @param init What the service is composed of.
   */
  public constructor(init: ICatalogServiceInit) {
    this._init = init;
    this._indexes = new Map();
  }

  // #endregion

  // #region Methods

  /**
   * Returns the frame of Translations.
   *
   * @public
   * @param projectId The project.
   * @param refresh Whether to read the project again.
   * @returns The overview.
   */
  public overview(projectId: string, refresh: boolean): CatalogOverview {
    if (refresh) {
      this.invalidate(projectId);
    }

    const index = this.indexOf(projectId);
    const locales = Array.from(new Set(index.catalogs.map((catalog) => catalog.locale)));
    const declared = [
      ...(index.configuration.options.actions?.detect?.languages ?? []),
      ...(index.configuration.options.actions?.generate?.locales ?? []),
    ];

    return {
      prefix: index.prefix,
      baseLocale: index.baseLocale,
      locales: Array.from(new Set([index.baseLocale, ...locales, ...declared])).map((code) => ({
        code,
        file: this.fileOf(index, code),
      })),
      format: index.format,
      commentsSupported: true,
      keyCount: index.keys.length,
      fileCount: index.catalogs.length,
      namespaces: countNamespaces(index.keys, index.prefix),
    };
  }

  /**
   * Returns the rows of the table of keys.
   *
   * @public
   * @param request What to show.
   * @returns The rows.
   */
  public keys(request: {
    projectId: string;
    namespace: string | null;
    search: string;
    filter: 'all' | 'duplicates' | 'unused' | 'placeholders';
    targetLocale: string | null;
    offset?: number;
    limit: number;
  }): CatalogKeys {
    const index = this.indexOf(request.projectId);
    const target = request.targetLocale ?? this.defaultTarget(index);
    const search = request.search.trim().toLowerCase();
    const flag =
      request.filter === 'all'
        ? null
        : ({ duplicates: 'duplicate', unused: 'unused', placeholders: 'placeholder' } as const)[
            request.filter
          ];
    const offset = request.offset ?? 0;
    const rows: Array<CatalogKeyRow> = [];
    let total = 0;
    let matching = 0;

    for (const key of index.keys) {
      if (request.namespace !== null && index.namespaceOf(key) !== request.namespace) {
        continue;
      }

      total++;

      const row = this.rowOf(index, key, target);

      if (flag && !row.flags.includes(flag)) {
        continue;
      }

      if (
        search &&
        !row.key.toLowerCase().includes(search) &&
        !row.base.toLowerCase().includes(search) &&
        !(row.target ?? '').toLowerCase().includes(search)
      ) {
        continue;
      }

      if (matching >= offset && rows.length < request.limit) {
        rows.push(row);
      }

      matching++;
    }

    return { rows, matching, total };
  }

  /**
   * Returns the details of a key.
   *
   * @public
   * @param projectId The project.
   * @param key The key.
   * @param targetLocale The locale that is edited.
   * @returns The details.
   * @throws EngineError when no catalog holds the key anymore.
   */
  public keyDetail(projectId: string, key: string, targetLocale: string | null): CatalogKeyDetail {
    const index = this.indexOf(projectId);
    const values = index.values.get(key);

    if (!values) {
      throw new EngineError('invalid-arguments', `No catalog holds the key ${key}.`);
    }

    const target = targetLocale ?? this.defaultTarget(index);
    const value = target ? (values.get(target) ?? null) : null;

    return {
      key,
      base: values.get(index.baseLocale) ?? '',
      target: value,
      comment: this.commentOf(index, key, target ?? index.baseLocale),
      findings: this.findingsOf(index, key, target),
      usages: index.usages.get(key) ?? [],
    };
  }

  /**
   * Returns the keys of a project.
   *
   * @public
   * @param projectId The project.
   * @returns The keys, sorted.
   */
  public allKeys(projectId: string): Array<string> {
    return this.indexOf(projectId).keys;
  }

  /**
   * Returns the number of keys and catalog files of a project.
   *
   * @public
   * @param projectId The project.
   * @returns The counts and the catalogs.
   */
  public stats(projectId: string): {
    keyCount: number;
    fileCount: number;
    catalogs: ReadonlyArray<IResourceInfo>;
  } {
    const index = this.indexOf(projectId);

    return {
      keyCount: index.keys.length,
      fileCount: index.catalogs.length,
      catalogs: index.catalogs,
    };
  }

  /**
   * Returns what Generate shows about the catalogs of a project.
   *
   * @public
   * @param projectId The project.
   * @returns The figures and the namespaces, each with the start of its keys.
   */
  public translationOverview(projectId: string): {
    baseLocale: string;
    format: ResourceMode;
    keyCount: number;
    namespaces: Array<{ name: string; path: string; count: number }>;
  } {
    const index = this.indexOf(projectId);

    return {
      baseLocale: index.baseLocale,
      format: index.format,
      keyCount: index.keys.length,
      namespaces: countNamespaces(index.keys, index.prefix).map(({ name, count }) => ({
        name,
        count,
        path: this.namespacePath(index, name),
      })),
    };
  }

  /**
   * Returns the locales a project can translate into, with how far each one is.
   *
   * @public
   * @param projectId The project.
   * @returns The locales.
   */
  public translationTargets(
    projectId: string,
  ): Array<{ locale: string; isNew: boolean; missing: number; identical: number }> {
    const index = this.indexOf(projectId);
    const declared = [
      ...(index.configuration.options.actions?.detect?.languages ?? []),
      ...(index.configuration.options.actions?.generate?.locales ?? []),
    ];
    const locales = Array.from(
      new Set([...declared, ...index.catalogs.map((catalog) => catalog.locale)]),
    ).filter((locale) => locale && locale !== index.baseLocale);
    const baseKeys = index.keys.filter((key) => index.values.get(key)?.has(index.baseLocale));

    return locales.map((locale) => ({
      locale,
      isNew: !index.catalogs.some((catalog) => catalog.locale === locale),
      missing: baseKeys.filter((key) => !index.values.get(key)?.has(locale)).length,
      identical: this.identicalCount(index, locale),
    }));
  }

  /**
   * Returns a sample of a project for the test lab: real keys and values, nothing else.
   *
   * @public
   * @param projectId The project.
   * @param namespace The start of the keys, or `null` for all.
   * @param size How many.
   * @returns The sample.
   */
  public sample(
    projectId: string,
    namespace: string | null,
    size: number,
  ): Array<{ key: string; base: string; comment: string }> {
    const index = this.indexOf(projectId);

    return index.keys
      .filter((key) => !namespace || key === namespace || key.startsWith(`${namespace}.`))
      .filter((key) => (index.values.get(key)?.get(index.baseLocale) ?? '') !== '')
      .slice(0, size)
      .map((key) => ({
        key,
        base: index.values.get(key)?.get(index.baseLocale) ?? '',
        comment: this.commentOf(index, key, index.baseLocale),
      }));
  }

  /**
   * Returns the absolute path of the first catalog of a locale, for opening it outside of the app.
   *
   * @public
   * @param projectId The project.
   * @param locale The locale.
   * @returns The path.
   * @throws EngineError when the locale has no catalog.
   */
  public catalogPath(projectId: string, locale: string): string {
    const catalog = this.indexOf(projectId).catalogs.find(
      (candidate) => candidate.locale === locale,
    );

    if (!catalog) {
      throw new EngineError('invalid-arguments', `The locale '${locale}' has no catalog.`);
    }

    return catalog.path;
  }

  /**
   * Forgets what was read about a project, because something changed its files.
   *
   * @public
   * @param projectId The project.
   */
  public invalidate(projectId: string): void {
    this._indexes.delete(projectId);
  }

  /**
   * @private
   */
  private indexOf(projectId: string): ICatalogIndex {
    const { project } = this._init.workspaces.requireProject(projectId);
    const cached = this._indexes.get(projectId);

    if (cached && cached.signature === this.signatureOf(cached.catalogs, cached.comments.folder)) {
      return cached;
    }

    const index = this.build(project);

    this._indexes.delete(projectId);
    this._indexes.set(projectId, index);

    for (const oldest of this._indexes.keys()) {
      if (this._indexes.size <= MAX_INDEXES) {
        break;
      }

      this._indexes.delete(oldest);
    }

    return index;
  }

  /**
   * @private
   */
  private build(project: ProjectRecord): ICatalogIndex {
    const configuration = this._init.projects.resolve(project);
    const actions = configuration.options.actions;
    const format = (actions?.detect?.type ?? 'json') as ResourceMode;
    const prefix = actions?.detect?.resourceKey?.prefix ?? '';
    const baseLocale = actions?.analyze?.baseLocale ?? 'en';
    const catalogs = readCatalogs(
      configuration.resourceRoots.filter((root) => root.length > 0),
      format,
      { logger: QUIET_LOGGER, fileSystem: this._init.fileSystem },
    );
    const values = new Map<string, Map<string, string>>();

    for (const catalog of catalogs) {
      for (const [key, value] of catalog.entries()) {
        const locales = values.get(key) ?? new Map<string, string>();

        if (!locales.has(catalog.locale)) {
          locales.set(catalog.locale, value);
        }

        values.set(key, locales);
      }
    }

    const keys = Array.from(values.keys()).sort((a, b) => a.localeCompare(b));
    const sources = this.readSources(configuration, project.folder, catalogs);
    const finder = new UsedKeysFinder();
    const finderOptions = { prefix, usedKeys: actions?.analyze?.usedKeys ?? [] };
    let used: Set<string> | null = null;

    if (sources) {
      try {
        used = finder.find(
          sources.map((source) => source.content),
          keys,
          finderOptions,
        );
      } catch (error) {
        if (!(error instanceof KeyPatternStoppedError)) {
          throw error;
        }
        // Analysis reports the stopped expression. A catalog can still show its translations and source locations.
      }
    }

    return {
      signature: this.signatureOf(catalogs, configuration.cwd),
      configuration,
      format,
      baseLocale,
      prefix,
      catalogs,
      comments: {
        folder: configuration.cwd,
        text: format === 'json' ? this.readComments(configuration.cwd) : null,
      },
      keys,
      values,
      used,
      usages: sources ? finder.locate(sources, keys, finderOptions) : new Map(),
      duplicates: this.findDuplicates(keys, values, baseLocale),
      namespaceOf: createNamespaceOf(keys, prefix),
    };
  }

  /**
   * Reads the sources, by the same rules as the `unused-keys` rule: no test files and no catalogs. Without a root or a
   * preset there is nothing to read.
   *
   * @private
   */
  private readSources(
    configuration: IResolvedConfiguration,
    folder: string,
    catalogs: ReadonlyArray<IResourceInfo>,
  ): Array<{ file: string; content: string }> | null {
    const preset = configuration.options.actions?.detect?.preset;

    if (!configuration.root || !preset) {
      return null;
    }

    const extensions = new Set(Presets.get(QUIET_LOGGER, preset).getExtensions());
    const catalogFiles = new Set(catalogs.map((catalog) => resolve(catalog.path)));
    const roots = configuration.resourceRoots
      .filter((root) => root.length > 0)
      .map((root) => resolve(folder, root));

    return walkRepository(resolve(folder, configuration.root))
      .files.filter(
        (file) =>
          extensions.has(extname(file)) &&
          !isTestFile(file) &&
          !catalogFiles.has(file) &&
          !roots.some((root) => PathResolver.isInside(root, file)),
      )
      .map((file) => ({
        file: DisplayPath.relativeTo(folder, file),
        content: readFileSync(file, 'utf8'),
      }));
  }

  /**
   * @private
   */
  private findDuplicates(
    keys: ReadonlyArray<string>,
    values: ReadonlyMap<string, ReadonlyMap<string, string>>,
    baseLocale: string,
  ): Map<string, Array<string>> {
    const byValue = new Map<string, Array<string>>();

    for (const key of keys) {
      const value = values.get(key)?.get(baseLocale);

      if (value) {
        byValue.set(value, [...(byValue.get(value) ?? []), key]);
      }
    }

    return byValue;
  }

  /**
   * @private
   */
  private rowOf(index: ICatalogIndex, key: string, target: string | null): CatalogKeyRow {
    const values = index.values.get(key) as Map<string, string>;
    const base = values.get(index.baseLocale) ?? '';
    const flags: CatalogKeyRow['flags'] = [];

    if ((index.duplicates.get(base)?.length ?? 0) > 1) {
      flags.push('duplicate');
    }

    if (index.used && !index.used.has(key)) {
      flags.push('unused');
    }

    if (placeholdersOf(base).length > 0) {
      flags.push('placeholder');
    }

    return { key, flags, base, target: target ? (values.get(target) ?? null) : null };
  }

  /**
   * @private
   */
  private findingsOf(index: ICatalogIndex, key: string, target: string | null): Array<string> {
    const values = index.values.get(key) as Map<string, string>;
    const base = values.get(index.baseLocale) ?? '';
    const findings = new Array<string>();
    const others = (index.duplicates.get(base) ?? []).filter((other) => other !== key);
    const value = target ? values.get(target) : undefined;

    if (others.length > 0) {
      findings.push(`Same value as ${others.join(', ')} in ${index.baseLocale}.`);
    }

    if (index.used && !index.used.has(key)) {
      findings.push(`No source below ${DisplayRoot.of(index.configuration)} uses this key.`);
    }

    if (target && target !== index.baseLocale) {
      if (value === undefined) {
        findings.push(`The catalog of ${target} lacks this key.`);
      } else if (value === '') {
        findings.push(`The value in ${target} is empty.`);
      } else if (this.isIdentical(index, key, target)) {
        findings.push(`The value in ${target} is identical to ${index.baseLocale}.`);
      }
    }

    return findings;
  }

  /**
   * @private
   */
  private isIdentical(index: ICatalogIndex, key: string, target: string): boolean {
    const analyze = index.configuration.options.actions?.analyze;
    const catalog = index.catalogs.find(
      (candidate) => candidate.locale === target && candidate.keys().includes(key),
    );

    if (!catalog) {
      return false;
    }

    const data = new MissingTranslationsRule().execute({
      resource: catalog,
      resources: index.catalogs,
      parameters: {
        baseLocale: index.baseLocale,
        identicalKeys: analyze?.identicalKeys,
        identicalValues: analyze?.identicalValues,
      },
    }).data as Array<IMissingTranslationsRuleResultData>;

    return data.some((entry) => entry.untranslatedKeys.includes(key));
  }

  /**
   * @private
   */
  private identicalCount(index: ICatalogIndex, locale: string): number {
    const analyze = index.configuration.options.actions?.analyze;
    const keys = new Set<string>();

    for (const catalog of index.catalogs.filter((candidate) => candidate.locale === locale)) {
      const data = new MissingTranslationsRule().execute({
        resource: catalog,
        resources: index.catalogs,
        parameters: {
          baseLocale: index.baseLocale,
          identicalKeys: analyze?.identicalKeys,
          identicalValues: analyze?.identicalValues,
        },
      }).data as Array<IMissingTranslationsRuleResultData>;

      for (const entry of data) {
        for (const key of entry.untranslatedKeys) {
          keys.add(key);
        }
      }
    }

    return keys.size;
  }

  /**
   * @private
   */
  private namespacePath(index: ICatalogIndex, name: string): string {
    const key = index.keys.find((candidate) => index.namespaceOf(candidate) === name) ?? name;
    const rest = withoutPrefix(key, index.prefix);
    const segments = rest.split('.');

    return `${key.slice(0, key.length - rest.length)}${segments.slice(0, segments.indexOf(name) + 1).join('.')}`;
  }

  /**
   * @private
   */
  private commentOf(index: ICatalogIndex, key: string, locale: string): string {
    const catalog =
      index.catalogs.find(
        (candidate) => candidate.locale === locale && candidate.keys().includes(key),
      ) ??
      (index.format === 'json'
        ? index.catalogs.find((candidate) => candidate.keys().includes(key))
        : undefined);

    if (!catalog) {
      return '';
    }

    if (index.format === 'json') {
      return CatalogComments.get(
        index.comments.text,
        CatalogComments.catalogIdOf(index.comments.folder, catalog),
        key,
      );
    }

    const models = new ResourceTransformer(QUIET_LOGGER).transform(catalog);

    return PoText.commentText(models.find((model) => model.key === key)?.comment ?? '');
  }

  /**
   * @private
   */
  private readComments(folder: string): string | null {
    const file = resolve(folder, COMMENTS_FILE_NAME);

    return existsSync(file) ? readFileSync(file, 'utf8') : null;
  }

  /**
   * @private
   */
  private fileOf(index: ICatalogIndex, locale: string): string | null {
    const catalog = index.catalogs.find((candidate) => candidate.locale === locale);

    return catalog ? basename(catalog.path) : null;
  }

  /**
   * @private
   */
  private defaultTarget(index: ICatalogIndex): string | null {
    return index.catalogs.find((catalog) => catalog.locale !== index.baseLocale)?.locale ?? null;
  }

  /**
   * @private
   */
  private signatureOf(catalogs: ReadonlyArray<IResourceInfo>, folder: string): string {
    return [...catalogs.map((catalog) => catalog.path), resolve(folder, COMMENTS_FILE_NAME)]
      .map((path) => {
        try {
          return `${path}:${statSync(path).mtimeMs}`;
        } catch {
          return `${path}:gone`;
        }
      })
      .join('|');
  }

  // #endregion
}

/**
 * Says where a project keeps its sources.
 */
namespace DisplayRoot {
  /**
   * @private
   */
  export function of(configuration: IResolvedConfiguration): string {
    return DisplayPath.relativeTo(configuration.cwd, configuration.root);
  }
}

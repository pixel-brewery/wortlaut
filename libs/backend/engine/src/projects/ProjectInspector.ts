// #region Imports

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import type { IFileSystem } from '@pixel-brewery/utilities';
import { PresetSchema, type DiscoveredLocale, type ProjectInspection, type ProjectOptions, type WorkspaceRecord } from '@pixel-brewery/wortlaut-contracts';
import { Presets, type ResourceMode } from '@pixel-brewery/wortlaut-core';
import { ConfigurationResolver, type IResolvedConfiguration } from '../configuration/ConfigurationResolver.js';
import { QUIET_LOGGER } from '../io/QuietLogger.js';
import { DisplayPath } from '../paths/DisplayPath.js';
import { PathResolver } from '../paths/PathResolver.js';
import { CatalogScanner, type ICatalogFolder } from './CatalogScanner.js';
import { walkRepository } from './RepositoryWalker.js';

// #endregion

/**
 * The packages that give a framework away, in the order they are looked for. A framework app often pulls in Lit through
 * its components, so Lit comes last.
 */
const PRESET_PACKAGES: ReadonlyArray<[preset: Presets, packageName: string]> = [
    [Presets.Angular, '@angular/core'],
    [Presets.Stencil, '@stencil/core'],
    [Presets.Vue, 'vue'],
    [Presets.React, 'react'],
    [Presets.Lit, 'lit']
];

/**
 * Locales to offer that a project does not have yet.
 */
const SUGGESTED_LOCALES = ['de', 'en', 'fr', 'nl', 'es', 'it'];

/**
 * Test and specification files, which are no sources of a project.
 */
const TEST_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/i;

/**
 * What an inspection found, with the absolute paths that stay in main.
 *
 * @internal
 */
export interface IProjectInspectionResult {
    inspection: ProjectInspection;
    folder: string;
    configuration: IResolvedConfiguration;
    catalogs: Array<ICatalogFolder>;
    sourceRoot: string;
}

/**
 * Finds out what a folder holds: framework, sources, catalogs, locales and key prefix, each with its evidence. It reads
 * and writes nothing else.
 *
 * @internal
 */
export class ProjectInspector {

    // #region Fields

    private readonly _resolver: ConfigurationResolver;
    private readonly _scanner: CatalogScanner;
    private readonly _home: string;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `ProjectInspector` class.
     *
     * @param resolver The configuration resolver.
     * @param fileSystem The file system.
     * @param home The home directory, for display paths.
     */
    public constructor(resolver: ConfigurationResolver, fileSystem: IFileSystem, home: string) {
        this._resolver = resolver;
        this._scanner = new CatalogScanner(fileSystem);
        this._home = home;
    }

    // #endregion

    // #region Methods

    /**
     * Inspects a folder.
     *
     * @param folder The absolute path of the folder.
     * @param catalogFolders Further folders with catalogs, which must lie below it.
     * @param preset The preset the user picked, or `null` to infer it.
     * @returns What the folder holds.
     * @throws EngineError when a configuration file of the repository is invalid.
     */
    public inspect(folder: string, catalogFolders: ReadonlyArray<string> = [], preset: string | null = null): IProjectInspectionResult {
        const configuration = this._resolver.resolve({ cwd: folder });
        const configured = this.describeConfiguration(configuration);
        const content = walkRepository(folder);
        const roots = configured ? configuration.resourceRoots.filter((root) => root.length > 0) : [];
        const catalogFiles = configured && roots.length > 0
            ? content.files.filter((file) => roots.some((root) => PathResolver.isInside(root, file)))
            : content.files;
        const extraFiles = catalogFolders.flatMap((extra) => walkRepository(extra).files);
        const catalogs = this.mergeFolders(this._scanner.scan(catalogFiles), this._scanner.scan(extraFiles));
        const presetResult = this.inferPreset(configuration, configured?.file ?? null, content.files, folder, preset);
        const sourceRoot = this.inferSourceRoot(configuration, configured?.file ?? null, content.files, catalogs, folder, presetResult.value);
        const locales = this.collectLocales(catalogs);
        const baseLocale = this.chooseBaseLocale(configuration, configured !== null, locales);
        const prefix = this.inferPrefix(configuration, configured?.file ?? null, catalogs, baseLocale);

        return {
            folder,
            configuration,
            catalogs,
            sourceRoot: sourceRoot.path,
            inspection: {
                name: this.readProjectName(folder),
                displayPath: DisplayPath.of(folder, this._home),
                configuration: configured ? { kind: configured.kind, file: configured.file } : null,
                preset: presetResult,
                sourceRoot: { value: sourceRoot.path ? DisplayPath.relativeTo(folder, sourceRoot.path) : '', fileCount: sourceRoot.fileCount, evidence: sourceRoot.evidence },
                prefix,
                catalogs: catalogs.map((catalog) => ({
                    folder: DisplayPath.relativeTo(folder, catalog.folder),
                    files: catalog.resources.map((resource) => basename(resource.path)).sort((a, b) => a.localeCompare(b)),
                    keys: new Set(catalog.resources.flatMap((resource) => resource.keys())).size,
                    format: catalog.format
                })),
                locales,
                baseLocale,
                suggestedLocales: SUGGESTED_LOCALES.filter((code) => code !== baseLocale && !locales.some((locale) => locale.code === code)),
                truncated: content.truncated
            }
        };
    }

    /**
     * Builds the settings a project without a configuration of its own keeps in the profile, in the shape of command
     * arguments relative to its folder. They hold no secret.
     *
     * @param result The inspection.
     * @param preset The chosen preset.
     * @param baseLocale The chosen base locale.
     * @param targetLocales The chosen target locales.
     * @returns The settings.
     */
    public buildSetupOptions(result: IProjectInspectionResult, preset: string | null, baseLocale: string, targetLocales: ReadonlyArray<string>): ProjectOptions {
        const resourceRoots = result.catalogs.map((catalog) => relative(result.folder, catalog.folder).split(sep)
            .join('/') || '.');
        const prefix = result.inspection.prefix.value;
        const validPreset = PresetSchema.safeParse(preset);

        return {
            actions: {
                detect: {
                    languages: [baseLocale, ...targetLocales],
                    root: result.sourceRoot ? relative(result.folder, result.sourceRoot).split(sep)
                        .join('/') : '',
                    ...resourceRoots.length === 0 ? {} : { resourceRoot: resourceRoots.length === 1 ? resourceRoots[0] : resourceRoots },
                    preset: validPreset.success ? validPreset.data : '',
                    type: result.catalogs[0]?.format ?? 'json',
                    ...prefix ? { resourceKey: { prefix } } : {}
                },
                analyze: { baseLocale },
                generate: { baseLocale, locales: [...targetLocales] }
            }
        };
    }

    /**
     * @private
     */
    private describeConfiguration(configuration: IResolvedConfiguration): { kind: 'nx-target' | 'wortlaut-config' | 'localizator-config'; file: string } | null {
        if (configuration.nxTarget) {
            return { kind: 'nx-target', file: DisplayPath.relativeTo(configuration.workspaceRoot, configuration.nxTarget.projectFile) };
        }

        if (configuration.configFile && configuration.configKind) {
            return { kind: configuration.configKind, file: DisplayPath.relativeTo(configuration.workspaceRoot, configuration.configFile) };
        }

        return null;
    }

    /**
     * @private
     */
    private mergeFolders(found: Array<ICatalogFolder>, added: Array<ICatalogFolder>): Array<ICatalogFolder> {
        return [...found, ...added.filter((catalog) => !found.some((other) => other.folder === catalog.folder))];
    }

    /**
     * @private
     */
    private inferPreset(configuration: IResolvedConfiguration, configuredFile: string | null, files: ReadonlyArray<string>, folder: string, chosen: string | null): ProjectInspection['preset'] {
        const picked = PresetSchema.safeParse(chosen);

        if (picked.success) {
            return { value: picked.data, evidence: 'Chosen by you' };
        }

        const configured = PresetSchema.safeParse(configuration.options.actions?.detect?.preset);

        if (configured.success && configuredFile) {
            return { value: configured.data, evidence: `Set in ${configuredFile}` };
        }

        const manifests = [join(folder, 'package.json'), ...files.filter((file) => basename(file) === 'package.json' && file !== join(folder, 'package.json'))];

        for (const [preset, packageName] of PRESET_PACKAGES) {
            const manifest = manifests.find((file) => this.readDependencies(file).has(packageName));

            if (manifest) {
                return { value: preset, evidence: `Found ${packageName} in ${DisplayPath.relativeTo(folder, manifest)}` };
            }
        }

        return { value: null, evidence: 'No framework dependency found in package.json' };
    }

    /**
     * @private
     */
    private readDependencies(file: string): Set<string> {
        try {
            const manifest = JSON.parse(readFileSync(file, 'utf8')) as { dependencies?: object; devDependencies?: object; peerDependencies?: object };

            return new Set([manifest.dependencies, manifest.devDependencies, manifest.peerDependencies].flatMap((group) => Object.keys(group ?? {})));
        } catch {
            return new Set();
        }
    }

    /**
     * @private
     */
    private inferSourceRoot(configuration: IResolvedConfiguration, configuredFile: string | null, files: ReadonlyArray<string>, catalogs: ReadonlyArray<ICatalogFolder>, folder: string, preset: string | null): { path: string; fileCount: number; evidence: string } {
        const extensions = preset ? Presets.get(QUIET_LOGGER, preset).getExtensions() : [];
        const sources = files
            .filter((file) => extensions.some((extension) => file.endsWith(extension)) && !TEST_FILE.test(file))
            .filter((file) => !catalogs.some((catalog) => PathResolver.isInside(catalog.folder, file)));

        if (configuredFile && configuration.root) {
            const fileCount = sources.filter((file) => PathResolver.isInside(configuration.root, file)).length;

            return { path: configuration.root, fileCount, evidence: `${this.countText(fileCount)}, set in ${configuredFile}` };
        }

        if (!preset) {
            return { path: '', fileCount: 0, evidence: 'Choose a framework preset to find the sources' };
        }

        const counts = new Map<string, number>();

        for (const file of sources) {
            const root = this.nearestSourceFolder(file, folder);

            counts.set(root, (counts.get(root) ?? 0) + 1);
        }

        const best = Array.from(counts.entries()).sort(([rootA, countA], [rootB, countB]) => countB - countA || rootA.length - rootB.length)[0];

        return best
            ? { path: best[0], fileCount: best[1], evidence: this.countText(best[1]) }
            : { path: '', fileCount: 0, evidence: 'No matching files' };
    }

    /**
     * @private
     */
    private countText(count: number): string {
        return count === 1 ? '1 matching file' : `${count} matching files`;
    }

    /**
     * Returns the nearest `src` folder above a file, or the folder itself when there is none.
     *
     * @private
     */
    private nearestSourceFolder(file: string, folder: string): string {
        let directory = dirname(file);

        while (PathResolver.isInside(folder, directory) && resolve(directory) !== resolve(folder)) {
            if (basename(directory) === 'src') {
                return directory;
            }

            directory = dirname(directory);
        }

        return folder;
    }

    /**
     * @private
     */
    private collectLocales(catalogs: ReadonlyArray<ICatalogFolder>): Array<DiscoveredLocale> {
        const keys = new Map<string, Set<string>>();

        for (const resource of catalogs.flatMap((catalog) => catalog.resources)) {
            keys.set(resource.locale, new Set([...keys.get(resource.locale) ?? [], ...resource.keys()]));
        }

        return Array.from(keys.entries())
            .map(([code, values]) => ({ code, keys: values.size }))
            .sort((a, b) => a.code.localeCompare(b.code));
    }

    /**
     * @private
     */
    private chooseBaseLocale(configuration: IResolvedConfiguration, configured: boolean, locales: ReadonlyArray<DiscoveredLocale>): string {
        const fromOptions = configuration.options.actions?.analyze?.baseLocale ?? 'en';

        if (configured || locales.length === 0 || locales.some((locale) => locale.code === fromOptions)) {
            return fromOptions;
        }

        return locales.reduce((best, locale) => locale.keys > best.keys ? locale : best).code;
    }

    /**
     * @private
     */
    private inferPrefix(configuration: IResolvedConfiguration, configuredFile: string | null, catalogs: ReadonlyArray<ICatalogFolder>, baseLocale: string): ProjectInspection['prefix'] {
        const configured = configuration.options.actions?.detect?.resourceKey?.prefix;

        if (configured && configuredFile) {
            return { value: configured, evidence: `Set in ${configuredFile}` };
        }

        const resources = catalogs.flatMap((catalog) => catalog.resources);
        const base = resources.filter((resource) => resource.locale === baseLocale);
        const keys = (base.length > 0 ? base : resources).flatMap((resource) => resource.keys());

        if (keys.length === 0) {
            return { value: '', evidence: 'No keys yet' };
        }

        const first = keys[0].split('.')[0];

        return keys.every((key) => key.startsWith(`${first}.`))
            ? { value: first, evidence: `All ${keys.length} keys start with it` }
            : { value: '', evidence: 'The keys share no prefix' };
    }

    /**
     * @private
     */
    private readProjectName(folder: string): string {
        for (const file of ['project.json', 'package.json']) {
            const path = join(folder, file);

            if (existsSync(path)) {
                try {
                    const name = (JSON.parse(readFileSync(path, 'utf8')) as { name?: unknown }).name;

                    if (typeof name === 'string' && name.length > 0) {
                        return name;
                    }
                } catch {
                    // A broken manifest does not stop an inspection: the folder still has a name.
                }
            }
        }

        return basename(folder);
    }

    // #endregion

}

/**
 * The workspace folder that holds a project: the repository it was found in, or else the project's own folder.
 *
 * @internal
 * @param workspace The workspace.
 * @param folder The absolute path of the project.
 * @returns The folder to name projects relative to.
 */
export function workspaceFolderOf(workspace: WorkspaceRecord, folder: string): string {
    return workspace.repositories.find((repository) => PathResolver.isInside(repository, folder)) ?? folder;
}

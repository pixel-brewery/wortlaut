// #region Imports

import { readFileSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import type { DetectHint, DetectRow, DetectScanResult } from '@pixel-brewery/wortlaut-contracts';
import { isTestFile, KeyGenerator, Presets, ResourceReader, rewriteSource, type IDetectorResult, type IResourceInfo, type ResourceMode } from '@pixel-brewery/wortlaut-core';
import { hashText } from '../cache/ResultCache.js';
import { ChangeSetBuilder } from '../changes/ChangeSetBuilder.js';
import { EngineError } from '../errors/EngineError.js';
import type { IDetectScanOptions } from '../interfaces/ICommandOptions.js';
import { DisplayPath } from '../paths/DisplayPath.js';
import { PathResolver } from '../paths/PathResolver.js';
import { walkRepository } from '../projects/RepositoryWalker.js';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * The most hard-coded strings a scan keeps. A surface works through them, and the next scan finds the rest.
 */
const MAX_SCAN_ROWS = 5000;

/**
 * A hard-coded string of a scan with everything it takes to rewrite it. The path stays in the process that ran the scan.
 *
 * @internal
 */
export interface IDetectScanRow extends DetectRow {
    path: string;

    /**
     * What the file held when it was scanned. A file that changed afterwards fails the apply.
     */
    fileHash: string;
    position: { start: number; end: number; raw: string } | null;
}

/**
 * A finished scan.
 *
 * @internal
 */
export interface IDetectScan {
    scanId: string;
    filesScanned: number;
    stringsFound: number;
    alreadyKeys: number;

    /**
     * How many hard-coded strings the sources hold, of which `rows` holds the first ones.
     */
    hardCoded: number;
    rows: Array<IDetectScanRow>;
    truncated: boolean;
}

/**
 * Reads the catalogs below folders that exist. A project without catalogs has none, which is no failure here.
 *
 * @internal
 * @param roots The resource roots.
 * @param type The format.
 * @param context The run.
 * @returns The catalogs.
 */
export function readCatalogs(roots: string | ReadonlyArray<string>, type: ResourceMode, context: Pick<IUseCaseContext, 'logger' | 'fileSystem'>): Array<IResourceInfo> {
    const folders = (typeof roots === 'string' ? [roots] : [...roots]).filter((root) => isFolder(root));

    return folders.length > 0 ? new ResourceReader(context.logger, context.fileSystem).scanDirectory(folders, type) : [];
}

/**
 * Scans the sources of a project for hard-coded strings with the detectors of its preset, file by file, so a long scan can
 * be followed and stopped.
 *
 * @internal
 * @param scanId The id of the scan.
 * @param options The options.
 * @param context The run.
 * @returns The scan.
 */
export async function scanSources(scanId: string, options: IDetectScanOptions, context: IUseCaseContext): Promise<IDetectScan> {
    if (!options.root) {
        throw new EngineError('invalid-arguments', 'This project has no source root to scan. Set it in Settings: project.');
    }

    if (!options.preset) {
        throw new EngineError('invalid-arguments', 'Choose a framework preset to scan with.');
    }

    const root = resolve(context.cwd, options.root);
    const preset = Presets.get(context.logger, options.preset);
    const extensions = new Set(preset.getExtensions());
    const catalogs = (Array.isArray(options.resourceRoot) ? options.resourceRoot : [options.resourceRoot]).filter((path) => path.length > 0)
        .map((path) => resolve(context.cwd, path));
    const walk = walkRepository(root);
    const files = walk.files
        .filter((file) => extensions.has(extname(file)))
        .filter((file) => !catalogs.some((catalog) => PathResolver.isInside(catalog, file)))
        .filter((file) => !options.skipTests || !isTestFile(file))
        .sort((a, b) => a.localeCompare(b));
    const keys = new KeyNames(readCatalogs(catalogs, options.type, context), options);
    const rows = new Array<IDetectScanRow>();
    let stringsFound = 0;
    let alreadyKeys = 0;
    let hardCoded = 0;

    for (const [index, file] of files.entries()) {
        await context.checkpoint('Scanning the sources', index, files.length, DisplayPath.relativeTo(root, file));

        const parser = preset.getParser(extname(file));
        const bytes = readFileSync(file);
        const content = bytes.toString('utf8');
        const seen = new Set<string>();
        const lines = content.split('\n');
        const detectOptions = { resourceKey: { prefix: options.resourceKeyPrefix, suffix: options.resourceKeySuffix } };
        const detect = (): Array<IDetectorResult> => parser.detect(content, detectOptions);
        const detected = context.cache
            ? context.cache.remember('detect.file', { preset: options.preset, extension: extname(file), options: detectOptions, content: hashText(content) }, detect)
            : detect();

        for (const found of detected) {
            const place = `${found.lineNumber}:${found.position?.start ?? found.columnNumber}`;

            // Two patterns of a detector may read the same value.
            if (seen.has(place)) {
                continue;
            }

            seen.add(place);
            stringsFound++;

            if (!found.isStatic) {
                alreadyKeys++;
                continue;
            }

            hardCoded++;

            if (rows.length >= MAX_SCAN_ROWS) {
                continue;
            }

            rows.push(createRow({
                id: `r${rows.length + 1}`,
                path: file,
                displayFile: DisplayPath.relativeTo(context.cwd, file),
                fileHash: ChangeSetBuilder.hash(bytes),
                value: found.match.value ?? '',
                line: found.lineNumber,
                column: found.columnNumber,
                lineText: lines[found.lineNumber - 1] ?? '',
                position: found.position ?? null,
                isTest: isTestFile(file),
                keys
            }));
        }
    }

    return { scanId, filesScanned: files.length, stringsFound, alreadyKeys, hardCoded, rows, truncated: walk.truncated };
}

/**
 * Projects a scan for the renderer: paths only as display values.
 *
 * @internal
 * @param scan The scan.
 * @returns The result.
 */
export function projectScan(scan: IDetectScan): DetectScanResult {
    return {
        scanId: scan.scanId,
        filesScanned: scan.filesScanned,
        stringsFound: scan.stringsFound,
        alreadyKeys: scan.alreadyKeys,
        hardCoded: scan.hardCoded,
        rows: scan.rows.map(({ id, value, file, location, line, column, key, hint, canApply, before, after, around }) => ({ id, value, file, location, line, column, key, hint, canApply, before, after, around })),
        truncated: scan.truncated
    };
}

/**
 * Finds the hard-coded strings of the sources, with a generated key and a reuse hint for each. It only reads.
 *
 * @internal
 */
export class DetectScanUseCase implements IUseCase<IDetectScanOptions, IDetectScan> {

    public readonly command = 'detect';

    /**
     * @override
     */
    public async execute(options: IDetectScanOptions, context: IUseCaseContext): Promise<IUseCaseOutput<IDetectScan>> {
        const scan = await scanSources(context.runId, options, context);

        context.logger.log(`${scan.hardCoded} hard-coded string(s) in ${scan.filesScanned} file(s).`);

        return { result: scan, data: projectScan(scan) };
    }

}

/**
 * Hands out the keys of a scan: an existing key for a text the catalog holds, otherwise a new one that clashes with nothing.
 */
class KeyNames {

    // #region Fields

    private readonly _generator = new KeyGenerator();
    private readonly _affixes: { prefix: string; suffix: string };
    private readonly _existing: Map<string, string>;
    private readonly _keysByValue: Map<string, string>;
    private readonly _assigned: Map<string, string>;

    // #endregion

    // #region Ctor

    public constructor(catalogs: ReadonlyArray<IResourceInfo>, options: IDetectScanOptions) {
        const base = catalogs.filter((catalog) => catalog.locale === options.baseLocale);

        this._affixes = { prefix: options.resourceKeyPrefix, suffix: options.resourceKeySuffix };
        this._existing = new Map(base.flatMap((catalog) => catalog.entries()));
        this._keysByValue = new Map();
        this._assigned = new Map();

        for (const [key, value] of this._existing) {
            if (!this._keysByValue.has(value)) {
                this._keysByValue.set(value, key);
            }
        }
    }

    // #endregion

    // #region Methods

    /**
     * Returns the key of a text the catalog already holds.
     */
    public reuse(value: string): string | null {
        return this._keysByValue.get(value) ?? null;
    }

    /**
     * Returns the key for a new text. The same text gets the same key, and another text never takes a key that is taken.
     */
    public generate(value: string): string {
        const known = this._assigned.get(value);

        if (known !== undefined) {
            return known;
        }

        const name = this._generator.generate(value);
        const taken = new Set([...this._existing.keys(), ...this._assigned.values()]);
        let key = name ? this._generator.withAffixes(name, this._affixes) : '';

        for (let number = 2; key && taken.has(key); number++) {
            key = this._generator.withAffixes(`${name}.${number}`, this._affixes);
        }

        this._assigned.set(value, key);

        return key;
    }

    // #endregion

}

/**
 * @private
 */
function createRow(input: { id: string; path: string; displayFile: string; fileHash: string; value: string; line: number; column: number; lineText: string; position: IDetectScanRow['position']; isTest: boolean; keys: KeyNames }): IDetectScanRow {
    const { value, position, isTest, keys, lineText } = input;
    const hasPlaceholder = position?.raw.includes('${') ?? false;
    const reused = keys.reuse(value);
    const key = reused ?? keys.generate(value);
    const hint: DetectHint = isTest ? { kind: 'test' } : hasPlaceholder ? { kind: 'placeholder' } : reused ? { kind: 'reuse', key: reused } : { kind: 'new' };
    const canApply = !isTest && !hasPlaceholder && position !== null;
    const after = (): string => {
        if (isTest) {
            return 'Ignored, because it is a test file';
        }

        if (hasPlaceholder || !position) {
            return 'Stays as it is, because it holds a placeholder';
        }

        return key ? rewriteSource(lineText, [{ line: 1, ...position, replacement: key }]).trim() : 'Name a key first';
    };

    return {
        id: input.id,
        value,
        file: input.displayFile,
        location: `${basename(input.path)}:${input.line}`,
        line: input.line,
        column: input.column,
        key,
        hint,
        canApply,
        before: lineText.trim(),
        after: after(),
        around: canApply && position ? { head: lineText.slice(0, position.start).trimStart(), tail: lineText.slice(position.end).trimEnd() } : null,
        path: input.path,
        fileHash: input.fileHash,
        position
    };
}

/**
 * @private
 */
function isFolder(path: string): boolean {
    try {
        return statSync(path).isDirectory();
    } catch {
        return false;
    }
}

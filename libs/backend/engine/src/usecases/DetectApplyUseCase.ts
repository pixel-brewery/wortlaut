// #region Imports

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CatalogEditor, rewriteSource, type IResourceInfo, type ISourceEdit } from '@pixel-brewery/wortlaut-core';
import { ChangeSetBuilder } from '../changes/ChangeSetBuilder.js';
import { EngineError } from '../errors/EngineError.js';
import type { IDetectScanOptions } from '../interfaces/ICommandOptions.js';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';
import { readCatalogs, scanSources, type IDetectScanRow } from './DetectScanUseCase.js';

// #endregion

/**
 * The options of `detect --apply`. The rows themselves are no options: they hold paths and whole lines, and a repeat scans
 * again.
 *
 * @public
 */
export interface IDetectApplyOptions extends IDetectScanOptions {

    /**
     * How many strings the change covers.
     */
    count: number;
}

/**
 * A row of a scan with the key it gets.
 *
 * @internal
 */
export interface IDetectApplyRow {
    row: IDetectScanRow;
    key: string;
}

/**
 * Replaces hard-coded strings with their keys and adds the new keys to the catalog of the base locale, as one change set.
 * A file that changed since the scan fails the apply and names the file.
 *
 * @internal
 */
export class DetectApplyUseCase implements IUseCase<IDetectApplyOptions, Array<string>> {

    // #region Fields

    public readonly command = 'detect.apply';

    private readonly _rows: ReadonlyArray<IDetectApplyRow> | null;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `DetectApplyUseCase` class.
     *
     * @param rows The rows of an earlier scan, or `null` to scan now and apply every string that can be applied.
     */
    public constructor(rows: ReadonlyArray<IDetectApplyRow> | null) {
        this._rows = rows;
    }

    // #endregion

    // #region Methods

    /**
     * @override
     */
    public detail(options: IDetectApplyOptions): string {
        const count = this._rows?.length ?? options.count;

        return count === 1 ? 'Replace 1 string with its key' : `Replace ${count} strings with their keys`;
    }

    /**
     * @override
     */
    public async execute(options: IDetectApplyOptions, context: IUseCaseContext): Promise<IUseCaseOutput<Array<string>>> {
        const rows = this._rows ?? (await scanSources(context.runId, options, context)).rows
            .filter((row) => row.canApply && row.key.length > 0)
            .map((row) => ({ row, key: row.key }));

        options.count = rows.length;

        for (const { row } of rows) {
            if (!row.canApply || !row.position) {
                throw new EngineError('invalid-arguments', `The string '${row.value}' in ${row.file} cannot be replaced.`, [row.file]);
            }
        }

        this.proposeSources(rows, context);
        this.proposeCatalog(rows, options, context);

        return { result: rows.map(({ key }) => key), data: { keys: rows.map(({ key }) => key) } };
    }

    /**
     * @private
     */
    private proposeSources(rows: ReadonlyArray<IDetectApplyRow>, context: IUseCaseContext): void {
        const byFile = new Map<string, Array<IDetectApplyRow>>();

        for (const entry of rows) {
            byFile.set(entry.row.path, [...byFile.get(entry.row.path) ?? [], entry]);
        }

        for (const [path, entries] of byFile) {
            const { file, fileHash } = entries[0].row;
            const changed = (): EngineError => new EngineError('change-set-conflict', `${file} changed since the scan. Nothing was written. Scan again.`, [file]);
            let bytes: Buffer;

            try {
                bytes = readFileSync(path);
            } catch {
                throw changed();
            }

            if (ChangeSetBuilder.hash(bytes) !== fileHash) {
                throw changed();
            }

            const edits: Array<ISourceEdit> = entries.map(({ row, key }) => ({ line: row.line, ...row.position as NonNullable<IDetectScanRow['position']>, replacement: key }));

            context.changes.propose(path, rewriteSource(bytes.toString('utf8'), edits));
        }
    }

    /**
     * @private
     */
    private proposeCatalog(rows: ReadonlyArray<IDetectApplyRow>, options: IDetectApplyOptions, context: IUseCaseContext): void {
        const base = readCatalogs(options.resourceRoot, options.type, context).filter((catalog) => catalog.locale === options.baseLocale);
        const existing = new Map(base.flatMap((catalog) => catalog.entries()));
        const fresh = new Map<string, string>();

        for (const { row, key } of rows) {
            const value = existing.get(key) ?? fresh.get(key);

            if (value !== undefined && value !== row.value) {
                throw new EngineError('invalid-arguments', `The key ${key} already holds another text, '${value}'. Choose another key for '${row.value}'.`);
            }

            if (value === undefined) {
                fresh.set(key, row.value);
            }
        }

        if (fresh.size === 0) {
            return;
        }

        const path = this.chooseCatalog(base, options, context);
        let text = base.some((catalog) => catalog.path === path) ? readFileSync(path, 'utf8') : CatalogEditor.empty(options.type);

        for (const [key, value] of fresh) {
            text = CatalogEditor.setValue(text, options.type, key, value);
        }

        context.changes.propose(path, text);
    }

    /**
     * Chooses the catalog for new keys: the largest one of the base locale, or a new one in the first resource root.
     *
     * @private
     */
    private chooseCatalog(base: ReadonlyArray<IResourceInfo>, options: IDetectApplyOptions, context: IUseCaseContext): string {
        const largest = [...base].sort((a, b) => b.keys().length - a.keys().length || a.path.localeCompare(b.path))[0];

        if (largest) {
            return largest.path;
        }

        const root = (Array.isArray(options.resourceRoot) ? options.resourceRoot : [options.resourceRoot]).find((path) => path.length > 0);

        if (!root) {
            throw new EngineError('invalid-arguments', 'This project has no catalog folder for new keys. Add one in Settings: project.');
        }

        return join(resolve(context.cwd, root), `lang.${options.baseLocale}.${options.type}`);
    }

    // #endregion

}

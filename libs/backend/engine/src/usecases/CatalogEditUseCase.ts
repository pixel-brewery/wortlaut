// #region Imports

import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { CatalogComments, CatalogEditor, COMMENTS_FILE_NAME, findCatalogLocale, isTestFile, Presets, ResourceMode, type IResourceInfo } from '@pixel-brewery/wortlaut-core';
import { EngineError } from '../errors/EngineError.js';
import type { IDetectOptions } from '../interfaces/ICommandOptions.js';
import { PathResolver } from '../paths/PathResolver.js';
import { walkRepository } from '../projects/RepositoryWalker.js';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';
import { readCatalogs } from './DetectScanUseCase.js';

// #endregion

/**
 * One edit of the catalogs of a project.
 *
 * @public
 */
export type CatalogEdit =
    | { kind: 'set-value'; key: string; locale: string; value: string } |
    { kind: 'set-comment'; key: string; locale: string; comment: string } |
    { kind: 'delete-key'; key: string } |
    { kind: 'merge-keys'; keep: string; remove: Array<string> } |
    { kind: 'add-locale'; locale: string };

/**
 * The options of a catalog edit.
 *
 * @public
 */
export interface ICatalogEditOptions extends IDetectOptions {
    resourceRoot: string | Array<string>;
    baseLocale: string;
    edit: CatalogEdit;
}

/**
 * Proposes an edit of the catalogs, and of the sources where keys merge. Every file keeps its order and its formatting.
 *
 * @internal
 */
export class CatalogEditUseCase implements IUseCase<ICatalogEditOptions, Array<string>> {

    public readonly command = 'catalog.edit';

    /**
     * @override
     */
    public detail(options: ICatalogEditOptions): string {
        const { edit } = options;

        switch (edit.kind) {
            case 'set-value':
                return `Change ${edit.key} in ${edit.locale}`;
            case 'set-comment':
                return `Comment on ${edit.key} in ${edit.locale}`;
            case 'delete-key':
                return `Delete ${edit.key}`;
            case 'merge-keys':
                return `Merge ${edit.remove.join(', ')} into ${edit.keep}`;
            default:
                return `Add the locale ${edit.locale}`;
        }
    }

    /**
     * @override
     */
    public execute(options: ICatalogEditOptions, context: IUseCaseContext): Promise<IUseCaseOutput<Array<string>>> {
        const catalogs = readCatalogs(options.resourceRoot, options.type, context);
        const { edit } = options;

        switch (edit.kind) {
            case 'set-value':
                this.editValue(catalogs, options, edit.key, edit.locale, (text) => CatalogEditor.setValue(text, options.type, edit.key, edit.value), context);
                break;
            case 'set-comment':
                if (options.type === ResourceMode.Json) {
                    this.setSharedComment(catalogs, options, edit.key, edit.locale, edit.comment, context);
                } else {
                    this.editValue(catalogs, options, edit.key, edit.locale, (text) => CatalogEditor.setComment(text, options.type, edit.key, edit.comment), context);
                }
                break;
            case 'delete-key':
                this.deleteKey(catalogs, edit.key, options, context);
                break;
            case 'merge-keys':
                this.mergeKeys(catalogs, edit.keep, edit.remove, options, context);
                break;
            default:
                this.addLocale(catalogs, edit.locale, options, context);
        }

        return Promise.resolve({ result: [], data: { edit: edit.kind } });
    }

    /**
     * @private
     */
    private editValue(catalogs: ReadonlyArray<IResourceInfo>, options: ICatalogEditOptions, key: string, locale: string, change: (text: string) => string, context: IUseCaseContext): void {
        const target = catalogs.find((catalog) => catalog.locale === locale && catalog.keys().includes(key)) ?? this.siblingFor(catalogs, options, key, locale);

        if (!target) {
            throw new EngineError('invalid-arguments', `The locale '${locale}' has no catalog yet. Add the locale first.`);
        }

        context.changes.propose(target.path, change(readFileSync(target.path, 'utf8')));
    }

    /**
     * Sets the comment of a key of a JSON catalog, in the comments file of the project. Every locale of the catalog shares it.
     *
     * @private
     */
    private setSharedComment(catalogs: ReadonlyArray<IResourceInfo>, options: ICatalogEditOptions, key: string, locale: string, comment: string, context: IUseCaseContext): void {
        const holder = catalogs.find((catalog) => catalog.locale === locale && catalog.keys().includes(key)) ?? catalogs.find((catalog) => catalog.keys().includes(key));

        if (!holder) {
            throw new EngineError('invalid-arguments', `No catalog holds the key ${key}.`);
        }

        const file = resolve(context.cwd, COMMENTS_FILE_NAME);

        context.changes.propose(file, CatalogComments.set(readComments(file), CatalogComments.catalogIdOf(context.cwd, holder), key, comment));
    }

    /**
     * Moves the comments of a JSON catalog along with an edit of its keys: a key that goes takes its comment along, unless the
     * key that stays has none yet.
     *
     * @private
     */
    private moveSharedComments(catalogs: ReadonlyArray<IResourceInfo>, remove: ReadonlyArray<string>, keep: string | null, context: IUseCaseContext): void {
        const file = resolve(context.cwd, COMMENTS_FILE_NAME);
        const before = readComments(file);
        let text = before;

        if (text === null) {
            return;
        }

        for (const id of new Set(catalogs.map((catalog) => CatalogComments.catalogIdOf(context.cwd, catalog)))) {
            for (const key of remove) {
                const comment = CatalogComments.get(text, id, key);

                if (comment) {
                    if (keep && !CatalogComments.get(text, id, keep)) {
                        text = CatalogComments.set(text, id, keep, comment);
                    }

                    text = CatalogComments.set(text, id, key, '');
                }
            }
        }

        if (text !== before) {
            context.changes.propose(file, text);
        }
    }

    /**
     * Finds the catalog of a locale that lacks a key, next to the catalog of the base locale that holds it.
     *
     * @private
     */
    private siblingFor(catalogs: ReadonlyArray<IResourceInfo>, options: ICatalogEditOptions, key: string, locale: string): IResourceInfo | null {
        const base = catalogs.find((catalog) => catalog.locale === options.baseLocale && catalog.keys().includes(key));

        return (base ? findCatalogLocale(base, [...catalogs], locale) : null) ?? catalogs.find((catalog) => catalog.locale === locale) ?? null;
    }

    /**
     * @private
     */
    private deleteKey(catalogs: ReadonlyArray<IResourceInfo>, key: string, options: ICatalogEditOptions, context: IUseCaseContext): void {
        const holders = catalogs.filter((catalog) => catalog.keys().includes(key));

        if (holders.length === 0) {
            throw new EngineError('invalid-arguments', `No catalog holds the key ${key}.`);
        }

        for (const catalog of holders) {
            context.changes.propose(catalog.path, CatalogEditor.removeKey(readFileSync(catalog.path, 'utf8'), options.type, key));
        }

        if (options.type === ResourceMode.Json) {
            this.moveSharedComments(holders, [key], null, context);
        }
    }

    /**
     * Merges keys into one: a locale keeps its value of the key that stays, or takes over the value of a key that goes, and
     * sources that name a key that goes as a literal name the key that stays. A key the code composes cannot be found this
     * way, so the change set says so.
     *
     * @private
     */
    private mergeKeys(catalogs: ReadonlyArray<IResourceInfo>, keep: string, remove: ReadonlyArray<string>, options: ICatalogEditOptions, context: IUseCaseContext): void {
        for (const catalog of catalogs) {
            const values = new Map(catalog.entries());
            const taken = remove.find((key) => values.has(key));

            if (!taken) {
                continue;
            }

            let text = readFileSync(catalog.path, 'utf8');

            if (!values.has(keep)) {
                text = CatalogEditor.setValue(text, options.type, keep, values.get(taken) ?? '');
            }

            for (const key of remove) {
                text = CatalogEditor.removeKey(text, options.type, key);
            }

            context.changes.propose(catalog.path, text);
        }

        if (options.type === ResourceMode.Json) {
            this.moveSharedComments(catalogs, remove, keep, context);
        }

        this.renameInSources(keep, remove, options, context);
        context.changes.addFinding({ rule: 'merge-keys', severity: 'info', message: `Literal uses of ${remove.join(', ')} now name ${keep}. Keys that code composes at runtime are not rewritten.`, file: null, locale: null });
    }

    /**
     * @private
     */
    private renameInSources(keep: string, remove: ReadonlyArray<string>, options: ICatalogEditOptions, context: IUseCaseContext): void {
        if (!options.root || !options.preset) {
            return;
        }

        const extensions = new Set(Presets.get(context.logger, options.preset).getExtensions());
        const catalogRoots = (Array.isArray(options.resourceRoot) ? options.resourceRoot : [options.resourceRoot]).filter((path) => path.length > 0)
            .map((path) => resolve(context.cwd, path));
        const pattern = new RegExp(`(['"\`])(${remove.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\1`, 'g');

        for (const file of walkRepository(resolve(context.cwd, options.root)).files) {
            if (extensions.has(extname(file)) && !isTestFile(file) && !catalogRoots.some((root) => PathResolver.isInside(root, file))) {
                const text = readFileSync(file, 'utf8');
                const next = text.replace(pattern, (_match, quote: string) => `${quote}${keep}${quote}`);

                if (next !== text) {
                    context.changes.propose(file, next);
                }
            }
        }
    }

    /**
     * Starts a locale as a copy of the base locale, for every catalog of it: the same keys in the same order. Every value
     * reads as identical to the base locale until someone translates it.
     *
     * @private
     */
    private addLocale(catalogs: ReadonlyArray<IResourceInfo>, locale: string, options: ICatalogEditOptions, context: IUseCaseContext): void {
        const base = catalogs.filter((catalog) => catalog.locale === options.baseLocale);

        if (base.length === 0) {
            throw new EngineError('invalid-arguments', `The base locale '${options.baseLocale}' has no catalog to start from.`);
        }

        for (const catalog of base) {
            const target = join(dirname(catalog.path), targetNameOf(basename(catalog.path), options.baseLocale, locale));

            if (context.fileSystem.fileGetLocale(target) !== locale) {
                throw new EngineError('invalid-arguments', `Wortlaut does not know the locale '${locale}', so a file for it would read as another locale.`);
            }

            if (existsSync(target)) {
                throw new EngineError('invalid-arguments', `The locale '${locale}' already has the catalog ${basename(target)}.`, [basename(target)]);
            }

            const text = readFileSync(catalog.path, 'utf8');

            context.changes.propose(target, options.type === 'po' ? text.replace(new RegExp(`(Language:\\s*)${options.baseLocale}\\b`), `$1${locale}`) : text);
        }
    }

}

/**
 * @private
 */
function readComments(file: string): string | null {
    return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/**
 * @private
 */
function targetNameOf(name: string, baseLocale: string, locale: string): string {
    const segment = `.${baseLocale}.`;

    return name.includes(segment) ? name.replace(segment, `.${locale}.`) : name.replace(/(\.[^.]+)$/, `.${locale}$1`);
}

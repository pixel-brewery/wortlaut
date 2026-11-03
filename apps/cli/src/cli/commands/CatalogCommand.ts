// #region Imports

import type { IFileSystem, ILogger, IProgramArg } from '@pixel-brewery/utilities';
import { CommandOptions, EngineError, type CatalogEdit, type IEngineOutcome, type WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { CATALOG_COMMAND_ARGS } from '../arguments/CatalogCommandArgs.js';
import { DEFAULT_CATALOG_COMMAND_ARGS_CONFIG, type ICatalogCommandArgsConfig } from '../arguments/configurations/ICatalogCommandArgsConfig.js';
import { EngineCommand } from './abstracts/EngineCommand.js';

// #endregion

/**
 * A command that edits catalogs through a change set: `set <key> <value>`, `comment <key> <text>`, `delete <key>`,
 * `merge <keep> <remove...>` and `add-locale <locale>`.
 *
 * @internal
 */
export class CatalogCommand extends EngineCommand<ICatalogCommandArgsConfig, Array<string>> {

    // #region Ctor

    /**
     * Constructs a new instance of the `CatalogCommand` class.
     *
     * @public
     */
    public constructor(config: ICatalogCommandArgsConfig, logger: ILogger, fileSystem: IFileSystem) {
        super(config, logger, fileSystem);
    }

    // #endregion

    // #region Properties

    public get name(): string {
        return 'catalog';
    }

    public get args(): Array<IProgramArg> {
        return CATALOG_COMMAND_ARGS;
    }

    /**
     * @protected
     * @override
     */
    protected override get settingNames(): Readonly<Record<string, string>> {
        return {
            dryRun: 'dryRun',
            review: 'review',
            resourceRoot: 'actions.detect.resourceRoot',
            type: 'actions.detect.type',
            baseLocale: 'actions.analyze.baseLocale'
        };
    }

    /**
     * @protected
     * @override
     */
    protected override get defaults(): ICatalogCommandArgsConfig {
        return DEFAULT_CATALOG_COMMAND_ARGS_CONFIG;
    }

    // #endregion

    // #region Methods

    /**
     * @public
     * @override
     */
    public override configure(config: ICatalogCommandArgsConfig): ICatalogCommandArgsConfig {
        const [action, ...words] = this.positionals;

        return Object.assign(super.configure(config), { action: action ?? '', words });
    }

    /**
     * @protected
     * @override
     */
    protected override run(engine: WortlautEngine): Promise<IEngineOutcome<Array<string>>> {
        const configuration = this.resolveConfiguration(engine);
        const scan = CommandOptions.forDetectScan(configuration, true);

        return engine.editCatalog({
            cwd: this.cwd,
            options: {
                root: scan.root,
                preset: scan.preset,
                type: scan.type,
                resourceKeyPrefix: scan.resourceKeyPrefix,
                resourceKeySuffix: scan.resourceKeySuffix,
                resourceRoot: scan.resourceRoot,
                baseLocale: scan.baseLocale,
                edit: this.createEdit()
            },
            writeMode: CommandOptions.writeMode(configuration)
        });
    }

    /**
     * @private
     */
    private createEdit(): CatalogEdit {
        const { action, words, locale } = this.config;
        const [first, ...rest] = words;

        switch (action) {
            case 'set':
            case 'comment':
                if (!first || rest.length !== 1 || !locale) {
                    throw new EngineError('invalid-arguments', `Use ${action} <key> <text> --locale <locale>.`);
                }

                return action === 'set' ? { kind: 'set-value', key: first, locale, value: rest[0] } : { kind: 'set-comment', key: first, locale, comment: rest[0] };
            case 'delete':
                if (!first) {
                    throw new EngineError('invalid-arguments', 'Use delete <key>.');
                }

                return { kind: 'delete-key', key: first };
            case 'merge':
                if (!first || rest.length === 0) {
                    throw new EngineError('invalid-arguments', 'Use merge <key to keep> <keys to remove...>.');
                }

                return { kind: 'merge-keys', keep: first, remove: rest };
            case 'add-locale':
                if (!first) {
                    throw new EngineError('invalid-arguments', 'Use add-locale <locale>.');
                }

                return { kind: 'add-locale', locale: first };
            default:
                throw new EngineError('invalid-arguments', `Unknown action '${action}'. Use set, comment, delete, merge or add-locale.`);
        }
    }

    // #endregion

}

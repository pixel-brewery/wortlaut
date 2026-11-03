// #region Imports

import { isSecretName } from '@pixel-brewery/wortlaut-contracts';
import { ConfigurationWriter } from '../configuration/ConfigurationWriter.js';
import type { IResolvedConfiguration } from '../configuration/ConfigurationResolver.js';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * The options of a change of several settings.
 *
 * @public
 */
export interface IConfigUpdateOptions {
    edits: Array<{ key: string; value: unknown }>;
}

/**
 * Proposes several changed settings as one change set, each in the file it comes from.
 *
 * @internal
 */
export class ConfigUpdateUseCase implements IUseCase<IConfigUpdateOptions, Array<string>> {

    // #region Fields

    public readonly command = 'config.set';

    private readonly _configuration: IResolvedConfiguration;
    private readonly _texts: Map<string, string>;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `ConfigUpdateUseCase` class.
     *
     * @param configuration The resolved configuration.
     * @param seed The texts of files the repository does not hold yet, by their paths.
     */
    public constructor(configuration: IResolvedConfiguration, seed: ReadonlyMap<string, string> = new Map()) {
        this._configuration = configuration;
        this._texts = new Map(seed);
    }

    // #endregion

    // #region Methods

    /**
     * @override
     */
    public detail(options: IConfigUpdateOptions): string {
        const names = options.edits.map(({ key }) => key.split('.').at(-1));

        return names.length === 1 ? `Change ${names[0]}` : `Change ${names.length} settings`;
    }

    /**
     * @override
     */
    public execute(options: IConfigUpdateOptions, context: IUseCaseContext): Promise<IUseCaseOutput<Array<string>>> {
        const files = new Set<string>();

        for (const { key, value } of options.edits) {
            if (isSecretName(key.split('.').at(-1) ?? '')) {
                context.scrubber.add(String(value));
            }

            files.add(ConfigurationWriter.edit(this._configuration, key, value, this._texts).file);
        }

        for (const file of files) {
            context.changes.propose(file, this._texts.get(file) as string);
        }

        return Promise.resolve({ result: Array.from(files), data: { files: Array.from(files) } });
    }

    // #endregion

}

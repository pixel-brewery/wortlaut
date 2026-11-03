// #region Imports

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findSecretNames, ProjectOptionsSchema } from '@pixel-brewery/wortlaut-contracts';
import { DEFAULT_CACHE_FOLDER } from '../cache/ResultCache.js';
import { CONFIG_FILE_NAME } from '../configuration/ConfigurationResolver.js';
import { EngineError } from '../errors/EngineError.js';
import type { IInitOptions } from '../interfaces/ICommandOptions.js';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * The file that keeps working as a fallback and would be shadowed by a new `wortlaut.config.json`.
 */
const FALLBACK_FILE_NAME = 'localizator.config.json';

/**
 * The file that keeps the cache out of Git.
 */
const GITIGNORE_FILE_NAME = '.gitignore';

/**
 * Proposes the configuration file of a project.
 *
 * @internal
 */
export class InitUseCase implements IUseCase<IInitOptions, string> {

    public readonly command = 'init';

    /**
     * @override
     */
    public execute(options: IInitOptions, context: IUseCaseContext): Promise<IUseCaseOutput<string>> {
        const file = join(context.cwd, CONFIG_FILE_NAME);
        const existing = [file, join(context.cwd, FALLBACK_FILE_NAME)].find((path) => existsSync(path));

        if (existing && !options.force) {
            throw new EngineError('invalid-arguments', `The project already has the configuration file ${existing}. Use --force to replace it.`, [existing]);
        }

        const settings = ProjectOptionsSchema.safeParse(options.settings);

        if (!settings.success) {
            throw new EngineError('invalid-arguments', `The settings are invalid: ${settings.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
        }

        const secrets = findSecretNames(settings.data);

        if (secrets.length > 0) {
            throw new EngineError('secret-refused', `The configuration file stays free of secrets. Leave out ${secrets.join(', ')} and read the key from the environment.`);
        }

        context.changes.propose(file, `${JSON.stringify(settings.data, null, 2)}\n`);
        this.ignoreCache(context);

        return Promise.resolve({ result: file, data: { file } });
    }

    /**
     * Keeps the folder of the cache out of Git, in the same change set.
     *
     * @private
     */
    private ignoreCache(context: IUseCaseContext): void {
        const path = join(context.cwd, GITIGNORE_FILE_NAME);
        const current = existsSync(path) ? readFileSync(path, 'utf8') : '';

        if (!isIgnored(current)) {
            const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n';

            context.changes.propose(path, `${current}${separator}${DEFAULT_CACHE_FOLDER}/\n`);
        }
    }

}

/**
 * Says whether a `.gitignore` covers the folder of the cache already: by its name, or by the folder around it.
 *
 * @private
 */
function isIgnored(gitignore: string): boolean {
    const [parent] = DEFAULT_CACHE_FOLDER.split('/');

    return gitignore.split(/\r?\n/u)
        .map((line) => line.trim().replace(/^\//u, '')
            .replace(/\/$/u, ''))
        .some((line) => line === DEFAULT_CACHE_FOLDER || line === parent);
}

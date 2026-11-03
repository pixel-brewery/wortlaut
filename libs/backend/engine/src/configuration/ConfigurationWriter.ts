// #region Imports

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSecretName, ProjectOptionsSchema, readEnvToken, type ProjectOptions } from '@pixel-brewery/wortlaut-contracts';
import { applyEdits, modify, type JSONPath } from 'jsonc-parser';
import { EngineError } from '../errors/EngineError.js';
import { CONFIG_FILE_NAME, type IResolvedConfiguration } from './ConfigurationResolver.js';

// #endregion

/**
 * The formatting of a value that is new in a file.
 */
const FORMATTING = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

/**
 * What writing a setting would change.
 *
 * @public
 */
export interface IConfigurationEdit {
    file: string;
    content: string;
}

/**
 * Writes one setting into the file it comes from, with a minimal diff.
 *
 * @remarks
 * A value that a shared default in `nx.json` provides becomes an override in `project.json`, and a shared default never
 * changes silently. Because Nx hands over whole top-level options, that override carries the rest of the inherited option.
 * A value nobody sets goes into the project's configuration file, or into a new `wortlaut.config.json`.
 *
 * @public
 */
export namespace ConfigurationWriter {

    /**
     * Works out the edit for a setting.
     *
     * @public
     * @param configuration The resolved configuration.
     * @param key The dotted name of the setting.
     * @param value The new value.
     * @param texts The texts of files that earlier edits of the same change already changed, which this edit continues.
     * @returns The file and its new content.
     * @throws EngineError for an unknown setting, an invalid value or a secret that is not a token.
     */
    export function edit(configuration: IResolvedConfiguration, key: string, value: unknown, texts: Map<string, string> = new Map()): IConfigurationEdit {
        validate(key, value);

        const path = key.split('.');
        const source = configuration.settings.find((setting) => setting.key === key)?.source;
        const target = configuration.nxTarget;

        if (source?.kind === 'wortlaut-config' || source?.kind === 'localizator-config') {
            return editFile(source.file as string, path, value, texts);
        }

        if (source?.kind === 'nx-configuration' && target && source.file === target.projectFile && target.configuration) {
            return editFile(target.projectFile, ['targets', target.targetName, 'configurations', target.configuration, ...path], value, texts);
        }

        if (source?.kind === 'project-json' && target) {
            return editFile(target.projectFile, ['targets', target.targetName, 'options', ...path], value, texts);
        }

        if (configuration.configFile && (!source || source.kind === 'default')) {
            return editFile(configuration.configFile, path, value, texts);
        }

        if (target) {
            return overrideInProject(configuration, path, value, texts);
        }

        return editFile(join(configuration.cwd, CONFIG_FILE_NAME), path, value, texts);
    }

    /**
     * Writes a value into `project.json` that it inherits so far, together with the rest of its top-level option.
     *
     * @private
     */
    function overrideInProject(configuration: IResolvedConfiguration, path: Array<string>, value: unknown, texts: Map<string, string>): IConfigurationEdit {
        const target = configuration.nxTarget;

        if (!target) {
            throw new EngineError('invalid-configuration', 'The project has no Nx target.');
        }

        const [option] = path;
        const options = ['targets', target.targetName, 'options'];

        if (path.length === 1 || target.ownOptions.includes(option)) {
            return editFile(target.projectFile, [...options, ...path], value, texts);
        }

        const inherited = structuredClone(target.options[option] ?? {}) as Record<string, unknown>;
        let node = inherited;

        for (const segment of path.slice(1, -1)) {
            node[segment] = { ...(node[segment] as object | undefined) };
            node = node[segment] as Record<string, unknown>;
        }

        node[path[path.length - 1]] = value;

        return editFile(target.projectFile, [...options, option], inherited, texts);
    }

    /**
     * @private
     */
    function editFile(file: string, path: JSONPath, value: unknown, texts: Map<string, string>): IConfigurationEdit {
        const existing = texts.get(file) ?? (existsSync(file) ? readFileSync(file, 'utf8') : null);
        const content = applyEdits(existing ?? '{}', modify(existing ?? '{}', path, value, FORMATTING));
        const result = existing === null ? `${content}\n` : content;

        texts.set(file, result);

        return { file, content: result };
    }

    /**
     * @private
     */
    function validate(key: string, value: unknown): void {
        const path = key.split('.');
        const tree = path.reduceRight<unknown>((current, segment) => ({ [segment]: current }), value);
        const result = ProjectOptionsSchema.safeParse(tree);

        if (!result.success) {
            throw new EngineError('invalid-arguments', `The value of '${key}' is invalid: ${result.error.issues.map((issue) => issue.message).join('; ')}`);
        }

        if (path.reduce<unknown>((current, segment) => (current as Record<string, unknown> | undefined)?.[segment], result.data as ProjectOptions) === undefined) {
            throw new EngineError('invalid-arguments', `Wortlaut has no setting '${key}'.`);
        }

        if (isSecretName(path[path.length - 1]) && !readEnvToken(value)) {
            throw new EngineError('secret-refused', `The setting '${key}' holds a secret and accepts only a token such as {env.MY_KEY}, so the secret stays out of the repository.`);
        }
    }

}


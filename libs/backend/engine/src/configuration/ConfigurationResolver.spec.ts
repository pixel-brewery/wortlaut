// #region Imports

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SettingSource } from '@pixel-brewery/wortlaut-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigurationResolver, type IResolvedConfiguration } from './ConfigurationResolver';

// #endregion

const EXECUTOR = '@pixel-brewery/nx-tasks:localizator';

describe('ConfigurationResolver', () => {
    let workspace: string;
    let project: string;

    beforeEach(() => {
        workspace = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-config-')));
        project = join(workspace, 'libs', 'ui');
        mkdirSync(project, { recursive: true });
    });

    afterEach(() => {
        rmSync(workspace, { recursive: true, force: true });
    });

    function write(path: string, value: unknown): string {
        const file = join(workspace, path);

        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));

        return file;
    }

    function resolve(request: Partial<Parameters<ConfigurationResolver['resolve']>[0]> = {}, env: NodeJS.ProcessEnv = {}): IResolvedConfiguration {
        return new ConfigurationResolver(env).resolve({ cwd: project, ...request });
    }

    function sourceOf(configuration: IResolvedConfiguration, key: string): SettingSource | undefined {
        return configuration.settings.find((setting) => setting.key === key)?.source;
    }

    it('gives every setting its default without any file', () => {
        // act
        const configuration = resolve();

        // assert
        expect(configuration.options.actions?.sort?.order).toBe('asc');
        expect(sourceOf(configuration, 'actions.sort.order')).toEqual({ kind: 'default', file: null });
        expect(configuration.resourceRoots).toEqual(['']);
    });

    it('records the file of every value through the whole order', () => {
        // arrange
        const nx = write('nx.json', {
            targetDefaults: {
                [EXECUTOR]: {
                    options: { verbose: true, output: 'from-defaults', mode: 'from-defaults', envFile: 'from-defaults' },
                    configurations: { ci: { mode: 'from-default-configuration' } }
                }
            }
        });
        const projectFile = write('libs/ui/project.json', {
            targets: {
                intl: {
                    executor: EXECUTOR,
                    options: { output: 'from-project' },
                    configurations: { ci: { envFile: 'from-configuration' } }
                }
            }
        });
        const config = write('libs/ui/wortlaut.config.json', { actions: { sort: { order: 'desc' }, transform: { types: ['ts'] } } });

        // act
        const configuration = resolve({ configuration: 'ci', arguments: { actions: { transform: { types: ['po'] } } } });

        // assert
        expect(sourceOf(configuration, 'verbose')).toEqual({ kind: 'nx-target-defaults', file: nx });
        expect(sourceOf(configuration, 'output')).toEqual({ kind: 'project-json', file: projectFile });
        expect(sourceOf(configuration, 'mode')).toEqual({ kind: 'nx-configuration', file: nx });
        expect(sourceOf(configuration, 'envFile')).toEqual({ kind: 'nx-configuration', file: projectFile });
        expect(sourceOf(configuration, 'actions.sort.order')).toEqual({ kind: 'wortlaut-config', file: config });
        expect(sourceOf(configuration, 'actions.transform.types')).toEqual({ kind: 'arguments', file: null });
        expect(configuration.options.actions?.transform?.types).toEqual(['po']);
    });

    it('merges the Nx layers like Nx does: project.json replaces a whole top-level option', () => {
        // arrange
        write('nx.json', { targetDefaults: { [EXECUTOR]: { options: { actions: { sort: { order: 'desc' }, analyze: { rules: ['empty-values'] } } } } } });
        const projectFile = write('libs/ui/project.json', { targets: { intl: { executor: EXECUTOR, options: { actions: { transform: { types: ['ts'] } } } } } });

        // act
        const configuration = resolve();

        // assert
        expect(configuration.options.actions?.sort?.order).toBe('asc');
        expect(sourceOf(configuration, 'actions.sort.order')?.kind).toBe('default');
        expect(configuration.options.actions?.analyze?.rules).toEqual([]);
        expect(sourceOf(configuration, 'actions.transform.types')).toEqual({ kind: 'project-json', file: projectFile });
    });

    it('finds the project from a directory below it and keeps executor paths relative to the project', () => {
        // arrange
        write('nx.json', {});
        write('libs/ui/project.json', { targets: { intl: { executor: EXECUTOR, options: { actions: { detect: { root: 'src', resourceRoot: ['assets/i18n'] } } } } } });
        mkdirSync(join(project, 'src', 'deep'), { recursive: true });

        // act
        const configuration = resolve({ cwd: join(project, 'src', 'deep') });

        // assert
        expect(configuration.projectRoot).toBe(project);
        expect(configuration.root).toBe(join(project, 'src'));
        expect(configuration.resourceRoots).toEqual([join(project, 'src', 'assets', 'i18n')]);
    });

    it('reads no Nx file when asked not to', () => {
        // arrange
        write('nx.json', { targetDefaults: { [EXECUTOR]: { options: { actions: { sort: { order: 'desc' } } } } } });
        write('libs/ui/project.json', { targets: { intl: { executor: EXECUTOR } } });

        // act
        const configuration = resolve({ readNx: false });

        // assert
        expect(configuration.options.actions?.sort?.order).toBe('asc');
        expect(configuration.nxTarget).toBeNull();
    });

    it('ignores a project without a Wortlaut target', () => {
        // arrange
        write('nx.json', { targetDefaults: { [EXECUTOR]: { options: { actions: { sort: { order: 'desc' } } } } } });
        write('libs/ui/project.json', { targets: { build: { executor: 'nx:run-commands' } } });

        // act
        const configuration = resolve();

        // assert
        expect(configuration.nxTarget).toBeNull();
        expect(configuration.options.actions?.sort?.order).toBe('asc');
    });

    it('reads localizator.config.json as a fallback', () => {
        // arrange
        const fallback = write('libs/ui/localizator.config.json', { actions: { sort: { order: 'desc' } } });

        // act
        const configuration = resolve();

        // assert
        expect(sourceOf(configuration, 'actions.sort.order')).toEqual({ kind: 'localizator-config', file: fallback });
    });

    it('prefers wortlaut.config.json and leaves the fallback unread', () => {
        // arrange
        write('libs/ui/localizator.config.json', { actions: { sort: { order: 'desc' }, detect: { preset: 'vue' } } });
        write('libs/ui/wortlaut.config.json', { actions: { sort: { order: 'asc' } } });

        // act
        const configuration = resolve();

        // assert
        expect(configuration.options.actions?.detect?.preset).toBe('');
        expect(configuration.configKind).toBe('wortlaut-config');
    });

    it('resolves paths of a configuration file from its directory, and a path argument from the working directory', () => {
        // arrange
        const nested = join(project, 'src');
        mkdirSync(nested);
        write('.git/HEAD', 'ref');
        write('libs/ui/wortlaut.config.json', { actions: { detect: { root: 'src', resourceRoot: ['i18n'] } } });

        // act
        const fromFile = resolve({ cwd: nested });
        const fromArgument = resolve({ cwd: nested, arguments: { actions: { detect: { resourceRoot: 'elsewhere' } } } });

        // assert
        expect(fromFile.root).toBe(nested);
        expect(fromFile.resourceRoots).toEqual([join(nested, 'i18n')]);
        expect(fromArgument.resourceRoots).not.toEqual(fromFile.resourceRoots);
        expect(fromArgument.resourceRoots[0].endsWith('elsewhere')).toBe(true);
        expect(fromArgument.root).toBe(nested);
    });

    it('refuses a configured path outside of the workspace, and accepts it as an argument', () => {
        // arrange
        write('nx.json', {});
        write('libs/ui/wortlaut.config.json', { actions: { detect: { resourceRoot: ['../../../outside'] } } });

        // act & assert
        expect(() => resolve()).toThrow(/outside of the workspace/);
        expect(resolve({ arguments: { actions: { detect: { resourceRoot: '/outside' } } } }).resourceRoots).toEqual(['/outside']);
    });

    it('names the file that holds invalid values', () => {
        // arrange
        const file = write('libs/ui/wortlaut.config.json', { actions: { detect: { preset: 'svelte' } } });

        // act & assert
        expect(() => resolve()).toThrow(file);
        expect(() => resolve()).toThrow('actions.detect.preset');
    });

    it('names the file that is no JSON', () => {
        // arrange
        const file = write('libs/ui/wortlaut.config.json', '{ broken');

        // act & assert
        expect(() => resolve()).toThrow(`The file ${file} is not valid JSON.`);
    });

    it('warns about settings it does not read', () => {
        // arrange
        write('libs/ui/wortlaut.config.json', { actions: { sort: { ordr: 'desc' } } });

        // act
        const configuration = resolve();

        // assert
        expect(configuration.warnings[0]).toContain('actions.sort.ordr');
    });

    it('reads comments in an Nx file', () => {
        // arrange
        write('nx.json', '// shared\n{ "targetDefaults": {} }');
        write('libs/ui/project.json', `{ /* target */ "targets": { "intl": { "executor": "${EXECUTOR}" } } }`);

        // act
        const configuration = resolve();

        // assert
        expect(configuration.nxTarget?.targetName).toBe('intl');
    });

    it('fails for a target or configuration that was asked for and does not exist', () => {
        // arrange
        write('nx.json', {});
        write('libs/ui/project.json', { targets: { intl: { executor: EXECUTOR } } });

        // act & assert
        expect(() => resolve({ target: 'nope' })).toThrow(/no target 'nope'/);
        expect(() => resolve({ configuration: 'nope' })).toThrow(/no configuration 'nope'/);
    });

    it('selects a target by name', () => {
        // arrange
        write('nx.json', {});
        write('libs/ui/project.json', {
            targets: {
                first: { executor: EXECUTOR, options: { output: 'first' } },
                second: { executor: EXECUTOR, options: { output: 'second' } }
            }
        });

        // act & assert
        expect(resolve().options.output).toBe('first');
        expect(resolve({ target: 'second' }).options.output).toBe('second');
    });

    describe('tokens', () => {
        it('stay unresolved in the settings and the options', () => {
            // arrange
            write('libs/ui/wortlaut.config.json', { actions: { generate: { model: '{env.MY_MODEL}' } } });

            // act
            const configuration = resolve({}, { MY_MODEL: 'gpt' });

            // assert
            expect(configuration.options.actions?.generate?.model).toBe('{env.MY_MODEL}');
            expect(configuration.settings.find((setting) => setting.key === 'actions.generate.model')?.value).toBe('{env.MY_MODEL}');
        });

        it('are filled from .env before the environment, like the Nx executor does', () => {
            // arrange
            write('libs/ui/.env', 'FROM_FILE=file\nBOTH=file\n');
            const configuration = resolve({}, { BOTH: 'environment', FROM_ENV: 'environment' });

            // act & assert
            expect(configuration.fill('{env.FROM_FILE}')).toBe('file');
            expect(configuration.fill('{env.BOTH}')).toBe('file');
            expect(configuration.fill('{env.FROM_ENV}')).toBe('environment');
            expect(configuration.fill({ list: ['{env.FROM_ENV}'], plain: 'text' })).toEqual({ list: ['environment'], plain: 'text' });
        });

        it('fill a secret variable only into a setting that holds a secret', () => {
            // arrange
            const configuration = resolve({}, { GEMINI_API_KEY: 'secret', NPM_TOKEN: 'secret', MODEL: 'a-model' });

            // act & assert
            expect(configuration.fill({ generate: { apiKey: '{env.GEMINI_API_KEY}', model: '{env.MODEL}' } })).toEqual({ generate: { apiKey: 'secret', model: 'a-model' } });
            expect(() => configuration.fill({ generate: { instructions: ['{env.NPM_TOKEN}'] } })).toThrow(/instructions must not read the secret variable NPM_TOKEN/);
            expect(() => configuration.fill({ detect: { resourceKey: { prefix: '{env.GEMINI_API_KEY}' } } })).toThrow(/prefix must not read/);
        });

        it('fail by name when a variable is not set', () => {
            // act & assert
            expect(() => resolve().fill('{env.MISSING}')).toThrow(/MISSING is not set/);
        });

        it('read the configured envFile only inside of the workspace', () => {
            // arrange
            write('nx.json', {});
            write('libs/ui/wortlaut.config.json', { envFile: '../../../.env' });

            // act & assert
            expect(() => resolve().fill('{env.ANY}')).toThrow(/outside of the workspace/);
        });
    });

    describe('secrets', () => {
        it('show a token but never a plain value', () => {
            // arrange
            write('libs/ui/wortlaut.config.json', { actions: { generate: { apiKey: 'sk-plain' } } });

            // act
            const fromFile = resolve();
            const withToken = resolve({ arguments: { actions: { generate: { apiKey: '{env.KEY}' } } } });
            const setting = (configuration: IResolvedConfiguration) => configuration.settings.find((entry) => entry.key === 'actions.generate.apiKey');

            // assert
            expect(setting(fromFile)).toMatchObject({ value: '***', secret: true });
            expect(setting(withToken)).toMatchObject({ value: '{env.KEY}', secret: true });
        });
    });
});

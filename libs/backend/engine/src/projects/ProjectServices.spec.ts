// #region Imports

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ILogger } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EngineError } from '../errors/EngineError';
import { WortlautEngine } from '../WortlautEngine';

// #endregion

const LOGGER: ILogger = { log: () => undefined, debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined } as ILogger;

/**
 * Lists the files of a folder with their modification times, to prove that a read wrote nothing.
 */
function fingerprint(folder: string): Record<string, number> {
    const result: Record<string, number> = {};

    for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) {
            const path = join(entry.parentPath, entry.name);

            result[path] = statSync(path).mtimeMs;
        }
    }

    return result;
}

describe('workspaces and projects', () => {
    let root: string;
    let repository: string;
    let engine: WortlautEngine;

    const write = (path: string, content: unknown): void => {
        const file = join(repository, path);

        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    };

    const registerAngularProject = (): { workspaceId: string; projectId: string } => {
        const inspection = engine.inspector.inspect(repository);

        return engine.workspaces.register({
            inspection,
            workspace: { kind: 'new', name: 'Acme', code: 'AC', color: 'teal' },
            preset: inspection.inspection.preset.value,
            baseLocale: inspection.inspection.baseLocale,
            targetLocales: ['de', 'fr']
        });
    };

    beforeEach(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-projects-')));
        repository = join(root, 'acme');
        mkdirSync(repository);
        engine = new WortlautEngine({ surface: 'desktop', logger: LOGGER, profileRoot: join(root, 'profile'), home: root, env: {} });

        write('package.json', { name: 'acme-app', dependencies: { '@angular/core': '22.0.0', lit: '3.0.0' } });
        write('src/app/app.component.ts', 'export const a = 1;');
        write('src/app/app.component.html', '<p>x</p>');
        write('src/app/app.component.spec.ts', 'it("x", () => 0);');
        write('libs/other/src/x.ts', 'export const x = 1;');
        write('src/i18n/lang.en.json', { loc: { app: { title: 'Title', save: 'Save', audio: 'Audio' }, error: { unknown: 'Unknown' } } });
        write('src/i18n/lang.de.json', { loc: { app: { title: 'Titel', save: 'Save', audio: 'Audio' } } });
        write('tsconfig.lib.json', { compilerOptions: { strict: true } });
        write('node_modules/x/lang.en.json', { ignored: 'yes' });
        write('.hidden/lang.en.json', { ignored: 'yes' });
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    describe('inspecting a folder', () => {
        it('finds the framework, sources, catalogs, locales and prefix with their evidence', () => {
            const { inspection } = engine.inspector.inspect(repository);

            expect(inspection.preset).toEqual({ value: 'angular', evidence: 'Found @angular/core in package.json' });
            expect(inspection.sourceRoot).toEqual({ value: 'src', fileCount: 2, evidence: '2 matching files' });
            expect(inspection.prefix).toEqual({ value: 'loc', evidence: 'All 4 keys start with it' });
            expect(inspection.catalogs).toEqual([{ folder: 'src/i18n', files: ['lang.de.json', 'lang.en.json'], keys: 4, format: 'json' }]);
            expect(inspection.locales).toEqual([{ code: 'de', keys: 3 }, { code: 'en', keys: 4 }]);
            expect(inspection.baseLocale).toBe('en');
            expect(inspection.suggestedLocales).toEqual(['fr', 'nl', 'es', 'it']);
            expect(inspection.configuration).toBeNull();
            expect(inspection.displayPath).toBe('~/acme');
            expect(inspection.name).toBe('acme-app');
        });

        it('reports a folder without catalogs as such', () => {
            rmSync(join(repository, 'src/i18n'), { recursive: true });

            const { inspection } = engine.inspector.inspect(repository);

            expect(inspection.catalogs).toEqual([]);
            expect(inspection.locales).toEqual([]);
            expect(inspection.baseLocale).toBe('en');
            expect(inspection.prefix).toEqual({ value: '', evidence: 'No keys yet' });
        });

        it('follows a preset the user picked', () => {
            write('src/app/app.vue', '<template/>');

            const { inspection } = engine.inspector.inspect(repository, [], 'vue');

            expect(inspection.preset).toEqual({ value: 'vue', evidence: 'Chosen by you' });
            expect(inspection.sourceRoot.value).toBe('src');
            expect(inspection.sourceRoot.fileCount).toBe(2);
        });

        it('adds a further catalog folder', () => {
            mkdirSync(join(root, 'elsewhere'));
            writeFileSync(join(root, 'elsewhere', 'lang.nl.json'), JSON.stringify({ loc: { a: 'A' } }));

            const { inspection } = engine.inspector.inspect(repository, [join(root, 'elsewhere')]);

            expect(inspection.catalogs.map((catalog) => catalog.files)).toContainEqual(['lang.nl.json']);
        });

        it('reads the values of a repository that has its own configuration', () => {
            write('wortlaut.config.json', { actions: { detect: { root: 'src', resourceRoot: 'i18n', preset: 'react', type: 'json', resourceKey: { prefix: 'msg' } }, analyze: { baseLocale: 'de' } } });

            const { inspection } = engine.inspector.inspect(repository);

            expect(inspection.configuration).toEqual({ kind: 'wortlaut-config', file: 'wortlaut.config.json' });
            expect(inspection.preset).toEqual({ value: 'react', evidence: 'Set in wortlaut.config.json' });
            expect(inspection.prefix.value).toBe('msg');
            expect(inspection.baseLocale).toBe('de');
        });

        it('fails on a broken configuration file instead of guessing', () => {
            write('wortlaut.config.json', '{ broken');

            expect(() => engine.inspector.inspect(repository)).toThrow(EngineError);
        });

        it('writes nothing into the folder', () => {
            const before = fingerprint(repository);

            engine.inspector.inspect(repository);

            expect(fingerprint(repository)).toEqual(before);
        });
    });

    describe('workspaces', () => {
        it('starts without workspaces', () => {
            expect(engine.workspaces.recent()).toEqual([]);
            expect(engine.workspaces.list()).toEqual([]);
        });

        it('creates a workspace for a repository without projects and sends it to setup', () => {
            const result = engine.workspaces.create({ name: 'Acme', code: 'AC', color: 'blue', repository });

            expect(result.next).toBe('setup');
            expect(result.discovered).toBe(0);
            expect(engine.workspaces.list()).toMatchObject([{ name: 'Acme', code: 'AC', color: 'blue', folder: '~/acme', projectCount: 0, folderMissing: false }]);
        });

        it('registers the Nx projects a repository brings along, under any target name', () => {
            write('nx.json', {});
            write('apps/shop/project.json', { name: 'shop', targets: { intl: { executor: '@pixel-brewery/nx-tasks:localizator' } } });
            write('libs/ui/project.json', { name: 'ui', targets: { build: { executor: 'nx:run-commands' } } });

            const result = engine.workspaces.create({ name: 'Acme', code: 'AC', color: 'blue', repository });

            expect(result).toMatchObject({ next: 'projects', discovered: 1 });
            expect(engine.workspaces.require(result.workspaceId).projects).toMatchObject([{ name: 'shop', kind: 'nx-target', nxTarget: 'intl' }]);
        });

        it('keeps a broken list untouched and reports it', () => {
            mkdirSync(join(root, 'profile'), { recursive: true });
            writeFileSync(join(root, 'profile', 'workspaces.json'), '{ broken');

            expect(() => engine.workspaces.list()).toThrow(expect.objectContaining({ code: 'workspace-store-invalid' }));
            expect(() => engine.workspaces.create({ name: 'Acme', code: 'AC', color: 'blue', repository })).toThrow(expect.objectContaining({ code: 'workspace-store-invalid' }));
            expect(readFileSync(join(root, 'profile', 'workspaces.json'), 'utf8')).toBe('{ broken');
        });

        it('says when the folder of a workspace is gone', () => {
            registerAngularProject();
            rmSync(repository, { recursive: true });

            expect(engine.workspaces.recent()[0].folderMissing).toBe(true);
        });

        it('lists the most recently opened workspace first', () => {
            let minute = 0;
            const clocked = new WortlautEngine({ surface: 'desktop', logger: LOGGER, profileRoot: join(root, 'profile'), home: root, env: {}, now: () => new Date(Date.UTC(2026, 0, 1, 0, minute++)) });
            const first = clocked.workspaces.create({ name: 'First', code: 'F', color: 'blue', repository }).workspaceId;

            clocked.workspaces.create({ name: 'Second', code: 'S', color: 'blue', repository });
            expect(clocked.workspaces.recent()[0].name).toBe('Second');

            clocked.workspaces.open(first);
            expect(clocked.workspaces.recent()[0].name).toBe('First');
        });

        it('registers a folder only once per workspace', () => {
            const { workspaceId, projectId } = registerAngularProject();
            const inspection = engine.inspector.inspect(repository);
            const again = engine.workspaces.register({ inspection, workspace: { kind: 'existing', id: workspaceId }, preset: 'angular', baseLocale: 'en', targetLocales: ['de'] });

            expect(again.projectId).toBe(projectId);
            expect(engine.workspaces.require(workspaceId).projects).toHaveLength(1);
        });

        it('writes only to the profile when a project is registered', () => {
            const before = fingerprint(repository);

            registerAngularProject();

            expect(fingerprint(repository)).toEqual(before);
        });

        it('refuses a project for a workspace that is gone', () => {
            const inspection = engine.inspector.inspect(repository);

            expect(() => engine.workspaces.register({ inspection, workspace: { kind: 'existing', id: 'gone' }, preset: null, baseLocale: 'en', targetLocales: [] }))
                .toThrow(expect.objectContaining({ code: 'workspace-not-found' }));
        });
    });

    describe('the summary of a project', () => {
        it('shows what the catalogs really hold before the first analysis', () => {
            const { projectId } = registerAngularProject();
            const summary = engine.projects.summary(projectId);

            expect(summary).toMatchObject({
                name: 'acme-app',
                resourceRoot: 'src/i18n',
                format: 'json',
                preset: 'angular',
                sourceRoot: 'src',
                hasCatalogs: true,
                keyCount: 4,
                namespaceCount: 2,
                analysis: null
            });
            expect(summary.namespaces).toEqual([{ name: 'app', count: 3 }, { name: 'error', count: 1 }]);
            expect(summary.moreNamespaces).toBeNull();
        });

        it('counts coverage with the rule behind missing-translations, after exceptions', () => {
            const { projectId } = registerAngularProject();

            expect(engine.projects.summary(projectId).locales).toEqual([
                { code: 'en', isBase: true, file: 'lang.en.json', total: 4, translated: 4, identical: 0, missing: 0 },
                { code: 'de', isBase: false, file: 'lang.de.json', total: 4, translated: 1, identical: 2, missing: 1 },
                { code: 'fr', isBase: false, file: null, total: 4, translated: 0, identical: 0, missing: 4 }
            ]);

            const summary = engine.projects.summary(projectId);

            expect(summary.translatedShare).toBe(0.25);
            expect(summary.translatedCount).toBe(1);
            expect(summary.translatableCount).toBe(4);
        });

        it('applies the declared identical values', () => {
            write('wortlaut.config.json', { actions: { detect: { resourceRoot: 'i18n', type: 'json', root: 'src', preset: 'angular' }, analyze: { baseLocale: 'en', identicalValues: ['Audio'], identicalKeys: ['loc.app.save'] } } });

            const { projectId } = registerAngularProject();
            const german = engine.projects.summary(projectId).locales.find((locale) => locale.code === 'de');

            expect(german).toMatchObject({ identical: 0, translated: 3, missing: 1 });
        });

        it('generates next steps from the real state', () => {
            const { projectId } = registerAngularProject();

            expect(engine.projects.summary(projectId).nextSteps).toEqual([
                { kind: 'identical-values', count: 2 },
                { kind: 'missing-locale', locale: 'fr', keys: 4, chunks: 1 }
            ]);
        });

        it('takes rule results from the last analysis of this project only', async () => {
            const { projectId } = registerAngularProject();
            const options = {
                resourceRoot: join(repository, 'src/i18n'),
                type: 'json' as const,
                rules: ['empty-values', 'unused-keys', 'missing-translations'],
                root: join(repository, 'src'),
                preset: 'angular' as never,
                resourceKeyPrefix: 'loc',
                resourceKeySuffix: '',
                usedKeys: [],
                baseLocale: 'en',
                identicalKeys: [],
                identicalValues: []
            };

            await engine.analyze({ cwd: repository, options });

            const { analysis, nextSteps } = engine.projects.summary(projectId);

            expect(analysis).toMatchObject({ failingRules: 2, unusedKeys: 4 });
            expect(analysis?.rules).toEqual([
                { id: 'empty-values', passed: true, locales: [] },
                { id: 'unused-keys', passed: false, locales: [{ locale: 'de', count: 3 }, { locale: 'en', count: 4 }] },
                { id: 'missing-translations', passed: false, locales: [{ locale: 'de', count: 2 }] }
            ]);
            expect(nextSteps.map((step) => step.kind)).toEqual(['identical-values', 'unused-keys', 'missing-locale']);
        });

        it('ignores the analysis of another folder', async () => {
            const { projectId } = registerAngularProject();

            mkdirSync(join(root, 'other'));
            writeFileSync(join(root, 'other', 'lang.en.json'), JSON.stringify({ a: 'A' }));
            await engine.analyze({
                cwd: join(root, 'other'),
                options: { resourceRoot: join(root, 'other'), type: 'json', rules: ['empty-values'], root: '', preset: '', resourceKeyPrefix: '', resourceKeySuffix: '', usedKeys: [], baseLocale: 'en', identicalKeys: [], identicalValues: [] }
            });

            expect(engine.projects.summary(projectId).analysis).toBeNull();
        });

        it('shows the true empty state of a project without catalogs', () => {
            rmSync(join(repository, 'src/i18n'), { recursive: true });

            const { projectId } = registerAngularProject();
            const summary = engine.projects.summary(projectId);

            expect(summary).toMatchObject({ hasCatalogs: false, keyCount: 0, namespaces: [], resourceRoot: null, translatedShare: null });
        });

        it('reads a project in a folder whose name a glob would read as syntax', () => {
            const special = join(root, 'app [copy] (2)');

            mkdirSync(join(special, 'i18n'), { recursive: true });
            writeFileSync(join(special, 'i18n', 'lang.en.json'), JSON.stringify({ loc: { a: 'A' } }));
            writeFileSync(join(special, 'i18n', 'lang.de.json'), JSON.stringify({ loc: { a: 'B' } }));

            const inspection = engine.inspector.inspect(special);
            const { projectId } = engine.workspaces.register({ inspection, workspace: { kind: 'new', name: 'X', code: 'X', color: 'teal' }, preset: null, baseLocale: 'en', targetLocales: ['de'] });

            expect(engine.projects.summary(projectId)).toMatchObject({ keyCount: 1, translatedShare: 1 });
        });

        it('fails when a configured resource root is gone', () => {
            const { projectId } = registerAngularProject();

            rmSync(join(repository, 'src/i18n'), { recursive: true });

            expect(() => engine.projects.summary(projectId)).toThrow(/not a valid directory/);
        });

        it('fails with a clear message when the folder of a project is gone', () => {
            const { projectId } = registerAngularProject();

            rmSync(repository, { recursive: true });

            expect(() => engine.projects.summary(projectId)).toThrow(expect.objectContaining({ code: 'project-folder-missing' }));
        });

        it('remembers the summary, so Welcome can show it without scanning', () => {
            const { projectId } = registerAngularProject();

            engine.projects.summary(projectId);

            expect(engine.workspaces.recent()[0]).toMatchObject({ keyCount: 4, locales: ['en', 'de'], projectCount: 1 });
        });

        it('records no run and writes nothing into the repository', () => {
            const { projectId } = registerAngularProject();
            const before = fingerprint(repository);

            engine.projects.summary(projectId);
            engine.projects.settings(projectId);
            engine.projects.effectiveSettings(projectId);
            engine.projects.sourceFile(projectId);
            engine.projects.nxTargets(projectId);
            engine.projects.cliCommands(projectId);

            expect(engine.runs.list()).toEqual([]);
            expect(fingerprint(repository)).toEqual(before);
        });
    });

    describe('the list of projects', () => {
        it('fills in figures once and shows the last analysis as the state', async () => {
            const { workspaceId, projectId } = registerAngularProject();

            expect(engine.projects.list(workspaceId)).toMatchObject({
                totalKeys: 4,
                nxTarget: null,
                sameAs: null,
                sharedDefaults: null,
                rows: [{ id: projectId, name: 'acme-app', folder: '.', keys: 4, locales: ['en', 'de'], state: { kind: 'not-analyzed' } }]
            });

            await engine.analyze({ cwd: repository, options: { resourceRoot: join(repository, 'src/i18n'), type: 'json', rules: ['missing-translations'], root: '', preset: '', resourceKeyPrefix: '', resourceKeySuffix: '', usedKeys: [], baseLocale: 'en', identicalKeys: [], identicalValues: [] } });

            expect(engine.projects.list(workspaceId).rows[0].state).toEqual({ kind: 'failing', rules: 1 });
        });

        it('keeps a project that cannot be read in the list', () => {
            const { workspaceId } = registerAngularProject();

            rmSync(repository, { recursive: true });

            expect(engine.projects.list(workspaceId).rows[0]).toMatchObject({ keys: null, state: { kind: 'folder-missing' } });
        });

        it('prints the same commands and reads shared defaults for an Nx workspace', () => {
            write('yarn.lock', '');
            write('nx.json', { targetDefaults: { intl: { options: { actions: { detect: { preset: 'angular', languages: ['en', 'de'] }, analyze: { usedKeys: ['a', 'b'] }, sort: { order: 'asc' } } } } } });
            write('apps/shop/project.json', { name: 'shop', targets: { intl: { executor: '@pixel-brewery/nx-tasks:wortlaut' } } });

            const { workspaceId } = engine.workspaces.create({ name: 'Acme', code: 'AC', color: 'blue', repository });
            const list = engine.projects.list(workspaceId);

            expect(list.sameAs?.analyze).toBe('yarn nx run-many --target=intl --configuration=analyze');
            expect(list.sharedDefaults).toEqual([
                { label: 'Preset', value: 'angular' },
                { label: 'Locales', value: 'en, de' },
                { label: 'Used keys', value: '2 patterns' },
                { label: 'Sort', value: 'asc' }
            ]);
            expect(list.rows[0].folder).toBe('apps/shop');
        });
    });

    describe('settings', () => {
        it('shows what was chosen at setup as values of the setup, for a project without a file', () => {
            const { projectId } = registerAngularProject();
            const { settings } = engine.projects.effectiveSettings(projectId);
            const preset = settings.find((setting) => setting.key === 'actions.detect.preset');
            const order = settings.find((setting) => setting.key === 'actions.sort.order');

            expect(preset).toMatchObject({ value: 'angular', source: { kind: 'arguments', file: null } });
            expect(order).toMatchObject({ value: 'asc', source: { kind: 'default', file: null } });
            expect(engine.projects.sourceFile(projectId)).toEqual({ file: null });
        });

        it('prefers a configuration that appeared in the repository over the setup', () => {
            const { projectId } = registerAngularProject();

            write('wortlaut.config.json', { actions: { detect: { preset: 'lit', root: 'src', resourceRoot: 'i18n' } } });

            const preset = engine.projects.effectiveSettings(projectId).settings.find((setting) => setting.key === 'actions.detect.preset');

            expect(preset).toMatchObject({ value: 'lit', source: { kind: 'wortlaut-config', file: 'wortlaut.config.json' } });
            expect(engine.projects.settings(projectId).preset).toBe('lit');
        });

        it('leaves tokens unresolved and masks a literal secret in values and in the source file', () => {
            write('wortlaut.config.json', { actions: { detect: { resourceRoot: 'src/i18n' }, generate: { apiKey: 'sk-do-not-show', model: '{env.MODEL}' } } });

            const { projectId } = registerAngularProject();
            const { settings } = engine.projects.effectiveSettings(projectId);

            expect(settings.find((setting) => setting.key === 'actions.generate.apiKey')).toMatchObject({ value: '***', secret: true });
            expect(settings.find((setting) => setting.key === 'actions.generate.model')?.value).toBe('{env.MODEL}');
            expect(JSON.stringify(settings)).not.toContain('sk-do-not-show');

            const file = engine.projects.sourceFile(projectId).file;

            expect(file?.name).toBe('wortlaut.config.json');
            expect(file?.text).toContain('{env.MODEL}');
            expect(file?.text).not.toContain('sk-do-not-show');
            expect(file?.text).toContain('"apiKey": "***"');
        });

        it('lists settings for Settings: project', () => {
            const { projectId } = registerAngularProject();

            expect(engine.projects.settings(projectId)).toMatchObject({
                name: 'acme-app',
                workingDirectory: '~/acme',
                sourceRoot: 'src',
                resourceRoots: ['src/i18n'],
                preset: 'angular',
                format: 'json',
                prefix: 'loc',
                baseLocale: 'en',
                targetLocales: ['de', 'fr']
            });
            expect(engine.projects.settings(projectId).rules).toContainEqual({ id: 'unused-keys', enabled: true });
        });

        it('shows the Nx commands of a project and its scripts', () => {
            write('yarn.lock', '');
            write('package.json', { name: 'acme', scripts: { 'lint:intl': 'nx run shop:intl:analyze', build: 'nx build', tr: 'wortlaut sort' } });
            write('nx.json', { targetDefaults: { '@pixel-brewery/nx-tasks:wortlaut': { options: { actions: { detect: { resourceRoot: 'src/i18n' } } }, configurations: { analyze: { mode: 'analyze' }, sort: { mode: 'sort' } } } } });
            write('apps/shop/project.json', { name: 'shop', targets: { intl: { executor: '@pixel-brewery/nx-tasks:wortlaut', configurations: { detect: { mode: 'detect' } } } } });

            const { workspaceId } = engine.workspaces.create({ name: 'Acme', code: 'AC', color: 'blue', repository });
            const project = engine.workspaces.require(workspaceId).projects[0];
            const targets = engine.projects.nxTargets(project.id);

            expect(targets).toMatchObject({ executor: '@pixel-brewery/nx-tasks:wortlaut', target: 'intl', projectCount: 1 });
            expect(targets.commands).toEqual([
                { label: 'Analyze', command: 'yarn nx run shop:intl:analyze' },
                { label: 'Sort', command: 'yarn nx run shop:intl:sort' },
                { label: 'Detect', command: 'yarn nx run shop:intl:detect' },
                { label: 'All projects', command: 'yarn nx run-many --target=intl --configuration=analyze' }
            ]);
            expect(targets.scripts).toEqual([{ label: 'lint:intl', command: 'yarn lint:intl' }, { label: 'tr', command: 'yarn tr' }]);
        });

        it('prints commands relative to the project, with its settings', () => {
            const { projectId } = registerAngularProject();
            const commands = engine.projects.cliCommands(projectId);

            expect(commands.find((row) => row.label === 'Sort')?.command).toBe('npx wortlaut sort --order asc --type json --resource-root src/i18n');
            expect(commands.find((row) => row.label === 'Detect')?.command).toBe('npx wortlaut detect --preset angular --root src --type json --resource-key-prefix loc');
        });
    });

    describe('runs of a project', () => {
        it('lists only the runs of the project and details them without absolute paths', async () => {
            const { projectId } = registerAngularProject();

            await engine.sort({ cwd: repository, writeMode: 'dry-run', options: { resourceRoot: join(repository, 'src/i18n'), type: 'json', order: 'asc' } });
            await engine.info(join(root, 'other'));

            const runs = engine.projects.listRuns(projectId, 10);

            expect(runs).toHaveLength(1);
            expect(runs[0]).toMatchObject({ title: 'sort', command: 'sort', state: 'succeeded', surface: 'desktop', dryRun: true });

            const detail = engine.projects.runDetail(runs[0].id);

            expect(detail?.equivalentCommand).toBe('npx wortlaut sort --order asc --type json --resource-root src/i18n --dry-run');
            expect(detail?.configuration).toContain('"cwd": "~/acme"');
            expect(detail?.configuration).not.toContain(root);
            expect(detail?.log).toContain('sort');
            expect(engine.projects.runDetail('unknown')).toBeNull();
        });
    });

    describe('the state of a project in a card', () => {
        it('counts the projects that need attention', async () => {
            const { projectId } = registerAngularProject();
            const { project } = engine.workspaces.requireProject(projectId);

            expect(engine.projects.projectState(project, [])).toEqual({ kind: 'not-analyzed' });
        });
    });
});

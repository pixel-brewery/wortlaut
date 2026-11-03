// #region Imports

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import type { ILogger } from '@pixel-brewery/utilities';
import type { RuleLock } from '@pixel-brewery/wortlaut-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandOptions } from '../configuration/CommandOptions';
import { WortlautEngine } from '../WortlautEngine';
import { PackProblem } from './PackProblem';
import { createManifest, FakePackFetcher, printManifest } from './testing/PackFixtures';

// #endregion

const LOGGER = { log: () => undefined, debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as ILogger;
const CONFIG = { actions: { detect: { resourceRoot: 'i18n', type: 'json', preset: '' }, analyze: { baseLocale: 'en' } } };
const NEW_COMMIT = 'c'.repeat(40);

describe('rule packs', () => {
    let root: string;
    let repository: string;
    let fetcher: FakePackFetcher;
    let engine: WortlautEngine;
    let workspaceId: string;
    let projectId: string;

    const writeIn = (base: string, path: string, content: unknown): void => {
        const file = join(base, path);

        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
    };
    const write = (path: string, content: unknown): void => writeIn(repository, path, content);
    const read = (path: string): string => readFileSync(join(repository, path), 'utf8');
    const lock = (): RuleLock => JSON.parse(read('wortlaut.lock.json')) as RuleLock;
    const seed = (base: string): void => {
        writeIn(base, '.git/HEAD', 'ref');
        writeIn(base, 'wortlaut.config.json', CONFIG);
        writeIn(base, 'i18n/lang.en.json', { loc: { greet: 'Hello {name}', save: 'Save and stop', note: 'Fine' } });
        writeIn(base, 'i18n/lang.de.json', { loc: { greet: 'Hallo', save: 'Speichern', note: 'TODO Gut' } });
    };
    const analyzeAt = (cwd: string) => {
        const configuration = engine.resolveConfiguration({ cwd, arguments: {}, readNx: true });

        return engine.analyze({ cwd, options: CommandOptions.forAnalyze(configuration) });
    };
    const scopeAt = (cwd: string) => engine.rulePacks.scopeAt(cwd, engine.resolveConfiguration({ cwd, arguments: {}, readNx: true }));
    const addFromFolder = async (folder = 'rules/our-pack', mode: 'apply' | 'review' | 'dry-run' = 'apply') => {
        const { pack, problem } = await engine.rulePacks.inspect(`./${folder}`, repository);

        expect(problem).toBeNull();

        return engine.rulePacks.install(pack as NonNullable<typeof pack>, scopeAt(repository), mode);
    };
    const addFromGitHub = async (mode: 'apply' | 'review' | 'dry-run' = 'apply') => {
        const { pack, problem } = await engine.rulePacks.inspect('github:owner/rules', repository);

        expect(problem).toBeNull();

        return engine.rulePacks.install(pack as NonNullable<typeof pack>, scopeAt(repository), mode);
    };

    beforeEach(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-rule-packs-')));
        repository = join(root, 'shop');
        seed(repository);
        write('rules/our-pack/wortlaut-pack.json', printManifest(createManifest()));
        fetcher = new FakePackFetcher();
        fetcher.hold(createManifest());
        engine = new WortlautEngine({ surface: 'desktop', logger: LOGGER, profileRoot: join(root, 'profile'), home: root, env: {}, packFetcher: fetcher });
        ({ workspaceId, projectId } = engine.workspaces.register({
            inspection: engine.inspector.inspect(repository),
            workspace: { kind: 'new', name: 'Shop', code: 'S', color: 'teal' },
            preset: null,
            baseLocale: 'en',
            targetLocales: ['de']
        }));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    describe('check', () => {
        it('shows inline what cannot be installed, from any source', async () => {
            // arrange
            write('empty/README.md', 'Hello');
            write('code/wortlaut-pack.json', printManifest(createManifest()));
            write('code/hook.js', 'process.exit(1)');
            write('wrong/wortlaut-pack.json', '{}');
            fetcher.failure = new PackProblem('not-found', 'owner/rules was not found.');

            // act & assert
            expect((await engine.rulePacks.inspect('./nope', repository)).problem?.kind).toBe('not-found');
            expect((await engine.rulePacks.inspect('./empty', repository)).problem?.kind).toBe('not-a-pack');
            expect((await engine.rulePacks.inspect('./code', repository)).problem).toMatchObject({ kind: 'has-code', details: ['hook.js'] });
            expect((await engine.rulePacks.inspect('./wrong', repository)).problem?.kind).toBe('invalid');
            expect((await engine.rulePacks.inspect('github:owner/rules', repository)).problem?.kind).toBe('not-found');
            expect((await engine.rulePacks.inspect('github:not a repository', repository)).problem?.kind).toBe('not-found');
        });

        it('holds a link in a folder pack as unsafe', async () => {
            // arrange
            const { symlinkSync } = await import('node:fs');

            write('linked/wortlaut-pack.json', printManifest(createManifest()));
            symlinkSync(join(root, 'profile'), join(repository, 'linked', 'elsewhere'));

            // act & assert
            expect((await engine.rulePacks.inspect('./linked', repository)).problem).toMatchObject({ kind: 'unsafe', message: expect.stringContaining('link') });
        });

        it('writes nothing, and runs nothing of the pack', async () => {
            // act
            const outcome = await engine.rulePacks.inspect('github:owner/rules', repository);
            const check = await engine.rulePacks.checkText('github:owner/rules', { workspaceId, projectId });

            // assert
            expect(outcome.pack).toMatchObject({ commit: fetcher.commit, access: { declarative: true, network: false, ai: false } });
            expect(check.checkId).not.toBeNull();
            expect(existsSync(join(repository, 'wortlaut.lock.json'))).toBe(false);
            expect(existsSync(join(repository, '.wortlaut'))).toBe(false);
            expect(engine.listChangeSets()).toEqual([]);
        });
    });

    describe('install', () => {
        it('pins a GitHub pack by commit and hash, as one change set with its copy', async () => {
            // act
            const outcome = await addFromGitHub();

            // assert
            expect(outcome.changeSet?.source.command).toBe('rules.install');
            expect(outcome.changeSet?.files.map((file) => file.displayPath).sort()).toEqual(['.wortlaut/rule-packs/our-pack/wortlaut-pack.json', 'wortlaut.lock.json']);
            expect(lock().packs['our-pack']).toMatchObject({ source: 'github:owner/rules', commit: fetcher.commit, version: '1.0.0', hash: expect.stringMatching(/^sha256:/) });
            expect(Object.keys(lock().packs['our-pack'].rules)).toEqual(['no-todo', 'same-placeholders', 'short-values']);
            expect(read('.wortlaut/rule-packs/our-pack/wortlaut-pack.json')).toBe(printManifest(createManifest()));
        });

        it('pins a folder inside the repository by its hash alone, without a copy', async () => {
            // act
            const outcome = await addFromFolder();

            // assert
            expect(outcome.changeSet?.files.map((file) => file.displayPath)).toEqual(['wortlaut.lock.json']);
            expect(lock().packs['our-pack']).toMatchObject({ source: 'folder:rules/our-pack', commit: null });
            expect(existsSync(join(repository, '.wortlaut'))).toBe(false);
        });

        it('refuses a folder outside of the repository for a pin everyone shares', async () => {
            // arrange
            writeIn(root, 'elsewhere/wortlaut-pack.json', printManifest(createManifest()));

            const { pack } = await engine.rulePacks.inspect(join(root, 'elsewhere'), repository);

            // act & assert
            await expect(engine.rulePacks.install(pack as NonNullable<typeof pack>, scopeAt(repository), 'apply')).rejects.toThrow(/cannot be pinned for everyone/);
            expect(existsSync(join(repository, 'wortlaut.lock.json'))).toBe(false);
        });

        it('writes nothing in a dry run', async () => {
            // act
            const outcome = await addFromGitHub('dry-run');

            // assert
            expect(outcome.changeSet?.state).toBe('proposed');
            expect(existsSync(join(repository, 'wortlaut.lock.json'))).toBe(false);
            expect(existsSync(join(repository, '.wortlaut'))).toBe(false);
        });

        it('leaves its change set in the review list, and a file that changed meanwhile fails the apply', async () => {
            // arrange
            const outcome = await addFromGitHub('review');

            expect(outcome.changeSet?.state).toBe('pending');
            expect(existsSync(join(repository, 'wortlaut.lock.json'))).toBe(false);
            write('wortlaut.lock.json', '{}');

            // act & assert
            await expect(engine.applyChangeSet(outcome.changeSet?.id as string, repository)).rejects.toThrow(/wortlaut\.lock\.json/);
            expect(read('wortlaut.lock.json')).toBe('{}');
            expect(existsSync(join(repository, '.wortlaut'))).toBe(false);
        });

        it('does nothing for what is already pinned, and refuses another content under the same name', async () => {
            // arrange
            await addFromGitHub();

            // act
            const again = await addFromGitHub();

            fetcher.hold(createManifest({ version: '2.0.0' }), NEW_COMMIT);

            // assert
            expect(again.changeSet).toBeNull();
            await expect(addFromGitHub()).rejects.toThrow(/already pinned with other content/);
        });

        it('refuses a rule that another pack has', async () => {
            // arrange
            await addFromGitHub();
            write('rules/twin/wortlaut-pack.json', printManifest(createManifest({ id: 'twin-pack' })));

            // act & assert
            await expect(addFromFolder('rules/twin')).rejects.toThrow(/already has a rule 'no-todo'/);
        });

        it('does not write over a lock file it cannot read', async () => {
            // arrange
            write('wortlaut.lock.json', 'nope');

            // act & assert
            await expect(addFromGitHub()).rejects.toThrow(/cannot be read/);
            expect(read('wortlaut.lock.json')).toBe('nope');
        });

        it('updates a localizator.lock.json where that is what a repository has', async () => {
            // arrange
            write('localizator.lock.json', { schemaVersion: 1, packs: {} });

            // act
            await addFromGitHub();

            // assert
            expect(existsSync(join(repository, 'wortlaut.lock.json'))).toBe(false);
            expect(read('localizator.lock.json')).toContain('our-pack');
        });
    });

    describe('analysis', () => {
        it('gives the same findings for a pack from a folder and from GitHub', async () => {
            // arrange
            const other = join(root, 'other');

            seed(other);
            await addFromFolder();

            const fromFolder = await analyzeAt(repository);

            const { pack } = await engine.rulePacks.inspect('github:owner/rules', other);

            await engine.rulePacks.install(pack as NonNullable<typeof pack>, scopeAt(other), 'apply');

            // act
            const fromGitHub = await analyzeAt(other);
            const strip = (findings: typeof fromFolder.report.findings) => findings.map((finding) => ({ ...finding, file: finding.file && normalize(finding.file).replace(root, '').replace(/\\/g, '/'), message: finding.message })).map((finding) => ({ ...finding, file: finding.file?.replace(/^\/(shop|other)/, '') }));

            // assert
            expect(fromFolder.report.findings.map((finding) => finding.rule)).toEqual(expect.arrayContaining(['no-todo', 'same-placeholders']));
            expect(strip(fromGitHub.report.findings)).toEqual(strip(fromFolder.report.findings));
        });

        it('runs the rules of a pack next to a configured list of built-in rules, with their severities', async () => {
            // arrange
            write('wortlaut.config.json', { actions: { ...CONFIG.actions, analyze: { baseLocale: 'en', rules: ['empty-values'] } } });
            await addFromFolder();

            // act
            const { report } = await analyzeAt(repository);

            // assert
            expect((report.data as { results: Array<{ rule: string }> }).results.map((row) => row.rule)).toEqual(expect.arrayContaining(['empty-values', 'no-todo', 'short-values', 'same-placeholders']));
            expect(report.findings.find((finding) => finding.rule === 'no-todo')?.severity).toBe('error');
            expect((report.data as { gate: { errors: number } }).gate.errors).toBe(2);
        });

        it('refuses a changed pack: its rules do not run, and the report says why', async () => {
            // arrange
            await addFromFolder();
            write('rules/our-pack/wortlaut-pack.json', printManifest(createManifest()).replace('Remove TODO.', 'Keep TODO.'));

            // act
            const { report } = await analyzeAt(repository);

            // assert
            const data = report.data as { results: Array<{ rule: string }>; gate: { refusedPacks: Array<{ pack: string; reason: string }> } };

            expect(data.results.map((row) => row.rule)).not.toContain('no-todo');
            expect(data.gate.refusedPacks).toEqual([{ pack: 'Our pack', reason: expect.stringContaining('does not match its pin') }]);
            expect(report.findings.find((finding) => finding.rule === 'rule-pack-verification')?.severity).toBe('error');
        });

        it('refuses a rule of a changed pack that is asked for by name', async () => {
            // arrange
            await addFromFolder();
            write('rules/our-pack/wortlaut-pack.json', printManifest(createManifest()).replace('Remove TODO.', 'Keep TODO.'));

            const configuration = engine.resolveConfiguration({ cwd: repository, arguments: {}, readNx: true });

            // act & assert
            await expect(engine.analyze({ cwd: repository, options: { ...CommandOptions.forAnalyze(configuration), rules: ['no-todo'], explicitRules: true } })).rejects.toThrow(/was refused/);
        });

        it('fails a hostile pattern within its bound, so the analysis ends', async () => {
            // arrange
            const hostile = createManifest({ rules: [{ id: 'hostile', description: 'x', message: 'x', severity: 'warning', pattern: { regex: '^(a+)+$' } }] });

            write('rules/our-pack/wortlaut-pack.json', printManifest(hostile));
            write('i18n/lang.en.json', { loc: { evil: `${'a'.repeat(40)}!` } });
            await addFromFolder();

            const startedAt = performance.now();

            // act
            const { report } = await analyzeAt(repository);

            // assert
            const finding = report.findings.find((candidate) => candidate.rule === 'hostile');

            expect(finding).toMatchObject({ severity: 'error', message: expect.stringContaining('did not finish') });
            expect(performance.now() - startedAt).toBeLessThan(5000);
        });

        it('leaves a repository without a lock file and without severities exactly as it was', async () => {
            // arrange
            write('i18n/lang.de.json', { loc: { greet: 'Hallo', save: 'Speichern', note: 'Fine' } });

            // act
            const { report } = await analyzeAt(repository);

            // assert
            const data = report.data as Record<string, unknown>;

            expect(Object.keys(data)).toEqual(['results']);
            expect(report.findings.map((finding) => [finding.rule, finding.severity])).toEqual([['missing-translations', 'error']]);
            expect((data.results as Array<{ rule: string }>).map((row) => row.rule)).toEqual([
                ...Array.from({ length: 2 }, () => 'duplicate-keys'),
                ...Array.from({ length: 2 }, () => 'duplicate-values'),
                ...Array.from({ length: 2 }, () => 'empty-values'),
                ...Array.from({ length: 2 }, () => 'key-consistency'),
                ...Array.from({ length: 2 }, () => 'missing-translations'),
                ...Array.from({ length: 2 }, () => 'multiple-key-usage')
            ]);
        });

        it('leaves out a rule that is off, and a pack that is off', async () => {
            // arrange
            await addFromFolder();
            await engine.rulePacks.setSeverity(scopeAt(repository), 'no-todo', 'off', 'apply');
            await engine.rulePacks.setSeverity(scopeAt(repository), 'empty-values', 'off', 'apply');

            const rulesRun = async (): Promise<Array<string>> => ((await analyzeAt(repository)).report.data as { results: Array<{ rule: string }> }).results.map((row) => row.rule);

            // act & assert
            expect(await rulesRun()).not.toContain('no-todo');
            expect(await rulesRun()).not.toContain('empty-values');
            expect(await rulesRun()).toContain('short-values');

            await engine.rulePacks.setEnabled(scopeAt(repository), 'our-pack', false, 'apply');

            expect(await rulesRun()).not.toContain('short-values');
        });

        it('lets a run ask for a rule that is off, because a switch affects that run only', async () => {
            // arrange
            await engine.rulePacks.setSeverity(scopeAt(repository), 'empty-values', 'off', 'apply');

            const configuration = engine.resolveConfiguration({ cwd: repository, arguments: {}, readNx: true });

            // act
            const { report } = await engine.analyze({ cwd: repository, options: { ...CommandOptions.forAnalyze(configuration), rules: ['empty-values'], explicitRules: true } });

            // assert
            expect((report.data as { results: Array<{ rule: string }> }).results.map((row) => row.rule)).toEqual(['empty-values', 'empty-values']);
        });
    });

    describe('update', () => {
        beforeEach(async () => {
            await addFromGitHub();
        });

        it('stays put while the source holds what is pinned, without downloading again', async () => {
            // arrange
            const before = fetcher.downloads;

            // act
            const preview = await engine.rulePacks.checkUpdate(workspaceId, 'our-pack');

            // assert
            expect(preview).toMatchObject({ available: false, updateId: null });
            expect(fetcher.downloads).toBe(before);
        });

        it('never updates itself: a changed source shows a review of the lock file and writes nothing', async () => {
            // arrange
            const pinned = read('wortlaut.lock.json');
            const copy = read('.wortlaut/rule-packs/our-pack/wortlaut-pack.json');
            const next = createManifest({ version: '1.1.0' });

            next.rules = [{ ...next.rules[0], severity: 'warning' }, next.rules[1], { id: 'new-rule', description: 'A new rule.', message: 'x', limit: { maxLength: 9 } }];
            fetcher.hold(next, NEW_COMMIT);

            // act
            const update = await engine.rulePacks.checkUpdate(workspaceId, 'our-pack');

            // assert
            expect(update).toMatchObject({ available: true, next: { commit: NEW_COMMIT, version: '1.1.0' }, summary: `1 new rule, 1 changed rule, 1 removed rule, commit ${NEW_COMMIT.slice(0, 7)}` });
            expect(update.rules).toEqual([
                { id: 'no-todo', change: 'changed', description: 'No TODO in a value.' },
                { id: 'new-rule', change: 'added', description: 'A new rule.' },
                { id: 'same-placeholders', change: 'removed', description: 'Placeholders match.' }
            ]);

            const [lockDiff] = update.repositories[0].files;

            expect(lockDiff.file).toBe('wortlaut.lock.json');
            expect(lockDiff.hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind === 'add').map((line) => line.text).join('\n')).toContain(NEW_COMMIT);
            expect(read('wortlaut.lock.json')).toBe(pinned);
            expect(read('.wortlaut/rule-packs/our-pack/wortlaut-pack.json')).toBe(copy);
            expect((await analyzeAt(repository)).report.findings.map((finding) => finding.rule)).toContain('no-todo');
        });

        it('writes exactly what the review showed, even when the source moves on', async () => {
            // arrange
            const next = createManifest({ version: '1.1.0' });

            fetcher.hold(next, NEW_COMMIT);

            const update = await engine.rulePacks.checkUpdate(workspaceId, 'our-pack');

            fetcher.hold(createManifest({ version: '9.9.9' }), 'd'.repeat(40));

            // act
            const write = await engine.rulePacks.updateIn(workspaceId, update.updateId as string, false);

            // assert
            expect(write.results).toEqual([expect.objectContaining({ failure: null, outcome: expect.objectContaining({ state: 'applied' }) })]);
            expect(lock().packs['our-pack']).toMatchObject({ commit: NEW_COMMIT, version: '1.1.0' });
            expect(read('.wortlaut/rule-packs/our-pack/wortlaut-pack.json')).toBe(printManifest(next));
        });

        it('leaves an approved update in Review while Dry run is on, and nothing is written', async () => {
            // arrange
            const pinned = read('wortlaut.lock.json');

            fetcher.hold(createManifest({ version: '1.1.0' }), NEW_COMMIT);

            const update = await engine.rulePacks.checkUpdate(workspaceId, 'our-pack');

            // act
            const write = await engine.rulePacks.updateIn(workspaceId, update.updateId as string, true);

            // assert
            expect(write.results[0].outcome?.state).toBe('pending');
            expect(read('wortlaut.lock.json')).toBe(pinned);
        });

        it('says so when the source cannot be reached, and the pin stays', async () => {
            // arrange
            fetcher.failure = new PackProblem('network', 'owner/rules did not answer within 30 seconds.');

            // act
            const update = await engine.rulePacks.checkUpdate(workspaceId, 'our-pack');

            // assert
            expect(update).toMatchObject({ available: false, failure: expect.stringContaining('did not answer') });
        });

        it('refuses a new definition with code, and it never reaches the lock file', async () => {
            // arrange
            fetcher.hold(createManifest(), NEW_COMMIT);
            fetcher.files.push({ path: 'hook.js', bytes: Buffer.from('process.exit(1)') });

            // act
            const update = await engine.rulePacks.checkUpdate(workspaceId, 'our-pack');

            // assert
            expect(update).toMatchObject({ available: false, failure: expect.stringContaining('holds code') });
        });

        it('offers a tampered copy a reviewed way back to what its source holds', async () => {
            // arrange
            const original = read('.wortlaut/rule-packs/our-pack/wortlaut-pack.json');

            write('.wortlaut/rule-packs/our-pack/wortlaut-pack.json', original.replace('Remove TODO.', 'Keep TODO.'));

            expect((await analyzeAt(repository)).report.findings.map((finding) => finding.rule)).toContain('rule-pack-verification');

            // act
            const update = await engine.rulePacks.checkUpdate(workspaceId, 'our-pack');

            await engine.rulePacks.updateIn(workspaceId, update.updateId as string, false);

            // assert
            expect(update.available).toBe(true);
            expect(update.repositories[0].files.map((file) => file.file)).toEqual(['.wortlaut/rule-packs/our-pack/wortlaut-pack.json']);
            expect(read('.wortlaut/rule-packs/our-pack/wortlaut-pack.json')).toBe(original);
            expect((await analyzeAt(repository)).report.findings.map((finding) => finding.rule)).toContain('no-todo');
        });

        it('re-pins a changed folder only through a reviewed update', async () => {
            // arrange
            await addFromFolder('rules/our-pack').catch(() => undefined);
            rmSync(join(repository, 'wortlaut.lock.json'));
            await addFromFolder();

            const next = createManifest({ version: '1.2.0' });

            write('rules/our-pack/wortlaut-pack.json', printManifest(next));

            expect(engine.rulePacks.status(repository, engine.resolveConfiguration({ cwd: repository, arguments: {}, readNx: true })).find((status) => status.id === 'our-pack')?.state).toBe('refused');

            // act
            const preview = await engine.rulePacks.previewUpdate(scopeAt(repository), 'our-pack');
            const outcome = await engine.rulePacks.applyUpdate(preview.next as NonNullable<typeof preview.next>, scopeAt(repository), 'our-pack', 'apply');

            // assert
            expect(outcome.changeSet?.files.map((file) => file.displayPath)).toEqual(['wortlaut.lock.json']);
            expect(lock().packs['our-pack'].version).toBe('1.2.0');
            expect((await analyzeAt(repository)).report.findings.map((finding) => finding.rule)).toContain('no-todo');
        });
    });

    describe('settings', () => {
        it('writes a severity into the file settings come from, with a small diff', async () => {
            // act
            await engine.rulePacks.setSeverity(scopeAt(repository), 'empty-values', 'warning', 'apply');

            // assert
            expect(JSON.parse(read('wortlaut.config.json'))).toEqual({ actions: { ...CONFIG.actions, analyze: { baseLocale: 'en', severities: { 'empty-values': 'warning' } } } });
        });

        it('writes into localizator.config.json when that is the file a repository has', async () => {
            // arrange
            rmSync(join(repository, 'wortlaut.config.json'));
            write('localizator.config.json', CONFIG);

            // act
            await engine.rulePacks.setSeverity(scopeAt(repository), 'empty-values', 'off', 'apply');

            // assert
            expect(existsSync(join(repository, 'wortlaut.config.json'))).toBe(false);
            expect(read('localizator.config.json')).toContain('"empty-values": "off"');
        });

        it('refuses a rule nothing defines, and a pack the lock file does not pin', async () => {
            // act & assert
            await expect(engine.rulePacks.setSeverity(scopeAt(repository), 'nope', 'off', 'apply')).rejects.toThrow(/No built-in rule and no pinned pack/);
            await expect(engine.rulePacks.setEnabled(scopeAt(repository), 'nope', false, 'apply')).rejects.toThrow(/pins no pack/);
        });

        it('keeps a severity in Review while Dry run is on', async () => {
            // arrange
            const before = read('wortlaut.config.json');

            // act
            const write = await engine.rulePacks.setSeverityIn(workspaceId, 'empty-values', 'off', true);

            // assert
            expect(write.results[0].outcome?.state).toBe('pending');
            expect(read('wortlaut.config.json')).toBe(before);
        });

        it('edits the one value behind the switch of a rule, from Settings: project as well', async () => {
            // arrange
            await engine.commands.updateSettings(projectId, { rules: ['duplicate-keys'] }, { sourceRoot: null, addResourceRoots: [] }, false);

            // assert
            const { analyze } = (JSON.parse(read('wortlaut.config.json')) as { actions: { analyze: { severities: Record<string, string>; rules?: Array<string> } } }).actions;

            expect(analyze.rules).toBeUndefined();
            expect(analyze.severities).toEqual({ 'duplicate-values': 'off', 'empty-values': 'off', 'key-consistency': 'off', 'missing-translations': 'off', 'multiple-key-usage': 'off', 'unused-keys': 'off' });
            expect(engine.projects.settings(projectId).rules.filter((rule) => rule.enabled).map((rule) => rule.id)).toEqual(['duplicate-keys']);

            // act
            await engine.commands.updateSettings(projectId, { rules: ['duplicate-keys', 'empty-values'] }, { sourceRoot: null, addResourceRoots: [] }, false);

            // assert
            expect(engine.projects.settings(projectId).rules.filter((rule) => rule.enabled).map((rule) => rule.id)).toEqual(['duplicate-keys', 'empty-values']);
            expect(engine.commands.analyzeOverview(projectId).rules.find((rule) => rule.id === 'empty-values')).toMatchObject({ enabled: true, severity: 'error' });
        });

        it('takes a rule back into a list of rules from older configuration', async () => {
            // arrange
            write('wortlaut.config.json', { actions: { ...CONFIG.actions, analyze: { baseLocale: 'en', rules: ['empty-values'] } } });

            expect(engine.projects.settings(projectId).rules.find((rule) => rule.id === 'duplicate-keys')?.enabled).toBe(false);

            // act
            await engine.commands.updateSettings(projectId, { rules: ['empty-values', 'duplicate-keys'] }, { sourceRoot: null, addResourceRoots: [] }, false);

            // assert
            expect(engine.projects.settings(projectId).rules.find((rule) => rule.id === 'duplicate-keys')?.enabled).toBe(true);
        });

        it('adds per-rule exceptions, which that rule leaves alone', async () => {
            // arrange
            await addFromFolder();

            // act
            const outcome = await engine.commands.addRuleException(projectId, 'no-todo', 'loc.note', false);
            const again = await engine.commands.addRuleException(projectId, 'no-todo', 'loc.note', false);

            // assert
            expect(outcome.state).toBe('applied');
            expect(again.state).toBe('unchanged');
            expect((await analyzeAt(repository)).report.findings.map((finding) => finding.rule)).not.toContain('no-todo');
        });
    });

    describe('workspace', () => {
        it('writes one change set per repository, and each repository pins for itself', async () => {
            // arrange
            const second = join(root, 'second');

            seed(second);
            engine.workspaces.update(workspaceId, { name: 'Shop', code: 'S', color: 'teal', scanForProjects: true, defaults: { baseLocale: null, targetLocales: [], preset: null }, removeRepositories: [], addRepositories: [second] });

            const check = await engine.rulePacks.checkText('github:owner/rules', { workspaceId, projectId });

            // act
            const write = await engine.rulePacks.installTo(check.checkId as string, { kind: 'workspace', workspaceId }, false);

            // assert
            expect(write.results).toHaveLength(2);
            expect(new Set(write.results.map((result) => result.outcome?.changeSetId)).size).toBe(2);
            expect(write.results.every((result) => result.outcome?.files.includes('wortlaut.lock.json'))).toBe(true);
            expect(existsSync(join(second, 'wortlaut.lock.json'))).toBe(true);
            expect(existsSync(join(repository, 'wortlaut.lock.json'))).toBe(true);
        });

        it('offers a folder only where it lies inside the repository, and says why it goes nowhere else', async () => {
            // arrange
            writeIn(root, 'elsewhere/wortlaut-pack.json', printManifest(createManifest()));

            // act
            const inside = await engine.rulePacks.check({ kind: 'folder', path: join(repository, 'rules/our-pack') }, { workspaceId, projectId });
            const outside = await engine.rulePacks.check({ kind: 'folder', path: join(root, 'elsewhere') }, { workspaceId, projectId });

            // assert
            expect(inside.targets.map((target) => target.label)).toEqual(['Workspace Shop', 'Only project shop']);
            expect(inside.sameAs).toBe('npx wortlaut rules add ./rules/our-pack');
            expect(outside.checkId).toBeNull();
            expect(outside.targets).toEqual([]);
            expect(outside.targetsNote).toMatch(/cannot be pinned for everyone/);
        });

        it('lists the built-in rules first, and a refused pack says why', async () => {
            // arrange
            await addFromGitHub();

            expect(engine.rulePacks.list(workspaceId).map((pack) => pack.id)).toEqual(['builtin', 'our-pack']);
            expect(engine.rulePacks.list(workspaceId)[0]).toMatchObject({ locked: true, access: { readsSource: true } });
            expect(engine.rulePacks.enabledCount(workspaceId)).toBe(1);

            write('.wortlaut/rule-packs/our-pack/wortlaut-pack.json', 'tampered');

            // act
            const pack = engine.rulePacks.list(workspaceId)[1];

            // assert
            expect(pack.enabled).toBe(false);
            expect(pack.refusal).toMatchObject({ reason: expect.stringContaining('does not match its pin'), pinnedHash: expect.stringMatching(/^sha256:/), foundHash: expect.stringMatching(/^sha256:/) });
            expect(pack.rules.map((rule) => rule.result)).toEqual(['Refused', 'Refused', 'Refused']);
            expect(engine.rulePacks.enabledCount(workspaceId)).toBe(0);
            expect(engine.commands.analyzeOverview(projectId).refusedPacks).toEqual([{ name: 'Our pack', reason: expect.stringContaining('does not match') }]);
        });

        it('sums up the latest results per project', async () => {
            // arrange
            await addFromGitHub();

            expect(engine.rulePacks.list(workspaceId)[1].rules.find((rule) => rule.id === 'no-todo')?.result).toBe('Not run');

            // act
            await engine.commands.runConfigured(projectId, 'analyze', { dryRun: true });

            // assert
            const rules = engine.rulePacks.list(workspaceId)[1].rules;

            expect(rules.find((rule) => rule.id === 'no-todo')).toMatchObject({ result: '1 project failing', variant: 'danger' });
            expect(rules.find((rule) => rule.id === 'short-values')).toMatchObject({ result: 'Pass', variant: 'success' });
        });

        it('offers what ships with Wortlaut until it is added, and offers nothing it cannot deliver', async () => {
            // act
            const before = engine.rulePacks.available(workspaceId);
            const check = await engine.rulePacks.checkText('wortlaut:message-checks', { workspaceId, projectId });

            await engine.rulePacks.installTo(check.checkId as string, { kind: 'workspace', workspaceId }, false);

            // assert
            expect(before).toEqual([{ id: 'message-checks', name: 'Message checks', description: expect.any(String), source: 'wortlaut:message-checks' }]);
            expect(before.map((pack) => pack.name)).not.toEqual(expect.arrayContaining(['Tone of voice', 'Angular templates']));
            expect(engine.rulePacks.available(workspaceId)).toEqual([]);
            expect(lock().packs['message-checks']).toMatchObject({ source: 'wortlaut:message-checks', commit: null, version: '1.0.0' });
        });

        it('shows the Message checks in Analyze with their severities, grouped by their pack', async () => {
            // arrange
            const check = await engine.rulePacks.checkText('wortlaut:message-checks', { workspaceId, projectId });

            await engine.rulePacks.installTo(check.checkId as string, { kind: 'workspace', workspaceId }, false);

            // act
            const overview = engine.commands.analyzeOverview(projectId);
            const result = await engine.commands.run({ command: 'analyze', projectId, input: { rules: overview.rules.filter((rule) => rule.enabled).map((rule) => rule.id) } }, { dryRun: true, runId: 'analysis-1' });

            // assert
            expect(overview.rules.filter((rule) => rule.group === 'Pack: Message checks').map((rule) => [rule.id, rule.severity])).toEqual([['placeholder-consistency', 'error'], ['icu-syntax', 'error'], ['text-expansion', 'warning'], ['trailing-punctuation', 'warning']]);

            const rules = result.output?.command === 'analyze' ? result.output.rules : [];
            const placeholders = rules.find((rule) => rule.id === 'placeholder-consistency');

            expect(placeholders).toMatchObject({ passed: false, severity: 'error', total: 1, pack: { name: 'Message checks', title: '1 values lost or added a placeholder', column: 'What changed' }, rows: [{ a: 'loc.greet', b: 'Lost {name}', key: 'loc.greet' }] });
            expect(rules.find((rule) => rule.id === 'icu-syntax')).toMatchObject({ passed: true, pack: { title: 'Messages are valid' } });
            expect(engine.commands.analyzeOverview(projectId).rules.find((rule) => rule.id === 'icu-syntax')?.last).toMatchObject({ passed: true });
        });

        it('guards every file before a change writes it', async () => {
            // arrange
            engine.rulePacks.guardPaths(() => {
                throw new Error('This file lies outside of the folders you chose.');
            });

            const check = await engine.rulePacks.checkText('github:owner/rules', { workspaceId, projectId });

            // act
            const write = await engine.rulePacks.installTo(check.checkId as string, { kind: 'workspace', workspaceId }, false);

            // assert
            expect(write.results[0]).toMatchObject({ outcome: null, failure: expect.stringContaining('outside of the folders') });
            expect(existsSync(join(repository, 'wortlaut.lock.json'))).toBe(false);
        });

        it('shows the lock file as the source of the packs of a project', async () => {
            // arrange
            await addFromGitHub();

            // act
            const setting = engine.projects.effectiveSettings(projectId).settings.find((candidate) => candidate.key === 'rulePacks');

            // assert
            expect(setting).toMatchObject({ value: [`our-pack@${fetcher.commit.slice(0, 7)}`], source: { kind: 'lock-file', file: 'wortlaut.lock.json' } });
        });
    });
});

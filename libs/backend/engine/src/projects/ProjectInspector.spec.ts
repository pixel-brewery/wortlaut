// #region Imports

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ILogger } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WortlautEngine } from '../WortlautEngine';

// #endregion

const LOGGER = { log: () => undefined, debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined } as ILogger;

describe('ProjectInspector', () => {
    let root: string;
    let repository: string;
    let engine: WortlautEngine;

    const write = (path: string, value: unknown): void => {
        const file = join(repository, path);

        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
    };

    beforeEach(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-inspector-')));
        repository = join(root, 'workspace');
        mkdirSync(repository);
        engine = new WortlautEngine({ surface: 'desktop', logger: LOGGER, profileRoot: join(root, 'profile'), home: root, env: {} });
        write('package.json', { name: 'workspace' });
        write('apps/frontend/app/package.json', { dependencies: { '@angular/core': '22.0.0' } });
        write('apps/frontend/app/project.json', { sourceRoot: 'apps/frontend/app/src' });
        write('apps/frontend/app/src/main.ts', 'export const app = true;');
        write('apps/frontend/app/src/index.html', '<p>Frontend</p>');

        for (let index = 0; index < 12; index++) {
            write(`libs/backend/core/src/Backend${index}.ts`, `export const value${index} = ${index};`);
        }
    });

    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('keeps Angular sources with the package that supplied the framework evidence, even when the backend has more TypeScript', () => {
        const { inspection } = engine.inspector.inspect(repository);

        expect(inspection.preset).toEqual({ value: 'angular', evidence: 'Found @angular/core in apps/frontend/app/package.json' });
        expect(inspection.sourceRoot).toMatchObject({ value: 'apps/frontend/app/src', fileCount: 2 });
        expect(existsSync(join(repository, 'wortlaut.config.json'))).toBe(false);
    });

    it('uses a declared custom Nx source root inside the selected repository', () => {
        write('apps/frontend/app/project.json', { sourceRoot: 'client/application' });
        write('client/application/Main.ts', 'export const client = true;');

        const { inspection } = engine.inspector.inspect(repository);

        expect(inspection.sourceRoot).toMatchObject({ value: 'client/application', fileCount: 1 });
    });

    it('ignores a declared Nx source root outside the selected repository', () => {
        write('apps/frontend/app/project.json', { sourceRoot: '../elsewhere' });
        mkdirSync(join(root, 'elsewhere'));
        writeFileSync(join(root, 'elsewhere', 'Secret.ts'), 'export const secret = true;');

        expect(engine.inspector.inspect(repository).inspection.sourceRoot.value).toBe('apps/frontend/app/src');
    });

    it('keeps a manually selected source root through preset changes and registration', async () => {
        write('libs/frontend/feature/Feature.ts', 'export const label = "Frontend";');
        const chosen = join(repository, 'libs/frontend');
        const result = engine.inspector.inspect(repository, [], 'angular', chosen);

        expect(result.inspection.sourceRoot).toEqual({ value: 'libs/frontend', fileCount: 1, evidence: '1 matching file, chosen by you' });
        expect(engine.inspector.inspect(repository, [], 'lit', chosen).sourceRoot).toBe(chosen);
        const registered = engine.workspaces.register({ inspection: result, workspace: { kind: 'new', name: 'Workspace', code: 'WS', color: 'teal' }, preset: 'angular', baseLocale: 'en', targetLocales: [] });
        const { project } = engine.workspaces.requireProject(registered.projectId);

        await engine.commands.writeSetupConfiguration(project, false);

        const configuration = JSON.parse(readFileSync(join(repository, 'wortlaut.config.json'), 'utf8')) as { actions: { detect: { root: string } } };

        expect(configuration.actions.detect.root).toBe('libs/frontend');
        expect(engine.projects.settings(registered.projectId).sourceRoot).toBe('libs/frontend');
    });

    it('persists an explicit repository root as a usable dot instead of an unset source root', () => {
        const result = engine.inspector.inspect(repository, [], 'angular', repository);

        expect(engine.inspector.buildSetupOptions(result, 'angular', 'en', []).actions?.detect?.root).toBe('.');
    });

    it('rejects selected source folders that are missing or outside the selected repository', () => {
        expect(() => engine.inspector.inspect(repository, [], 'angular', root)).toThrow('Choose an existing source folder inside the project.');
        expect(() => engine.inspector.inspect(repository, [], 'angular', join(repository, 'missing'))).toThrow('Choose an existing source folder inside the project.');
    });

    it('preserves an existing configured source root instead of replacing it with a setup choice', () => {
        write('wortlaut.config.json', { actions: { detect: { root: 'apps/frontend/app/src', preset: 'angular' } } });
        const file = join(repository, 'wortlaut.config.json');
        const before = readFileSync(file, 'utf8');

        const result = engine.inspector.inspect(repository, [], 'angular', join(repository, 'libs/backend/core/src'));

        expect(result.inspection.sourceRoot.value).toBe('apps/frontend/app/src');
        expect(result.inspection.sourceRoot.evidence).toContain('set in wortlaut.config.json');
        expect(readFileSync(file, 'utf8')).toBe(before);
    });

    it('preserves an explicitly unconfigured source root in existing project configuration', () => {
        write('wortlaut.config.json', { actions: { detect: { preset: 'angular' } } });

        const result = engine.inspector.inspect(repository, [], 'angular', join(repository, 'apps/frontend/app/src'));

        expect(result.inspection.sourceRoot).toEqual({ value: '', fileCount: 0, evidence: 'No source root set in wortlaut.config.json' });
    });
});

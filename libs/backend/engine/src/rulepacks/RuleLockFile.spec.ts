// #region Imports

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuleLockFile } from './RuleLockFile';

// #endregion

const LOCK = { schemaVersion: 1, packs: { 'a-pack': { name: 'A pack', source: 'github:o/r', version: '1.0.0', commit: 'a'.repeat(40), hash: `sha256:${'a'.repeat(64)}`, rules: { 'b-rule': `sha256:${'b'.repeat(64)}`, 'a-rule': `sha256:${'c'.repeat(64)}` } } } };

describe('RuleLockFile', () => {
    let root: string;

    beforeEach(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-lock-')));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('reads wortlaut.lock.json', () => {
        // arrange
        writeFileSync(join(root, 'wortlaut.lock.json'), JSON.stringify(LOCK));

        // act
        const state = RuleLockFile.read(root);

        // assert
        expect(state).toMatchObject({ path: join(root, 'wortlaut.lock.json'), exists: true, problem: null });
        expect(Object.keys(state.lock.packs)).toEqual(['a-pack']);
    });

    it('falls back to localizator.lock.json, and keeps writing there', () => {
        // arrange
        writeFileSync(join(root, 'localizator.lock.json'), JSON.stringify(LOCK));

        // act
        const state = RuleLockFile.read(root);

        // assert
        expect(state.path).toBe(join(root, 'localizator.lock.json'));
        expect(Object.keys(state.lock.packs)).toEqual(['a-pack']);
    });

    it('prefers wortlaut.lock.json over its fallback', () => {
        // arrange
        writeFileSync(join(root, 'localizator.lock.json'), JSON.stringify(LOCK));
        writeFileSync(join(root, 'wortlaut.lock.json'), JSON.stringify({ schemaVersion: 1, packs: {} }));

        // act & assert
        expect(RuleLockFile.read(root).lock.packs).toEqual({});
    });

    it('says what a new file would be', () => {
        expect(RuleLockFile.read(root)).toMatchObject({ path: join(root, 'wortlaut.lock.json'), exists: false, problem: null, lock: { packs: {} } });
    });

    it.each([
        ['no JSON', 'nope', /not valid JSON/],
        ['an unknown field', JSON.stringify({ ...LOCK, extra: 1 }), /extra/],
        ['a hash in another form', JSON.stringify({ schemaVersion: 1, packs: { a: { ...LOCK.packs['a-pack'], hash: 'md5:1' } } }), /hash/],
        ['a pack name that could leave a folder', JSON.stringify({ schemaVersion: 1, packs: { '../evil': LOCK.packs['a-pack'] } }), /evil|lowercase/]
    ])('trusts nothing of a file with %s, and says why', (_name, text, problem) => {
        // arrange
        writeFileSync(join(root, 'wortlaut.lock.json'), text);

        // act
        const state = RuleLockFile.read(root);

        // assert
        expect(state.problem).toMatch(problem);
        expect(state.lock.packs).toEqual({});
    });

    it('finds the nearest lock file, up to the root of the repository', () => {
        // arrange
        const project = join(root, 'repo', 'apps', 'a');

        mkdirSync(join(root, 'repo', '.git'), { recursive: true });
        mkdirSync(project, { recursive: true });

        // act & assert
        expect(RuleLockFile.findDirectory(project)).toBeNull();
        expect(RuleLockFile.repositoryOf(project)).toBe(join(root, 'repo'));

        writeFileSync(join(root, 'repo', 'wortlaut.lock.json'), JSON.stringify(LOCK));
        expect(RuleLockFile.findDirectory(project)).toBe(join(root, 'repo'));

        writeFileSync(join(project, 'wortlaut.lock.json'), JSON.stringify(LOCK));
        expect(RuleLockFile.findDirectory(project)).toBe(project);
    });

    it('does not look beyond the repository', () => {
        // arrange
        writeFileSync(join(root, 'wortlaut.lock.json'), JSON.stringify(LOCK));
        mkdirSync(join(root, 'repo', '.git'), { recursive: true });

        // act & assert
        expect(RuleLockFile.findDirectory(join(root, 'repo'))).toBeNull();
    });

    it('prints in one spelling, so a change is a small diff', () => {
        // act
        const text = RuleLockFile.print(LOCK as never);

        // assert
        expect(text.endsWith('}\n')).toBe(true);
        expect(text.indexOf('a-rule')).toBeLessThan(text.indexOf('b-rule'));
    });
});

// #region Imports

import { describe, expect, it } from 'vitest';
import { RuleLockSchema, RulePackManifestSchema } from './RulePack';

// #endregion

const RULE = { id: 'a-rule', description: 'A rule.', message: 'Found.', limit: { maxLength: 9 } };
const MANIFEST = { schemaVersion: 1, id: 'a-pack', name: 'A pack', description: 'A pack.', version: '1.0.0', rules: [RULE] };

describe('RulePackManifestSchema', () => {
    it('accepts a pack of data', () => {
        expect(RulePackManifestSchema.safeParse(MANIFEST).success).toBe(true);
        expect(RulePackManifestSchema.safeParse({ ...MANIFEST, rules: [{ ...RULE, limit: undefined, check: { name: 'length-ratio', maxRatio: 1.5 } }] }).success).toBe(true);
    });

    it.each([
        ['a field nobody knows', { ...MANIFEST, hook: 'x' }],
        ['a field a rule does not have', { ...MANIFEST, rules: [{ ...RULE, run: 'x' }] }],
        ['a check the engine does not have', { ...MANIFEST, rules: [{ ...RULE, limit: undefined, check: { name: 'custom' } }] }],
        ['a check with a field of its own', { ...MANIFEST, rules: [{ ...RULE, limit: undefined, check: { name: 'punctuation', script: 'x' } }] }],
        ['a limit without a bound', { ...MANIFEST, rules: [{ ...RULE, limit: {} }] }],
        ['a ratio that cannot be exceeded', { ...MANIFEST, rules: [{ ...RULE, limit: undefined, check: { name: 'length-ratio', maxRatio: 1 } }] }],
        ['an id with a path in it', { ...MANIFEST, id: 'a/b' }],
        ['a newline in a name', { ...MANIFEST, name: 'A\nB' }],
        ['too many rules', { ...MANIFEST, rules: Array.from({ length: 201 }, (_, index) => ({ ...RULE, id: `r-${index}` })) }]
    ])('refuses %s', (_name, manifest) => {
        expect(RulePackManifestSchema.safeParse(manifest).success).toBe(false);
    });
});

describe('RuleLockSchema', () => {
    const entry = { name: 'A pack', source: 'github:o/r', version: '1.0.0', commit: 'abcdef1', hash: `sha256:${'a'.repeat(64)}`, rules: { 'a-rule': `sha256:${'b'.repeat(64)}` } };

    it('pins by commit and hash, or by hash alone', () => {
        expect(RuleLockSchema.safeParse({ schemaVersion: 1, packs: { 'a-pack': entry } }).success).toBe(true);
        expect(RuleLockSchema.safeParse({ schemaVersion: 1, packs: { 'a-pack': { ...entry, commit: null } } }).success).toBe(true);
    });

    it.each([
        ['a hash in another form', { ...entry, hash: 'abc' }],
        ['a commit in another form', { ...entry, commit: 'main' }],
        ['a field nobody knows', { ...entry, enabled: true }]
    ])('refuses %s', (_name, pin) => {
        expect(RuleLockSchema.safeParse({ schemaVersion: 1, packs: { 'a-pack': pin } }).success).toBe(false);
    });

    it('refuses a pack name that could leave a folder', () => {
        expect(RuleLockSchema.safeParse({ schemaVersion: 1, packs: { '../evil': entry } }).success).toBe(false);
    });
});

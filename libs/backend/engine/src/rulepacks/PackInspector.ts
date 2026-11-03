// #region Imports

import { createHash } from 'node:crypto';
import { RULE_PACK_FILE_NAME, RulePackManifestSchema, type RuleDefinition, type RulePackAccess, type RulePackManifest } from '@pixel-brewery/wortlaut-contracts';
import { BUILT_IN_RULE_SEVERITIES, PatternGuard } from '@pixel-brewery/wortlaut-core';
import type { IPackFile } from './PackArchive.js';
import { PACK_LIMITS } from './PackLimits.js';
import { PackProblem } from './PackProblem.js';
import type { PackSource } from './PackSource.js';

// #endregion

/**
 * The kinds of files a pack may hold next to its definition: data and documents, which nothing runs.
 */
const INERT_FILE = /(?:^|\/)(?:\.gitignore|\.gitattributes|\.npmignore|\.editorconfig|\.nvmrc|\.prettierrc|LICEN[SC]E[^/]*|NOTICE[^/]*|AUTHORS[^/]*|README[^/]*|CHANGELOG[^/]*)$|\.(?:json|md|markdown|txt|yml|yaml|toml|png|jpe?g|gif|svg|webp)$/i;

/**
 * The scripts npm runs by itself. A pack that asks for one expects code to run.
 */
const LIFECYCLE_SCRIPTS = new Set(['preinstall', 'install', 'postinstall', 'preuninstall', 'uninstall', 'postuninstall', 'prepublish', 'preprepare', 'prepare', 'postprepare', 'prepack', 'postpack', 'dependencies']);

/**
 * The fields that would make a definition more than data. The schema refuses every unknown field, and these get a reason of
 * their own.
 */
const CODE_FIELDS = new Set(['code', 'script', 'scripts', 'function', 'exec', 'command', 'module', 'plugin', 'require', 'import', 'handler', 'wasm', 'eval', 'hook', 'hooks']);

/**
 * A pack as a check found it. Nothing of it ran.
 *
 * @public
 */
export interface IInspectedPack {
    manifest: RulePackManifest;

    /**
     * The definition file as it came, which is what the hash covers and what a repository pins.
     */
    text: string;
    hash: string;
    ruleHashes: Record<string, string>;
    access: RulePackAccess;
    source: PackSource;
    commit: string | null;
    version: string | null;
}

/**
 * Checks what a source delivered: it parses and validates the definitions, computes the content hash and derives what the pack
 * may do. It runs nothing of a pack.
 *
 * @internal
 */
export namespace PackInspector {

    /**
     * Inspects the files of a pack.
     *
     * @param files The files.
     * @param provenance Where they come from.
     * @param provenance.source The source.
     * @param provenance.commit The commit, for a GitHub pack.
     * @param provenance.version The version a registry gave, if any.
     * @returns The pack.
     * @throws PackProblem for what is no pack, holds code or has invalid definitions.
     */
    export function inspect(files: ReadonlyArray<IPackFile>, provenance: { source: PackSource; commit: string | null; version: string | null }): IInspectedPack {
        const definition = files.find((file) => file.path === RULE_PACK_FILE_NAME);

        if (!definition) {
            throw new PackProblem('not-a-pack', `This is no rule pack: it has no ${RULE_PACK_FILE_NAME} at its root.`);
        }

        refuseCode(files);

        const manifest = readDefinition(definition.bytes);

        return {
            manifest,
            text: definition.bytes.toString('utf8'),
            hash: hashOf(definition.bytes),
            ruleHashes: Object.fromEntries(manifest.rules.map((rule) => [rule.id, hashOfRule(rule)])),
            access: accessOf(manifest),
            source: provenance.source,
            commit: provenance.commit,
            version: provenance.version ?? manifest.version
        };
    }

    /**
     * Reads and validates a definition file.
     *
     * @param bytes The bytes of the file.
     * @returns The definition.
     * @throws PackProblem for a file that is too large, holds code or is invalid.
     */
    export function readDefinition(bytes: Buffer): RulePackManifest {
        if (bytes.length > PACK_LIMITS.maxManifestBytes) {
            throw new PackProblem('too-large', `${RULE_PACK_FILE_NAME} is larger than ${PACK_LIMITS.maxManifestBytes} bytes.`);
        }

        const text = bytes.toString('utf8');

        if (!Buffer.from(text, 'utf8').equals(bytes)) {
            throw new PackProblem('invalid', `${RULE_PACK_FILE_NAME} is not valid UTF-8.`);
        }

        let raw: unknown;

        try {
            raw = JSON.parse(text);
        } catch (error) {
            throw new PackProblem('invalid', `${RULE_PACK_FILE_NAME} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
        }

        const codeFields = findCodeFields(raw);

        if (codeFields.length > 0) {
            throw new PackProblem('has-code', 'This pack asks to run code, and packs hold definitions only. Wortlaut refuses it.', codeFields);
        }

        const parsed = RulePackManifestSchema.safeParse(raw);

        if (!parsed.success) {
            throw new PackProblem('invalid', 'Some definitions of this pack are invalid.', parsed.error.issues.map((issue) => `${issue.path.join('.') || RULE_PACK_FILE_NAME}: ${issue.message}`));
        }

        const problems = findRuleProblems(parsed.data);

        if (problems.length > 0) {
            throw new PackProblem('invalid', 'Some definitions of this pack are invalid.', problems);
        }

        return parsed.data;
    }

    /**
     * Returns the content hash of a definition file. A folder, a repository and a package with the same file have the same hash.
     *
     * @param bytes The bytes of the file.
     * @returns The hash, with the name of its algorithm.
     */
    export function hashOf(bytes: Buffer): string {
        return `sha256:${createHash('sha256').update(bytes)
            .digest('hex')}`;
    }

    /**
     * Derives what a pack may do from its definitions: rules read keys and values of catalogs, and no definition can reach
     * anything else.
     *
     * @param manifest The definition.
     * @returns The access.
     */
    export function accessOf(manifest: RulePackManifest): RulePackAccess {
        return { declarative: true, readsCatalogs: manifest.rules.length > 0, readsSource: false, network: false, ai: false };
    }

    /**
     * @private
     */
    function hashOfRule(rule: RuleDefinition): string {
        return hashOf(Buffer.from(stableJson(rule), 'utf8'));
    }

    /**
     * @private
     */
    function stableJson(value: unknown): string {
        if (Array.isArray(value)) {
            return `[${value.map((item) => stableJson(item)).join(',')}]`;
        }

        if (value && typeof value === 'object') {
            return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
                .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
                .join(',')}}`;
        }

        return JSON.stringify(value);
    }

    /**
     * Refuses a pack with anything that could be code: a file of a kind that is not plain data, a script line at the start of a
     * file, or a package that asks for lifecycle scripts.
     *
     * @private
     */
    function refuseCode(files: ReadonlyArray<IPackFile>): void {
        const code = files.filter((file) => !INERT_FILE.test(file.path) || file.bytes.subarray(0, 2).toString('latin1') === '#!').map((file) => file.path);

        if (code.length > 0) {
            throw new PackProblem('has-code', 'This pack holds code, and packs hold definitions only. Wortlaut refuses it.', code.slice(0, 20));
        }

        const manifest = files.find((file) => file.path === 'package.json');

        if (manifest) {
            const scripts = readLifecycleScripts(manifest.bytes);

            if (scripts.length > 0) {
                throw new PackProblem('has-code', 'This package asks for lifecycle scripts, and packs hold definitions only. Wortlaut never runs them and refuses it.', scripts);
            }
        }
    }

    /**
     * @private
     */
    function readLifecycleScripts(bytes: Buffer): Array<string> {
        try {
            const { scripts } = JSON.parse(bytes.toString('utf8')) as { scripts?: Record<string, unknown> };

            return Object.keys(scripts ?? {}).filter((name) => LIFECYCLE_SCRIPTS.has(name));
        } catch {
            return [];
        }
    }

    /**
     * @private
     */
    function findCodeFields(raw: unknown): Array<string> {
        const fieldsOf = (value: unknown, path: string): Array<string> => value && typeof value === 'object' && !Array.isArray(value)
            ? Object.keys(value).filter((key) => CODE_FIELDS.has(key.toLowerCase()))
                .map((key) => `${path}${key}`)
            : [];
        const rules = (raw as { rules?: unknown } | null)?.rules;

        return [
            ...fieldsOf(raw, ''),
            ...Array.isArray(rules) ? rules.flatMap((rule, index) => [...fieldsOf(rule, `rules.${index}.`), ...fieldsOf((rule as { check?: unknown } | null)?.check, `rules.${index}.check.`)]) : []
        ];
    }

    /**
     * Checks what the schema cannot: that names are free and that every pattern compiles. Nothing is matched here.
     *
     * @private
     */
    function findRuleProblems(manifest: RulePackManifest): Array<string> {
        const problems = new Array<string>();
        const seen = new Set<string>();

        for (const rule of manifest.rules) {
            if (seen.has(rule.id)) {
                problems.push(`${rule.id}: this id is used twice.`);
            }

            seen.add(rule.id);

            if (Object.hasOwn(BUILT_IN_RULE_SEVERITIES, rule.id)) {
                problems.push(`${rule.id}: a built-in rule has this id.`);
            }

            if (rule.pattern) {
                const problem = PatternGuard.findProblem(rule.pattern.regex, rule.pattern.flags ?? '');

                if (problem) {
                    problems.push(`${rule.id}: the pattern is invalid: ${problem}`);
                }
            }
        }

        return problems;
    }

}

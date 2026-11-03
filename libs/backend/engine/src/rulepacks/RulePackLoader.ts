// #region Imports

import { lstatSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { RULE_PACK_FILE_NAME, type RuleLockEntry, type RulePackManifest } from '@pixel-brewery/wortlaut-contracts';
import { BUILT_IN_RULE_SEVERITIES, DeclarativeRule, PatternGuard, type ResourceAnalyzer } from '@pixel-brewery/wortlaut-core';
import { PathResolver } from '../paths/PathResolver.js';
import { readBounded } from './PackFolder.js';
import { PackInspector } from './PackInspector.js';
import { PackProblem } from './PackProblem.js';
import { RuleLockFile, type ILockFileState } from './RuleLockFile.js';

// #endregion

/**
 * Where a repository keeps the pinned copy of a pack that comes from GitHub, npm or Wortlaut itself.
 *
 * @internal
 */
export const VENDOR_FOLDER = '.wortlaut/rule-packs';

/**
 * A pack of a lock file after its verification.
 *
 * @internal
 */
export interface ILoadedPack {
    id: string;
    entry: RuleLockEntry;

    /**
     * The definition, only when the content matches the lock file.
     */
    manifest: RulePackManifest | null;

    /**
     * Why the pack is refused: its rules do not run. A hash that does not match is refused, never only warned about.
     */
    refusal: string | null;

    /**
     * The hash of what was found, when that differs from the pin.
     */
    foundHash: string | null;

    /**
     * Whether the project lets it run. A refused pack stays refused either way.
     */
    enabled: boolean;
}

/**
 * The packs that apply to a folder.
 *
 * @internal
 */
export interface ILoadedPacks {

    /**
     * The directory of the lock file, or `null` when no lock file applies.
     */
    directory: string | null;

    /**
     * The state of the lock file.
     */
    lock: ILockFileState | null;
    packs: Array<ILoadedPack>;
}

/**
 * Finds the packs of a lock file and verifies each one against its pin, on every load. Loading reads files and compares hashes:
 * no pack can make it do more.
 *
 * @internal
 */
export namespace RulePackLoader {

    /**
     * Loads the packs that apply to a folder.
     *
     * @param start The folder.
     * @param disabled The packs that the project turned off.
     * @returns The packs.
     */
    export function load(start: string, disabled: ReadonlyArray<string> = []): ILoadedPacks {
        const directory = RuleLockFile.findDirectory(start);

        if (!directory) {
            return { directory: null, lock: null, packs: [] };
        }

        return loadDirectory(directory, disabled);
    }

    /**
     * Loads the packs of the lock file of a directory.
     *
     * @param directory The directory.
     * @param disabled The packs that the project turned off.
     * @returns The packs.
     */
    export function loadDirectory(directory: string, disabled: ReadonlyArray<string> = []): ILoadedPacks {
        const lock = RuleLockFile.read(directory);
        const taken = new Set(Object.keys(BUILT_IN_RULE_SEVERITIES));
        const packs = Object.entries(lock.lock.packs).map(([id, entry]) => verify(directory, id, entry, !disabled.includes(id), taken));

        return { directory, lock, packs };
    }

    /**
     * Registers the rules of the packs that passed and are enabled, as rules like any other.
     *
     * @param analyzer The analyzer.
     * @param packs The packs.
     * @param guard Bounds the patterns of this analysis.
     * @returns The ids of the rules.
     */
    export function registerRules(analyzer: ResourceAnalyzer, packs: ReadonlyArray<ILoadedPack>, guard: PatternGuard): Array<string> {
        const rules = new Array<string>();

        for (const pack of packs) {
            if (pack.manifest && pack.enabled) {
                for (const rule of pack.manifest.rules) {
                    analyzer.registerRule(rule.id, new DeclarativeRule(rule, { pack: pack.manifest.name, guard }));
                    rules.push(rule.id);
                }
            }
        }

        return rules;
    }

    /**
     * Returns where the definition of a pack lies. The name of a pack is a checked slug, and the folder of a folder pack has to
     * stay inside the repository, so a lock file cannot point anywhere else.
     *
     * @param directory The directory of the lock file.
     * @param id The pack.
     * @param source The source of the pin.
     * @returns The absolute path of the definition file.
     * @throws PackProblem for a folder outside of the repository.
     */
    export function definitionPathOf(directory: string, id: string, source: string): string {
        if (!source.startsWith('folder:')) {
            return join(directory, ...VENDOR_FOLDER.split('/'), id, RULE_PACK_FILE_NAME);
        }

        const repository = RuleLockFile.repositoryOf(directory);
        const folder = resolve(directory, source.slice('folder:'.length));

        if (!PathResolver.isInside(repository, folder)) {
            throw new PackProblem('unsafe', `The lock file points at a folder outside of the repository: ${source.slice('folder:'.length)}`);
        }

        return join(folder, RULE_PACK_FILE_NAME);
    }

    /**
     * @private
     */
    function verify(directory: string, id: string, entry: RuleLockEntry, enabled: boolean, taken: Set<string>): ILoadedPack {
        const refuse = (refusal: string, foundHash: string | null = null): ILoadedPack => ({ id, entry, manifest: null, refusal, foundHash, enabled: false });

        try {
            const path = definitionPathOf(directory, id, entry.source);

            refuseLinks(directory, path);

            const bytes = readBounded(path, RULE_PACK_FILE_NAME);
            const foundHash = PackInspector.hashOf(bytes);

            if (foundHash !== entry.hash) {
                return refuse(`Its content hash is ${shortHash(foundHash)}, but the lock file pins ${shortHash(entry.hash)}. Wortlaut refuses a pack that does not match its pin, so its rules do not run.`, foundHash);
            }

            const manifest = PackInspector.readDefinition(bytes);

            if (manifest.id !== id) {
                return refuse(`Its definition names the pack '${manifest.id}', but the lock file pins it as '${id}'.`);
            }

            const collision = manifest.rules.find((rule) => taken.has(rule.id));

            if (collision) {
                return refuse(`Its rule '${collision.id}' has the same id as another rule, so its rules do not run.`);
            }

            manifest.rules.forEach((rule) => taken.add(rule.id));

            return { id, entry, manifest, refusal: null, foundHash: null, enabled };
        } catch (error) {
            if (error instanceof PackProblem) {
                return refuse(`${error.message} Its rules do not run.`);
            }

            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return refuse('The pinned copy of this pack is missing, so its rules do not run.');
            }

            return refuse(`This pack cannot be read: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Refuses a definition that is a link or lies behind one, so a pin cannot be pointed at a file elsewhere.
     *
     * @private
     */
    function refuseLinks(directory: string, path: string): void {
        if (lstatSync(path).isSymbolicLink()) {
            throw new PackProblem('unsafe', `${RULE_PACK_FILE_NAME} is a link, which Wortlaut refuses.`);
        }

        const repository = realpathSync(RuleLockFile.repositoryOf(directory));

        if (!PathResolver.isInside(repository, realpathSync(path))) {
            throw new PackProblem('unsafe', `${relative(directory, path).split(sep)
                .join('/')} leads outside of the repository, which Wortlaut refuses.`);
        }
    }

    /**
     * @private
     */
    function shortHash(hash: string): string {
        return `${hash.slice(0, 'sha256:'.length + 8)}…${hash.slice(-4)}`;
    }

}

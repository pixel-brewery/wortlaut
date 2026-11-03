// #region Imports

import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { isWortlautExecutor } from '../configuration/ConfigurationResolver.js';
import { walkRepository } from './RepositoryWalker.js';

// #endregion

/**
 * The configuration files that make a folder a project, the same ones the resolution reads.
 */
const CONFIG_FILE_NAMES = new Set(['wortlaut.config.json', 'localizator.config.json']);

/**
 * A project found in a repository with its own configuration.
 *
 * @internal
 */
export interface IDiscoveredProject {
    name: string;
    folder: string;
    kind: 'nx-target' | 'configuration';
    nxTarget: string | null;
}

/**
 * Finds the projects of a repository that bring their configuration along: Nx projects whose target runs Wortlaut's
 * executor under any name, and folders with a configuration file. Everything else goes through Project setup.
 *
 * @internal
 * @param repository The absolute path of the repository.
 * @returns The projects, sorted by folder. An Nx target wins over a configuration file in the same folder.
 */
export function discoverProjects(repository: string): Array<IDiscoveredProject> {
    const projects = new Map<string, IDiscoveredProject>();
    const { files } = walkRepository(repository);

    for (const file of files) {
        if (CONFIG_FILE_NAMES.has(basename(file)) && !projects.has(dirname(file))) {
            projects.set(dirname(file), { name: basename(dirname(file)), folder: dirname(file), kind: 'configuration', nxTarget: null });
        }
    }

    for (const file of files) {
        if (basename(file) === 'project.json') {
            const project = readNxProject(file);

            if (project) {
                projects.set(dirname(file), { name: project.name ?? basename(dirname(file)), folder: dirname(file), kind: 'nx-target', nxTarget: project.target });
            }
        }
    }

    return Array.from(projects.values()).sort((a, b) => a.folder.localeCompare(b.folder));
}

/**
 * @private
 */
function readNxProject(file: string): { name: string | undefined; target: string } | null {
    try {
        const project = JSON.parse(readFileSync(file, 'utf8')) as { name?: string; targets?: Record<string, { executor?: string }> };
        const target = Object.entries(project.targets ?? {}).find(([, value]) => isWortlautExecutor(value.executor));

        return target ? { name: project.name, target: target[0] } : null;
    } catch {
        // A file that cannot be read is no project this discovery can name. Opening it directly reports the failure.
        return null;
    }
}

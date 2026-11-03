// #region Imports

import { resolve } from 'node:path';
import { mcpClientName, type McpActivity, type RunDetail, type RunRecord, type RunSummary } from '@pixel-brewery/wortlaut-contracts';
import { DisplayPath } from '../paths/DisplayPath.js';
import { PathResolver } from '../paths/PathResolver.js';
import { CommandPrinter } from '../printing/CommandPrinter.js';

// #endregion

/**
 * What a list of runs shows and what the details of a run show. Paths appear only as display values, and the options come
 * from the record, which holds no secrets.
 *
 * @internal
 */
export namespace RunProjection {

    /**
     * The commands that can start again from their stored options.
     */
    const REPEATABLE = new Set<string>(['detect', 'analyze', 'transform', 'sort']);

    /**
     * Returns whether a run belongs to a project: it ran in the project's folder, or its paths point there.
     *
     * @param run The run.
     * @param folder The absolute path of the project.
     * @returns `true` when the run belongs to the project.
     */
    export function belongsTo(run: RunRecord, folder: string): boolean {
        if (PathResolver.isInside(folder, run.cwd)) {
            return true;
        }

        const { root, resourceRoot } = run.options;
        const paths = [root, ...Array.isArray(resourceRoot) ? resourceRoot : [resourceRoot]];

        return paths.some((path) => typeof path === 'string' && path.length > 0 && PathResolver.isInside(folder, resolve(run.cwd, path)));
    }

    /**
     * Returns the rules that failed in an analysis.
     *
     * @param run The run.
     * @returns The distinct rule ids.
     */
    export function failedRules(run: RunRecord): Array<string> {
        return run.command === 'analyze' ? Array.from(new Set(run.findings.map((finding) => finding.rule))) : [];
    }

    /**
     * Projects a run for a list.
     *
     * @param run The run.
     * @returns The summary.
     */
    export function summarize(run: RunRecord): RunSummary {
        return {
            id: run.id,
            title: titleOf(run),
            command: run.command,
            state: run.state,
            surface: run.surface,
            client: run.assistant ? mcpClientName(run.assistant.client) : null,
            dryRun: run.dryRun,
            forReview: run.writeMode === 'review',
            canRepeat: REPEATABLE.has(run.command),
            startedAt: run.startedAt,
            detail: detailOf(run),
            failedRules: failedRules(run).length
        };
    }

    /**
     * Projects what an assistant did for Recent activity.
     *
     * @param run The run.
     * @returns What it did, or `null` for a run no assistant started.
     */
    export function activity(run: RunRecord): McpActivity | null {
        return run.assistant
            ? { runId: run.id, tool: run.assistant.tool, client: mcpClientName(run.assistant.client), result: run.assistant.result, state: run.state, startedAt: run.startedAt }
            : null;
    }

    /**
     * Projects a run for its details.
     *
     * @param run The run.
     * @param home The home directory, for display paths.
     * @returns The details.
     */
    export function detail(run: RunRecord, home: string): RunDetail {
        const configuration = {
            cwd: DisplayPath.of(run.cwd, home),
            writeMode: run.writeMode,
            options: run.options
        };

        const equivalentCommand = CommandPrinter.printRun(run);

        return {
            ...summarize(run),
            durationMs: run.durationMs,
            equivalentCommand,
            equivalentCommandShown: CommandPrinter.shorten(equivalentCommand),
            log: DisplayPath.scrub(run.log.map((entry) => entry.message).join('\n'), home),
            droppedLogEntries: run.droppedLogEntries,
            changes: (run.changeSet?.files ?? []).map((file) => ({ file: file.displayPath, action: file.action, state: run.changeSet?.state ?? 'proposed' })),
            configuration: DisplayPath.scrub(JSON.stringify(configuration, null, 2), home),
            failure: run.failure ? DisplayPath.scrub(run.failure.message, home) : null
        };
    }

    /**
     * @private
     */
    function titleOf(run: RunRecord): string {
        if (run.assistant) {
            return run.assistant.tool;
        }

        if (run.command === 'catalog.edit') {
            return `catalog ${String((run.options.edit as { kind?: string } | undefined)?.kind ?? 'edit').replace('-', ' ')}`;
        }

        if (run.command === 'generate' && Array.isArray(run.options.locales) && run.options.locales.length > 0) {
            return `generate ${run.options.locales.join(', ')}`;
        }

        return run.command.replace('.', ' ');
    }

    /**
     * @private
     */
    function detailOf(run: RunRecord): string {
        if (run.assistant) {
            return run.assistant.result;
        }

        const { options } = run;
        const files = run.changeSet ? [run.changeSet.files.length === 1 ? '1 file' : `${run.changeSet.files.length} files`] : [];
        const parts = {
            analyze: () => [Array.isArray(options.rules) && options.rules.length > 0 ? `${options.rules.length} rules` : 'All rules', `${failedRules(run).length} failed`],
            detect: () => [options.preset, options.resourceKeyPrefix],
            'detect.apply': () => [options.count === 1 ? '1 string' : `${String(options.count ?? 0)} strings`],
            'translations.propose': () => [options.locale],
            'mcp.read': () => [options.tool],
            'catalog.edit': () => [(options.edit as { key?: string; keep?: string; locale?: string } | undefined)?.key ?? (options.edit as { keep?: string } | undefined)?.keep ?? (options.edit as { locale?: string } | undefined)?.locale],
            generate: () => [options.strategy, options.model],
            transform: () => [Array.isArray(options.types) ? options.types.join(', ') : ''],
            sort: () => [options.order === 'desc' ? 'Descending' : 'Ascending'],
            info: () => ['Environment'],
            'ai.status': () => ['AI providers'],
            init: () => ['Configuration file'],
            'config.set': () => [options.key ?? (Array.isArray(options.edits) ? options.edits.length === 1 ? (options.edits[0] as { key: string }).key : `${options.edits.length} settings` : '')],
            'changes.apply': () => [options.id],
            'changes.discard': () => [options.id],
            'changes.recover': () => [options.outcome],
            'rules.install': () => [options.source],
            'rules.update': () => [options.pack],
            'rules.settings': () => [options.rule ?? options.pack, options.severity ?? options.action]
        }[run.command]();

        return [...parts, ...files].filter((part) => typeof part === 'string' && part.length > 0).join(' · ');
    }

}

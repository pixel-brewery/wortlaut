// #region Imports

import { magenta, StringExtensions, t } from '@pixel-brewery/utilities';
import { readEnvironmentKey, ResourceGenerator, type IResourceGeneratorResult, type IResourceGeneratorStrategy } from '@pixel-brewery/wortlaut-ai';
import { ResourceReader, ResourceTransformer } from '@pixel-brewery/wortlaut-core';
import { EngineError } from '../errors/EngineError.js';
import { createCommentReader } from '../generate/CatalogCommentReader.js';
import { createRawOutputFile } from '../generate/RawOutputFile.js';
import type { IGenerateOptions } from '../interfaces/ICommandOptions.js';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * Translates a catalog with AI. The generator returns proposals, so nothing reaches the target before the run has ended.
 * A failed or stopped run hands over what it finished as a failure with proposals: the runner keeps those in the review
 * list and writes nothing.
 *
 * @internal
 */
export class GenerateUseCase implements IUseCase<IGenerateOptions, Array<IResourceGeneratorResult>> {

    // #region Fields

    public readonly command = 'generate';

    private readonly _env: NodeJS.ProcessEnv;
    private readonly _strategies: ReadonlyMap<string, IResourceGeneratorStrategy>;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `GenerateUseCase` class.
     *
     * @param env The environment, which may hold the provider's key.
     * @param strategies Additional strategies by name.
     */
    public constructor(env: NodeJS.ProcessEnv, strategies: ReadonlyMap<string, IResourceGeneratorStrategy>) {
        this._env = env;
        this._strategies = strategies;
    }

    // #endregion

    // #region Methods

    /**
     * @override
     */
    public detail(options: IGenerateOptions): string {
        return `${options.strategy}: ${options.baseLocale} to ${options.locales.join(', ')}`;
    }

    /**
     * @override
     */
    public async execute(options: IGenerateOptions, context: IUseCaseContext): Promise<IUseCaseOutput<Array<IResourceGeneratorResult>>> {
        const { logger, fileSystem } = context;
        const apiKey = options.apiKey || readEnvironmentKey(options.strategy, this._env);

        context.scrubber.add(apiKey);
        logger.log(t`Running generator on resources...${StringExtensions.newLine}`);

        const reader = new ResourceReader(logger, fileSystem);
        const resources = reader.scanDirectory(options.resourceRoot, options.type);
        const baseResource = resources.find((resource) => resource.locale === options.baseLocale);

        if (!baseResource) {
            throw new Error(t`Base locale not found: ${options.baseLocale}`);
        }

        const generator = new ResourceGenerator(logger, fileSystem, new ResourceTransformer(logger), reader, {
            chunkSize: options.chunkSize,
            limit: options.limit,
            scope: options.scope,
            namespace: options.namespace,
            keys: options.keys,
            localeInstructions: options.localeInstructions,
            commentOf: createCommentReader(context.cwd, baseResource),
            onRaw: options.keepRawOutput ? createRawOutputFile(context.runId, (line) => logger.log(line)) : undefined,
            identicalKeys: options.identicalKeys,
            identicalValues: options.identicalValues,
            dumpModels: options.dumpModels,
            signal: context.signal,
            onProgress: (progress) => context.progress('generate', progress.completedChunks, progress.totalChunks, progress.locale),
            config: {
                apiKey,
                model: options.model,
                temperature: options.temperature,
                instructions: options.instructions
            }
        });

        for (const [name, strategy] of this._strategies) {
            generator.registerStrategy(name, strategy);
        }

        // Taken before the first request: a target that changes during a long run must fail the apply.
        for (const locale of options.locales) {
            context.changes.snapshot(generator.getTargetFilePath(baseResource, locale));
        }

        logger.log(t`${magenta('Asking AI...')}`);

        const run = await generator.run(baseResource, options.locales, options.strategy, options.onlyNew);

        for (const result of run.results) {
            context.changes.propose(result.resource.path, result.resource.toString());

            for (const warning of result.warnings) {
                context.changes.addFinding({ rule: 'generate', severity: 'warning', message: warning, file: result.resource.path, locale: result.locale });
            }

            for (const key of result.heldBack ?? []) {
                context.changes.addFinding({ rule: 'generate', severity: 'error', message: `The translation of ${key} stayed wrong, so it was left out.`, file: result.resource.path, locale: result.locale });
            }
        }

        return {
            result: run.results,
            data: {
                status: run.status,
                locales: run.results.map((result) => ({
                    locale: result.locale,
                    file: result.resource.path,
                    status: result.status,
                    translatedKeys: result.translatedKeys
                }))
            },
            failure: this.toFailure(run.status, run.error)
        };
    }

    /**
     * @private
     */
    private toFailure(status: string, error: Error | null): EngineError | null {
        switch (status) {
            case 'failed':
                return new EngineError('generation-failed', error?.message ?? 'The translation failed.');
            case 'stopped':
                return new EngineError('run-stopped', 'The run was stopped.');
            default:
                return null;
        }
    }

    // #endregion

}

// #region Imports

import { ArrayExtensions, bold, dim, FileSystemInfo, gray, Path, t, TemporaryFile, yellow, type IFileSystem, type ILogger } from '@pixel-brewery/utilities';
import { createKeyPattern, type IResourceInfo, type IResourceModel, type ResourceMode, type ResourceReader, type ResourceTransformer } from '@pixel-brewery/wortlaut-core';
import type { IResourceGeneratorOptions, ResourceGeneratorKeyScope } from './interfaces/IResourceGeneratorOptions.js';
import type { IResourceGeneratorResult, IResourceGeneratorRun, ResourceGeneratorStatus } from './interfaces/IResourceGeneratorResult.js';
import { ChatGptResourceGeneratorStrategy } from './strategies/ChatGptResourceGeneratorStrategy.js';
import { GeminiResourceGeneratorStrategy } from './strategies/GeminiResourceGeneratorStrategy.js';
import type { IResourceGeneratorStrategy } from './strategies/interfaces/IResourceGeneratorStrategy.js';
import { runTranslation } from './TranslationRunner.js';

// #endregion

/**
 * What translating one locale produced.
 */
interface IProcessedLocale {
    models: Array<IResourceModel>;
    translatedKeys: number;
    status: ResourceGeneratorStatus;
    error: Error | null;
    warnings: Array<string>;
    heldBack: Array<string>;
}

/**
 * What translating one locale of a catalog would take.
 *
 * @public
 */
export interface ITranslationPlan {
    locale: string;

    /**
     * The path of the target file.
     */
    targetPath: string;

    /**
     * The rows to translate, with the comments the prompt gets to see.
     */
    models: Array<IResourceModel>;

    /**
     * What the target holds already.
     */
    existing: Array<IResourceModel>;
    chunks: Array<Array<IResourceModel>>;
}

/**
 * Class responsible for generating translated resources using AI. It produces proposals and never writes the target
 * file: whoever runs it decides, through a change set, whether a proposal is written.
 *
 * @public
 */
export class ResourceGenerator {

    // #region Fields

    private readonly _logger: ILogger;
    private readonly _fileSystem: IFileSystem;
    private readonly _transformer: ResourceTransformer;
    private readonly _reader: ResourceReader;
    private readonly _options: IResourceGeneratorOptions;
    private readonly _strategies: Map<string, IResourceGeneratorStrategy>;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `ResourceGenerator` class.
     *
     * @param logger The logger service.
     * @param fileSystem The service to handle file operations.
     * @param transformer The service to handle resource transformations.
     * @param reader The service to read resources.
     * @param options The configuration options for the generator.
     */
    public constructor(logger: ILogger, fileSystem: IFileSystem, transformer: ResourceTransformer, reader: ResourceReader, options: IResourceGeneratorOptions) {
        this._logger = logger;
        this._options = options;
        this._fileSystem = fileSystem;
        this._transformer = transformer;
        this._reader = reader;
        const chatGptResourceGeneratorStrategy = new ChatGptResourceGeneratorStrategy(fileSystem, options.config);
        const geminiResourceGeneratorStrategy = new GeminiResourceGeneratorStrategy(fileSystem, options.config);

        this._strategies = new Map<string, IResourceGeneratorStrategy>()
            .set('openai', chatGptResourceGeneratorStrategy)
            .set('google', geminiResourceGeneratorStrategy)
            .set('chatgpt', chatGptResourceGeneratorStrategy)
            .set('gemini', geminiResourceGeneratorStrategy);
    }

    // #endregion

    // #region Methods

    /**
     * Registers a strategy under a name, next to the built-in ones.
     *
     * @public
     * @param name The name of the strategy.
     * @param strategy The strategy.
     */
    public registerStrategy(name: string, strategy: IResourceGeneratorStrategy): void {
        this._strategies.set(name, strategy);
    }

    /**
     * Translates a resource into the specified locales and returns the proposals. A provider failure or a stop ends the
     * run without throwing: the result holds everything that was finished by then, and nothing is written.
     *
     * @public
     * @param resource The resource to generate.
     * @param locales The locales to generate the resource for.
     * @param strategy The strategy to use for generation.
     * @param onlyNew The optional flag to indicate if only new resources should be generated.
     * @returns The proposals and how the run ended.
     * @throws Error if the strategy is not supported.
     */
    public async run(resource: IResourceInfo, locales: Array<string>, strategy: string, onlyNew?: boolean): Promise<IResourceGeneratorRun> {
        const generatorStrategy = this.getStrategy(strategy);
        const scope: ResourceGeneratorKeyScope = onlyNew ? 'new' : this._options.scope ?? 'all';
        const results = new Array<IResourceGeneratorResult>();

        if (locales.length === 0) {
            this._logger.warn(t` ${gray('No locales specified, skipping...')}`);
        }

        for (const locale of locales) {
            this._logger.log(`  Generating resource for locales ${bold(locales.join(', '))}`);
            this._logger.log(`  Using strategy ${bold(strategy)}`);

            // eslint-disable-next-line no-await-in-loop
            const processed = await this.processResource(generatorStrategy, resource, locale, scope, Boolean(onlyNew));

            try {
                if (processed.status === 'completed' || processed.translatedKeys > 0) {
                    results.push({
                        resource: this.serializeProposal(processed.models, resource, locale),
                        locale,
                        status: processed.status,
                        translatedKeys: processed.translatedKeys,
                        warnings: processed.warnings,
                        heldBack: processed.heldBack
                    });
                }
            } catch (error: unknown) {
                return { status: 'failed', results, error: error instanceof Error ? error : new Error(String(error)) };
            }

            if (processed.status !== 'completed') {
                return { status: processed.status, results, error: processed.error };
            }
        }

        return { status: 'completed', results, error: null };
    }

    /**
     * Gets the path of the target file for the specified resource and locale.
     *
     * @public
     * @param resource The base resource.
     * @param locale The target locale.
     * @returns The path of the target file.
     */
    public getTargetFilePath(resource: IResourceInfo, locale: string): string {
        // A locale names the file, so it must not lead anywhere else, whichever surface it came through.
        if ((/[\\/]|\.\./).test(locale)) {
            throw new Error(`The locale '${locale}' holds a path.`);
        }

        const info = new FileSystemInfo(resource.path);
        // double getFileNameWithoutExtension is not a typo, we need to remove the locale from the name
        const targetName = `${this._fileSystem.pathGetFileNameWithoutExtension(this._fileSystem.pathGetFileNameWithoutExtension(resource.name))}.${locale}.${resource.type}`;
        const targetPath = Path.combine(info.directoryPath, targetName);

        return targetPath;
    }

    /**
     * Works out what translating a locale takes, without asking anyone.
     *
     * @public
     * @param resource The base resource.
     * @param locale The target locale.
     * @param scope Which keys to translate.
     * @param limitFirst Applies the limit before the selection, as `onlyNew` of `run` always did.
     * @returns The plan.
     */
    public plan(resource: IResourceInfo, locale: string, scope: ResourceGeneratorKeyScope, limitFirst = false): ITranslationPlan {
        const limit = this._options.limit;
        const limited = (models: Array<IResourceModel>): Array<IResourceModel> => limit && models.length > limit ? ArrayExtensions.limit(models, limit) : models;
        const all = this._transformer.transform(resource);
        const targetPath = this.getTargetFilePath(resource, locale);
        const existing = this.loadExistingModels(targetPath, resource);
        const selected = this.selectModels(limitFirst ? limited(all) : all, existing, scope);
        const models = (limitFirst ? selected : limited(selected)).map((model) => this.withComment(model));

        return { locale, targetPath, models, existing, chunks: ArrayExtensions.chunk(models, this._options.chunkSize) };
    }

    /**
     * Translates a resource into one locale, chunk by chunk.
     *
     * @private
     * @param strategy The strategy to use for processing.
     * @param resource The resource to process.
     * @param locale The locale to process the resource for.
     * @param scope Which keys to translate.
     * @returns The models of the target and how the translation ended.
     */
    private async processResource(strategy: IResourceGeneratorStrategy, resource: IResourceInfo, locale: string, scope: ResourceGeneratorKeyScope, limitFirst: boolean): Promise<IProcessedLocale> {
        const { models, existing: existingModels, chunks: allChunks } = this.plan(resource, locale, scope, limitFirst);
        const keepsExisting = scope !== 'all' || Boolean(this._options.namespace) || Boolean(this._options.keys);

        this._logger.log(`  Translating from ${bold(resource.locale)} to ${bold(locale)}`);

        if (this._options.limit && models.length === this._options.limit) {
            this._logger.log(yellow(`  ${bold(models.length.toString())} (limited) keys will be processed.`));
        }

        if (keepsExisting) {
            this._logger.log(`  ${bold(models.length.toString())} new keys remain to be translated.`);
        }

        const signal = this._options.signal;
        const reportProgress = (completedChunks: number): void => this._options.onProgress?.({ locale, completedChunks, totalChunks: allChunks.length });
        const warnings = new Array<string>();

        this._logger.log(`  Splitting ${bold(models.length.toString())} keys into ${bold(allChunks.length.toString())} chunks`);
        reportProgress(0);

        const outcome = await runTranslation({
            strategy,
            resource,
            locale,
            chunks: allChunks,
            instructions: this.instructionsFor(locale),
            signal,
            retryBudget: this._options.retryBudget,
            retryDelayMs: this._options.retryDelayMs,
            onRaw: this._options.onRaw,
            onChunkEnd: (index, report) => {
                for (const issue of report.issues) {
                    this._logger.warn(`  ${yellow('Warning:')} ${issue.message}`);
                    warnings.push(`A chunk for '${locale}': ${issue.message}`);
                }

                if (report.status === 'done') {
                    reportProgress(index + 1);
                }
            }
        });
        const clean = outcome.rows.filter((row) => !row.problem).map(({ key, value, comment }): IResourceModel => ({ key, value, comment }));
        const heldBack = outcome.rows.filter((row) => row.problem).map((row) => row.key);

        if (outcome.status !== 'completed') {
            this._logger.warn(`  ${yellow(outcome.status === 'failed' ? 'Chunk failed' : 'Stopped')} (${bold(outcome.finishedChunks.toString())}/${bold(allChunks.length.toString())} chunks completed)`);

            return {
                models: this.mergeModels(existingModels, clean),
                translatedKeys: clean.length,
                status: outcome.status,
                error: outcome.error,
                warnings,
                heldBack
            };
        }

        const targetModels = keepsExisting ? this.mergeModels(existingModels, clean) : clean;

        this._logger.log(`  ${bold(targetModels.length.toString())} keys processed.`);

        if (this._options.dumpModels) {
            this.dumpResult(targetModels);
        }

        return { models: targetModels, translatedKeys: clean.length, status: 'completed', error: null, warnings, heldBack };
    }

    /**
     * Returns the instructions of a locale: those for all locales, then its own.
     *
     * @private
     */
    private instructionsFor(locale: string): Array<string> {
        const general = this._options.config.instructions;

        return [...Array.isArray(general) ? general : [general], this._options.localeInstructions?.[locale] ?? ''];
    }

    /**
     * @private
     */
    private withComment(model: IResourceModel): IResourceModel {
        const comment = this._options.commentOf?.(model.key);

        return comment ? { ...model, comment } : model;
    }

    /**
     * Selects the models to translate by namespace and key scope.
     *
     * @private
     */
    private selectModels(models: Array<IResourceModel>, existingModels: Array<IResourceModel>, scope: ResourceGeneratorKeyScope): Array<IResourceModel> {
        const existing = new Map(existingModels.map((model) => [model.key, model.value]));
        const namespace = this._options.namespace ?? '';
        const keys = this._options.keys ? new Set(this._options.keys) : null;
        const identicalKeys = (this._options.identicalKeys ?? []).map((pattern) => createKeyPattern(pattern));
        const identicalValues = new Set(this._options.identicalValues ?? []);

        return models
            .filter((model) => !namespace || model.key === namespace || model.key.startsWith(`${namespace}.`))
            .filter((model) => !keys || keys.has(model.key))
            .filter((model) => {
                switch (scope) {
                    case 'new':
                        return !existing.has(model.key);
                    case 'missing':
                        return !existing.has(model.key) || (existing.get(model.key) === model.value &&
                            !identicalValues.has(model.value) &&
                            !identicalKeys.some((pattern) => pattern.test(model.key)));
                    default:
                        return true;
                }
            });
    }

    /**
     * Overlays the translated models on the models of the target. New translations overwrite existing entries by key;
     * keys that were not translated keep their previous value.
     *
     * @private
     */
    private mergeModels(existingModels: Array<IResourceModel>, translated: Array<IResourceModel>): Array<IResourceModel> {
        const merged = new Map<string, IResourceModel>();

        for (const model of [...existingModels, ...translated]) {
            merged.set(model.key, model);
        }

        return Array.from(merged.values());
    }

    /**
     * Serializes the models of a locale into the proposal for its target file.
     *
     * @private
     */
    private serializeProposal(models: Array<IResourceModel>, resource: IResourceInfo, locale: string): IResourceInfo {
        const targetFilePath = this.getTargetFilePath(resource, locale);

        return this._transformer.serialize(models, {
            name: this._fileSystem.pathGetFileName(targetFilePath),
            path: targetFilePath,
            locale: locale,
            target: resource.type
        });
    }

    /**
     * Gets the strategy for the specified strategy name.
     *
     * @private
     * @param strategy The strategy name.
     * @returns The strategy.
     */
    private getStrategy(strategy: string): IResourceGeneratorStrategy {
        const generatorStrategy = this._strategies.get(strategy);

        if (generatorStrategy === undefined) {
            throw new Error(t`The specified strategy '${strategy}' is not supported.`);
        }

        return generatorStrategy;
    }

    /**
     * Creates a local dump of the ai resource, when asked to.
     * Is is used for analysis purposes.
     * It could be that the serialization is not correct, so we can check the output.
     */
    private dumpResult(models: Array<IResourceModel>): void {
        const tempFile = new TemporaryFile();
        this._logger.log(`  ${bold('Dumping keys to')} ${dim(tempFile.path)}`);

        this._fileSystem.fileWriteAllJson(tempFile.path, models);
    }

    /**
     * Loads existing translated models from the target file, if it exists.
     *
     * @private
     * @param targetFilePath The path to the target file.
     * @param resource The source resource info (used to determine the file type).
     * @returns The existing models, or an empty array if the file does not exist.
     */
    private loadExistingModels(targetFilePath: string, resource: IResourceInfo): Array<IResourceModel> {
        try {
            if (!this._fileSystem.fileExists(targetFilePath)) {
                return [];
            }

            const targetResource = this._reader.scanFile(targetFilePath, resource.type as ResourceMode);

            if (!targetResource) {
                return [];
            }

            return this._transformer.transform(targetResource);
        } catch (error: unknown) {
            this._logger.warn(`  ${yellow('Could not read the target:')} ${error instanceof Error ? error.message : String(error)}`);

            return [];
        }
    }

    // #endregion

}

// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';
import type { ResourceAnalyzer } from './analyzers/ResourceAnalyzer';
import type {
  IAnalyzerRuleExecutionContext,
  IAnalyzerRuleResult,
} from './analyzers/tasks/interfaces/IAnalyzerRule';
import type { IResourceInfo } from './models/interfaces/IResourceInfo';
import type { ResourceType } from './models/interfaces/ResourceType';
import type { ResourceReader } from './readers/ResourceReader';
import type { ResourceMode } from './ResourceMode';
import type { ResourceSorter } from './sorting/ResourceSorter';
import type { IResourceTransformerResult } from './transformers/interfaces/IResourceTransformerResult';
import type { ResourceTransformer } from './transformers/ResourceTransformer';

// #endregion

/**
 * The `ResourceProcessor` class.
 *
 * @public
 */
export class ResourceProcessor {
  // #region Fields

  private readonly _logger: ILogger;
  private readonly _reader: ResourceReader;
  private readonly _transformer: ResourceTransformer;
  private readonly _analyzer: ResourceAnalyzer;
  private readonly _sorter: ResourceSorter;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `ResourceProcessor` class.
   *
   * @public
   */
  public constructor(
    logger: ILogger,
    reader: ResourceReader,
    transformer: ResourceTransformer,
    analyzer: ResourceAnalyzer,
    sorter: ResourceSorter,
  ) {
    this._logger = logger;
    this._reader = reader;
    this._transformer = transformer;
    this._analyzer = analyzer;
    this._sorter = sorter;
  }

  // #endregion

  // #region Methods

  /**
   * Scans the specified path for resources.
   *
   * @public
   * @param path The path to scan.
   * @param type The type of resources to scan.
   * @returns The resource information.
   */
  public scan(path: string, type: ResourceMode): Array<IResourceInfo> {
    return this._reader.scanDirectory(path, type);
  }

  /**
   * Transforms an input resource dynamically by determining the appropriate adapter and serializer.
   *
   * @public
   * @param resource The input resource to transform.
   * @param meta The metadata for the transformation.
   * @returns The transformed resource information.
   * @throws Error if no adapter or serializer is registered for the specified resource type.
   */
  public transform(
    resource: IResourceInfo,
    meta: Pick<IResourceInfo, 'name' | 'path' | 'locale'> & { target: ResourceType },
  ): IResourceTransformerResult {
    const models = this._transformer.transform(resource);
    const newResource = this._transformer.serialize(models, meta);

    return {
      originalResource: resource,
      transformedResource: newResource,
    };
  }

  /**
   * Executes all registered rules using the provided context.
   *
   * @public
   * @param rules The name of rules to execute. If not specified, all rules are executed
   * @param context The execution context.
   */
  public analyze(
    rules: Array<string>,
    context: IAnalyzerRuleExecutionContext,
  ): Array<IAnalyzerRuleResult> {
    const results: Array<IAnalyzerRuleResult> = [];
    for (const rule of rules) {
      this._logger.info(`Executing rule: ${rule}`);
      const result = this._analyzer.executeRule(rule, context);

      results.push(result);
    }

    return results;
  }

  /**
   * Sorts the specified resources.
   *
   * @public
   * @param resources The resources to sort.
   * @returns The sorted resources.
   */
  public sort(resources: Array<IResourceInfo>): Array<IResourceInfo> {
    return this._sorter.sort(resources);
  }

  // #endregion
}

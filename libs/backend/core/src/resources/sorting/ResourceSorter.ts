// #region Imports

import { bold, gray, type IFileSystem, type ILogger, magenta, t } from '@pixel-brewery/utilities';
import type { IResourceInfo } from '../models/interfaces/IResourceInfo';
import { ResourceType } from '../models/interfaces/ResourceType';

// #endregion

/**
 * Interface for the options required to sort resources.
 */
export interface IResourceSorterOptions {
  /**
   * Whether to perform a dry run.
   */
  dryRun: boolean;

  /**
   * The order to sort resources.
   */
  order: 'asc' | 'desc';
}

/**
 * What sorting a resource would change.
 *
 * @public
 */
export interface IResourceSortPlan {
  /**
   * The resource with its keys in the requested order.
   */
  sortedResource: IResourceInfo;

  /**
   * The number of keys whose position changes. Without any, the file keeps its content.
   */
  keysSorted: number;
}

/**
 * The `ResourceSorter` class is responsible for sorting resources.
 */
export class ResourceSorter {
  // #region Fields

  private readonly _logger: ILogger;
  private readonly _fileSystem: IFileSystem;
  private readonly _options: IResourceSorterOptions;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new ResourceSorter.
   *
   * @public
   * @param logger The logger interface.
   * @param fileSystem The file system interface.
   * @param options The options for sorting resources.
   */
  public constructor(logger: ILogger, fileSystem: IFileSystem, options: IResourceSorterOptions) {
    this._logger = logger;
    this._fileSystem = fileSystem;
    this._options = options;
  }

  // #endregion

  // #region Methods

  /**
   * Sorts resource keys based on the provided options.
   * @param resources The resources to sort.
   * @returns The sorted resources.
   */
  public sort(resources: Array<IResourceInfo>): Array<IResourceInfo> {
    const plans = this.plan(resources);

    for (const plan of plans) {
      if (!this._options.dryRun && plan.keysSorted > 0) {
        this._fileSystem.fileWriteAllText(
          plan.sortedResource.path,
          this.serialize(plan.sortedResource),
        );
        this._logger.info(`  ${plan.sortedResource.name} ${bold(gray('Updated'))}`);
      } else if (this._options.dryRun) {
        this._logger.log(t`${gray('  Dry run enabled, skipping...')}`);
      }
    }

    return plans.map((plan) => plan.sortedResource);
  }

  /**
   * Serializes a sorted catalog for writing or review, keeping its original file ending.
   *
   * @public
   * @param resource The sorted resource.
   * @returns The text to write.
   */
  public serialize(resource: IResourceInfo): string {
    const serialized = resource.toString();

    if (resource.isVirtual || !this._fileSystem.fileExists(resource.path)) {
      return serialized;
    }

    const original = this._fileSystem.fileReadAllText(resource.path);
    const ending = original.slice(original.trimEnd().length);
    const body = serialized.trimEnd();
    // JSON escapes line breaks inside values, so this only changes the document's formatting.
    const formatted =
      resource.type === ResourceType.Json && original.includes('\r\n')
        ? body.replace(/\r?\n/g, '\r\n')
        : body;

    return formatted + ending;
  }

  /**
   * Works out what sorting the resources would change, without writing anything.
   *
   * @public
   * @param resources The resources to sort.
   * @returns One plan per resource.
   */
  public plan(resources: Array<IResourceInfo>): Array<IResourceSortPlan> {
    this._logger.log(t`${magenta('Sorting resources keys...')}`);

    const plans = resources.map((resource) => {
      this._logger.info(`  Sorting ${gray(resource.name)}`);

      const plan = this.sortResource(resource);

      if (plan.keysSorted > 0) {
        this._logger.info(t`    ${bold(resource.name)}: ${plan.keysSorted} key(s) were sorted.`);
      } else {
        this._logger.info(t`    ${bold(resource.name)}: No keys needed sorting.`);
      }

      return plan;
    });

    this._logger.log(t`${magenta('Resource keys sorted.')}`);

    return plans;
  }

  /**
   * Sorts a single resource and collects sorting information.
   *
   * @param resource The resource to sort.
   * @returns The sorted resource and sorting details.
   */
  private sortResource(resource: IResourceInfo): IResourceSortPlan {
    const clonedResource = resource.clone();
    // `entries` keeps the document order, while `keys` is always sorted and would never show a difference.
    const keysBeforeSort = clonedResource.entries().map(([key]) => key);
    const sortedResource = clonedResource.sort(this._options.order);
    const keysAfterSort = sortedResource.entries().map(([key]) => key);

    const sortedKeysCount = keysBeforeSort.filter(
      (key, index) => key !== keysAfterSort[index],
    ).length;

    return {
      sortedResource: sortedResource,
      keysSorted: sortedKeysCount,
    };
  }

  // #endregion
}

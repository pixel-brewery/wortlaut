// #region Imports

import { StringExtensions, t } from '@pixel-brewery/utilities';
import { ResourceReader, ResourceSorter, type IResourceInfo } from '@pixel-brewery/wortlaut-core';
import type { ISortOptions } from '../interfaces/ICommandOptions.js';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * Sorts the keys of the catalogs. A file is proposed only when the position of a key changes, so a catalog that is in
 * order keeps its formatting.
 *
 * @internal
 */
export class SortUseCase implements IUseCase<ISortOptions, Array<IResourceInfo>> {
  public readonly command = 'sort';

  /**
   * @override
   */
  public async execute(
    options: ISortOptions,
    context: IUseCaseContext,
  ): Promise<IUseCaseOutput<Array<IResourceInfo>>> {
    await context.checkpoint('Reading the catalogs', 0, 1, null);

    context.logger.log(t`Running sort on resources...${StringExtensions.newLine}`);

    const resources = new ResourceReader(context.logger, context.fileSystem).scanDirectory(
      options.resourceRoot,
      options.type,
    );
    const sorter = new ResourceSorter(context.logger, context.fileSystem, {
      dryRun: false,
      order: options.order,
    });
    await context.checkpoint('Sorting the keys', 0, resources.length, null);

    const plans = sorter.plan(resources);

    for (const [index, plan] of plans.entries()) {
      await context.checkpoint(
        'Sorting the keys',
        index + 1,
        plans.length,
        plan.sortedResource.name,
      );

      if (plan.keysSorted > 0) {
        context.changes.propose(plan.sortedResource.path, sorter.serialize(plan.sortedResource));
      }
    }

    return {
      result: plans.map((plan) => plan.sortedResource),
      data: {
        files: plans.map((plan) => ({
          file: plan.sortedResource.path,
          locale: plan.sortedResource.locale,
          keysSorted: plan.keysSorted,
        })),
      },
    };
  }
}

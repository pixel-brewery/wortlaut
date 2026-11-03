// #region Imports

import { bold, magenta, StringExtensions, t } from '@pixel-brewery/utilities';
import { ResourceReader, ResourceTransformer, type IResourceTransformerResult } from '@pixel-brewery/wortlaut-core';
import type { ITransformOptions } from '../interfaces/ICommandOptions.js';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * Converts the catalogs into other formats. A target file that already holds the resource is not proposed, also when a
 * formatter reformatted the file.
 *
 * @internal
 */
export class TransformUseCase implements IUseCase<ITransformOptions, Array<IResourceTransformerResult>> {

    public readonly command = 'transform';

    /**
     * @override
     */
    public async execute(options: ITransformOptions, context: IUseCaseContext): Promise<IUseCaseOutput<Array<IResourceTransformerResult>>> {
        const { logger, fileSystem } = context;

        await context.checkpoint('Reading the catalogs', 0, 1, null);

        logger.log(t`Running transform on resources...${StringExtensions.newLine}`);

        const resources = new ResourceReader(logger, fileSystem).scanDirectory(options.resourceRoot, options.type);
        const transformer = new ResourceTransformer(logger);
        const results = new Array<IResourceTransformerResult>();
        const files = new Array<{ file: string; locale: string; target: string; upToDate: boolean }>();
        const total = options.types.length * resources.length;

        logger.log(t`${magenta('Executing transformations...')}`);

        for (const type of options.types) {
            for (const resource of resources) {
                await context.checkpoint('Converting the catalogs', results.length, total, resource.name);

                const models = transformer.transform(resource);

                logger.log(t`  Transforming ${bold(resource.name)} to ${bold(type)}...`);

                const targetResource = transformer.serialize(models, {
                    name: fileSystem.pathChangeExtension(resource.name, type),
                    path: fileSystem.pathChangeExtension(resource.path, type),
                    locale: resource.locale,
                    target: type
                });
                const upToDate = fileSystem.fileExists(targetResource.path) && transformer.isUpToDate(targetResource, fileSystem.fileReadAllText(targetResource.path));

                if (upToDate) {
                    logger.log(t`    ${bold(targetResource.name)} is up to date.`);
                } else {
                    context.changes.propose(targetResource.path, targetResource.toString());
                }

                results.push({ originalResource: resource, transformedResource: targetResource });
                files.push({ file: targetResource.path, locale: resource.locale, target: type, upToDate });
            }
        }

        logger.log(t`${magenta('Transformations completed.')}`);

        return { result: results, data: { files } };
    }

}

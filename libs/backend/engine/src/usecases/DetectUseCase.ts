// #region Imports

import { StringExtensions, t } from '@pixel-brewery/utilities';
import {
  Formatters,
  isTestFile,
  LocalizationProcessor,
  Presets,
  type ILocalizationProcessorResult,
  type ResourceType,
} from '@pixel-brewery/wortlaut-core';
import { extname } from 'node:path';
import { hashText } from '../cache/ResultCache.js';
import type { IDetectOptions } from '../interfaces/ICommandOptions.js';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * Finds the strings of the sources. It only reads.
 *
 * @internal
 */
export class DetectUseCase implements IUseCase<
  IDetectOptions,
  Array<ILocalizationProcessorResult>
> {
  public readonly command = 'detect';

  /**
   * @override
   */
  public execute(
    options: IDetectOptions,
    context: IUseCaseContext,
  ): Promise<IUseCaseOutput<Array<ILocalizationProcessorResult>>> {
    context.logger.log(t`Running detector on resources...${StringExtensions.newLine}`);

    const processor = new LocalizationProcessor(
      Formatters.get(options.type as ResourceType),
      context.fileSystem,
    );
    const detectOptions = {
      resourceKey: {
        prefix: options.resourceKeyPrefix,
        suffix: options.resourceKeySuffix,
      },
    };
    const { cache } = context;
    const results = processor
      .process(
        options.root,
        Presets.get(context.logger, options.preset),
        detectOptions,
        cache
          ? (file, content, detect) =>
              cache.remember(
                'detect.file',
                {
                  preset: options.preset,
                  extension: extname(file),
                  options: detectOptions,
                  content: hashText(content),
                },
                detect,
              )
          : undefined,
      )
      .filter((result) => !options.skipTests || !isTestFile(result.filePath));

    return Promise.resolve({
      result: results,
      data: {
        files: results.map((result) => ({
          file: result.filePath,
          strings: result.parsings.map((parsing) => ({
            value: parsing.match.value ?? '',
            hardCoded: parsing.isStatic,
            line: parsing.lineNumber,
            column: parsing.columnNumber,
          })),
        })),
      },
    });
  }
}

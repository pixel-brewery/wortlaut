// #region Imports

import { type IFileSystem, Path } from '@pixel-brewery/utilities';
import { EventEmitter } from 'events';
import type { IDetectOptions, IDetectorResult } from '../detectors/interfaces/IDetector.js';
import type { IFormatter } from '../formatters/interfaces/IFormatter.js';
import type { IFrameworkPreset } from '../presets/interfaces/IFrameworkPreset.js';
import { KeyGenerator } from './KeyGenerator.js';

// #endregion

/**
 * Result of a localization processor extraction.
 *
 * @public
 */
export interface ILocalizationProcessorResult {
  // #region Properties

  /**
   * The file path of the processed file.
   */
  filePath: string;

  /**
   * The extraction result
   */
  extraction: {
    content: string;
    changes: Record<string, string>;
  };

  /**
   * The parsing results.
   */
  parsings: Array<IDetectorResult>;

  // #endregion
}

/**
 * Event map for the `LocalizationProcessor`.
 *
 * @public
 */
export interface ILocalizationProcessorEventMap {
  // #region Properties

  /**
   * The detected event.
   */
  detected: [change: IDetectorResult];

  /**
   * The failed event.
   */
  failed: [error: any];

  // #endregion
}

/**
 * The `IProcessOptions` interface.
 *
 * @public
 */
export interface IProcessOptions extends IDetectOptions {}

/**
 * The `LocalizationProcessor` class.
 *
 * @public
 */
export class LocalizationProcessor extends EventEmitter<ILocalizationProcessorEventMap> {
  // #region Fields

  private readonly _fileSystem: IFileSystem;
  private readonly _formatter: IFormatter;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `LocalizationProcessor` class.
   *
   * @public
   */
  public constructor(formatter: IFormatter, fileSystem: IFileSystem) {
    super({ captureRejections: true });

    this._formatter = formatter;
    this._fileSystem = fileSystem;
  }

  // #endregion

  // #region Methods

  /**
   * Processes the localization of a directory.
   *
   * @public
   * @param rootDir The root directory to process.
   * @param preset The preset to use for processing.
   * @param options The optional processing options.
   * @returns The results of the localization process.
   */
  public process(
    rootDir: string,
    preset: IFrameworkPreset,
    options?: IProcessOptions,
    around?: (
      file: string,
      content: string,
      detect: () => Array<IDetectorResult>,
    ) => Array<IDetectorResult>,
  ): Array<ILocalizationProcessorResult> {
    if (!rootDir.length) {
      return [];
    }

    if (!this._fileSystem.fileExists(rootDir)) {
      throw new Error('The specified directory does not exist.');
    }

    Object.entries(preset.getParsers()).forEach(([_, x]) => {
      x.on('detected', (args) => {
        this.emit('detected', args);
      });

      x.on('failed', (args) => {
        this.emit('failed', args);
      });
    });

    const extensions = preset.getExtensions().map((x) => Path.combine(rootDir, `**/*${x}`));
    const results = new Array<ILocalizationProcessorResult>();

    this._fileSystem.fileGlob(extensions).forEach((file) => {
      const ext = Path.getExtension(file, true);
      const content = this._fileSystem.fileReadAllText(file);
      const parser = preset.getParser(ext);
      const detect = (): Array<IDetectorResult> => parser.detect(content, options);
      const parsings = around ? around(file, content, detect) : detect();
      const extraction = this.format(parsings);

      // if (Object.keys(extraction.changes).length > 0) {
      results.push({
        filePath: file,
        parsings: parsings,
        extraction: extraction,
      });
      // }
    });

    return results;
  }

  /**
   * Extracts strings from a value.
   *
   * @public
   * @param values The values to extract.
   * @returns The extraction result.
   */
  private format(values: Array<IDetectorResult>): {
    content: string;
    changes: Record<string, string>;
  } {
    const keyValueMap: Record<string, string> = {};

    values.forEach((x) => {
      const key = x.isStatic
        ? new KeyGenerator().generate(x.match.value ?? '')
        : (x.match.value ?? '');
      keyValueMap[key] = x.match.value ?? '';
    });

    return this._formatter.format(keyValueMap);
  }

  // #endregion
}

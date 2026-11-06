// #region Imports

import { extname } from 'node:path';
import type {
  PresetInfo,
  TestDetectResult,
  TestPatternResult,
  TestPreset,
} from '@pixel-brewery/wortlaut-contracts';
import {
  createKeyPattern,
  JsonFormatter,
  KeyGenerator,
  KeyMatcher,
  PatternGuard,
  Presets,
} from '@pixel-brewery/wortlaut-core';
import { QUIET_LOGGER } from '../io/QuietLogger.js';

// #endregion

/**
 * The most keys a pattern test lists.
 */
const MAX_PATTERN_KEYS = 2000;

/**
 * The prefix of the samples, which follows the project's.
 */
const SAMPLE_PREFIX = 'loc';

/**
 * The names of the presets.
 */
const PRESET_NAMES: Readonly<Record<Presets, string>> = {
  [Presets.Angular]: 'Angular',
  [Presets.Lit]: 'Lit',
  [Presets.React]: 'React',
  [Presets.Vue]: 'Vue',
  [Presets.Stencil]: 'Stencil',
};

/**
 * The sample of each file type. The strings are neutral: they show how the detector reads a file.
 */
const SAMPLES: Readonly<Record<string, string>> = {
  '.html':
    "<header>\n  <h2>{{ 'Save your work' | translate }}</h2>\n  <p>{{ 'loc.orders.title' | translate }}</p>\n</header>\n<my-button [label]=\"'Keep editing' | translate\"\n           (click)=\"pause('Pause editing' | translate)\"></my-button>\n<div *ngIf=\"'Paused' | translate as text\">{{ text }}</div>",
  '.ts':
    "export class OrderPanel {\n  public readonly title = translate('Order panel');\n  public hint(): string {\n    return t('loc.orders.hint');\n  }\n}",
  '.js':
    "export function title() {\n  return t('Order panel');\n}\n\nexport const hint = () => t('loc.orders.hint');",
  '.jsx':
    "export function OrderPanel() {\n  return (\n    <section title={t('Order panel')}>\n      <h2>{t('loc.orders.title')}</h2>\n    </section>\n  );\n}",
  '.tsx':
    "export function OrderPanel(): JSX.Element {\n  return (\n    <section title={t('Order panel')}>\n      <h2>{t('loc.orders.title')}</h2>\n    </section>\n  );\n}",
  '.vue':
    "<template>\n  <h2>{{ $t('Save your work') }}</h2>\n  <p>{{ $t('loc.orders.title') }}</p>\n</template>",
};

/**
 * Tries the real detectors and key matchers on samples. It reads no project and writes nothing.
 *
 * @public
 */
export class TestLab {
  // #region Methods

  /**
   * Returns the presets with the file types they read.
   *
   * @public
   * @returns The presets.
   */
  public presets(): Array<PresetInfo> {
    return Object.values(Presets)
      .filter((value): value is Presets => typeof value === 'string')
      .map((id) => ({
        id,
        name: PRESET_NAMES[id],
        extensions: Presets.get(QUIET_LOGGER, id).getExtensions(),
      }));
  }

  /**
   * Returns the presets with a sample for each file type they read.
   *
   * @public
   * @param prefix The prefix of the project's keys.
   * @returns The presets.
   */
  public testPresets(prefix: string): Array<TestPreset> {
    const head = prefix.replace(/\.$/, '') || SAMPLE_PREFIX;

    return this.presets().map(({ id, name, extensions }) => ({
      id,
      name,
      samples: extensions.map((extension) => ({
        fileName: `panel${extension}`,
        content: (SAMPLES[extension] ?? '').split(`'${SAMPLE_PREFIX}.`).join(`'${head}.`),
      })),
    }));
  }

  /**
   * Runs the detector of a preset on a text.
   *
   * @public
   * @param preset The preset.
   * @param fileName The name of the file, whose type chooses the detector.
   * @param content The text.
   * @param prefix The prefix of the project's keys.
   * @returns What the detector finds.
   */
  public detect(
    preset: string,
    fileName: string,
    content: string,
    prefix: string,
  ): TestDetectResult {
    const framework = Presets.get(QUIET_LOGGER, preset);
    const extension = extname(fileName);
    const parser = framework.getParser(extension);

    if (!parser) {
      return {
        detector: null,
        prefix,
        matches: [],
        resource: '{}',
        failure: `${PRESET_NAMES[preset as Presets]} reads ${framework.getExtensions().join(', ')}, and no ${extension || 'file without a type'}.`,
      };
    }

    let failure: string | null = null;

    parser.on('failed', (error: unknown) => {
      failure = error instanceof Error ? error.message : String(error);
    });

    const found = parser.detect(content, { resourceKey: { prefix, suffix: '' } });
    const generator = new KeyGenerator();
    const entries: Record<string, string> = {};

    for (const result of found) {
      const value = result.match.value ?? '';

      entries[
        result.isStatic ? generator.generateWithAffixes(value, { prefix, suffix: '' }) : value
      ] = value;
    }

    return {
      detector: parser.constructor.name,
      prefix,
      matches: found.map((result) => ({
        line: result.lineNumber,
        column: result.columnNumber,
        value: result.match.value ?? '',
        isHardCoded: result.isStatic,
      })),
      resource: new JsonFormatter().format(entries).content,
      failure,
    };
  }

  /**
   * Tests a pattern on keys, in the grammar of the list it would go into: used keys read globs and regular expressions,
   * identical keys only `*`.
   *
   * @public
   * @param pattern The pattern.
   * @param list The list.
   * @param keys The keys of the project.
   * @returns Which keys it covers.
   */
  public pattern(
    pattern: string,
    list: 'usedKeys' | 'identicalKeys',
    keys: ReadonlyArray<string>,
  ): TestPatternResult {
    const none = (error: string): TestPatternResult => ({
      error,
      matchCount: 0,
      total: keys.length,
      keys: keys.slice(0, MAX_PATTERN_KEYS).map((key) => ({ key, isMatch: false })),
    });

    if (pattern.length === 0) {
      return none('An empty entry matches no key.');
    }

    let exact: ReadonlySet<string> = new Set();
    let expressions: ReadonlyArray<RegExp>;

    try {
      if (list === 'usedKeys') {
        const matcher = new KeyMatcher([pattern], 'usedKeys');

        exact = matcher.exactKeys;
        expressions = matcher.patterns;
      } else {
        expressions = [createKeyPattern(pattern)];
      }
    } catch (error) {
      return none((error as Error).message.replace('The usedKeys entry', 'The entry'));
    }

    // A pattern can backtrack catastrophically, and whoever typed it is not always the user.
    const guard = new PatternGuard();
    const hit = new Array<boolean>(keys.length).fill(false);

    for (const expression of expressions) {
      const outcome = guard.test(expression.source, expression.flags, keys);

      if (outcome.kind === 'stopped') {
        return none(`This pattern was stopped: ${outcome.reason}`);
      }

      outcome.matches.forEach((isMatch, index) => {
        hit[index] ||= isMatch;
      });
    }

    const results = keys.map((key, index) => ({ key, isMatch: hit[index] || exact.has(key) }));
    const hits = results.filter((result) => result.isMatch);

    return {
      error: null,
      matchCount: hits.length,
      total: keys.length,
      keys: [...hits, ...results.filter((result) => !result.isMatch)].slice(0, MAX_PATTERN_KEYS),
    };
  }

  // #endregion
}

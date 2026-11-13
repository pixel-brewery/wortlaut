// #region Imports

import { PatternGuard } from '../resources/analyzers/declarative/PatternGuard';
import { KeyMatcher } from './KeyMatcher';

// #endregion

/**
 * The options of the `UsedKeysFinder`.
 *
 * @public
 */
export interface IUsedKeysFinderOptions {
  /**
   * The prefix every resource key starts with, for example `loc`.
   * Keys composed in code are only derived from literals that start with it.
   *
   * @default ''
   */
  prefix?: string;

  /**
   * Keys that count as used although no scanned source mentions them, for example keys that another library composes
   * at runtime. Each entry matches the whole key, case-sensitively, and is one of:
   * - an exact key, such as `loc.orders.title`;
   * - a glob with `.` as the segment separator: `*` matches within one segment, `**` as a whole segment any number of
   *   segments, `?` one character other than `.`, and `{a,b}` either alternative, for example
   *   `loc.orders.{open,closed}.label`. A trailing `*` matches the rest of the key, so `loc.api.error.*` keeps every
   *   key below `loc.api.error`. `\` escapes the next character;
   * - a regular expression written as `/expression/flags`, such as `/loc\.step\d+\.title/`.
   *
   * @default []
   */
  usedKeys?: ReadonlyArray<string>;
}

/**
 * A string literal without whitespace or quotes, in single quotes, double quotes or backticks.
 */
const QUOTED_LITERAL = /(['"`])([^'"`\s]+)\1/g;

/**
 * A template literal with at least one placeholder.
 */
const TEMPLATE_LITERAL = /`([^`]*\$\{[^`]*)`/g;

/**
 * A string literal ending with a dot that the code concatenates with `+`.
 */
const CONCATENATED_LITERAL = /(['"`])([^'"`\s]+\.)\1\s*\+/g;

/**
 * A placeholder of a template literal.
 */
const PLACEHOLDER = /\$\{[^}]*\}/g;

/**
 * Where a source uses a key.
 *
 * @public
 */
export interface IKeyUsage {
  file: string;
  line: number;
}

/**
 * Finds the resource keys that source code uses.
 *
 * @description
 * A key counts as used when a source contains it as a complete string literal in single quotes, double quotes or
 * backticks, whatever call, pipe or constant surrounds it: `t('loc.title')`, `{{ 'loc.title' | translate }}`,
 * `this.translate.translate('loc.title')` and `{ label: 'loc.title' }` all use `loc.title`.
 *
 * Keys that the code composes count as used as well, as far as the code shows them:
 * - A template literal with placeholders, such as `` `loc.status.${state}.label` ``, uses every key that matches it,
 *   each placeholder standing for at least one character.
 * - A string literal that ends with a dot and is concatenated, such as `'loc.status.' + state`, uses every key that
 *   starts with it.
 *
 * Only literals that start with the key prefix derive such patterns. Keys that no scanned source mentions, such as keys
 * that another library composes, are declared with `usedKeys` instead of being guessed.
 *
 * @public
 */
export class UsedKeysFinder {
  // #region Methods

  /**
   * Returns the keys that the sources use.
   *
   * @public
   * @param sources The contents of the source files.
   * @param keys The keys of the resources.
   * @param options The options.
   * @param guard The guard to share with other pattern evaluations in the same operation.
   * @returns The used keys.
   * @throws Error if an entry of `usedKeys` is invalid. The message names the entry.
   * @throws KeyPatternStoppedError if evaluating a declared pattern exceeds its budget.
   */
  public find(
    sources: Iterable<string>,
    keys: ReadonlyArray<string>,
    options?: IUsedKeysFinderOptions,
    guard?: PatternGuard,
  ): Set<string> {
    const knownKeys = new Set(keys);
    const usedKeys = new Set<string>();
    const prefix = this.normalizePrefix(options?.prefix ?? '');
    const declaredKeys = new KeyMatcher(options?.usedKeys ?? [], 'usedKeys');
    const patterns = new Array<RegExp>();

    for (const source of sources) {
      for (const match of source.matchAll(QUOTED_LITERAL)) {
        if (knownKeys.has(match[2])) {
          usedKeys.add(match[2]);
        }
      }

      for (const match of source.matchAll(TEMPLATE_LITERAL)) {
        const pattern = this.createTemplatePattern(match[1], prefix);

        if (pattern) {
          patterns.push(pattern);
        }
      }

      for (const match of source.matchAll(CONCATENATED_LITERAL)) {
        if (this.isKeyHead(match[2], prefix)) {
          patterns.push(new RegExp(`^${this.escape(match[2])}.+$`, 's'));
        }
      }
    }

    const remaining = keys.filter((key) => !usedKeys.has(key));
    const declared = declaredKeys.matchKeys(remaining, guard);

    for (const key of remaining) {
      if (declared.has(key) || patterns.some((pattern) => pattern.test(key))) {
        usedKeys.add(key);
      }
    }

    return usedKeys;
  }

  /**
   * Returns where the sources use each key, by the same reading as `find`. A key that only `usedKeys` declares has no
   * location.
   *
   * @public
   * @param sources The source files with their contents.
   * @param keys The keys of the resources.
   * @param options The options.
   * @returns The usages by key. A key without usage is not in the map.
   */
  public locate(
    sources: Iterable<{ file: string; content: string }>,
    keys: ReadonlyArray<string>,
    options?: IUsedKeysFinderOptions,
  ): Map<string, Array<IKeyUsage>> {
    const knownKeys = new Set(keys);
    const prefix = this.normalizePrefix(options?.prefix ?? '');
    const usages = new Map<string, Array<IKeyUsage>>();
    const add = (key: string, file: string, line: number): void => {
      const list = usages.get(key) ?? [];

      if (!list.some((usage) => usage.file === file && usage.line === line)) {
        list.push({ file, line });
        usages.set(key, list);
      }
    };

    for (const { file, content } of sources) {
      content.split('\n').forEach((text, index) => {
        for (const match of text.matchAll(QUOTED_LITERAL)) {
          if (knownKeys.has(match[2])) {
            add(match[2], file, index + 1);
          }
        }

        const patterns = [
          ...Array.from(text.matchAll(TEMPLATE_LITERAL), (match) =>
            this.createTemplatePattern(match[1], prefix),
          ),
          ...Array.from(text.matchAll(CONCATENATED_LITERAL), (match) =>
            this.isKeyHead(match[2], prefix)
              ? new RegExp(`^${this.escape(match[2])}.+$`, 's')
              : null,
          ),
        ].filter((pattern) => pattern !== null);

        for (const pattern of patterns) {
          for (const key of keys) {
            if (pattern.test(key)) {
              add(key, file, index + 1);
            }
          }
        }
      });
    }

    return usages;
  }

  /**
   * Creates the pattern of the keys a template literal composes, or `null` when it does not compose a key.
   *
   * @private
   */
  private createTemplatePattern(body: string, prefix: string): RegExp | null {
    const parts = body.split(PLACEHOLDER);

    if (!this.isKeyHead(parts[0], prefix)) {
      return null;
    }

    return new RegExp(`^${parts.map((part) => this.escape(part)).join('.+')}$`, 's');
  }

  /**
   * Returns whether the static start of a literal starts a key.
   *
   * @private
   */
  private isKeyHead(head: string, prefix: string): boolean {
    return prefix ? head.startsWith(prefix) : head.includes('.');
  }

  /**
   * Returns the prefix including the dot that separates it from the rest of a key.
   *
   * @private
   */
  private normalizePrefix(prefix: string): string {
    if (!prefix) {
      return '';
    }

    return prefix.endsWith('.') ? prefix : `${prefix}.`;
  }

  /**
   * Escapes the characters of a text that have a meaning in a regular expression.
   *
   * @private
   */
  private escape(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // #endregion
}

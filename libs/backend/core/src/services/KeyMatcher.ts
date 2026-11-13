// #region Imports

import { PatternGuard } from '../resources/analyzers/declarative/PatternGuard';

// #endregion

/**
 * The most patterns that the braces of one entry may expand to.
 */
const MAX_EXPANSIONS = 10000;

/**
 * The flags that a regular expression entry may set. The expression matches the whole key once: `g` and `y` would make
 * matching depend on earlier matches, `m` would let `^` and `$` match inside a key, and `d` has no effect.
 */
const REGEX_FLAGS = /^[isuv]*$/;

/**
 * The glob wildcard `*`.
 */
const STAR = Symbol('*');

/**
 * The glob wildcard `?`.
 */
const ANY = Symbol('?');

/**
 * A literal character or a wildcard of a glob without braces.
 */
type GlobToken = string | typeof STAR | typeof ANY;

/**
 * A part of a parsed glob: glob text without braces, with its escapes, or the alternatives of a brace pair.
 */
type GlobPart = string | ReadonlyArray<ReadonlyArray<GlobPart>>;

/**
 * A configured key pattern could not finish, so it would be unsafe to treat its keys as unmatched.
 *
 * @public
 */
export class KeyPatternStoppedError extends Error {
  /**
   * @param entry The pattern as entered.
   * @param reason Why its evaluation stopped.
   */
  public constructor(entry: string, reason: string) {
    super(`The key pattern '${entry}' was stopped. ${reason}`);
    this.name = 'KeyPatternStoppedError';
  }
}

/**
 * Matches keys against entries that are exact keys, globs or regular expressions, such as the `usedKeys` of the
 * `analyze` command.
 *
 * @remarks
 * Every entry matches the whole key, case-sensitively:
 * - An entry without wildcards and braces is an exact key.
 * - A glob treats `.` as the separator of the key segments. `*` matches any characters within one segment, `**` as a
 *   whole segment matches any number of segments, `?` matches one character other than `.`, and `{a,b}` matches either
 *   alternative. Alternatives may contain dots, wildcards and further braces; braces expand first, as in a shell. A
 *   `*` at the end of a pattern keeps its original meaning and matches the rest of the key, across segments. `\`
 *   escapes the next character.
 * - `/expression/flags` is a regular expression, matched as if it were enclosed in `^(?:…)$`.
 *
 * @public
 */
export class KeyMatcher {
  // #region Fields

  private readonly _keys: Set<string>;
  private readonly _patterns: Array<{ entry: string; expression: RegExp }>;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `KeyMatcher` class.
   *
   * @public
   * @param entries The entries: exact keys, globs or regular expressions.
   * @param name The name of the option that declares the entries, for the error messages, for example `usedKeys`.
   * @throws Error if an entry is invalid. The message names the option and the entry.
   */
  public constructor(entries: Iterable<string>, name: string) {
    this._keys = new Set<string>();
    this._patterns = [];

    for (const entry of entries) {
      try {
        this.add(entry);
      } catch (error) {
        throw new Error(
          `The ${name} entry '${String(entry)}' is invalid: ${(error as Error).message}.`,
          { cause: error },
        );
      }
    }
  }

  // #endregion

  // #region Properties

  /**
   * Gets the entries without wildcards.
   *
   * @public
   * @readonly
   */
  public get exactKeys(): ReadonlySet<string> {
    return this._keys;
  }

  /**
   * Gets the compiled patterns, for a caller that has to bound the time they take on text from outside.
   *
   * @public
   * @readonly
   */
  public get patterns(): ReadonlyArray<RegExp> {
    return this._patterns.map(({ expression }) => expression);
  }

  // #endregion

  // #region Methods

  /**
   * Returns whether an entry matches the key.
   *
   * @public
   * @param key The key.
   * @returns `true` if an entry matches the whole key; otherwise, `false`.
   * @throws KeyPatternStoppedError when a pattern cannot finish in time.
   */
  public matches(key: string): boolean {
    return this._keys.has(key) || this.matchKeys([key]).has(key);
  }

  /**
   * Matches all candidate keys with one bounded evaluation per pattern, using a shared time budget.
   *
   * @public
   * @param keys The keys to match.
   * @param guard The guard to share with other pattern evaluations in the same operation.
   * @returns The matching keys in input order.
   * @throws KeyPatternStoppedError when a pattern cannot finish in time.
   */
  public matchKeys(keys: ReadonlyArray<string>, guard = new PatternGuard()): Set<string> {
    const matched = new Set(keys.filter((key) => this._keys.has(key)));
    let remaining = keys.filter((key) => !matched.has(key));

    for (const { entry, expression } of this._patterns) {
      if (remaining.length === 0) {
        break;
      }

      const outcome = guard.test(expression.source, expression.flags, remaining, true);

      if (outcome.kind === 'stopped') {
        throw new KeyPatternStoppedError(entry, outcome.reason);
      }

      remaining = remaining.filter((key, index) => {
        if (outcome.matches[index]) {
          matched.add(key);
          return false;
        }

        return true;
      });
    }

    return new Set(keys.filter((key) => matched.has(key)));
  }

  /**
   * Adds an entry as exact keys or patterns.
   *
   * @private
   */
  private add(entry: unknown): void {
    if (typeof entry !== 'string') {
      throw new Error('an entry must be a string');
    }

    if (entry.length === 0) {
      throw new Error('an empty entry matches no key');
    }

    if (entry.startsWith('/')) {
      this._patterns.push({ entry, expression: this.createRegularExpression(entry) });
      return;
    }

    for (const glob of this.expand(this.parse(entry))) {
      const tokens = this.tokenize(glob);

      if (tokens.every((token) => typeof token === 'string')) {
        this._keys.add(tokens.join(''));
      } else {
        this._patterns.push({ entry, expression: this.compile(tokens) });
      }
    }
  }

  /**
   * Creates the pattern of a regular expression entry, written as `/expression/flags`.
   *
   * @private
   */
  private createRegularExpression(entry: string): RegExp {
    const end = entry.lastIndexOf('/');

    if (end === 0) {
      throw new Error('a regular expression is written as /expression/flags');
    }

    const expression = entry.slice(1, end);
    const flags = entry.slice(end + 1);

    if (expression.length === 0) {
      throw new Error('the regular expression is empty');
    }

    if (!REGEX_FLAGS.test(flags)) {
      throw new Error(
        `the flags '${flags}' are not supported; a regular expression always matches the whole key and may only use the flags i, s, u and v`,
      );
    }

    // Compiling the expression on its own first rejects an expression such as `a)|(b` that would break out of the
    // enclosing group and match only part of the key.
    const pattern = new RegExp(expression, flags);

    return new RegExp(`^(?:${pattern.source})$`, pattern.flags);
  }

  /**
   * Parses a glob into its text and brace pairs.
   *
   * @private
   */
  private parse(glob: string): Array<GlobPart> {
    let index = 0;

    const parseSequence = (isAlternative: boolean): Array<GlobPart> => {
      const parts = new Array<GlobPart>();
      let text = '';

      while (index < glob.length) {
        const character = glob[index];

        if (character === '\\') {
          if (index === glob.length - 1) {
            throw new Error("the '\\' at the end escapes no character");
          }

          text += glob.slice(index, index + 2);
          index += 2;
        } else if (character === '{') {
          const position = index + 1;
          const alternatives = new Array<Array<GlobPart>>();

          do {
            index++;
            alternatives.push(parseSequence(true));
          } while (glob[index] === ',');

          if (glob[index] !== '}') {
            throw new Error(`the '{' at position ${position} has no closing '}'`);
          }

          if (alternatives.length < 2) {
            throw new Error(
              `the braces at position ${position} hold a single alternative; separate alternatives with commas, or escape literal braces as \\{ and \\}`,
            );
          }

          index++;
          parts.push(text, alternatives);
          text = '';
        } else if (isAlternative && (character === ',' || character === '}')) {
          break;
        } else if (character === '}') {
          throw new Error(`the '}' at position ${index + 1} has no opening '{'`);
        } else {
          text += character;
          index++;
        }
      }

      parts.push(text);

      return parts;
    };

    return parseSequence(false);
  }

  /**
   * Expands the brace pairs of a parsed glob into globs without braces.
   *
   * @private
   */
  private expand(parts: ReadonlyArray<GlobPart>): Array<string> {
    let globs = [''];

    for (const part of parts) {
      const continuations =
        typeof part === 'string' ? [part] : part.flatMap((alternative) => this.expand(alternative));

      if (globs.length * continuations.length > MAX_EXPANSIONS) {
        throw new Error(`its braces expand to more than ${MAX_EXPANSIONS} patterns`);
      }

      globs = globs.flatMap((glob) =>
        continuations.map((continuation) => `${glob}${continuation}`),
      );
    }

    return globs;
  }

  /**
   * Splits a glob without braces into literal characters and wildcards.
   *
   * @private
   */
  private tokenize(glob: string): Array<GlobToken> {
    const tokens = new Array<GlobToken>();

    for (let index = 0; index < glob.length; index++) {
      const character = glob[index];

      if (character === '\\') {
        index++;
        tokens.push(glob[index]);
      } else if (character === '*') {
        tokens.push(STAR);
      } else if (character === '?') {
        tokens.push(ANY);
      } else {
        tokens.push(character);
      }
    }

    return tokens;
  }

  /**
   * Compiles the tokens of a glob with wildcards into a pattern that matches the whole key.
   *
   * @private
   */
  private compile(tokens: ReadonlyArray<GlobToken>): RegExp {
    let source = '';

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];

      if (token === ANY) {
        source += '[^.]';
      } else if (token !== STAR) {
        source += this.escape(token);
      } else {
        let end = index;

        while (tokens[end + 1] === STAR) {
          end++;
        }

        const isLast = end === tokens.length - 1;
        const isSegment =
          (index === 0 || tokens[index - 1] === '.') && (isLast || tokens[end + 1] === '.');

        if (end - index > 1) {
          throw new Error(
            "'***' is no wildcard; use '*' within a segment or '**' for any number of segments",
          );
        }

        if (end === index) {
          // A trailing `*` keeps its original meaning: the rest of the key, across segments.
          source += isLast ? '.*' : '[^.]*';
        } else if (!isSegment) {
          throw new Error(
            "'**' must be a whole segment, as in 'loc.**.label'; use '*' within a segment",
          );
        } else if (isLast) {
          // `loc.**` matches every key below `loc`, `**` alone every key.
          source += '.*';
        } else {
          // `**.` matches any number of leading segments, none included; the dot belongs to the group.
          source += '(?:[^.]*\\.)*';
          end++;
        }

        index = end;
      }
    }

    return new RegExp(`^${source}$`, 's');
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

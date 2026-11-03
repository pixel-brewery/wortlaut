/**
 * How deep messages may nest. Real messages stay far below this, and a hostile value cannot exhaust the stack.
 */
const MAX_DEPTH = 32;

/**
 * The argument types whose cases are messages of their own.
 */
const CASE_TYPES = new Set(['plural', 'select', 'selectordinal']);

/**
 * The categories a plural can name, next to exact values such as `=0`.
 */
const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

/**
 * A problem found while reading a message.
 */
class IcuProblem extends Error {
}

/**
 * Reads one message of the ICU message format in one pass.
 */
class IcuReader {

    // #region Fields

    private readonly _text: string;
    private _index: number;

    // #endregion

    // #region Ctor

    public constructor(text: string) {
        this._text = text;
        this._index = 0;
    }

    // #endregion

    // #region Methods

    /**
     * Reads the whole value.
     */
    public read(): void {
        this.readMessage(0);

        if (this._index < this._text.length) {
            throw new IcuProblem('A closing brace has no opening brace.');
        }
    }

    /**
     * Reads a message up to its closing brace, which stays for the caller.
     *
     * @private
     */
    private readMessage(depth: number): void {
        if (depth > MAX_DEPTH) {
            throw new IcuProblem('The message nests too deeply.');
        }

        while (this._index < this._text.length) {
            const character = this._text[this._index];

            if (character === '\'') {
                this.skipQuote();
            } else if (character === '{') {
                this.readArgument(depth);
            } else if (character === '}') {
                return;
            } else {
                this._index++;
            }
        }
    }

    /**
     * An apostrophe quotes up to the next one when a brace follows it, and two of them are one.
     *
     * @private
     */
    private skipQuote(): void {
        const next = this._text[this._index + 1];

        if (next === '{' || next === '}') {
            const end = this._text.indexOf('\'', this._index + 1);

            this._index = end < 0 ? this._text.length : end + 1;
        } else {
            this._index += next === '\'' ? 2 : 1;
        }
    }

    /**
     * @private
     */
    private readArgument(depth: number): void {
        this._index++;

        // `{{ name }}` is the placeholder of a template language, which ICU does not read.
        if (this._text[this._index] === '{') {
            const end = this._text.indexOf('}}', this._index);

            if (end < 0) {
                throw new IcuProblem('An opening brace has no closing brace.');
            }

            this._index = end + 2;

            return;
        }

        const name = this.readUntil(',{}');

        if (this._text[this._index] === '{') {
            throw new IcuProblem(`The argument '${name.trim()}' has no closing brace.`);
        }

        if (this._text[this._index] === '}') {
            this._index++;

            return;
        }

        if (this._index >= this._text.length) {
            throw new IcuProblem(`The argument '${name.trim()}' has no closing brace.`);
        }

        this._index++;

        const type = this.readUntil(',{}').trim();

        if (CASE_TYPES.has(type)) {
            if (this._text[this._index] !== ',') {
                throw new IcuProblem(`The ${type} of '${name.trim()}' has no cases.`);
            }

            this._index++;
            this.readCases(name.trim(), type, depth);
        } else {
            this.skipStyle(name.trim());
        }
    }

    /**
     * @private
     */
    private readCases(name: string, type: string, depth: number): void {
        const selectors = new Array<string>();

        for (;;) {
            this.skipSpace();

            if (this._index >= this._text.length) {
                throw new IcuProblem(`The ${type} of '${name}' has no closing brace.`);
            }

            if (this._text[this._index] === '}') {
                this._index++;
                break;
            }

            const selector = this.readUntil('{}').trim();

            if (type !== 'select' && selector.startsWith('offset:')) {
                const rest = selector.slice('offset:'.length).trim()
                    .split(/\s+/);

                if (rest.length < 2) {
                    continue;
                }

                selectors.push(this.checkSelector(rest[1], type, name));
            } else {
                selectors.push(this.checkSelector(selector, type, name));
            }

            if (this._text[this._index] !== '{') {
                throw new IcuProblem(`The case '${selector}' of '${name}' has no message.`);
            }

            this._index++;
            this.readMessage(depth + 1);

            if (this._text[this._index] !== '}') {
                throw new IcuProblem(`The case '${selector}' of '${name}' has no closing brace.`);
            }

            this._index++;
        }

        if (selectors.length === 0) {
            throw new IcuProblem(`The ${type} of '${name}' has no cases.`);
        }

        if (!selectors.includes('other')) {
            throw new IcuProblem(`The ${type} of '${name}' has no 'other' case.`);
        }
    }

    /**
     * @private
     */
    private checkSelector(selector: string, type: string, name: string): string {
        if (!selector || (/\s/).test(selector)) {
            throw new IcuProblem(`The ${type} of '${name}' has a case without a name.`);
        }

        if (type !== 'select' && !selector.startsWith('=') && !PLURAL_CATEGORIES.has(selector)) {
            throw new IcuProblem(`The ${type} of '${name}' has an unknown case '${selector}'.`);
        }

        return selector;
    }

    /**
     * Skips the style of a type without cases, such as a date format, which may hold quoted text and braces.
     *
     * @private
     */
    private skipStyle(name: string): void {
        let depth = 1;

        while (this._index < this._text.length && depth > 0) {
            const character = this._text[this._index];

            if (character === '\'') {
                this.skipQuote();
            } else {
                depth += character === '{' ? 1 : character === '}' ? -1 : 0;
                this._index++;
            }
        }

        if (depth > 0) {
            throw new IcuProblem(`The argument '${name}' has no closing brace.`);
        }
    }

    /**
     * @private
     */
    private readUntil(stops: string): string {
        const start = this._index;

        while (this._index < this._text.length && !stops.includes(this._text[this._index])) {
            this._index++;
        }

        return this._text.slice(start, this._index);
    }

    /**
     * @private
     */
    private skipSpace(): void {
        while (this._index < this._text.length && (/\s/).test(this._text[this._index])) {
            this._index++;
        }
    }

    // #endregion

}

/**
 * Finds what is wrong with an ICU message: braces that do not match, and plural and select messages without the `other` case
 * or with a case that does not exist. It takes one pass over the value, whatever the value holds.
 *
 * @public
 * @param value The value.
 * @returns The problem, or `null` for a valid message.
 */
export function findIcuProblem(value: string): string | null {
    try {
        new IcuReader(value).read();

        return null;
    } catch (error) {
        if (error instanceof IcuProblem) {
            return error.message;
        }

        throw error;
    }
}

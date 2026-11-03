/**
 * Placeholders such as `{0}`, `{name}` or `{{ name }}`.
 */
const PLACEHOLDER = /\{[^{}]*\}/g;

/**
 * Returns the placeholders of a value.
 *
 * @public
 * @param value The value.
 * @returns The placeholders in their order.
 */
export function placeholdersOf(value: string): Array<string> {
    return value.match(PLACEHOLDER) ?? [];
}

/**
 * A printf placeholder such as `%s`, `%1$d`, `%(name)s` or `%@`.
 */
const PRINTF_PLACEHOLDER = /%(?:\d+\$)?(?:\([^()\s]+\))?[@sdifuxXeEgGc]/g;

/**
 * An ICU argument that holds messages of its own, such as `{count, plural, one {# item} other {# items}}`.
 */
const ICU_ARGUMENT = /^\s*([^\s,{}]+)\s*,\s*(plural|select|selectordinal)\s*,/;

/**
 * Returns what a translation has to keep of a value: placeholders in all the usual forms, in their order. It reads nested
 * ICU messages, whose words may be translated while their arguments stay.
 *
 * @public
 * @param value The value.
 * @returns The placeholders, each in one spelling.
 */
export function protectedTokensOf(value: string): Array<string> {
    const tokens = new Array<string>();
    let plain = '';
    let index = 0;

    while (index < value.length) {
        if (value[index] !== '{') {
            plain += value[index];
            index++;
            continue;
        }

        const end = closingBraceOf(value, index);

        if (end < 0) {
            plain += value.slice(index);
            break;
        }

        tokens.push(...tokensOfBraces(value.slice(index + 1, end)));
        index = end + 1;
    }

    return [...tokens, ...plain.match(PRINTF_PLACEHOLDER) ?? []];
}

/**
 * Compares the placeholders of a translation with those of its base value.
 *
 * @public
 * @param base The base value.
 * @param translation The translation.
 * @returns What the translation lost and what it added, with repetitions.
 */
export function comparePlaceholders(base: string, translation: string): { missing: Array<string>; added: Array<string> } {
    const remaining = protectedTokensOf(translation);
    const missing = new Array<string>();

    for (const token of protectedTokensOf(base)) {
        const found = remaining.indexOf(token);

        if (found >= 0) {
            remaining.splice(found, 1);
        } else {
            missing.push(token);
        }
    }

    return { missing, added: remaining };
}

/**
 * @private
 */
function closingBraceOf(value: string, start: number): number {
    let depth = 0;

    for (let index = start; index < value.length; index++) {
        if (value[index] === '{') {
            depth++;
        } else if (value[index] === '}') {
            depth--;

            if (depth === 0) {
                return index;
            }
        }
    }

    return -1;
}

/**
 * @private
 */
function tokensOfBraces(inner: string): Array<string> {
    const icu = ICU_ARGUMENT.exec(inner);

    if (icu) {
        return [`{${icu[1]},${icu[2]}}`, ...tokensOfCases(inner.slice(icu[0].length))];
    }

    // `{{ name }}` and `{{name}}` are one placeholder.
    return inner.startsWith('{') && inner.endsWith('}') ? [`{{${inner.slice(1, -1).trim()}}}`] : [`{${inner.trim()}}`];
}

/**
 * Reads the cases of an ICU argument. Each one is a message of its own, whose words may be translated.
 *
 * @private
 */
function tokensOfCases(cases: string): Array<string> {
    const tokens = new Array<string>();
    let index = cases.indexOf('{');

    while (index >= 0) {
        const end = closingBraceOf(cases, index);

        if (end < 0) {
            break;
        }

        tokens.push(...protectedTokensOf(cases.slice(index + 1, end)));
        index = cases.indexOf('{', end + 1);
    }

    return tokens;
}

/**
 * Removes the placeholders of a value, which stay the same in every locale, so what is left is the text to translate.
 *
 * @public
 * @param value The value.
 * @returns The value without its placeholders.
 */
export function removePlaceholders(value: string): string {
    return value.replace(PLACEHOLDER, '');
}

/**
 * Option names that hold a secret. `resourceKey`, `usedKeys` and `identicalKeys` are ordinary options and do not match.
 */
const SECRET_NAME = /api[-_]?key|secret|token|password|passphrase|credential|authorization/i;

/**
 * A token that a value is filled with from the environment, for example `{env.GEMINI_API_KEY}`.
 */
const ENV_TOKEN = /^\{env\.([A-Z0-9_]+)\}$/;

/**
 * Returns the name of the environment variable that a token refers to.
 *
 * @public
 * @param value The value of an option.
 * @returns The name of the variable, or `null` when the value is no token.
 */
export function readEnvToken(value: unknown): string | null {
    return typeof value === 'string' ? ENV_TOKEN.exec(value)?.[1] ?? null : null;
}

/**
 * Returns whether an option of this name holds a secret, so its value must stay out of runs, change sets and logs.
 *
 * @public
 * @param name The name of the option.
 * @returns `true` when the option holds a secret.
 */
export function isSecretName(name: string): boolean {
    return SECRET_NAME.test(name);
}

/**
 * Returns the names of all secret options in a value, at any depth.
 *
 * @public
 * @param value The value to inspect.
 * @returns The dotted paths of the secret options.
 */
export function findSecretNames(value: unknown, path = ''): Array<string> {
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => findSecretNames(item, `${path}[${index}]`));
    }

    if (typeof value !== 'object' || value === null) {
        return [];
    }

    return Object.entries(value).flatMap(([key, item]) => {
        const itemPath = path ? `${path}.${key}` : key;

        return isSecretName(key) ? [itemPath] : findSecretNames(item, itemPath);
    });
}

// #region Imports

import { parseArgs, type ParseArgsOptionDescriptor } from 'node:util';
import type { IProgramArg } from '@pixel-brewery/utilities';

// #endregion

/**
 * The words that a boolean flag accepts as its value.
 */
const BOOLEAN_WORD = /^(true|false|yes|no|1|0)$/i;

/**
 * What a command line says beyond the parsed values, which already hold the defaults.
 *
 * @internal
 */
export interface ICommandLine {

    /**
     * The options that the command line sets, by the names of the parsed values.
     */
    given: Set<string>;

    /**
     * The words that are no options, such as the sub-command of `changes`.
     */
    positionals: Array<string>;
}

/**
 * Reads a command line the way the program's parser does, for what the parser does not hand over.
 *
 * @internal
 */
export namespace CommandLine {

    /**
     * Lets a boolean flag stand without a value anywhere on the command line. The parser takes the next word as the value
     * of every option, so `--json --type resx` would read `--type` as the value of `--json`.
     *
     * @internal
     * @param argv The command line.
     * @param flags The boolean flags.
     * @returns The command line where every boolean flag without a value says `=true`.
     */
    export function normalizeBooleanFlags(argv: ReadonlyArray<string>, flags: ReadonlyArray<IProgramArg>): Array<string> {
        const longNames = new Map<string, string>();

        for (const flag of flags) {
            const aliases = typeof flag.alias === 'string' ? [flag.alias] : flag.alias;
            const long = aliases.find((alias) => alias.startsWith('--')) ?? aliases[0];

            for (const alias of aliases) {
                longNames.set(alias, long);
            }
        }

        return argv.flatMap((token, index) => {
            const long = longNames.get(token);

            if (!long) {
                return [token];
            }

            return BOOLEAN_WORD.test(argv[index + 1] ?? '') ? [long] : [`${long}=true`];
        });
    }

    /**
     * Returns whether a command line asks for JSON output.
     *
     * @internal
     * @param argv The normalized command line.
     * @returns `true` when the output is JSON.
     */
    export function asksForJson(argv: ReadonlyArray<string>): boolean {
        const index = argv.findIndex((token) => token === '--json' || token.startsWith('--json='));

        if (index < 0) {
            return false;
        }

        const value = argv[index].includes('=') ? argv[index].split('=')[1] : argv[index + 1];

        return !(/^(false|no|0)$/i).test(value ?? '');
    }

    /**
     * Reads the arguments of a command.
     *
     * @internal
     * @param args The arguments behind the name of the command.
     * @param declared The arguments the command declares.
     * @returns The options it sets and its positionals.
     */
    export function read(args: ReadonlyArray<string>, declared: ReadonlyArray<IProgramArg>): ICommandLine {
        const options: Record<string, ParseArgsOptionDescriptor> = {};
        const shortNames = new Map<string, string>();

        for (const arg of declared) {
            const aliases = typeof arg.alias === 'string' ? [arg.alias] : arg.alias;
            const long = aliases.find((alias) => alias.startsWith('--'));
            const short = aliases.find((alias) => !alias.startsWith('--'));
            const name = (long ?? short ?? '').replace(/^-+/, '');

            options[name] = { type: 'string', ...(short?.length === 2 && long ? { short: short.slice(1) } : {}) };

            if (short && short.length > 2) {
                shortNames.set(short, `--${name}`);
            }
        }

        const { tokens } = parseArgs({
            args: args.map((token) => shortNames.get(token) ?? token),
            options,
            strict: false,
            allowPositionals: true,
            tokens: true
        });

        return {
            given: new Set(tokens.filter((token) => token.kind === 'option').map((token) => token.name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()))),
            positionals: tokens.flatMap((token) => token.kind === 'positional' ? [token.value] : [])
        };
    }

}

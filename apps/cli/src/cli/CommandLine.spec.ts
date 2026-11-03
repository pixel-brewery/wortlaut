// #region Imports

import type { IProgramArg } from '@pixel-brewery/utilities';
import { describe, expect, it } from 'vitest';
import { CommandLine } from './CommandLine';

// #endregion

const FLAG: IProgramArg = { alias: ['-dr', '--dry-run'], options: { metavar: 'boolean' } };
const JSON_FLAG: IProgramArg = { alias: '--json', options: { metavar: 'boolean' } };
const ORDER: IProgramArg = { alias: ['-o', '--order'], options: { metavar: 'string' } };
const ROOT: IProgramArg = { alias: ['-rr', '--resource-root'], options: { metavar: 'string' } };

describe('CommandLine', () => {
    describe('normalizeBooleanFlags', () => {
        it('gives a flag without a value the value true', () => {
            // act & assert
            expect(CommandLine.normalizeBooleanFlags(['--json', '--order', 'desc'], [JSON_FLAG])).toEqual(['--json=true', '--order', 'desc']);
            expect(CommandLine.normalizeBooleanFlags(['--order', 'desc', '--json'], [JSON_FLAG])).toEqual(['--order', 'desc', '--json=true']);
        });

        it('keeps the value a flag has, as existing calls write it', () => {
            // act & assert
            expect(CommandLine.normalizeBooleanFlags(['--dry-run', 'true', '-dr', 'false'], [FLAG])).toEqual(['--dry-run', 'true', '--dry-run', 'false']);
        });

        it('does not take a word that is no boolean as the value of a flag', () => {
            // act & assert
            expect(CommandLine.normalizeBooleanFlags(['--json', 'set-1'], [JSON_FLAG])).toEqual(['--json=true', 'set-1']);
        });
    });

    describe('asksForJson', () => {
        it.each([
            [['sort', '--json=true'], true],
            [['sort', '--json', 'true'], true],
            [['sort', '--json', 'false'], false],
            [['sort', '--json=false'], false],
            [['sort'], false]
        ])('reads %j', (argv, expected) => {
            // act & assert
            expect(CommandLine.asksForJson(argv)).toBe(expected);
        });
    });

    describe('read', () => {
        it('tells what was given from what holds its default', () => {
            // act
            const { given } = CommandLine.read(['--order', 'asc', '-rr', 'i18n', '--json=true'], [FLAG, JSON_FLAG, ORDER, ROOT]);

            // assert
            expect(given).toEqual(new Set(['order', 'resourceRoot', 'json']));
        });

        it('hands over the positionals around the options', () => {
            // act
            const { positionals } = CommandLine.read(['apply', '--json=true', 'set-1', '--order', 'asc'], [JSON_FLAG, ORDER]);

            // assert
            expect(positionals).toEqual(['apply', 'set-1']);
        });

        it('does not mistake the value of an option for a positional', () => {
            // act
            const { positionals } = CommandLine.read(['-o', 'asc', 'list'], [ORDER]);

            // assert
            expect(positionals).toEqual(['list']);
        });
    });
});

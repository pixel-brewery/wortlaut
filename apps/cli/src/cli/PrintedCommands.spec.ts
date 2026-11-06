// #region Imports

import { CommandPrinter } from '@pixel-brewery/wortlaut-engine';
import { describe, expect, it } from 'vitest';
import { ANALYZE_COMMAND_ARGS } from './arguments/AnalyzeCommandArgs';
import { DETECT_COMMAND_ARGS } from './arguments/DetectCommandArgs';
import { GENERATE_COMMAND_ARGS } from './arguments/GenerateCommandArgs';
import { SORT_COMMAND_ARGS } from './arguments/SortCommandArgs';
import { TRANSFORM_COMMAND_ARGS } from './arguments/TransformCommandArgs';

// #endregion

const ARGS_BY_COMMAND = {
  analyze: ANALYZE_COMMAND_ARGS,
  detect: DETECT_COMMAND_ARGS,
  generate: GENERATE_COMMAND_ARGS,
  sort: SORT_COMMAND_ARGS,
  transform: TRANSFORM_COMMAND_ARGS,
};

describe('the commands the engine prints', () => {
  it('use only flags the command accepts, so a "Same as" line can run', () => {
    const printed = CommandPrinter.flagsByCommand();

    expect(Object.keys(printed).sort()).toEqual(Object.keys(ARGS_BY_COMMAND).sort());

    for (const [command, args] of Object.entries(ARGS_BY_COMMAND)) {
      const accepted = args.flatMap((arg) => (Array.isArray(arg.alias) ? arg.alias : [arg.alias]));

      for (const flag of printed[command]) {
        expect(accepted, `${command} ${flag}`).toContain(flag);
      }
    }
  });

  it('hold every explicit key in the line that runs, however many there are, so it writes the same files', async () => {
    // arrange
    const keys = Array.from({ length: 500 }, (_key, index) => `loc.item${index}`);
    const line = CommandPrinter.printCommand(
      'generate',
      { strategy: 'codex', keys, resourceRoot: 'i18n' },
      process.cwd(),
    );
    const { GENERATE_COMMAND_ARGS: args } = await import('./arguments/GenerateCommandArgs');
    const flag = args.find((arg) =>
      (Array.isArray(arg.alias) ? arg.alias : [arg.alias]).includes('--keys'),
    );
    const value = /--keys (\S+)/u.exec(line)?.[1] ?? '';

    // assert
    expect((flag?.options?.type as (text: string) => unknown)(value)).toEqual(keys);
  });

  it('never name the option that holds a key', () => {
    expect(Object.values(CommandPrinter.flagsByCommand()).flat()).not.toContain('--api-key');
  });
});

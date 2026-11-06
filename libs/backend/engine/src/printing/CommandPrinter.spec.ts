// #region Imports

import { describe, expect, it } from 'vitest';
import { CommandPrinter } from './CommandPrinter';

// #endregion

const RUN = { cwd: '/work/app', writeMode: 'apply' as const };

describe('CommandPrinter', () => {
  describe('a long list of keys', () => {
    const KEYS = Array.from({ length: 500 }, (_key, index) => `loc.orders.item${index}.title`);
    const command = CommandPrinter.printCommand(
      'generate',
      {
        strategy: 'codex',
        baseLocale: 'en',
        locales: ['de'],
        keys: KEYS,
        type: 'json',
        resourceRoot: 'i18n',
      },
      '/work/app',
    );

    it('stays whole in the command that runs', () => {
      expect(command).toContain(`--keys ${KEYS.join(',')}`);
    });

    it('fits on a screen, and says how many more there are', () => {
      // act
      const shown = CommandPrinter.shorten(command);

      // assert
      expect(shown).toBe(
        'npx wortlaut generate --strategy codex --base-locale en --locales de --keys loc.orders.item0.title,loc.orders.item1.title,loc.orders.item2.title … and 497 more --type json --resource-root i18n',
      );
      expect(shown.length).toBeLessThan(250);
    });

    it('leaves a short list and a command without keys as they are', () => {
      // arrange
      const short = CommandPrinter.printCommand(
        'generate',
        { strategy: 'codex', keys: ['a.b', 'c.d'] },
        '/work/app',
      );

      // assert
      expect(CommandPrinter.shorten(short)).toBe(short);
      expect(CommandPrinter.shorten('npx wortlaut sort --order asc')).toBe(
        'npx wortlaut sort --order asc',
      );
    });

    it('reads a quoted list, and shortens one for every resource root', () => {
      // arrange
      const keys = Array.from({ length: 10 }, (_key, index) => `it's key ${index}`);
      const line = CommandPrinter.printCommand(
        'generate',
        { strategy: 'codex', keys, resourceRoot: ['a', 'b'] },
        '/work/app',
      );

      // act
      const shown = CommandPrinter.shorten(line);

      // assert
      expect(shown.match(/and 7 more/gu)).toHaveLength(2);
      expect(shown).toContain("it'\\''s key 0");
    });

    it('shortens a single key that is too long to read', () => {
      // arrange
      const line = CommandPrinter.printCommand(
        'generate',
        { strategy: 'codex', keys: ['k'.repeat(400)] },
        '/work/app',
      );

      // act
      const shown = CommandPrinter.shorten(line);

      // assert
      expect(shown.length).toBeLessThan(220);
      expect(shown).toContain('…');
    });
  });

  it('prints paths relative to the working directory and lists with commas', () => {
    const line = CommandPrinter.printRun({
      ...RUN,
      command: 'analyze',
      options: {
        type: 'json',
        resourceRoot: '/work/app/i18n',
        root: '/work/app/src',
        preset: 'angular',
        baseLocale: 'en',
        rules: ['empty-values', 'unused-keys'],
        usedKeys: [],
        identicalKeys: [],
        identicalValues: [],
        resourceKeyPrefix: 'loc',
        resourceKeySuffix: '',
      },
    });

    expect(line).toBe(
      'npx wortlaut analyze --type json --resource-root i18n --root src --preset angular --base-locale en --resource-key-prefix loc --rules empty-values,unused-keys',
    );
  });

  it('never prints a key, not even when an option holds one', () => {
    const line = CommandPrinter.printRun({
      ...RUN,
      command: 'generate',
      options: {
        strategy: 'openai',
        apiKey: 'sk-secret',
        locales: ['fr'],
        baseLocale: 'en',
        type: 'json',
        resourceRoot: 'i18n',
        temperature: 0.7,
      },
    });

    expect(line).not.toContain('sk-secret');
    expect(line).not.toContain('api-key');
    expect(line).toBe(
      'npx wortlaut generate --strategy openai --base-locale en --locales fr --temperature 0.7 --type json --resource-root i18n',
    );
  });

  it('quotes what a shell would read as syntax', () => {
    const line = CommandPrinter.printCommand(
      'analyze',
      { usedKeys: ['loc.api.*', "it's"], resourceRoot: 'my files/i18n' },
      '/work',
    );

    expect(line).toBe(
      "npx wortlaut analyze --resource-root 'my files/i18n' --used-keys 'loc.api.*,it'\\''s'",
    );
  });

  it('prints one command per resource root, since one flag names one', () => {
    expect(
      CommandPrinter.printCommand(
        'sort',
        { order: 'asc', type: 'json', resourceRoot: ['/work/a', '/work/b'] },
        '/work',
      ),
    ).toBe(
      'npx wortlaut sort --order asc --type json --resource-root a && npx wortlaut sort --order asc --type json --resource-root b',
    );
  });

  it('states the write mode of a run', () => {
    expect(
      CommandPrinter.printRun({
        ...RUN,
        command: 'sort',
        writeMode: 'dry-run',
        options: { order: 'desc' },
      }),
    ).toBe('npx wortlaut sort --order desc --dry-run');
    expect(
      CommandPrinter.printRun({
        ...RUN,
        command: 'transform',
        writeMode: 'review',
        options: { types: ['ts', 'po'] },
      }),
    ).toBe('npx wortlaut transform --types ts,po --review');
  });

  it('prints the commands of the review list and of settings', () => {
    expect(
      CommandPrinter.printRun({ ...RUN, command: 'changes.apply', options: { id: 'abc-1' } }),
    ).toBe('npx wortlaut changes apply abc-1');
    expect(
      CommandPrinter.printRun({ ...RUN, command: 'changes.discard', options: { id: 'abc-1' } }),
    ).toBe('npx wortlaut changes discard abc-1');
    expect(
      CommandPrinter.printRun({
        ...RUN,
        command: 'config.set',
        options: { key: 'actions.sort.order', value: 'desc' },
      }),
    ).toBe('npx wortlaut config set actions.sort.order desc');
    expect(CommandPrinter.printRun({ ...RUN, command: 'info', options: {} })).toBe(
      'npx wortlaut info',
    );
  });

  it('lists the commands of the CLI without a project', () => {
    const rows = CommandPrinter.listCommands(null);

    expect(rows.find((row) => row.label === 'Analyze')?.command).toBe('npx wortlaut analyze');
    expect(rows.map((row) => row.label)).toEqual([
      'Detect',
      'Analyze',
      'Generate',
      'Sort',
      'Transform',
      'Environment',
      'AI providers',
      'Set up a project',
      'Read or change a setting',
      'Review list',
      'Rule packs',
      'MCP server',
    ]);
  });

  it('prints a run on all projects', () => {
    expect(CommandPrinter.printRunMany('yarn', 'intl', 'analyze')).toBe(
      'yarn nx run-many --target=intl --configuration=analyze',
    );
  });
});

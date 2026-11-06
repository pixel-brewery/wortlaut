// #region Imports

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRANSFORM_COMMAND_ARGS_CONFIG } from '../arguments/configurations/ITransformCommandArgsConfig';
import { TYPE_ARG, TYPES_ARG } from '../arguments/TransformCommandArgs';
import { TransformCommand } from './TransformCommand';

// #endregion

describe('TransformCommand', () => {
  it('names itself and declares its arguments', () => {
    // arrange
    const command = new TransformCommand(
      { ...DEFAULT_TRANSFORM_COMMAND_ARGS_CONFIG },
      {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      } as unknown as ILogger,
      new FileSystem(),
    );

    // act
    const aliases = command.args?.flatMap((x) => x.alias);

    // assert
    expect(command.name).toBe('transform');
    expect(aliases).toEqual(
      expect.arrayContaining([
        '--types',
        '--type',
        '--resource-root',
        '--dry-run',
        '--review',
        '--json',
      ]),
    );
  });

  it('accepts the PO format', () => {
    // act
    const choices = TYPE_ARG.options.choices;

    // assert
    expect(choices).toContain('po');
  });

  it('writes the target files through a change set', async () => {
    // arrange
    const root = mkdtempSync(join(tmpdir(), 'wortlaut-transform-'));
    writeFileSync(join(root, 'lang.en.json'), JSON.stringify({ a: 'A', b: 'B' }));
    const command = new TransformCommand(
      { ...DEFAULT_TRANSFORM_COMMAND_ARGS_CONFIG },
      {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      } as unknown as ILogger,
      new FileSystem(),
    );
    command.configure({
      ...DEFAULT_TRANSFORM_COMMAND_ARGS_CONFIG,
      resourceRoot: root,
      types: ['resx'],
    });

    try {
      // act
      const result = await command.execute();

      // assert
      expect(result.canceled).toBe(false);
      expect(readFileSync(join(root, 'lang.en.resx'), 'utf8')).toContain('<data name="a"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads its target types as a comma-separated list', () => {
    // act
    const types = (TYPES_ARG.options.type as (value: string) => Array<string>)('ts, resx');

    // assert
    expect(types).toEqual(['ts', 'resx']);
  });
});

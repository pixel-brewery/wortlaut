// #region Imports

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findMcpCommand } from './McpConnection';

// #endregion

describe('findMcpCommand', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wortlaut-connection-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('takes the command line next to the app, because that is what really runs here', () => {
    // arrange
    const cli = join(root, 'wortlaut.js');

    writeFileSync(cli, '');

    // act
    const command = findMcpCommand(cli, '/usr/bin/node');

    // assert
    expect(command).toEqual({
      command: ['node', cli, 'mcp'],
      isPublished: false,
      ready: true,
      problem: null,
    });
  });

  it('is honest when Node.js is missing', () => {
    // arrange
    const cli = join(root, 'wortlaut.js');

    writeFileSync(cli, '');

    // act
    const command = findMcpCommand(cli, null);

    // assert
    expect(command.ready).toBe(false);
    expect(command.problem).toContain('Node.js');
  });

  it('falls back to the published package, and does not claim that it can start', () => {
    // act
    const command = findMcpCommand(join(root, 'nothing.js'), '/usr/bin/node');

    // assert
    expect(command.command).toEqual(['npx', '-y', '@pixel-brewery/wortlaut-app', 'mcp']);
    expect(command.isPublished).toBe(true);
    expect(command.ready).toBe(false);
    expect(command.problem).toContain('registry');
  });
});

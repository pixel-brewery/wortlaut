// #region Imports

import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MCP_LEVEL_FILE_NAME, McpLevelStore } from './McpLevelStore';

// #endregion

describe('McpLevelStore', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wortlaut-levels-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('knows no level until one was chosen', () => {
    // act
    const level = new McpLevelStore(root).read();

    // assert
    expect(level).toBeNull();
  });

  it('stores a level in a private file of the profile', () => {
    // arrange
    const store = new McpLevelStore(root);

    // act
    store.write('propose');

    // assert
    expect(new McpLevelStore(root).read()).toBe('propose');
    expect(statSync(join(root, MCP_LEVEL_FILE_NAME)).mode & 0o777).toBe(
      process.platform === 'win32' ? 0o666 : 0o600,
    );
  });

  it.each(['not json', '{}', '{"level":"admin"}', '{"level":"write","extra":true}'])(
    'counts a file it cannot trust as no level: %s',
    (content) => {
      // arrange
      writeFileSync(join(root, MCP_LEVEL_FILE_NAME), content);

      // act
      const level = new McpLevelStore(root).read();

      // assert
      expect(level).toBeNull();
    },
  );
});

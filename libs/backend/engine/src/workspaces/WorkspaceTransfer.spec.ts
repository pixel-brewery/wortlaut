// #region Imports

import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ILogger } from '@pixel-brewery/utilities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WortlautEngine } from '../WortlautEngine';

// #endregion

const LOGGER = {
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as ILogger;

describe('WorkspaceTransfer', () => {
  let root: string;
  let engine: WortlautEngine;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-transfer-')));
    engine = new WortlautEngine({
      surface: 'desktop',
      logger: LOGGER,
      profileRoot: join(root, 'profile'),
      home: root,
      env: {},
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function repositoryOf(name: string): string {
    const repository = join(root, name);

    mkdirSync(join(repository, 'i18n'), { recursive: true });
    writeFileSync(join(repository, 'i18n', 'lang.en.json'), '{"a":"A"}');
    writeFileSync(
      join(repository, 'wortlaut.config.json'),
      JSON.stringify({ actions: { detect: { resourceRoot: 'i18n' } } }),
    );

    return repository;
  }

  it('round-trips the settings of a workspace, and only those', () => {
    // arrange
    const { workspaceId } = engine.workspaces.create({
      name: 'Acme',
      code: 'AC',
      color: 'violet',
      repository: repositoryOf('shop'),
    });

    engine.workspaces.update(workspaceId, {
      name: 'Acme',
      code: 'AC',
      color: 'violet',
      scanForProjects: false,
      defaults: { baseLocale: 'en', targetLocales: ['de', 'fr'], preset: 'react' },
      removeRepositories: [],
      addRepositories: [],
    });

    // act
    const preview = engine.transfer.preview(engine.transfer.exportText(workspaceId), 'acme.json');

    // assert
    expect(preview).toMatchObject({
      name: 'Acme',
      code: 'AC',
      color: 'violet',
      scanForProjects: false,
      defaults: { baseLocale: 'en', targetLocales: ['de', 'fr'], preset: 'react' },
      repositories: [{ name: 'shop' }],
      packs: [],
      nameTaken: true,
    });
  });

  it('adds a new workspace and leaves the one of the same name alone', async () => {
    // arrange
    const { workspaceId } = engine.workspaces.create({
      name: 'Acme',
      code: 'AC',
      color: 'violet',
      repository: repositoryOf('shop'),
    });
    const before = engine.workspaces.require(workspaceId);
    const { importId } = engine.transfer.preview(
      engine.transfer.exportText(workspaceId),
      'acme.json',
    );

    // act
    const added = await engine.transfer.add(importId, [repositoryOf('elsewhere')], true);

    // assert
    expect(added.workspaceId).not.toBe(workspaceId);
    expect(engine.workspaces.require(workspaceId)).toEqual(before);
    expect(engine.workspaces.require(added.workspaceId).repositories).toEqual([
      join(root, 'elsewhere'),
    ]);
  });

  it('gains no folder from the file: without a chosen folder the workspace has none, and nothing can be written', async () => {
    // arrange
    const { importId } = engine.transfer.preview(
      JSON.stringify({
        format: 'wortlaut-workspace',
        schemaVersion: 1,
        workspace: {
          name: 'Moved',
          code: 'M',
          color: 'teal',
          scanForProjects: true,
          defaults: { baseLocale: null, targetLocales: [], preset: null },
          repositories: [{ name: '/etc' }],
          packs: [],
        },
      }),
      'moved.json',
    );

    // act
    const { workspaceId, discovered } = await engine.transfer.add(importId, [], true);

    // assert
    expect(discovered).toBe(0);
    expect(engine.workspaces.require(workspaceId).repositories).toEqual([]);
    expect(() => engine.workspaces.requireInsideKnownRoots('/etc/hosts')).toThrow(
      'outside of the folders you chose',
    );
  });

  it('uses a checked file once', async () => {
    // arrange
    const { importId } = engine.transfer.preview(
      JSON.stringify({
        format: 'wortlaut-workspace',
        schemaVersion: 1,
        workspace: {
          name: 'Moved',
          code: 'M',
          color: 'teal',
          scanForProjects: true,
          defaults: { baseLocale: null, targetLocales: [], preset: null },
          repositories: [],
          packs: [],
        },
      }),
      'moved.json',
    );

    await engine.transfer.add(importId, [], true);

    // act & assert
    await expect(engine.transfer.add(importId, [], true)).rejects.toThrow('no longer available');
  });

  it('never installs a pack that comes with a repository, whatever its source says', async () => {
    // arrange
    const repository = repositoryOf('shop');
    const { importId } = engine.transfer.preview(
      JSON.stringify({
        format: 'wortlaut-workspace',
        schemaVersion: 1,
        workspace: {
          name: 'Moved',
          code: 'M',
          color: 'teal',
          scanForProjects: true,
          defaults: { baseLocale: null, targetLocales: [], preset: null },
          repositories: [{ name: 'shop' }],
          packs: [
            {
              id: 'evil',
              name: 'Evil',
              source: 'folder:../../etc',
              version: null,
              commit: null,
              hash: `sha256:${'b'.repeat(64)}`,
            },
          ],
        },
      }),
      'moved.json',
    );

    // act
    const { packs } = await engine.transfer.add(importId, [repository], true);

    // assert
    expect(packs).toEqual([
      {
        name: 'Evil',
        state: 'skipped',
        detail: expect.stringContaining('comes with its repository'),
      },
    ]);
    expect(existsSync(join(repository, 'wortlaut.lock.json'))).toBe(false);
  });
});

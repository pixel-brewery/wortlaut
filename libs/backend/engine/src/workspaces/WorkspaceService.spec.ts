// #region Imports

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QUIET_LOGGER } from '../io/QuietLogger';
import { WortlautEngine } from '../WortlautEngine';

// #endregion

describe('WorkspaceService', () => {
  let root: string;
  let repository: string;
  let engine: WortlautEngine;

  const write = (path: string, content: unknown): void => {
    const file = join(repository, path);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(content));
  };

  const writeNxProject = (name: string): void => {
    write(`apps/${name}/project.json`, {
      name,
      targets: { intl: { executor: '@pixel-brewery/wortlaut-nx-tasks:wortlaut' } },
    });
  };

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-workspaces-')));
    repository = join(root, 'acme');
    engine = new WortlautEngine({
      surface: 'desktop',
      logger: QUIET_LOGGER,
      profileRoot: join(root, 'profile'),
      home: root,
      env: {},
    });
    write('nx.json', {});
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('discovers Nx targets added after workspace creation and preserves existing project records', () => {
    writeNxProject('studio');
    const { workspaceId } = engine.workspaces.create({
      name: 'Acme',
      code: 'AC',
      color: 'blue',
      repository,
    });
    const [studio] = engine.workspaces.require(workspaceId).projects;

    engine.workspaces.rememberSnapshot(studio.id, { keyCount: 1, locales: ['en'] });
    write('manual/i18n/lang.en.json', { title: 'Title' });
    engine.workspaces.register({
      inspection: engine.inspector.inspect(join(repository, 'manual')),
      workspace: { kind: 'existing', id: workspaceId },
      preset: 'angular',
      baseLocale: 'en',
      targetLocales: ['de'],
    });
    const existing = engine.workspaces.require(workspaceId).projects;

    writeNxProject('showcase');

    const opened = engine.workspaces.open(workspaceId);

    expect(opened.projects).toHaveLength(3);
    expect(opened.projects).toEqual(expect.arrayContaining(existing));
    expect(opened.projects).toContainEqual(
      expect.objectContaining({
        name: 'showcase',
        folder: join(repository, 'apps', 'showcase'),
        kind: 'nx-target',
        nxTarget: 'intl',
      }),
    );
    expect(engine.workspaces.require(workspaceId).projects).toEqual(opened.projects);
    expect(engine.workspaces.open(workspaceId).projects).toEqual(opened.projects);
  });

  it('does not register newly configured projects on open when scanning is disabled', () => {
    const { workspaceId } = engine.workspaces.adopt({
      name: 'Acme',
      code: 'AC',
      color: 'blue',
      repositories: [repository],
      scanForProjects: false,
      defaults: { baseLocale: null, targetLocales: [], preset: null },
    });

    writeNxProject('showcase');

    expect(engine.workspaces.open(workspaceId).projects).toEqual([]);
  });
});

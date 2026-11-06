// #region Imports

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { ProjectList, RunBatch } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectStateBadge, ProjectsViewPresenter } from './ProjectsViewPresenter';

// #endregion

const WORKSPACE = { id: 'w1', code: 'AC', color: 'teal', name: 'Acme' } as const;
const STATE = {
  workspace: WORKSPACE,
  project: null,
  provider: null,
  dryRun: true,
  pendingChanges: 0,
};
const LIST: ProjectList = {
  workspace: WORKSPACE,
  folder: '~/code/acme',
  nxTarget: 'intl',
  totalKeys: 1300,
  rows: [
    {
      id: 'p1',
      name: 'shop',
      folder: 'apps/shop',
      keys: 1000,
      locales: ['en', 'de'],
      state: { kind: 'failing', rules: 2 },
    },
    {
      id: 'p2',
      name: 'admin',
      folder: 'apps/admin',
      keys: 300,
      locales: ['en'],
      state: { kind: 'clean' },
    },
    {
      id: 'p3',
      name: 'old',
      folder: 'apps/old',
      keys: null,
      locales: [],
      state: { kind: 'folder-missing' },
    },
    {
      id: 'p4',
      name: 'new',
      folder: 'libs/new',
      keys: 0,
      locales: [],
      state: { kind: 'not-analyzed' },
    },
  ],
  sameAs: {
    detect: 'yarn nx run-many --target=intl --configuration=detect',
    analyze: 'yarn nx run-many --target=intl --configuration=analyze',
    transform: 't',
    sort: 's',
    generate: 'g',
  },
  sharedDefaults: [{ label: 'Preset', value: 'angular' }],
};

const BATCH: RunBatch = {
  id: 'b1',
  workspaceId: 'w1',
  command: 'analyze',
  dryRun: true,
  startedAt: '2026-11-02T10:00:00.000Z',
  concurrency: 4,
  rows: [
    {
      projectId: 'p1',
      projectName: 'shop',
      runId: 'run0',
      state: 'succeeded',
      summary: '1 rule failing',
      failure: null,
    },
    {
      projectId: 'p2',
      projectName: 'admin',
      runId: 'run1',
      state: 'failed',
      summary: null,
      failure: 'It broke.',
    },
    {
      projectId: 'p3',
      projectName: 'old',
      runId: 'run2',
      state: 'running',
      summary: null,
      failure: null,
    },
    {
      projectId: 'p4',
      projectName: 'new',
      runId: 'run3',
      state: 'waiting',
      summary: null,
      failure: null,
    },
  ],
};

function setUp(overrides: { list?: ProjectList; state?: unknown; batch?: RunBatch | null } = {}) {
  const navigate = vi.fn(() => Promise.resolve(true));
  const api = {
    onEvent: () => () => undefined,
    request: vi.fn((method: string, _payload: unknown): Promise<unknown> => {
      switch (method) {
        case 'project.list':
          return Promise.resolve(overrides.list ?? LIST);
        case 'dialog.chooseFolder':
          return Promise.resolve({ folder: { token: 't1', displayPath: '~/x', name: 'x' } });
        case 'run.active':
          return Promise.resolve([]);
        case 'run.startAll':
          return Promise.resolve(
            LIST.rows.map((row, index) => ({
              id: `run${index}`,
              command: 'analyze',
              projectId: row.id,
              projectName: row.name,
              title: 'analyze',
              startedAt: new Date().toISOString(),
              dryRun: true,
              phase: index === 0 ? 'Starting' : 'Waiting',
              completed: 0,
              total: 0,
              detail: null,
              batch: { id: 'b1', index, total: LIST.rows.length },
              log: [],
            })),
          );
        case 'run.cancelBatch':
          return Promise.resolve({});
        case 'run.batch':
          return Promise.resolve(overrides.batch === undefined ? BATCH : overrides.batch);
        default:
          return Promise.resolve(overrides.state ?? STATE);
      }
    }),
  };

  TestBed.configureTestingModule({
    providers: [
      ProjectsViewPresenter,
      { provide: DesktopApi, useValue: api },
      { provide: Router, useValue: { navigate } },
    ],
  });

  return {
    presenter: TestBed.inject(ProjectsViewPresenter),
    api,
    navigate,
    session: TestBed.inject(ShellSession),
  };
}

describe('projectStateBadge', () => {
  it('shows the last result, and says when there is none', () => {
    expect(projectStateBadge({ kind: 'not-analyzed' })).toEqual({
      label: 'Not analyzed',
      variant: 'neutral',
    });
    expect(projectStateBadge({ kind: 'clean' })).toEqual({ label: 'Complete', variant: 'success' });
    expect(projectStateBadge({ kind: 'failing', rules: 1 })).toEqual({
      label: '1 rule failing',
      variant: 'warning',
    });
    expect(projectStateBadge({ kind: 'folder-missing' })).toEqual({
      label: 'Folder is gone',
      variant: 'danger',
    });
  });
});

describe('ProjectsViewPresenter', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('bounds displayed projects while retaining the complete bulk command scope', async () => {
    // arrange
    const rows = Array.from({ length: 150 }, (_, index) => ({
      ...LIST.rows[0],
      id: `project-${index}`,
    }));
    const { presenter, api } = setUp({ list: { ...LIST, rows }, batch: null });
    await presenter.list.reload();
    expect(presenter.visibleRows()).toHaveLength(100);
    expect(presenter.rows()).toHaveLength(150);

    // act
    presenter.showMoreRows();
    await presenter.runAll();

    // assert
    expect(presenter.visibleRows().at(-1)?.id).toBe('project-149');
    expect(presenter.hasMoreRows()).toBe(false);
    expect(api.request).toHaveBeenCalledWith('run.startAll', {
      workspaceId: 'w1',
      command: 'analyze',
    });
  });

  it('bounds batch rows without reducing total progress or hiding the final result', async () => {
    // arrange
    const rows = Array.from({ length: 150 }, (_, index) => ({
      ...BATCH.rows[0],
      projectId: `project-${index}`,
      runId: `run-${index}`,
    }));
    const { presenter, session } = setUp({ batch: { ...BATCH, rows } });
    await session.refresh();
    await presenter.loadBatch();
    expect(presenter.visibleBatchRows()).toHaveLength(100);

    // act
    presenter.showMoreBatchRows();

    // assert
    expect(presenter.visibleBatchRows().at(-1)?.runId).toBe('run-149');
    expect(presenter.batchProgress()).toMatchObject({ total: 150, finished: 150 });
  });

  it('closes the open project, since the view belongs to the workspace', async () => {
    const { presenter, api } = setUp();

    await presenter.list.reload();

    expect(api.request).toHaveBeenCalledWith('shell.setProject', { projectId: null });
    expect(api.request).toHaveBeenCalledWith('project.list', { workspaceId: 'w1' });
  });

  it('fails plainly without an open workspace', async () => {
    const { presenter } = setUp({ state: { ...STATE, workspace: null } });

    await presenter.list.reload();

    expect(presenter.list.error()).toBe('No workspace is open.');
  });

  it('writes the line below the title', async () => {
    const { presenter } = setUp();

    await presenter.list.reload();

    expect(presenter.subtitle()).toBe(
      '4 Nx projects with the target intl · 1,300 keys · found in ~/code/acme',
    );
  });

  it('leaves the target out for a workspace without Nx', async () => {
    const { presenter } = setUp({
      list: { ...LIST, nxTarget: null, sameAs: null, rows: LIST.rows.slice(0, 1) },
    });

    await presenter.list.reload();

    expect(presenter.subtitle()).toBe('1 project · 1,300 keys · found in ~/code/acme');
    expect(presenter.sameAs()).toBeNull();
  });

  it('lets the run button and the same-as line follow the command', async () => {
    const { presenter } = setUp();

    await presenter.list.reload();

    expect(presenter.runLabel()).toBe('Run analyze');
    expect(presenter.sameAs()).toBe('yarn nx run-many --target=intl --configuration=analyze');

    presenter.pickCommand('detect');

    expect(presenter.runLabel()).toBe('Run detect');
    expect(presenter.sameAs()).toBe('yarn nx run-many --target=intl --configuration=detect');
    expect(
      presenter
        .commands()
        .filter((command) => command.isChecked)
        .map((command) => command.id),
    ).toEqual(['detect']);
  });

  it('runs a command on all projects, shows how far each one is, and can stop them', async () => {
    // arrange
    const { presenter, api, session } = setUp();

    await session.refresh();
    await presenter.list.reload();

    // act
    await presenter.runAll();

    // assert
    expect(api.request).toHaveBeenCalledWith('run.startAll', {
      workspaceId: 'w1',
      command: 'analyze',
    });
    expect(presenter.isRunning()).toBe(true);
    expect(presenter.canRun()).toBe(false);
    expect(presenter.batchRows().map((row) => [row.projectName, row.badge.label])).toEqual([
      ['shop', 'Done'],
      ['admin', 'Failed'],
      ['old', 'Running'],
      ['new', 'Waiting'],
    ]);
    expect(presenter.batchProgress().text).toBe('2 of 4 projects finished, 1 failed');
    expect(presenter.batchTitle()).toBe('Analyze, dry run');

    // act
    await presenter.cancelAll();

    // assert
    expect(api.request).toHaveBeenCalledWith('run.cancelBatch', { batchId: 'b1' });
  });

  it('runs Generate on all projects as well, and says what it does', async () => {
    // arrange
    const { presenter, api } = setUp({ batch: null });

    await presenter.list.reload();

    // act
    presenter.pickCommand('generate');
    await presenter.runAll();

    // assert
    expect(presenter.runLabel()).toBe('Run generate');
    expect(presenter.runNote()).toContain('one project at a time');
    expect(api.request).toHaveBeenCalledWith('run.startAll', {
      workspaceId: 'w1',
      command: 'generate',
    });
  });

  it('filters by text and by what needs attention', async () => {
    const { presenter } = setUp();

    await presenter.list.reload();

    expect(presenter.rows().map((row) => row.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(presenter.footer()).toBe('4 projects');

    presenter.pickFilter('attention');
    expect(presenter.rows().map((row) => row.id)).toEqual(['p1', 'p3']);
    expect(presenter.footer()).toBe('2 of 4 projects');

    presenter.pickFilter('all');
    presenter.searchForm.text().value.set(' LIBS/');
    expect(presenter.rows().map((row) => row.id)).toEqual(['p4']);

    presenter.searchForm.text().value.set('nothing like this');
    expect(presenter.rows()).toEqual([]);
  });

  it('writes a dash for a project that could not be read', async () => {
    const { presenter } = setUp();

    await presenter.list.reload();

    expect(presenter.keysOf(LIST.rows[0])).toBe('1,000');
    expect(presenter.keysOf(LIST.rows[2])).toBe('–');
  });

  it('opens a project through main', async () => {
    const { presenter, api, navigate } = setUp();

    await presenter.open('p1');

    expect(api.request).toHaveBeenCalledWith('shell.setProject', { projectId: 'p1' });
    expect(navigate).toHaveBeenCalledWith(['/overview']);
  });

  it('adds a project through the dialog and Project setup, for this workspace', async () => {
    const { presenter, navigate, session } = setUp();

    await session.refresh();
    await presenter.addProject();

    expect(navigate).toHaveBeenCalledWith(['/setup'], {
      queryParams: { folder: 't1', workspace: 'w1' },
    });
  });
});

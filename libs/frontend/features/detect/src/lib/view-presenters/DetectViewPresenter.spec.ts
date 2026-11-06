// #region Imports

import { TestBed } from '@angular/core/testing';
import type {
  DetectRow,
  DetectScanResult,
  DetectSettings,
} from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeHint, DetectViewPresenter } from './DetectViewPresenter';

// #endregion

const SETTINGS: DetectSettings = {
  presets: [{ id: 'angular', name: 'Angular', extensions: ['.html', '.ts'] }],
  preset: 'angular',
  sourceRoot: 'src',
  prefix: 'loc',
  suffix: '',
  format: 'json',
};

const ROW: DetectRow = {
  id: 'r1',
  value: 'Ready to go',
  file: 'src/panel.html',
  location: 'panel.html:2',
  line: 2,
  column: 4,
  key: 'loc.ready.to.go',
  hint: { kind: 'new' },
  canApply: true,
  before: "<h2>{{ 'Ready to go' | translate }}</h2>",
  after: "<h2>{{ 'loc.ready.to.go' | translate }}</h2>",
  around: { head: "<h2>{{ '", tail: "' | translate }}</h2>" },
};

const SCAN: DetectScanResult = {
  scanId: 's1',
  filesScanned: 3,
  stringsFound: 5,
  alreadyKeys: 3,
  hardCoded: 2,
  rows: [
    ROW,
    {
      ...ROW,
      id: 'r2',
      value: 'In a test',
      key: 'in.a.test',
      hint: { kind: 'test' },
      canApply: false,
      after: 'Ignored, because it is a test file',
      around: null,
    },
  ],
  truncated: false,
};

function setUp(applied: 'applied' | 'pending' | Error = 'pending') {
  const request = vi.fn((method: string, _payload: unknown): Promise<unknown> => {
    switch (method) {
      case 'shell.state':
        return Promise.resolve({
          workspace: { id: 'w1', code: 'S', color: 'teal', name: 'Shop' },
          project: { id: 'p1', name: 'shop' },
          provider: null,
          dryRun: true,
          pendingChanges: 0,
        });
      case 'detect.settings':
        return Promise.resolve(SETTINGS);
      case 'run.print':
        return Promise.resolve({ command: 'npx wortlaut detect --preset angular' });
      case 'run.active':
        return Promise.resolve([]);
      case 'run.latest':
        return Promise.resolve(null);
      case 'run.start':
        return Promise.resolve({
          id: 'run1',
          command: 'detect',
          projectId: 'p1',
          projectName: 'shop',
          title: 'detect',
          startedAt: new Date().toISOString(),
          dryRun: true,
          phase: 'Starting',
          completed: 0,
          total: 0,
          detail: null,
          batch: null,
          log: [],
        });
      case 'run.result':
        return Promise.resolve({
          runId: 'run1',
          command: 'detect',
          projectId: 'p1',
          state: 'succeeded',
          dryRun: true,
          failure: null,
          outcome: null,
          output: { command: 'detect', scan: SCAN },
        });
      case 'run.cancel':
        return Promise.resolve({});
      case 'detect.apply':
        return applied instanceof Error
          ? Promise.reject(applied)
          : Promise.resolve({
              state: applied,
              changeSetId: 'c1',
              runId: 'r9',
              files: ['src/panel.html'],
            });
      default:
        return Promise.reject(new Error(`Unexpected ${method}`));
    }
  });
  let listener: ((event: unknown) => void) | null = null;

  TestBed.configureTestingModule({
    providers: [
      DetectViewPresenter,
      {
        provide: DesktopApi,
        useValue: {
          request,
          onEvent: (handler: (event: unknown) => void) => {
            listener = handler;

            return () => undefined;
          },
        },
      },
    ],
  });

  const finish = (): void =>
    listener?.({
      type: 'run.finished',
      runId: 'run1',
      command: 'detect',
      projectId: 'p1',
      state: 'succeeded',
      failure: null,
    });

  return {
    presenter: TestBed.inject(DetectViewPresenter),
    session: TestBed.inject(ShellSession),
    request,
    finish,
  };
}

async function scanned(applied: 'applied' | 'pending' | Error = 'pending') {
  const context = setUp(applied);

  await context.session.refresh();
  await context.presenter.load();

  const scan = context.presenter.scan();

  await vi.waitFor(() => {
    expect(context.presenter.run.isRunning()).toBe(true);
  });
  context.finish();
  await scan;

  return context;
}

describe('describeHint', () => {
  it('says what a row is', () => {
    expect(describeHint({ kind: 'reuse', key: 'loc.a' })).toBe('Reuse loc.a');
    expect(describeHint({ kind: 'new' })).toBe('New key');
    expect(describeHint({ kind: 'test' })).toBe('Test file');
  });
});

describe('DetectViewPresenter', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('starts from the settings of the project and prints the same command', async () => {
    // arrange
    const { presenter, session } = setUp();

    await session.refresh();

    // act
    await presenter.load();

    // assert
    expect(presenter.form.preset().value()).toBe('angular');
    expect(presenter.presets()).toEqual([{ id: 'angular', label: 'Angular (.html, .ts)' }]);
    expect(presenter.sameAs.value()).toContain('wortlaut detect');
    expect(presenter.figures()[0]).toEqual({ label: 'Files scanned', value: '–' });
  });

  it('shows the figures and rows of a scan and selects the first row', async () => {
    // act
    const { presenter } = await scanned();

    // assert
    expect(presenter.figures().map((figure) => figure.value)).toEqual(['3', '5', '3', '2']);
    expect(presenter.rows().map((row) => row.hintText)).toEqual(['New key', 'Test file']);
    expect(presenter.selectedRow()?.id).toBe('r1');
  });

  it('takes a key the user names into the change and into the request', async () => {
    // arrange
    const { presenter, request } = await scanned();

    // act
    presenter.nameKey('loc.nice.name');
    await presenter.applySelected();

    // assert
    expect(presenter.selectedAfter()).toBe("<h2>{{ 'loc.nice.name' | translate }}</h2>");
    expect(request).toHaveBeenCalledWith('detect.apply', {
      projectId: 'p1',
      scanId: 's1',
      rows: [{ rowId: 'r1', key: 'loc.nice.name' }],
    });
  });

  it('refuses a key that holds a space', async () => {
    // arrange
    const { presenter } = await scanned();

    // act
    presenter.nameKey('not a key');

    // assert
    expect(presenter.keyError()).toContain('letters');
    expect(presenter.canApply()).toBe(false);
  });

  it('ignores a row in this scan', async () => {
    // arrange
    const { presenter } = await scanned();

    // act
    presenter.ignore();

    // assert
    expect(presenter.rows().map((row) => row.id)).toEqual(['r2']);
  });

  it('applies only what can be applied, marks it as waiting while dry run is on', async () => {
    // arrange
    const { presenter, request } = await scanned('pending');

    // act
    await presenter.applyAll();

    // assert
    expect(request).toHaveBeenCalledWith(
      'detect.apply',
      expect.objectContaining({ rows: [{ rowId: 'r1', key: 'loc.ready.to.go' }] }),
    );
    expect(presenter.outcome()?.state).toBe('pending');
    expect(presenter.rows()[0].hintText).toBe('Waiting in Review');
    expect(presenter.canApplyAll()).toBe(false);
  });

  it('shows a page of rows at a time, and says when a scan holds only the first strings', async () => {
    // arrange
    const rows = Array.from({ length: 250 }, (_item, index) => ({ ...ROW, id: `r${index}` }));
    const { presenter, session, request, finish } = setUp();

    request.mockImplementation((method: string, payload: unknown) =>
      method === 'run.result'
        ? Promise.resolve({
            runId: 'run1',
            command: 'detect',
            projectId: 'p1',
            state: 'succeeded',
            dryRun: true,
            failure: null,
            outcome: null,
            output: { command: 'detect', scan: { ...SCAN, hardCoded: 9000, rows } },
          })
        : ((
            {
              'shell.state': Promise.resolve({
                workspace: { id: 'w1', code: 'S', color: 'teal', name: 'Shop' },
                project: { id: 'p1', name: 'shop' },
                provider: null,
                dryRun: true,
                pendingChanges: 0,
              }),
              'detect.settings': Promise.resolve(SETTINGS),
              'run.print': Promise.resolve({ command: 'x' }),
              'run.active': Promise.resolve([]),
              'run.latest': Promise.resolve(null),
              'run.start': Promise.resolve({
                id: 'run1',
                command: 'detect',
                projectId: 'p1',
                projectName: 'shop',
                title: 'detect',
                startedAt: new Date().toISOString(),
                dryRun: true,
                phase: 'Starting',
                completed: 0,
                total: 0,
                detail: null,
                batch: null,
                log: [],
              }),
            } as Record<string, Promise<unknown>>
          )[method] ?? Promise.reject(new Error(`${method} ${String(payload)}`))),
    );
    await session.refresh();
    await presenter.load();

    // act
    const scan = presenter.scan();

    await vi.waitFor(() => {
      expect(presenter.run.isRunning()).toBe(true);
    });
    finish();
    await scan;

    // assert
    expect(presenter.rows()).toHaveLength(200);
    expect(presenter.hasMoreRows()).toBe(true);
    expect(presenter.boundNote()).toContain('first 250 of 9,000');

    // act
    presenter.showMore();

    // assert
    expect(presenter.rows()).toHaveLength(250);
    expect(presenter.hasMoreRows()).toBe(false);
  });

  it('names the file when the source changed since the scan', async () => {
    // arrange
    const { presenter } = await scanned(
      new Error('src/panel.html changed since the scan. Nothing was written. Scan again.'),
    );

    // act
    await presenter.applySelected();

    // assert
    expect(presenter.message()).toContain('src/panel.html changed');
  });

  it('replaces the generated keys with proposals and writes nothing', async () => {
    // arrange
    const { presenter, request } = await scanned();
    const original = request.getMockImplementation() as (
      method: string,
      payload: unknown,
    ) => Promise<unknown>;

    request.mockImplementation((method: string, payload: unknown) =>
      method === 'ai.nameKeys'
        ? Promise.resolve({
            names: [{ rowId: 'r1', key: 'loc.greeting.ready' }],
            providerName: 'OpenAI',
            dropped: ['The name BAD KEY breaks the rules of a key and was left out.'],
          })
        : original(method, payload),
    );

    // act
    await presenter.nameKeysWithAi();

    // assert
    expect(presenter.rows().find((row) => row.id === 'r1')?.key).toBe('loc.greeting.ready');
    expect(presenter.aiNote()).toMatchObject({ variant: 'warning', header: 'OpenAI named 1 keys' });
    expect(presenter.aiNote()?.content).toContain('left out');
    expect(request.mock.calls.map(([method]) => method)).not.toContain('detect.apply');
  });

  it('says when no provider is set up', async () => {
    // arrange
    const { presenter, request } = await scanned();
    const original = request.getMockImplementation() as (
      method: string,
      payload: unknown,
    ) => Promise<unknown>;

    request.mockImplementation((method: string, payload: unknown) =>
      method === 'ai.nameKeys'
        ? Promise.reject(new Error('No AI provider is set up. Open Settings: AI to connect one.'))
        : original(method, payload),
    );

    // act
    await presenter.nameKeysWithAi();

    // assert
    expect(presenter.aiNote()).toMatchObject({
      header: 'No names were proposed',
      content: 'No AI provider is set up. Open Settings: AI to connect one.',
    });
  });
});

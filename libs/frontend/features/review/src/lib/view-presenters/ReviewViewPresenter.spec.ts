// #region Imports

import { TestBed } from '@angular/core/testing';
import type { ReviewDetail, ReviewItem } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewViewPresenter, titleOf } from './ReviewViewPresenter';

// #endregion

const ITEM: ReviewItem = {
  id: 'c1',
  command: 'sort',
  surface: 'desktop',
  detail: null,
  createdAt: new Date().toISOString(),
  projectName: 'shop',
  partial: false,
  fileCount: 2,
  findingCount: 0,
  conflicts: [],
};
const DETAIL: ReviewDetail = {
  ...ITEM,
  files: [
    {
      file: 'lang.en.json',
      action: 'update',
      additions: 1,
      deletions: 1,
      hasConflict: false,
      hunks: [],
      truncated: false,
    },
  ],
  findings: [],
};

function setUp(state: {
  dryRun: boolean;
  items?: Array<ReviewItem>;
  detail?: ReviewDetail;
  apply?: () => Promise<unknown>;
}) {
  let items = state.items ?? [ITEM];
  const shell = {
    workspace: { id: 'w1', code: 'S', color: 'teal', name: 'Shop' },
    project: null,
    provider: null,
    dryRun: state.dryRun,
    pendingChanges: items.length,
  };
  const request = vi.fn(
    (
      method: string,
      payload: { id?: string; fileOffset?: number; fileLimit?: number },
    ): Promise<unknown> => {
      switch (method) {
        case 'shell.state':
          return Promise.resolve(shell);
        case 'run.active':
          return Promise.resolve([]);
        case 'changes.list':
          return Promise.resolve(items);
        case 'changes.recovered':
          return Promise.resolve([]);
        case 'changes.get': {
          const detail = state.detail ?? {
            ...DETAIL,
            ...items.find((item) => item.id === payload.id),
          };
          const offset = payload.fileOffset ?? 0;

          return Promise.resolve({
            ...detail,
            files: detail.files.slice(
              offset,
              payload.fileLimit === undefined ? undefined : offset + payload.fileLimit,
            ),
          });
        }
        case 'changes.apply':
          return (
            state.apply ??
            (() =>
              Promise.resolve({
                state: 'applied',
                changeSetId: 'c1',
                runId: 'r1',
                files: ['lang.en.json'],
              }))
          )().then((value) => {
            items = [];

            return value;
          });
        case 'changes.discard':
          items = [];

          return Promise.resolve({});
        default:
          return Promise.reject(new Error(`Unexpected ${method}`));
      }
    },
  );

  TestBed.configureTestingModule({
    providers: [
      ReviewViewPresenter,
      { provide: DesktopApi, useValue: { request, onEvent: () => () => undefined } },
    ],
  });

  return {
    presenter: TestBed.inject(ReviewViewPresenter),
    session: TestBed.inject(ShellSession),
    request,
  };
}

describe('ReviewViewPresenter', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('replaces five-file pages and reaches the last file with a fixed request size', async () => {
    // arrange
    const files = Array.from({ length: 12 }, (_, index) => ({
      ...DETAIL.files[0],
      file: `catalog-${index}.json`,
    }));
    const { presenter, session, request } = setUp({
      dryRun: false,
      detail: { ...DETAIL, fileCount: files.length, files },
    });
    await session.refresh();
    await presenter.load();

    // act
    await presenter.setFilePage(2);

    // assert
    expect(request).toHaveBeenCalledWith('changes.get', { id: 'c1', fileOffset: 0, fileLimit: 5 });
    expect(request).toHaveBeenLastCalledWith('changes.get', {
      id: 'c1',
      fileOffset: 10,
      fileLimit: 5,
    });
    expect(presenter.detail.value()?.files.map((file) => file.file)).toEqual([
      'catalog-10.json',
      'catalog-11.json',
    ]);
  });

  it('keeps an off-page conflict in the complete approval decision', async () => {
    // arrange
    const files = Array.from({ length: 12 }, (_, index) => ({
      ...DETAIL.files[0],
      file: `catalog-${index}.json`,
    }));
    const { presenter, session, request } = setUp({
      dryRun: false,
      detail: { ...DETAIL, fileCount: 12, files, conflicts: ['catalog-11.json'] },
    });
    await session.refresh();

    // act
    await presenter.load();
    await presenter.approve();

    // assert
    expect(presenter.detail.value()?.files).toHaveLength(5);
    expect(presenter.canApply()).toBe(false);
    expect(request).not.toHaveBeenCalledWith('changes.apply', expect.anything());
  });

  it('resets the preview page when a change set is selected again', async () => {
    // arrange
    const files = Array.from({ length: 12 }, (_, index) => ({
      ...DETAIL.files[0],
      file: `catalog-${index}.json`,
    }));
    const { presenter, session, request } = setUp({
      dryRun: true,
      detail: { ...DETAIL, fileCount: 12, files },
    });
    await session.refresh();
    await presenter.load();
    await presenter.setFilePage(2);

    // act
    await presenter.select('c1');

    // assert
    expect(presenter.filePage()).toBe(0);
    expect(request).toHaveBeenLastCalledWith('changes.get', {
      id: 'c1',
      fileOffset: 0,
      fileLimit: 5,
    });
  });

  it('bounds summaries and findings while keeping their last entries reachable', async () => {
    // arrange
    const items = Array.from({ length: 76 }, (_, index) => ({ ...ITEM, id: `c${index + 1}` }));
    const findings = Array.from({ length: 101 }, (_, index) => `Finding ${index}`);
    const { presenter, session } = setUp({
      dryRun: true,
      items,
      detail: { ...DETAIL, findings, findingCount: findings.length },
    });
    await session.refresh();
    await presenter.load();
    expect(presenter.items()).toHaveLength(50);
    expect(presenter.findings()).toHaveLength(100);

    // act
    presenter.showMoreItems();
    presenter.showMoreFindings();

    // assert
    expect(presenter.items().at(-1)?.id).toBe('c76');
    expect(presenter.findings().at(-1)).toBe('Finding 100');
    expect(presenter.hasMoreItems()).toBe(false);
    expect(presenter.hasMoreFindings()).toBe(false);
  });

  it('selects the newest change set and shows its diff', async () => {
    // arrange
    const { presenter, session } = setUp({ dryRun: false });

    await session.refresh();

    // act
    await presenter.load();

    // assert
    expect(presenter.selectedId()).toBe('c1');
    expect(presenter.detail.value()?.files[0].file).toBe('lang.en.json');
    expect(presenter.title()).toBe('Sort keys');
  });

  it('does not write while Dry run is on', async () => {
    // arrange
    const { presenter, session, request } = setUp({ dryRun: true });

    await session.refresh();
    await presenter.load();

    // act
    await presenter.approve();

    // assert
    expect(presenter.canApply()).toBe(false);
    expect(request).not.toHaveBeenCalledWith('changes.apply', expect.anything());
  });

  it('writes with Dry run off, says what it wrote and moves on', async () => {
    // arrange
    const { presenter, session, request } = setUp({ dryRun: false });

    await session.refresh();
    await presenter.load();

    // act
    await presenter.approve();

    // assert
    expect(request).toHaveBeenCalledWith('changes.apply', { id: 'c1' });
    expect(presenter.outcome()).toMatchObject({ state: 'applied', files: ['lang.en.json'] });
    expect(presenter.selectedId()).toBeNull();
  });

  it('names the file when a change set fails, and keeps it in the list', async () => {
    // arrange
    const { presenter, session } = setUp({
      dryRun: false,
      apply: () =>
        Promise.reject(
          new Error('lang.en.json changed since the change set was built. Nothing was written.'),
        ),
    });

    await session.refresh();
    await presenter.load();

    // act
    await presenter.approve();

    // assert
    expect(presenter.message()).toContain('lang.en.json changed');
    expect(presenter.list.value()?.length).toBe(1);
  });

  it('cannot write a change set whose files changed', async () => {
    // arrange
    const { presenter, session } = setUp({
      dryRun: false,
      items: [{ ...ITEM, conflicts: ['lang.en.json'] }],
    });

    await session.refresh();

    // act
    await presenter.load();

    // assert
    expect(presenter.canApply()).toBe(false);
  });

  it('discards without writing', async () => {
    // arrange
    const { presenter, session, request } = setUp({ dryRun: true });

    await session.refresh();
    await presenter.load();

    // act
    await presenter.discard();

    // assert
    expect(request).toHaveBeenCalledWith('changes.discard', { id: 'c1' });
    expect(presenter.list.value()).toEqual([]);
  });

  it('waits for the selected change set before allowing discard, including in dry run with conflicts', async () => {
    // arrange
    const other = { ...ITEM, id: 'c2', conflicts: ['lang.en.json'] };
    const { presenter, session, request } = setUp({ dryRun: true, items: [ITEM, other] });
    let resolveDetail!: (detail: ReviewDetail) => void;
    const pending = new Promise<ReviewDetail>((resolve) => {
      resolveDetail = resolve;
    });

    await session.refresh();
    await presenter.load();
    request.mockImplementationOnce(() => pending);

    // act
    const selection = presenter.select('c2');

    await presenter.discard();

    // assert
    expect(presenter.selectedId()).toBe('c2');
    expect(presenter.detail.value()?.id).toBe('c1');
    expect(presenter.canDiscard()).toBe(false);
    expect(request).not.toHaveBeenCalledWith('changes.discard', expect.anything());

    // act
    resolveDetail({ ...DETAIL, ...other });
    await selection;

    // assert
    expect(presenter.canDiscard()).toBe(true);
    expect(presenter.canApply()).toBe(false);

    // act
    await presenter.discard();

    // assert
    expect(request.mock.calls.filter(([method]) => method === 'changes.discard')).toEqual([
      ['changes.discard', { id: 'c2' }],
    ]);
  });

  it('names the commands that leave a change set', () => {
    // act & assert
    expect(titleOf({ command: 'detect.apply' })).toBe('Hard-coded strings');
    expect(titleOf({ command: 'init' })).toBe('Configuration file');
  });
});

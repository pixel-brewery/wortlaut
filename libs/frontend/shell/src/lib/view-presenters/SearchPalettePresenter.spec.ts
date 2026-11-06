// #region Imports

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DesktopApi, ShellSession, ShortcutCenter } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHELL_NAVIGATION } from '../contracts/shellTokens';
import { SearchPalettePresenter } from './SearchPalettePresenter';

// #endregion

const NAVIGATION = [
  {
    label: 'Workspace',
    needsProject: false,
    items: [{ label: 'Projects', icon: 'folder', route: '/projects', match: '/projects' }],
  },
  {
    label: 'Commands',
    needsProject: true,
    items: [
      { label: 'Detect', icon: 'search', route: '/detect', match: '/detect' },
      { label: 'Analyze', icon: 'clipboardTask', route: '/analyze', match: '/analyze' },
    ],
  },
];
const RESULTS = {
  keys: [{ key: 'loc.title', value: 'Title', projectId: 'p2', projectName: 'admin' }],
  files: [
    { id: 'f1', file: 'i18n/lang.en.json', kind: 'catalog', projectId: 'p1', projectName: 'shop' },
  ],
  truncated: false,
};

function setUp(
  options: { project?: { id: string; name: string } | null; openFails?: boolean } = {},
) {
  const navigate = vi.fn(() => Promise.resolve(true));
  const navigateByUrl = vi.fn(() => Promise.resolve(true));
  const state = {
    workspace: { id: 'w1', code: 'AC', color: 'teal', name: 'Acme' },
    project: options.project === undefined ? { id: 'p1', name: 'shop' } : options.project,
    provider: null,
    dryRun: true,
    pendingChanges: 0,
  };
  const request = vi.fn((method: string): Promise<unknown> => {
    switch (method) {
      case 'search.query':
        return Promise.resolve(RESULTS);
      case 'search.openFile':
        return options.openFails
          ? Promise.reject(new Error('The file is gone.'))
          : Promise.resolve({});
      default:
        return Promise.resolve(state);
    }
  });

  TestBed.configureTestingModule({
    providers: [
      SearchPalettePresenter,
      { provide: DesktopApi, useValue: { request, onEvent: () => () => undefined } },
      { provide: Router, useValue: { navigate, navigateByUrl } },
      { provide: SHELL_NAVIGATION, useValue: NAVIGATION },
    ],
  });

  return {
    presenter: TestBed.inject(SearchPalettePresenter),
    request,
    navigate,
    navigateByUrl,
    session: TestBed.inject(ShellSession),
  };
}

async function search(presenter: SearchPalettePresenter, text: string): Promise<void> {
  presenter.form.text().value.set(text);
  TestBed.tick();
  await vi.advanceTimersByTimeAsync(200);
  TestBed.tick();
}

function key(name: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: name, cancelable: true });
}

describe('SearchPalettePresenter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('opens with the shortcut of this platform, and shows what it can open', async () => {
    // arrange
    const { presenter, session } = setUp();

    await session.refresh();
    TestBed.inject(ShortcutCenter).setPlatform('darwin');

    // act
    TestBed.inject(ShortcutCenter).handle(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
    );

    // assert
    expect(presenter.isOpen()).toBe(true);
    expect(presenter.items().map((item) => item.label)).toContain('Analyze');
    expect(presenter.placeholder()).toContain('⌘K');
  });

  it('does not offer a view that needs a project while none is open', async () => {
    // arrange
    const { presenter, session } = setUp({ project: null });

    await session.refresh();
    presenter.open();

    // assert
    expect(presenter.items().map((item) => item.label)).toContain('Projects');
    expect(presenter.items().map((item) => item.label)).not.toContain('Analyze');
  });

  it('groups commands, keys and files, and asks main with a pause', async () => {
    // arrange
    const { presenter, request, session } = setUp();

    await session.refresh();
    presenter.open();

    // act
    await search(presenter, 'a');

    // assert
    expect(request).toHaveBeenCalledWith('search.query', {
      text: 'a',
      workspaceId: 'w1',
      projectId: 'p1',
    });
    expect(presenter.groups().map((group) => group.label)).toEqual(['Commands', 'Keys', 'Files']);
  });

  it('opens a command with Enter, after the arrow keys walked to it', async () => {
    // arrange
    const { presenter, navigateByUrl, session } = setUp();

    await session.refresh();
    presenter.open();
    await search(presenter, 'detect');

    const index = presenter.items().findIndex((item) => item.label === 'Detect');

    // act
    for (let step = 0; step < index; step++) {
      await presenter.onKey(key('ArrowDown'));
    }

    await presenter.onKey(key('Enter'));

    // assert
    expect(navigateByUrl).toHaveBeenCalledWith('/detect');
    expect(presenter.isOpen()).toBe(false);
  });

  it('wraps around with the arrow keys', async () => {
    // arrange
    const { presenter, session } = setUp();

    await session.refresh();
    presenter.open();

    const last = presenter.items().at(-1)?.id;

    // act
    await presenter.onKey(key('ArrowUp'));

    // assert
    expect(presenter.activeId()).toBe(last);
  });

  it('opens a key in Translations, in its own project', async () => {
    // arrange
    const { presenter, navigate, request, session } = setUp();

    await session.refresh();
    presenter.open();
    await search(presenter, 'loc');

    // act
    await presenter.choose(presenter.items().find((item) => item.kind === 'key') as never);

    // assert
    expect(request).toHaveBeenCalledWith('shell.setProject', { projectId: 'p2' });
    expect(navigate).toHaveBeenCalledWith(['/translations'], { queryParams: { key: 'loc.title' } });
  });

  it('opens a file by its id, and stays open with the reason when that fails', async () => {
    // arrange
    const { presenter, request, session } = setUp({ openFails: true });

    await session.refresh();
    presenter.open();
    await search(presenter, 'lang');

    // act
    await presenter.choose(presenter.items().find((item) => item.kind === 'file') as never);

    // assert
    expect(request).toHaveBeenCalledWith('search.openFile', { id: 'f1' });
    expect(presenter.message()).toBe('The file is gone.');
    expect(presenter.isOpen()).toBe(true);
  });

  it('takes it that the box reports no text at all when the dialog takes it away', async () => {
    // arrange
    const { presenter, session } = setUp();

    await session.refresh();
    presenter.open();

    // act
    presenter.form.text().value.set(null as never);
    TestBed.tick();

    // assert
    expect(presenter.items().map((item) => item.label)).toContain('Projects');
    expect(presenter.isEmpty()).toBe(false);
  });

  it('says when nothing was found', async () => {
    // arrange
    const { presenter, request, session } = setUp();

    request.mockImplementation((method: string) =>
      Promise.resolve(
        method === 'search.query'
          ? { keys: [], files: [], truncated: false }
          : {
              workspace: { id: 'w1' },
              project: null,
              provider: null,
              dryRun: true,
              pendingChanges: 0,
            },
      ),
    );
    await session.refresh();
    presenter.open();

    // act
    await search(presenter, 'zzz');

    // assert
    expect(presenter.isEmpty()).toBe(true);
  });
});

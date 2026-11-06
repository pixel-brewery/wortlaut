// #region Imports

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { IpcEvent, WorkspaceRecent } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WelcomeViewPresenter } from './WelcomeViewPresenter';

// #endregion

const FOLDER = {
  token: '6f1b1c1e-0d3a-4f5e-9a2b-1c2d3e4f5a6b',
  displayPath: '~/shop',
  name: 'shop',
};
const WORKSPACE: WorkspaceRecent = {
  id: 'w1',
  code: 'AC',
  color: 'teal',
  name: 'Acme',
  projectCount: 1,
  keyCount: 858,
  locales: ['en', 'de'],
  folderMissing: false,
};

function setUp(request: (method: string, payload: unknown) => Promise<unknown>) {
  let emit: (event: IpcEvent) => void = () => undefined;
  const stop = vi.fn();
  const navigate = vi.fn(() => Promise.resolve(true));

  TestBed.configureTestingModule({
    providers: [
      WelcomeViewPresenter,
      {
        provide: DesktopApi,
        useValue: {
          request: vi.fn(request),
          onEvent: (listener: (event: IpcEvent) => void) => {
            emit = listener;

            return stop;
          },
        },
      },
      { provide: Router, useValue: { navigate } },
    ],
  });

  return {
    presenter: TestBed.inject(WelcomeViewPresenter),
    navigate,
    stop,
    emit: (event: IpcEvent) => {
      emit(event);
    },
  };
}

describe('WelcomeViewPresenter', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('writes the line of a recent workspace from its last known state', () => {
    const { presenter } = setUp(() => Promise.resolve(null));

    expect(presenter.detailOf(WORKSPACE)).toBe('1 project · 858 keys · English and German');
    expect(presenter.detailOf({ ...WORKSPACE, locales: [], keyCount: 0, projectCount: 0 })).toBe(
      '0 projects · 0 keys · No locales yet',
    );
  });

  it('says when the folder of a recent workspace is gone', () => {
    const { presenter } = setUp(() => Promise.resolve(null));

    expect(presenter.detailOf({ ...WORKSPACE, folderMissing: true })).toBe('The folder is gone');
  });

  it('goes on to Project setup with the token of a chosen folder', async () => {
    const { presenter, navigate } = setUp(() => Promise.resolve({ folder: FOLDER }));

    await presenter.chooseFolder();

    expect(navigate).toHaveBeenCalledWith(['/setup'], { queryParams: { folder: FOLDER.token } });
  });

  it('stays here when the dialog is cancelled', async () => {
    const { presenter, navigate } = setUp(() => Promise.resolve({ folder: null }));

    await presenter.chooseFolder();

    expect(navigate).not.toHaveBeenCalled();
    expect(presenter.message()).toBeNull();
  });

  it('stays here with a message when a chosen folder cannot be used', async () => {
    const { presenter, navigate } = setUp(() =>
      Promise.reject(new Error('This folder cannot be read.')),
    );

    await presenter.chooseFolder();

    expect(navigate).not.toHaveBeenCalled();
    expect(presenter.message()).toBe('This folder cannot be read.');
  });

  it('goes on with a dropped folder, and stays with a message for a dropped file', () => {
    const { presenter, navigate, emit } = setUp(() => Promise.resolve(null));

    emit({ type: 'folder.dropFailed', message: 'That is a file. Choose a folder.' });
    expect(presenter.message()).toBe('That is a file. Choose a folder.');
    expect(navigate).not.toHaveBeenCalled();

    emit({ type: 'folder.dropped', folder: FOLDER });
    expect(navigate).toHaveBeenCalledWith(['/setup'], { queryParams: { folder: FOLDER.token } });
  });

  it('opens a workspace where main says', async () => {
    const { presenter, navigate } = setUp(() => Promise.resolve({ next: 'overview' }));

    await presenter.open('w1');

    expect(navigate).toHaveBeenCalledWith(['/overview']);
  });

  it('shows the true failure of the recent list', async () => {
    const { presenter } = setUp(() =>
      Promise.reject(new Error('The workspace list cannot be read.')),
    );

    await presenter.recent.reload();

    expect(presenter.recent.isFailed()).toBe(true);
    expect(presenter.recent.error()).toBe('The workspace list cannot be read.');
  });

  it('ends its subscription with the view', () => {
    const { stop } = setUp(() => Promise.resolve(null));

    TestBed.resetTestingModule();

    expect(stop).toHaveBeenCalled();
  });
});

// #region Imports

import { TestBed } from '@angular/core/testing';
import type { AppSettingsView } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession, ShortcutCenter } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bugReportOf, formatMemory, SettingsAppViewPresenter } from './SettingsAppViewPresenter';

// #endregion

const SETTINGS: AppSettingsView = {
  startInDryRun: true,
  verboseLog: false,
  cacheResults: true,
  colorMode: null,
  cacheFolder: '.wortlaut/cache',
  activeColorMode: 'light',
};
const INFO = {
  name: 'Wortlaut',
  version: '0.2.0',
  platform: 'win32',
  arch: 'x64',
  cpus: 8,
  totalMemory: 16 * 1024 ** 3,
};

function setUp(options: { failSave?: boolean; file?: string | null } = {}) {
  const request = vi.fn((method: string, payload: Record<string, unknown>): Promise<unknown> => {
    switch (method) {
      case 'app.getSettings':
        return Promise.resolve(SETTINGS);
      case 'app.saveSettings':
        return options.failSave
          ? Promise.reject(new Error('The profile cannot be written.'))
          : Promise.resolve({
              ...SETTINGS,
              ...payload,
              activeColorMode: payload.colorMode ?? 'light',
            });
      case 'app.getInfo':
        return Promise.resolve(INFO);
      case 'config.exportRun':
        return Promise.resolve({ file: options.file === undefined ? '~/out.json' : options.file });
      case 'shell.state':
        return Promise.resolve({
          workspace: { id: 'w1', code: 'AC', color: 'teal', name: 'Acme' },
          project: { id: 'p1', name: 'shop' },
          provider: null,
          dryRun: true,
          pendingChanges: 0,
        });
      default:
        return Promise.resolve({});
    }
  });

  TestBed.configureTestingModule({
    providers: [
      SettingsAppViewPresenter,
      { provide: DesktopApi, useValue: { request, onEvent: () => () => undefined } },
    ],
  });

  return {
    presenter: TestBed.inject(SettingsAppViewPresenter),
    request,
    shell: TestBed.inject(ShellSession),
  };
}

describe('SettingsAppViewPresenter', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('applies every change at once, with the other values as they are', async () => {
    // arrange
    const { presenter, request } = setUp();

    await presenter.load();

    // act
    await presenter.setVerboseLog(true);
    await presenter.setCacheResults(false);
    await presenter.setColorMode('dark');

    // assert
    expect(request).toHaveBeenLastCalledWith('app.saveSettings', {
      startInDryRun: true,
      verboseLog: true,
      cacheResults: false,
      colorMode: 'dark',
    });
    expect(presenter.values()).toMatchObject({
      verboseLog: true,
      cacheResults: false,
      activeColorMode: 'dark',
    });
  });

  it('asks main nothing when a switch only reports the state it was bound to', async () => {
    // arrange
    const { presenter, request } = setUp();

    await presenter.load();

    // act
    await presenter.setStartInDryRun(true);

    // assert
    expect(request).not.toHaveBeenCalledWith('app.saveSettings', expect.anything());
  });

  it('says why a change failed', async () => {
    // arrange
    const { presenter } = setUp({ failSave: true });

    await presenter.load();

    // act
    await presenter.setVerboseLog(true);

    // assert
    expect(presenter.message()).toBe('The profile cannot be written.');
    expect(presenter.values()?.verboseLog).toBe(false);
  });

  it('shows the real environment and the shortcuts of this platform', async () => {
    // arrange
    const { presenter } = setUp();

    // act
    await presenter.load();

    // assert
    expect(presenter.environment()).toEqual([
      { label: 'Wortlaut', value: '0.2.0' },
      { label: 'Platform', value: 'win32' },
      { label: 'Arch', value: 'x64' },
      { label: 'Cpus', value: '8' },
      { label: 'Ram', value: '16 GB' },
    ]);
    expect(TestBed.inject(ShortcutCenter).labelOf('search')).toBe('Ctrl K');
    expect(presenter.shortcuts().map((shortcut) => shortcut.keys)).toEqual([
      'Ctrl K',
      'Ctrl Enter',
      'Ctrl J',
      'Ctrl ↓',
    ]);
  });

  it('copies for a bug report what the environment says, and nothing else', async () => {
    // arrange
    const { presenter, request } = setUp();

    await presenter.load();

    // act
    await presenter.copyBugReport();

    // assert
    expect(request).toHaveBeenCalledWith('clipboard.writeText', {
      text: 'Wortlaut 0.2.0\nPlatform: win32\nArch: x64\nCpus: 8\nRam: 16 GB',
    });
    expect(presenter.note()).toBe('Copied for a bug report.');
  });

  it('exports the run configuration of the open project, and stays quiet for a cancelled dialog', async () => {
    // arrange
    const { presenter, request, shell } = setUp({ file: null });

    await shell.refresh();
    await presenter.load();

    // act
    await presenter.exportRunConfiguration();

    // assert
    expect(request).toHaveBeenCalledWith('config.exportRun', {
      workspaceId: 'w1',
      projectId: 'p1',
    });
    expect(presenter.note()).toBeNull();
  });

  it('writes memory and the report without anything it does not know', () => {
    expect(formatMemory(32 * 1024 ** 3)).toBe('32 GB');
    expect(bugReportOf(INFO)).not.toMatch(/\/|~/u);
  });
});

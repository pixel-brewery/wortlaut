// #region Imports

import { TestBed } from '@angular/core/testing';
import type { EffectiveSetting } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CliNxViewPresenter,
  describeSource,
  describeValue,
  toSettingRows,
} from './CliNxViewPresenter';

// #endregion

const SOURCE_DEFAULT = { kind: 'default', file: null } as const;

function setting(
  key: string,
  value: unknown,
  source: EffectiveSetting['source'] = SOURCE_DEFAULT,
  secret = false,
): EffectiveSetting {
  return { key, value, secret, source };
}

const COMMANDS = [
  { label: 'Sort', command: 'npx wortlaut sort --order asc' },
  { label: 'Environment', command: 'npx wortlaut info' },
];
const OPEN = {
  workspace: { id: 'w1', code: 'AC', color: 'teal', name: 'Acme' },
  project: { id: 'p1', name: 'shop' },
  provider: null,
  dryRun: true,
};

function setUp(failOpen = false) {
  const request = vi.fn((method: string, _payload: unknown): Promise<unknown> => {
    switch (method) {
      case 'shell.state':
        return Promise.resolve(OPEN);
      case 'cli.commands':
        return Promise.resolve(COMMANDS);
      case 'config.getEffective':
        return Promise.resolve({ settings: [setting('actions.sort.order', 'asc')], warnings: [] });
      case 'config.getSourceFile':
        return Promise.resolve({ file: { name: 'nx.json', text: '{}', truncated: false } });
      case 'nx.targets':
        return Promise.resolve({
          executor: null,
          target: null,
          projectCount: 0,
          commands: [],
          scripts: [],
          configPreview: '{}',
        });
      case 'config.openSourceFile':
        return failOpen ? Promise.reject(new Error('It cannot be opened.')) : Promise.resolve({});
      default:
        return Promise.resolve({});
    }
  });

  TestBed.configureTestingModule({
    providers: [CliNxViewPresenter, { provide: DesktopApi, useValue: { request } }],
  });

  return {
    presenter: TestBed.inject(CliNxViewPresenter),
    session: TestBed.inject(ShellSession),
    request,
  };
}

describe('describeSource', () => {
  it('names where a value comes from', () => {
    expect(describeSource(setting('a', 1))).toEqual({ from: 'Default', variant: 'neutral' });
    expect(
      describeSource(setting('a', 1, { kind: 'nx-target-defaults', file: 'nx.json' })),
    ).toEqual({ from: 'nx.json targetDefaults', variant: 'info' });
    expect(
      describeSource(setting('a', 1, { kind: 'project-json', file: 'apps/x/project.json' })),
    ).toEqual({ from: 'apps/x/project.json', variant: 'info' });
    expect(describeSource(setting('a', 1, { kind: 'nx-configuration', file: 'nx.json' }))).toEqual({
      from: 'configuration in nx.json',
      variant: 'info',
    });
    expect(
      describeSource(setting('a', 1, { kind: 'wortlaut-config', file: 'wortlaut.config.json' })),
    ).toEqual({ from: 'wortlaut.config.json', variant: 'info' });
    expect(describeSource(setting('a', 1, { kind: 'arguments', file: null }))).toEqual({
      from: 'Project setup',
      variant: 'success',
    });
  });
});

describe('describeValue', () => {
  it('leaves a token unresolved and counts patterns', () => {
    expect(describeValue('actions.generate.model', '{env.GEMINI_MODEL}')).toBe(
      '{env.GEMINI_MODEL}',
    );
    expect(describeValue('actions.analyze.usedKeys', ['a', 'b'])).toBe('2 patterns');
    expect(describeValue('actions.analyze.usedKeys', ['a'])).toBe('1 pattern');
    expect(describeValue('actions.detect.languages', ['en', 'de'])).toBe('en, de');
    expect(describeValue('actions.analyze.rules', [])).toBe('All');
    expect(describeValue('actions.generate.locales', [])).toBe('None');
    expect(describeValue('actions.detect.preset', 'angular')).toBe('Angular');
    expect(describeValue('actions.detect.type', 'json')).toBe('JSON');
    expect(describeValue('actions.generate.limit', null)).toBe('None');
  });
});

describe('toSettingRows', () => {
  it('lists known settings in order and hides defaults that say nothing', () => {
    const rows = toSettingRows([
      setting('actions.sort.order', 'asc'),
      setting('actions.detect.preset', 'angular', { kind: 'project-json', file: 'project.json' }),
      setting('actions.detect.resourceKey.suffix', ''),
      setting('actions.detect.languages', []),
      setting('actions.detect.root', '', { kind: 'wortlaut-config', file: 'wortlaut.config.json' }),
      setting('unknown.setting', 'x'),
      setting('dryRun', false),
    ]);

    expect(rows.map((row) => row.label)).toEqual(['Preset', 'Source root', 'Sort']);
    expect(rows[0]).toEqual({
      key: 'actions.detect.preset',
      label: 'Preset',
      value: 'Angular',
      from: 'project.json',
      variant: 'info',
    });
  });

  it('shows the mask of a secret and nothing else', () => {
    const rows = toSettingRows([
      setting(
        'actions.generate.apiKey',
        '***',
        { kind: 'wortlaut-config', file: 'wortlaut.config.json' },
        true,
      ),
    ]);

    expect(rows[0].value).toBe('***');
  });
});

describe('CliNxViewPresenter', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('lists the commands without a project and reads nothing of one', async () => {
    const { presenter, request } = setUp();

    await presenter.load();

    expect(presenter.hasProject()).toBe(false);
    expect(presenter.filteredCommands()).toEqual(COMMANDS);
    expect(request).toHaveBeenCalledWith('cli.commands', { projectId: null });
    expect(request).not.toHaveBeenCalledWith('config.getEffective', expect.anything());
  });

  it('reads the settings, the source file and the targets of the open project', async () => {
    const { presenter, session, request } = setUp();

    await session.refresh();
    await presenter.load();

    expect(request).toHaveBeenCalledWith('config.getEffective', { projectId: 'p1' });
    expect(request).toHaveBeenCalledWith('cli.commands', { projectId: 'p1' });
    expect(presenter.settingRows().map((row) => row.label)).toEqual(['Sort']);
    expect(presenter.source.value()?.file?.name).toBe('nx.json');
    expect(presenter.nx.value()?.configPreview).toBe('{}');
  });

  it('filters the commands by action and by command', async () => {
    const { presenter } = setUp();

    await presenter.load();

    presenter.searchForm.text().value.set('ENVIRON');
    expect(presenter.filteredCommands().map((row) => row.label)).toEqual(['Environment']);

    presenter.searchForm.text().value.set('--order');
    expect(presenter.filteredCommands().map((row) => row.label)).toEqual(['Sort']);

    presenter.searchForm.text().value.set('nothing');
    expect(presenter.filteredCommands()).toEqual([]);
  });

  it('moves between the tabs', () => {
    const { presenter } = setUp();

    expect(presenter.tab()).toBe('settings');

    presenter.openTab('commands');

    expect(presenter.tab()).toBe('commands');
  });

  it('copies a command and says so for a moment', async () => {
    vi.useFakeTimers();

    const { presenter, request } = setUp();

    await presenter.copy('npx wortlaut info');

    expect(request).toHaveBeenCalledWith('clipboard.writeText', { text: 'npx wortlaut info' });
    expect(presenter.copied()).toBe('npx wortlaut info');

    vi.advanceTimersByTime(2000);
    expect(presenter.copied()).toBeNull();

    vi.useRealTimers();
  });

  it('asks main to open the file, and shows why it could not', async () => {
    const { presenter, session, request } = setUp(true);

    await session.refresh();
    await presenter.openSourceFile();

    expect(request).toHaveBeenCalledWith('config.openSourceFile', { projectId: 'p1' });
    expect(presenter.message()).toBe('It cannot be opened.');
  });
});

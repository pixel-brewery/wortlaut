// #region Imports

import { TestBed } from '@angular/core/testing';
import type { AiDefaults, AiProvider } from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeProviderBadge, SettingsAiViewPresenter } from './SettingsAiViewPresenter';

// #endregion

const KEY = 'test-key-not-real';

const PROVIDERS: Array<AiProvider> = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    kind: 'local',
    state: 'signed-out',
    description: 'Found on this computer · not signed in',
  },
  {
    id: 'codex',
    name: 'Codex',
    kind: 'local',
    state: 'not-installed',
    description: 'Not installed',
  },
  { id: 'openai', name: 'OpenAI', kind: 'key', state: 'ready', description: 'With your API key.' },
  {
    id: 'google',
    name: 'Google Gemini',
    kind: 'key',
    state: 'no-key',
    description: 'No key is set.',
  },
];

const DEFAULTS: AiDefaults = {
  defaultProvider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  chunkSize: 10,
  limit: null,
  instructions: 'Keep Wortlaut.',
  localeInstructions: { de: 'Use du.' },
  safety: {
    reviewBeforeWriting: true,
    protectPlaceholders: true,
    keepPartialResults: true,
    keepRawOutput: false,
  },
  locales: ['de'],
  sourceFile: 'wortlaut.config.json',
};

/**
 * @private
 */
function setUp(hasProject = true) {
  const request = vi.fn((method: string, _payload: unknown): Promise<unknown> => {
    switch (method) {
      case 'shell.state':
        return Promise.resolve({
          workspace: null,
          project: hasProject ? { id: 'p1', name: 'shop' } : null,
          provider: null,
          dryRun: true,
          pendingChanges: 0,
        });
      case 'ai.providers':
        return Promise.resolve(PROVIDERS);
      case 'ai.defaults':
        return Promise.resolve(DEFAULTS);
      case 'ai.models':
        return Promise.resolve({ models: ['gpt-4o-mini', 'gpt-4o'] });
      case 'ai.checkLogin':
        return Promise.resolve(PROVIDERS[0]);
      case 'ai.installHint':
        return Promise.resolve({ text: 'Install it yourself.' });
      case 'ai.setKey':
      case 'ai.clearKey':
        return Promise.resolve(PROVIDERS[2]);
      case 'ai.testKey':
        return Promise.resolve({ ok: true, message: 'The provider accepted this key.' });
      case 'ai.saveDefaults':
        return Promise.resolve({
          state: 'pending',
          changeSetId: 'c1',
          runId: 'r1',
          files: ['wortlaut.config.json'],
        });
      default:
        return Promise.resolve({});
    }
  });

  TestBed.configureTestingModule({
    providers: [
      SettingsAiViewPresenter,
      { provide: DesktopApi, useValue: { request, onEvent: () => () => undefined } },
    ],
  });

  return {
    presenter: TestBed.inject(SettingsAiViewPresenter),
    session: TestBed.inject(ShellSession),
    request,
  };
}

/**
 * @private
 */
async function loaded(hasProject = true) {
  const context = setUp(hasProject);

  await context.session.refresh();
  await context.presenter.load();

  return context;
}

describe('describeProviderBadge', () => {
  it('says how a provider stands', () => {
    expect(describeProviderBadge({ state: 'ready' })).toEqual({
      label: 'Connected',
      variant: 'success',
    });
    expect(describeProviderBadge({ state: 'signed-out' }).label).toBe('Not signed in');
    expect(describeProviderBadge({ state: 'not-installed' }).label).toBe('Not set up');
  });
});

describe('SettingsAiViewPresenter', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows every provider with its true state and action', async () => {
    // act
    const { presenter } = await loaded();

    // assert
    expect(presenter.assistants().map((provider) => [provider.id, provider.action])).toEqual([
      ['claude-code', 'Check login'],
      ['codex', 'Show how to install'],
    ]);
    expect(
      presenter
        .keyed()
        .map((provider) => [provider.id, provider.placeholder, provider.action, provider.canAct]),
    ).toEqual([
      ['openai', 'Saved', 'Test connection', true],
      ['google', 'Paste your API key', 'Test connection', false],
    ]);
  });

  it('asks for a login without starting one, and says how to sign in', async () => {
    // arrange
    const { presenter, request } = await loaded();

    // act
    await presenter.actOnAssistant(PROVIDERS[0]);

    // assert
    expect(request).toHaveBeenCalledWith('ai.checkLogin', { providerId: 'claude-code' });
    expect(presenter.assistants()[0].hint).toBe('Install it yourself.');
  });

  it('shows how to install and installs nothing', async () => {
    // arrange
    const { presenter, request } = await loaded();

    // act
    await presenter.actOnAssistant(PROVIDERS[1]);

    // assert
    expect(request).toHaveBeenCalledWith('ai.installHint', { providerId: 'codex' });
    expect(request).not.toHaveBeenCalledWith('ai.checkLogin', expect.anything());
  });

  it('sends a typed key to main once, and forgets it right after', async () => {
    // arrange
    const { presenter, request } = await loaded();

    presenter.typeKey('google', ` ${KEY} `);
    expect(presenter.keyed()[1]).toMatchObject({ action: 'Set key', canAct: true });

    // act
    await presenter.actOnKey('google');

    // assert
    expect(request).toHaveBeenCalledWith('ai.setKey', { providerId: 'google', key: KEY });
    expect(presenter.keyed()[1].typed).toBe('');
    expect(JSON.stringify(presenter.keyed())).not.toContain(KEY);
  });

  it('tests and clears a saved key without seeing it', async () => {
    // arrange
    const { presenter, request } = await loaded();

    // act
    await presenter.actOnKey('openai');
    expect(presenter.keyed()[0].test).toEqual({
      ok: true,
      message: 'The provider accepted this key.',
    });
    await presenter.clearKey('openai');

    // assert
    expect(request).toHaveBeenCalledWith('ai.testKey', { providerId: 'openai' });
    expect(request).toHaveBeenCalledWith('ai.clearKey', { providerId: 'openai' });
  });

  it('saves the defaults as a change set and the provider to the profile', async () => {
    // arrange
    const { presenter, request } = await loaded();

    presenter.form.chunkSize().value.set('25');
    presenter.form.defaultProvider().value.set('claude-code');
    presenter.setLocaleInstructions('de', 'Use Sie.');
    presenter.setSafety('keepRawOutput', true);
    expect(presenter.isDirty()).toBe(true);

    // act
    await presenter.save();

    // assert
    expect(request).toHaveBeenCalledWith('ai.setDefaultProvider', { providerId: 'claude-code' });
    expect(request).toHaveBeenCalledWith('ai.saveDefaults', {
      projectId: 'p1',
      changes: {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        chunkSize: 25,
        limit: null,
        instructions: 'Keep Wortlaut.',
        localeInstructions: { de: 'Use Sie.' },
        safety: {
          reviewBeforeWriting: true,
          protectPlaceholders: true,
          keepPartialResults: true,
          keepRawOutput: true,
        },
      },
    });
    expect(presenter.outcome()?.state).toBe('pending');
  });

  it('refuses values that make no sense, and goes back on Discard', async () => {
    // arrange
    const { presenter } = await loaded();

    // act & assert
    presenter.form.chunkSize().value.set('500');
    expect(presenter.error()).toContain('1 to 100');
    expect(presenter.canSave()).toBe(false);

    presenter.discard();
    expect(presenter.form.chunkSize().value()).toBe('10');
    expect(presenter.isDirty()).toBe(false);
  });

  it('has no defaults without a project, and the providers still work', async () => {
    // act
    const { presenter, request } = await loaded(false);

    // assert
    expect(presenter.defaults.value()).toBeNull();
    expect(presenter.keyed()).toHaveLength(2);
    expect(request).not.toHaveBeenCalledWith('ai.defaults', expect.anything());
  });
});

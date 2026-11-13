// #region Imports

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import type { AnalyzeOverview, AnalyzeRuleResult } from '@pixel-brewery/wortlaut-contracts';
import { AiHandoff, DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyzeViewPresenter, describeRule } from './AnalyzeViewPresenter';

// #endregion

const OVERVIEW: AnalyzeOverview = {
  baseLocale: 'en',
  locales: ['en', 'de'],
  sourceRoot: 'src',
  rules: [
    {
      id: 'empty-values',
      group: 'Built-in rules',
      description: 'A key exists but has no text.',
      enabled: true,
      severity: 'error',
      last: null,
    },
    {
      id: 'missing-translations',
      group: 'Built-in rules',
      description: 'A value is identical.',
      enabled: true,
      severity: 'warning',
      last: { passed: false, locales: [{ locale: 'de', count: 7 }] },
    },
    {
      id: 'unused-keys',
      group: 'Built-in rules',
      description: 'No source uses the key.',
      enabled: false,
      severity: 'warning',
      last: null,
    },
  ],
  exceptions: { usedKeys: [], identicalKeys: [], identicalValues: ['PDF'] },
  refusedPacks: [],
};

const RESULT: AnalyzeRuleResult = {
  id: 'missing-translations',
  passed: false,
  message: 'long',
  locales: [{ locale: 'de', count: 1 }],
  total: 1,
  rows: [
    { a: 'loc.pdf', b: 'Audio', key: 'loc.pdf', value: 'Audio', keys: ['loc.pdf'], locale: 'de' },
  ],
  severity: 'warning',
  pack: null,
};

function setUp(
  write: 'applied' | 'pending' = 'pending',
  query: Record<string, string> = {},
  overview: AnalyzeOverview = OVERVIEW,
) {
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
      case 'analyze.overview':
        return Promise.resolve(overview);
      case 'run.active':
        return Promise.resolve([]);
      case 'run.latest':
        return Promise.resolve({
          runId: 'old',
          command: 'analyze',
          projectId: 'p1',
          state: 'succeeded',
          dryRun: true,
          failure: null,
          outcome: null,
          output: {
            command: 'analyze',
            rules: [
              RESULT,
              { id: 'empty-values', passed: true, message: 'ok', locales: [], total: 2, rows: [] },
            ],
          },
        });
      case 'config.addException':
      case 'config.addRuleException':
      case 'catalog.deleteKey':
      case 'catalog.mergeKeys':
        return Promise.resolve({
          state: write,
          changeSetId: 'c1',
          runId: 'r1',
          files: ['wortlaut.config.json'],
        });
      case 'run.start':
        return Promise.resolve({
          id: 'run2',
          command: 'analyze',
          projectId: 'p1',
          projectName: 'shop',
          title: 'analyze',
          startedAt: new Date().toISOString(),
          dryRun: true,
          phase: 'Starting',
          completed: 0,
          total: 0,
          detail: null,
          batch: null,
          log: [],
        });
      default:
        return Promise.reject(new Error(`Unexpected ${method}`));
    }
  });

  TestBed.configureTestingModule({
    providers: [
      AnalyzeViewPresenter,
      { provide: DesktopApi, useValue: { request, onEvent: () => () => undefined } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
      },
    ],
  });

  return {
    presenter: TestBed.inject(AnalyzeViewPresenter),
    session: TestBed.inject(ShellSession),
    request,
  };
}

describe('describeRule', () => {
  it('offers the action of each rule', () => {
    const context = { baseLocale: 'en', sourceRoot: 'src' };

    expect(describeRule(RESULT, context).actions.map((action) => action.id)).toEqual(['allow']);
    expect(describeRule({ ...RESULT, id: 'unused-keys', total: 2 }, context)).toMatchObject({
      title: '2 keys are not used in src',
      hasAi: 'patterns',
    });
    expect(
      describeRule({ ...RESULT, id: 'unused-keys' }, context).actions.map((action) => action.id),
    ).toEqual(['declare-used', 'delete']);
    expect(
      describeRule({ ...RESULT, id: 'duplicate-values' }, context).actions.map(
        (action) => action.id,
      ),
    ).toEqual(['merge']);
    expect(
      describeRule({ ...RESULT, passed: true }, context).actions.map((action) => action.id),
    ).toEqual(['open-file']);
  });
});

describe('AnalyzeViewPresenter', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('counts the rules that are on, and refuses to run none', async () => {
    // arrange
    const { presenter, session } = setUp();

    await session.refresh();
    await presenter.load();

    // assert
    expect(presenter.runLabel()).toBe('Run 2 rules');
    expect(presenter.canRun()).toBe(true);
    expect(presenter.rules().find((rule) => rule.id === 'missing-translations')?.resultLocale).toBe(
      'de',
    );

    // act
    presenter.setRule('empty-values', false);
    presenter.setRule('missing-translations', false);

    // assert
    expect(presenter.runLabel()).toBe('Run 0 rules');
    expect(presenter.canRun()).toBe(false);
    expect(presenter.rules().find((rule) => rule.id === 'unused-keys')?.result).toBe('Off');
    expect(
      presenter.rules().find((rule) => rule.id === 'missing-translations')?.resultLocale,
    ).toBeNull();
  });

  it('shows the first rule that failed, and the result of a rule that is picked', async () => {
    // arrange
    const { presenter, session } = setUp();

    await session.refresh();

    // act
    await presenter.load();

    // assert
    expect(presenter.selectedId()).toBe('missing-translations');
    expect(presenter.rows()[0].a).toBe('loc.pdf');
    expect(presenter.rows()[0].localeA).toBeNull();

    // act
    presenter.pick('empty-values');

    // assert
    expect(presenter.card()?.title).toBe('No empty values');
  });

  it('allows a value through the configuration, and marks the row while it waits in Review', async () => {
    // arrange
    const { presenter, session, request } = setUp('pending');

    await session.refresh();
    await presenter.load();

    // act
    await presenter.act('allow', presenter.rows()[0]);

    // assert
    expect(request).toHaveBeenCalledWith('config.addException', {
      projectId: 'p1',
      list: 'identicalValues',
      entry: 'Audio',
    });
    expect(presenter.outcome()?.state).toBe('pending');
    expect(presenter.rows()[0].isWaiting).toBe(true);
  });

  it('declares a key used', async () => {
    // arrange
    const { presenter, session, request } = setUp();

    await session.refresh();
    await presenter.load();

    // act
    await presenter.act('declare-used', presenter.rows()[0]);

    // assert
    expect(request).toHaveBeenCalledWith('config.addException', {
      projectId: 'p1',
      list: 'usedKeys',
      entry: 'loc.pdf',
    });
  });

  it('turns what the test lab prepared into a change set only when asked', async () => {
    // arrange
    const { presenter, session, request } = setUp('pending', {
      prepare: 'usedKeys',
      pattern: 'loc.*',
    });

    await session.refresh();
    await presenter.load();

    // assert
    expect(presenter.prepared()).toEqual({
      list: 'usedKeys',
      pattern: 'loc.*',
      listName: 'Used keys',
    });
    expect(request).not.toHaveBeenCalledWith('config.addException', expect.anything());

    // act
    await presenter.applyPrepared();

    // assert
    expect(request).toHaveBeenCalledWith('config.addException', {
      projectId: 'p1',
      list: 'usedKeys',
      entry: 'loc.*',
    });
    expect(presenter.prepared()).toBeNull();
  });

  it('goes to Generate with the keys of the open rule', async () => {
    // arrange
    const { presenter, session } = setUp();

    await session.refresh();
    await presenter.load();

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    // act
    await presenter.translateWithAi();

    // assert
    expect(TestBed.inject(AiHandoff).takeGenerate()?.keys).toEqual(
      presenter.selected()?.rows.flatMap((row) => row.keys),
    );
    expect(navigate).toHaveBeenCalledWith(['/generate']);
  });

  it('goes to the test lab with the widest pattern, as a proposal that writes nothing', async () => {
    // arrange
    const { presenter, session, request } = setUp();

    await session.refresh();
    await presenter.load();

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const original = request.getMockImplementation() as (
      method: string,
      payload: unknown,
    ) => Promise<unknown>;

    request.mockImplementation((method: string, payload: unknown) =>
      method === 'ai.suggestPatterns'
        ? Promise.resolve({
            patterns: [
              { pattern: 'loc.*', matchCount: 3 },
              { pattern: 'loc.pdf', matchCount: 1 },
            ],
            providerName: 'OpenAI',
            dropped: ['The key pattern was stopped. It ran longer than 250 ms.'],
          })
        : original(method, payload),
    );

    // act
    await presenter.suggestPatterns();

    // assert
    expect(TestBed.inject(AiHandoff).takePattern()).toMatchObject({
      pattern: 'loc.*',
      note: expect.stringContaining('The key pattern was stopped.'),
    });
    expect(navigate).toHaveBeenCalledWith(['/test-lab/patterns']);
    expect(request.mock.calls.map(([method]) => method)).not.toContain('config.addException');
  });

  it('says when the AI has no pattern or no provider', async () => {
    // arrange
    const { presenter, session, request } = setUp();

    await session.refresh();
    await presenter.load();

    const original = request.getMockImplementation() as (
      method: string,
      payload: unknown,
    ) => Promise<unknown>;

    request.mockImplementation((method: string, payload: unknown) =>
      method === 'ai.suggestPatterns'
        ? Promise.reject(new Error('No AI provider is set up.'))
        : original(method, payload),
    );

    // act
    await presenter.suggestPatterns();

    // assert
    expect(presenter.aiMessage()).toBe('No AI provider is set up.');
  });
});

describe('rules of a pack in Analyze', () => {
  const PACK_RESULT: AnalyzeRuleResult = {
    id: 'text-expansion',
    passed: false,
    message: 'Check them in the layout, or allow them.',
    locales: [{ locale: 'de', count: 1 }],
    total: 1,
    rows: [
      {
        a: 'auth.failed',
        b: 'Sign-in failed. / Anmeldung fehlgeschlagen.',
        key: 'auth.failed',
        value: null,
        keys: ['auth.failed'],
        locale: 'de',
      },
    ],
    severity: 'warning',
    pack: {
      name: 'Message checks',
      title: '1 values are much longer',
      column: 'Base and translation',
    },
  };

  it('says what the pack says, and where it comes from', () => {
    // act
    const card = describeRule(PACK_RESULT, { baseLocale: 'en', sourceRoot: null });

    // assert
    expect(card).toMatchObject({
      title: '1 values are much longer',
      columnA: 'Key',
      columnB: 'Base and translation',
      actions: [{ id: 'allow-for-rule', label: 'Allow' }],
      hasAi: null,
    });
    expect(card.message).toBe(
      'Check them in the layout, or allow them. From the rule pack Message checks.',
    );
  });

  it('says what a passing rule of a pack says', () => {
    // act
    const card = describeRule(
      {
        ...PACK_RESULT,
        passed: true,
        message: 'Lengths fit.',
        locales: [],
        rows: [],
        pack: { name: 'Message checks', title: 'Lengths fit', column: 'x' },
      },
      { baseLocale: 'en', sourceRoot: null },
    );

    // assert
    expect(card).toMatchObject({
      title: 'Lengths fit',
      message: 'Lengths fit.',
      columnA: 'Locale',
      columnB: 'Result',
    });
  });

  const WITH_PACK: AnalyzeOverview = {
    ...OVERVIEW,
    rules: [
      ...OVERVIEW.rules,
      {
        id: 'icu-syntax',
        group: 'Pack: Message checks',
        description: 'Messages are valid.',
        enabled: true,
        severity: 'error',
        last: { passed: false, locales: [{ locale: 'de', count: 2 }] },
      },
    ],
    refusedPacks: [{ name: 'Our pack', reason: 'Its content hash does not match.' }],
  };

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('groups the rules by their pack, colors a failure by its severity, and names a refused pack', async () => {
    // arrange
    const { presenter, session } = setUp('pending', {}, WITH_PACK);

    await session.refresh();

    // act
    await presenter.load();

    // assert
    expect(presenter.groups().map((group) => group.label)).toEqual([
      'Built-in rules',
      'Pack: Message checks',
    ]);
    expect(presenter.rules().find((rule) => rule.id === 'icu-syntax')?.variant).toBe('danger');
    expect(presenter.refusedPacks()).toEqual([
      { name: 'Our pack', reason: 'Its content hash does not match.' },
    ]);
  });

  it('allows a key for that rule alone, through a change set', async () => {
    // arrange
    const { presenter, session, request } = setUp();

    await session.refresh();
    await presenter.load();
    request.mockClear();

    // act
    await presenter.act('allow-for-rule', PACK_RESULT.rows[0]);

    // assert
    expect(request).toHaveBeenCalledWith('config.addRuleException', {
      projectId: 'p1',
      rule: 'missing-translations',
      key: 'auth.failed',
    });
  });
});

// #region Imports

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { TestPatternResult } from '@pixel-brewery/wortlaut-contracts';
import { AiHandoff, DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestPatternsViewPresenter } from './TestPatternsViewPresenter';

// #endregion

function setUp(navigate = vi.fn(() => Promise.resolve(true)), result?: TestPatternResult) {
  const request = vi.fn((method: string, payload: { pattern?: string }): Promise<unknown> => {
    switch (method) {
      case 'shell.state':
        return Promise.resolve({
          workspace: { id: 'w1', code: 'S', color: 'teal', name: 'Shop' },
          project: { id: 'p1', name: 'shop' },
          provider: null,
          dryRun: true,
          pendingChanges: 0,
        });
      case 'test.pattern':
        return Promise.resolve(
          result ??
            (payload.pattern === '{a'
              ? {
                  error: 'The entry is invalid',
                  matchCount: 0,
                  total: 2,
                  keys: [
                    { key: 'loc.a', isMatch: false },
                    { key: 'loc.b', isMatch: false },
                  ],
                }
              : {
                  error: null,
                  matchCount: 1,
                  total: 2,
                  keys: [
                    { key: 'loc.a', isMatch: true },
                    { key: 'loc.b', isMatch: false },
                  ],
                }),
        );
      default:
        return Promise.reject(new Error(`Unexpected ${method}`));
    }
  });

  TestBed.configureTestingModule({
    providers: [
      TestPatternsViewPresenter,
      { provide: DesktopApi, useValue: { request } },
      { provide: Router, useValue: { navigate } },
    ],
  });

  return { session: TestBed.inject(ShellSession), request };
}

function largeResult(): TestPatternResult {
  return {
    error: null,
    matchCount: 230,
    total: 5000,
    keys: Array.from({ length: 251 }, (_entry, index) => ({
      key: `loc.${index}`,
      isMatch: index < 230,
    })),
  };
}

describe('TestPatternsViewPresenter', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('explains an invalid pattern and offers nothing to add', async () => {
    // arrange
    const { session } = setUp();

    await session.refresh();

    const presenter = TestBed.inject(TestPatternsViewPresenter);

    // act
    presenter.useExample('{a');
    await presenter.result.reload();

    // assert
    expect(presenter.error()).toBe('The entry is invalid');
    expect(presenter.canAdd()).toBe(false);
  });

  it('counts what a pattern covers on real keys, with the grammar of the list', async () => {
    // arrange
    const { session, request } = setUp();

    await session.refresh();

    const presenter = TestBed.inject(TestPatternsViewPresenter);

    // act
    presenter.setList('identicalKeys');
    presenter.useExample('loc.*');
    await presenter.result.reload();

    // assert
    expect(presenter.title()).toBe('1 of 2 keys match');
    expect(request).toHaveBeenLastCalledWith('test.pattern', {
      projectId: 'p1',
      pattern: 'loc.*',
      list: 'identicalKeys',
    });
  });

  it('only prepares a change in Analyze and writes nothing', async () => {
    // arrange
    const navigate = vi.fn(() => Promise.resolve(true));
    const { session, request } = setUp(navigate);

    await session.refresh();

    const presenter = TestBed.inject(TestPatternsViewPresenter);

    presenter.useExample('loc.*');

    // act
    await presenter.add('usedKeys');

    // assert
    expect(navigate).toHaveBeenCalledWith(['/analyze'], {
      queryParams: { prepare: 'usedKeys', pattern: 'loc.*' },
    });
    expect(request.mock.calls.map(([method]) => method)).not.toContain('config.addException');
  });

  it('pages returned keys while preserving full match and omitted-key counts', async () => {
    // arrange
    const { session, request } = setUp(undefined, largeResult());

    await session.refresh();

    const presenter = TestBed.inject(TestPatternsViewPresenter);

    presenter.useExample('loc.*');
    await presenter.result.reload();
    TestBed.tick();

    const asked = request.mock.calls.length;

    // assert
    expect(presenter.keys()).toHaveLength(100);
    expect(presenter.title()).toBe('230 of 5,000 keys match');
    expect(presenter.hiddenKeys()).toBe(4900);

    // act
    presenter.showMoreKeys();

    // assert
    expect(presenter.keys()).toHaveLength(200);
    expect(presenter.hiddenKeys()).toBe(4800);

    // act
    presenter.showMoreKeys();
    TestBed.tick();

    // assert
    expect(presenter.keys()).toHaveLength(251);
    expect(presenter.hasMoreKeys()).toBe(false);
    expect(presenter.hiddenKeys()).toBe(4749);
    expect(presenter.title()).toBe('230 of 5,000 keys match');
    expect(presenter.canAdd()).toBe(true);
    expect(request.mock.calls).toHaveLength(asked);
  });

  it.each(['pattern', 'list'] as const)(
    'starts from the first page when the %s changes',
    async (change) => {
      // arrange
      const { session } = setUp(undefined, largeResult());

      await session.refresh();

      const presenter = TestBed.inject(TestPatternsViewPresenter);

      await presenter.result.reload();
      TestBed.tick();
      presenter.showMoreKeys();

      // act
      if (change === 'pattern') {
        presenter.useExample('loc.*');
      } else {
        presenter.setList('identicalKeys');
      }

      TestBed.tick();

      // assert
      expect(presenter.keys()).toHaveLength(100);
      expect(presenter.hasMoreKeys()).toBe(true);
    },
  );
});

describe('a pattern an AI proposed', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('fills the field and stays a proposal', () => {
    // arrange
    setUp();
    TestBed.inject(AiHandoff).offerPattern({
      pattern: 'loc.api.*',
      note: 'OpenAI proposed this pattern.',
    });

    // act
    const presenter = TestBed.inject(TestPatternsViewPresenter);

    // assert
    expect(presenter.form.pattern().value()).toBe('loc.api.*');
    expect(presenter.proposal()).toBe('OpenAI proposed this pattern.');
  });
});

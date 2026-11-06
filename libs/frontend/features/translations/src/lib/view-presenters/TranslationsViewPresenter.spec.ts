// #region Imports

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { CatalogKeysRequestSchema, IPC_CONTRACT } from '@pixel-brewery/wortlaut-contracts';
import type {
  AiValueProposal,
  CatalogKeyDetail,
  CatalogKeys,
  CatalogOverview,
  IpcPayload,
  WriteOutcome,
} from '@pixel-brewery/wortlaut-contracts';
import { DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flagsOf, TranslationsViewPresenter } from './TranslationsViewPresenter';

// #endregion

const OVERVIEW: CatalogOverview = {
  prefix: 'loc',
  baseLocale: 'en',
  locales: [
    { code: 'en', file: 'lang.en.json' },
    { code: 'de', file: 'lang.de.json' },
    { code: 'it', file: 'lang.it.json' },
    { code: 'fr', file: null },
  ],
  format: 'json',
  commentsSupported: false,
  keyCount: 2,
  fileCount: 2,
  namespaces: Array.from({ length: 15 }, (_item, index) => ({ name: `ns${index}`, count: 2 })),
};

const DETAIL: CatalogKeyDetail = {
  key: 'loc.a',
  base: 'Hello {0}',
  target: 'Hallo {0}',
  comment: null,
  findings: [],
  usages: [{ file: 'src/a.ts', line: 3 }],
};
const KEYS: CatalogKeys = {
  rows: [{ key: 'loc.a', flags: ['placeholder'], base: 'Hello {0}', target: 'Hallo {0}' }],
  matching: 1,
  total: 2,
};
const LARGE_KEYS = Array.from(
  { length: 13102 },
  (_value, index) => `loc.catalog.k${String(index).padStart(5, '0')}`,
);
const LARGE_OVERVIEW: CatalogOverview = {
  ...OVERVIEW,
  keyCount: LARGE_KEYS.length,
  namespaces: LARGE_KEYS.map((key) => ({ name: key.slice('loc.catalog.'.length), count: 1 })),
};

function catalogPage(query: IpcPayload<'catalog.keys'>, count = LARGE_KEYS.length): CatalogKeys {
  const inNamespace = LARGE_KEYS.slice(0, count).filter(
    (key) => query.namespace === null || key.slice('loc.catalog.'.length) === query.namespace,
  );
  const matching = inNamespace.filter(
    (key) => key.includes(query.search) && (query.filter === 'all' || query.filter === 'unused'),
  );

  return {
    rows: matching
      .slice(query.offset, query.offset + query.limit)
      .map((key) => ({ key, flags: ['unused'], base: 'Base value', target: 'Target value' })),
    matching: matching.length,
    total: inNamespace.length,
  };
}

function setUp(
  save: 'applied' | 'pending' = 'pending',
  detail: CatalogKeyDetail = DETAIL,
  readKeys: (query: IpcPayload<'catalog.keys'>) => CatalogKeys = () => KEYS,
  overview: CatalogOverview = OVERVIEW,
  query: Record<string, string> = {},
) {
  const request = vi.fn((method: string, payload: unknown): Promise<unknown> => {
    switch (method) {
      case 'ai.providers':
        return Promise.resolve([
          { id: 'openai', name: 'OpenAI', kind: 'key', state: 'ready', description: '' },
        ]);
      case 'ai.suggestValue':
        return Promise.resolve({ value: 'Bonjour {0}', providerName: 'OpenAI', problem: null });
      case 'ai.cancel':
        return Promise.resolve(undefined);
      case 'shell.state':
        return Promise.resolve({
          workspace: { id: 'w1', code: 'S', color: 'teal', name: 'Shop' },
          project: { id: 'p1', name: 'shop' },
          provider: null,
          dryRun: true,
          pendingChanges: 0,
        });
      case 'catalog.overview':
        return Promise.resolve(overview);
      case 'catalog.keys':
        return Promise.resolve(readKeys(CatalogKeysRequestSchema.parse(payload)));
      case 'catalog.keyDetail':
        return Promise.resolve({
          ...detail,
          key: IPC_CONTRACT['catalog.keyDetail'].request.parse(payload).key,
        });
      case 'catalog.setValue':
      case 'catalog.setComment':
      case 'catalog.addLocale':
        return Promise.resolve({
          state: save,
          changeSetId: 'c1',
          runId: 'r1',
          files: ['lang.de.json'],
        });
      default:
        return Promise.reject(new Error(`Unexpected ${method}`));
    }
  });

  const parameters = convertToParamMap(query);

  TestBed.configureTestingModule({
    providers: [
      TranslationsViewPresenter,
      { provide: DesktopApi, useValue: { request } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: parameters }, queryParamMap: of(parameters) },
      },
    ],
  });

  return {
    presenter: TestBed.inject(TranslationsViewPresenter),
    session: TestBed.inject(ShellSession),
    request,
  };
}

async function loaded(
  save: 'applied' | 'pending' = 'pending',
  detail: CatalogKeyDetail = DETAIL,
  readKeys: (query: IpcPayload<'catalog.keys'>) => CatalogKeys = () => KEYS,
  overview: CatalogOverview = OVERVIEW,
  query: Record<string, string> = {},
) {
  const context = setUp(save, detail, readKeys, overview, query);

  await context.session.refresh();
  await context.presenter.load();
  await vi.waitFor(() => {
    TestBed.tick();

    // A route can already have details while the initial locale effect still reloads its editor.
    expect(context.presenter.detail.status()).toBe('ready');
    expect(context.presenter.detail.value()).not.toBeNull();
    expect(context.presenter.editorForm.value().value()).toBe(
      context.presenter.detail.value()?.target ?? '',
    );
    expect(context.presenter.editorForm.comment().value()).toBe(
      context.presenter.detail.value()?.comment ?? '',
    );
  });

  return context;
}

describe('flagsOf', () => {
  it('writes the flags as badges, with the placeholder of the value', () => {
    expect(
      flagsOf({ flags: ['duplicate', 'unused', 'placeholder'], base: 'At {0} now' }).map(
        (badge) => badge.label,
      ),
    ).toEqual(['Duplicate', 'Unused', '{0}']);
  });
});

describe('TranslationsViewPresenter', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('picks the first target locale with a catalog and the first key', async () => {
    // act
    const { presenter } = await loaded();

    // assert
    expect(presenter.target()).toBe('de');
    expect(presenter.selectedKey()).toBe('loc.a');
    expect(presenter.editorForm.value().value()).toBe('Hallo {0}');
    expect(presenter.keysHeader()).toBe('1 of 2 keys');
  });

  it('shows thirteen namespaces, then N more', async () => {
    // act
    const { presenter } = await loaded();

    // assert
    expect(presenter.namespaces()).toHaveLength(13);
    expect(presenter.moreNamespaces()).toEqual({ label: '2 more', count: '4' });

    // act
    presenter.showMoreNamespaces();

    // assert
    expect(presenter.namespaces()).toHaveLength(15);
    expect(presenter.moreNamespaces()).toBeNull();
  });

  it('shows Save only when dirty, and Revert goes back', async () => {
    // arrange
    const { presenter } = await loaded();

    expect(presenter.isDirty()).toBe(false);

    // act
    presenter.editorForm.value().value.set('Servus');

    // assert
    expect(presenter.isDirty()).toBe(true);

    // act
    presenter.revert();

    // assert
    expect(presenter.isDirty()).toBe(false);
  });

  it('saves a value as a change set for that catalog, which waits in Review while dry run is on', async () => {
    // arrange
    const { presenter, request } = await loaded('pending');

    presenter.editorForm.value().value.set('Servus');

    // act
    await presenter.save();

    // assert
    expect(request).toHaveBeenCalledWith('catalog.setValue', {
      projectId: 'p1',
      key: 'loc.a',
      locale: 'de',
      value: 'Servus',
    });
    expect(presenter.outcome()?.state).toBe('pending');
    expect(presenter.isDirty()).toBe(false);
  });

  it('asks for a locale tag before it adds a locale', async () => {
    // arrange
    const { presenter, request } = await loaded();

    presenter.openAddLocale();

    // act
    presenter.newLocaleForm.code().value.set('not a tag');

    // assert
    expect(presenter.canAddLocale()).toBe(false);

    // act
    presenter.newLocaleForm.code().value.set('pt-BR');
    await presenter.addLocale();

    // assert
    expect(request).toHaveBeenCalledWith('catalog.addLocale', { projectId: 'p1', locale: 'pt-BR' });
    expect(presenter.addingLocale()).toBe(false);
  });

  it('suggests a value with the unsaved comment, and it stays a proposal until it is applied', async () => {
    // arrange
    const { presenter, request } = await loaded();

    presenter.editorForm.comment().value.set('On the greeting screen');

    // act
    await presenter.suggest();

    // assert
    expect(request).toHaveBeenCalledWith('ai.suggestValue', {
      requestId: expect.any(String),
      projectId: 'p1',
      key: 'loc.a',
      locale: 'de',
      comment: 'On the greeting screen',
    });
    expect(presenter.suggestion()?.value).toBe('Bonjour {0}');
    expect(presenter.suggestionNote()).toBe('OpenAI · placeholders kept');
    expect(presenter.editorForm.value().value()).toBe('Hallo {0}');
    expect(request.mock.calls.map(([method]) => method)).not.toContain('catalog.setValue');
  });

  it('fills the editor on Apply and saves nothing, and goes back on Discard', async () => {
    // arrange
    const { presenter, request } = await loaded();

    await presenter.suggest();

    // act
    presenter.applySuggestion();

    // assert
    expect(presenter.editorForm.value().value()).toBe('Bonjour {0}');
    expect(presenter.isDirty()).toBe(true);
    expect(request.mock.calls.map(([method]) => method)).not.toContain('catalog.setValue');

    await presenter.suggest();
    presenter.discardSuggestion();
    expect(presenter.suggestion()).toBeNull();
  });

  it('discards a proposal when the target locale changes', async () => {
    const { presenter } = await loaded();

    await presenter.suggest();

    presenter.targetForm.code().value.set('it');
    TestBed.tick();

    expect(presenter.target()).toBe('it');
    expect(presenter.suggestion()).toBeNull();
  });

  it('cancels an in-flight proposal and ignores its answer after changing locale', async () => {
    const { presenter, request } = await loaded();
    let finish: (value: AiValueProposal) => void = () => undefined;
    const response = new Promise<AiValueProposal>((resolve) => {
      finish = resolve;
    });

    request.mockImplementationOnce(() => response);
    const suggesting = presenter.suggest();

    presenter.targetForm.code().value.set('it');
    TestBed.tick();

    expect(request).toHaveBeenCalledWith('ai.cancel', { requestId: expect.any(String) });

    finish({ value: 'Hallo', providerName: 'OpenAI', problem: null });
    await suggesting;

    expect(presenter.suggestion()).toBeNull();
  });

  it.each(['pending', 'applied'] as const)(
    'keeps the unsaved comment when the value is %s',
    async (state) => {
      const { presenter } = await loaded(state, { ...DETAIL, comment: 'Saved context' });

      presenter.editorForm.value().value.set('Servus');
      presenter.editorForm.comment().value.set('Unsaved context');

      await presenter.save();

      expect(presenter.editorForm.comment().value()).toBe('Unsaved context');
      expect(presenter.isCommentDirty()).toBe(true);
    },
  );

  it.each(['pending', 'applied'] as const)(
    'keeps the unsaved value when the comment is %s',
    async (state) => {
      const { presenter } = await loaded(state, { ...DETAIL, comment: 'Saved context' });

      presenter.editorForm.value().value.set('Servus');
      presenter.editorForm.comment().value.set('Updated context');

      await presenter.saveComment();

      expect(presenter.editorForm.value().value()).toBe('Servus');
      expect(presenter.isDirty()).toBe(true);
    },
  );

  it('keeps a newer value draft while the previous save completes', async () => {
    const { presenter, request } = await loaded();
    let finish: (value: WriteOutcome) => void = () => undefined;
    const response = new Promise<WriteOutcome>((resolve) => {
      finish = resolve;
    });

    presenter.editorForm.value().value.set('First draft');
    request.mockImplementationOnce(() => response);
    const saving = presenter.save();

    presenter.editorForm.value().value.set('Newer draft');
    finish({ state: 'pending', changeSetId: 'c1', runId: 'r1', files: ['lang.de.json'] });
    await saving;

    expect(presenter.editorForm.value().value()).toBe('Newer draft');
    expect(presenter.isDirty()).toBe(true);
  });

  it.each(['value', 'comment'] as const)(
    'keeps the selected key and unrelated draft when applying its %s after search entry',
    async (field) => {
      const detail = { ...DETAIL, comment: 'Saved context' };
      const { presenter } = await loaded('applied', detail, () => KEYS, OVERVIEW, {
        key: 'loc.fromSearch',
      });

      expect(presenter.selectedKey()).toBe('loc.fromSearch');

      await presenter.select('loc.chosen');
      presenter.editorForm.value().value.set('Submitted value');
      presenter.editorForm.comment().value.set('Submitted context');

      if (field === 'value') {
        detail.target = 'Submitted value';
        await presenter.save();
      } else {
        detail.comment = 'Submitted context';
        await presenter.saveComment();
      }

      expect(presenter.selectedKey()).toBe('loc.chosen');
      expect(presenter.detail.value()?.key).toBe('loc.chosen');
      expect(presenter.outcome()?.state).toBe('applied');
      expect(presenter.editorForm.value().value()).toBe('Submitted value');
      expect(presenter.editorForm.comment().value()).toBe('Submitted context');
      expect(presenter.isDirty()).toBe(field !== 'value');
      expect(presenter.isCommentDirty()).toBe(field !== 'comment');
    },
  );

  it.each(['value', 'comment'] as const)(
    'keeps newer value and comment drafts when an applied %s save finishes after search entry',
    async (field) => {
      const detail = { ...DETAIL, comment: 'Saved context' };
      const { presenter, request } = await loaded('applied', detail, () => KEYS, OVERVIEW, {
        key: 'loc.fromSearch',
      });
      let finish: (value: WriteOutcome) => void = () => undefined;
      const response = new Promise<WriteOutcome>((resolve) => {
        finish = resolve;
      });

      expect(presenter.selectedKey()).toBe('loc.fromSearch');

      presenter.editorForm.value().value.set('Submitted value');
      presenter.editorForm.comment().value.set('Submitted context');
      request.mockImplementationOnce(() => response);

      const saving = field === 'value' ? presenter.save() : presenter.saveComment();

      presenter.editorForm.value().value.set('Newer value');
      presenter.editorForm.comment().value.set('Newer context');

      if (field === 'value') {
        detail.target = 'Submitted value';
      } else {
        detail.comment = 'Submitted context';
      }

      finish({ state: 'applied', changeSetId: 'c1', runId: 'r1', files: ['lang.de.json'] });
      await saving;

      expect(presenter.selectedKey()).toBe('loc.fromSearch');
      expect(presenter.outcome()?.state).toBe('applied');
      expect(presenter.editorForm.value().value()).toBe('Newer value');
      expect(presenter.editorForm.comment().value()).toBe('Newer context');
      expect(presenter.isDirty()).toBe(true);
      expect(presenter.isCommentDirty()).toBe(true);
    },
  );

  it('browses past 5,000 keys with bounded requests and keeps the selected editor draft', async () => {
    const { presenter, request } = await loaded('pending', DETAIL, catalogPage, LARGE_OVERVIEW);
    const selected = presenter.selectedKey();

    presenter.editorForm.value().value.set('Unsaved value');
    presenter.pickPage(25);

    await vi.waitFor(() => {
      TestBed.tick();
      expect(presenter.rows()[0]?.key).toBe('loc.catalog.k05000');
    });

    expect(presenter.rows()).toHaveLength(200);
    expect(request).toHaveBeenCalledWith(
      'catalog.keys',
      expect.objectContaining({ offset: 5000, limit: 200 }),
    );
    expect(presenter.selectedKey()).toBe(selected);
    expect(presenter.editorForm.value().value()).toBe('Unsaved value');

    presenter.pickPage(65);

    await vi.waitFor(() => {
      TestBed.tick();
      expect(presenter.rows()[0]?.key).toBe('loc.catalog.k13000');
    });

    expect(presenter.rows()).toHaveLength(102);
    expect(
      request.mock.calls
        .filter(([method]) => method === 'catalog.keys')
        .every(([_method, payload]) => CatalogKeysRequestSchema.parse(payload).limit === 200),
    ).toBe(true);
  });

  it.each(['search', 'namespace', 'filter', 'locale'] as const)(
    'returns to the first page when %s changes',
    async (changed) => {
      const { presenter, request } = await loaded('pending', DETAIL, catalogPage, LARGE_OVERVIEW);

      presenter.pickPage(25);

      await vi.waitFor(() => {
        TestBed.tick();
        expect(presenter.rows()[0]?.key).toBe('loc.catalog.k05000');
      });

      request.mockClear();

      switch (changed) {
        case 'search':
          presenter.searchForm.text().value.set('k');
          break;
        case 'namespace':
          presenter.pickNamespace('k00000');
          break;
        case 'filter':
          presenter.pickFilter('unused');
          break;
        case 'locale':
          presenter.targetForm.code().value.set('it');
          break;
      }

      await vi.waitFor(() => {
        TestBed.tick();
        expect(presenter.page()).toBe(0);
        expect(presenter.rows()[0]?.key).toBe('loc.catalog.k00000');
      });

      const payloads = request.mock.calls
        .filter(([method]) => method === 'catalog.keys')
        .map(([_method, payload]) => CatalogKeysRequestSchema.parse(payload));

      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.every((payload) => payload.offset === 0 && payload.limit === 200)).toBe(true);
    },
  );

  it('reloads the last valid page when the matching count shrinks and keeps the editor draft', async () => {
    let count = LARGE_KEYS.length;
    const { presenter, request } = await loaded(
      'pending',
      DETAIL,
      (query) => catalogPage(query, count),
      LARGE_OVERVIEW,
    );

    presenter.pickPage(65);

    await vi.waitFor(() => {
      TestBed.tick();
      expect(presenter.rows()[0]?.key).toBe('loc.catalog.k13000');
    });

    presenter.editorForm.value().value.set('Unsaved value');
    count = 5000;

    await presenter.keys.reload();

    await vi.waitFor(() => {
      TestBed.tick();
      expect(presenter.page()).toBe(24);
      expect(presenter.rows()[0]?.key).toBe('loc.catalog.k04800');
    });

    expect(request).toHaveBeenCalledWith(
      'catalog.keys',
      expect.objectContaining({ offset: 4800, limit: 200 }),
    );
    expect(presenter.rows()).toHaveLength(200);
    expect(presenter.editorForm.value().value()).toBe('Unsaved value');
  });

  it('reveals namespaces incrementally instead of rendering the entire remainder', async () => {
    const overview = {
      ...OVERVIEW,
      keyCount: 80,
      namespaces: Array.from({ length: 40 }, (_value, index) => ({ name: `ns${index}`, count: 2 })),
    };
    const { presenter } = await loaded('pending', DETAIL, () => ({ ...KEYS, total: 80 }), overview);

    presenter.showMoreNamespaces();

    expect(presenter.namespaces()).toHaveLength(26);
    expect(presenter.moreNamespaces()).toEqual({ label: '14 more', count: '28' });
  });

  it('reveals usages in batches and resets the batch for another selected key', async () => {
    const detail = {
      ...DETAIL,
      usages: Array.from({ length: 123 }, (_value, index) => ({
        file: `src/file-${index}.ts`,
        line: index + 1,
      })),
    };
    const { presenter } = await loaded('pending', detail);

    expect(presenter.usages()).toHaveLength(50);
    expect(presenter.moreUsages()).toBe(73);

    presenter.showMoreUsages();

    expect(presenter.usages()).toHaveLength(100);
    expect(presenter.moreUsages()).toBe(23);

    await presenter.select('loc.other');

    expect(presenter.usages()).toHaveLength(50);
    expect(presenter.moreUsages()).toBe(73);
  });
});

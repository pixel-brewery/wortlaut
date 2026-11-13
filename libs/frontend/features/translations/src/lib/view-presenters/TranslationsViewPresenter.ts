// #region Imports

import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { form } from '@angular/forms/signals';
import { ActivatedRoute } from '@angular/router';
import type {
  AiProvider,
  AiValueProposal,
  CatalogFilter,
  CatalogKeyDetail,
  CatalogKeyRow,
  CatalogKeys,
  CatalogOverview,
  WriteOutcome,
} from '@pixel-brewery/wortlaut-contracts';
import {
  AsyncValue,
  bindShortcuts,
  DesktopApi,
  formatCount,
  localeName,
  ShellSession,
} from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * How many rows one server-backed page holds.
 */
const PAGE_SIZE = 200;

/**
 * How many namespaces the tree reveals at a time.
 */
const LISTED_NAMESPACES = 13;

/**
 * How many source usages the details reveal at a time.
 */
const USAGE_PAGE_SIZE = 50;

/**
 * What a locale tag looks like.
 */
const LOCALE_TAG = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/;

/**
 * Writes the flags of a row as badges.
 *
 * @param row The row.
 * @returns The badges.
 */
export function flagsOf(
  row: Pick<CatalogKeyRow, 'flags' | 'base'>,
): Array<{ id: string; label: string; variant: 'warning' | 'neutral' }> {
  return row.flags.map((flag) => {
    switch (flag) {
      case 'duplicate':
        return { id: flag, label: 'Duplicate', variant: 'warning' as const };
      case 'unused':
        return { id: flag, label: 'Unused', variant: 'neutral' as const };
      default:
        return {
          id: flag,
          label: /\{[^{}]*\}/.exec(row.base)?.[0] ?? 'Placeholder',
          variant: 'neutral' as const,
        };
    }
  });
}

/**
 * Owns Translations: the namespaces, search and filters, the selected key and its editor. Saving builds a change set for one
 * catalog, and with Dry run on it waits in Review.
 */
@Injectable()
export class TranslationsViewPresenter {
  // #region Fields

  private readonly _api = inject(DesktopApi);
  private readonly _shell = inject(ShellSession);
  private readonly _route = inject(ActivatedRoute, { optional: true });
  private readonly _namespace = signal<string | null>(null);
  private readonly _filter = signal<CatalogFilter>('all');
  private readonly _search = signal({ text: '' });
  private readonly _targetModel = signal({ code: '' });
  private readonly _target = computed(() => this._targetModel().code || null);
  private readonly _page = signal(0);
  private _pageQuery = '';
  private readonly _selectedKey = signal<string | null>(null);
  private readonly _editor = signal({ value: '', comment: '' });
  private readonly _namespaceLimit = signal(LISTED_NAMESPACES);
  private readonly _usageLimit = signal(USAGE_PAGE_SIZE);
  private readonly _outcome = signal<WriteOutcome | null>(null);
  private readonly _message = signal<string | null>(null);
  private readonly _busy = signal(false);
  private readonly _addingLocale = signal(false);
  private readonly _newLocale = signal({ code: '' });
  private readonly _suggestion = signal<AiValueProposal | null>(null);
  private readonly _suggesting = signal<string | null>(null);
  private readonly _suggestError = signal<string | null>(null);

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `TranslationsViewPresenter` class.
   */
  public constructor() {
    bindShortcuts({
      run: () => this.save(),
      suggest: () => this.suggest(),
      next: () => this.selectNextOpen(),
    });

    // A result of the search opens its key, also while this view is open already.
    const opened = this._route?.queryParamMap.subscribe((parameters) => {
      const key = parameters.get('key');

      if (key && this.overview.value()) {
        void this.open(key);
      }
    });

    inject(DestroyRef).onDestroy(() => opened?.unsubscribe());

    // Search and filters ask main again. Reading the catalogs happens once, so this stays quick.
    effect(() => {
      const query = JSON.stringify([
        this._namespace(),
        this._filter(),
        this._search().text,
        this._target(),
      ]);
      const page = this._page();

      untracked(() => {
        if (query !== this._pageQuery) {
          this._pageQuery = query;

          if (page !== 0) {
            this._page.set(0);

            return;
          }
        }

        if (this.overview.value()) {
          void this.keys.reload();
        }
      });
    });

    // The first key shows its details until the user picks another one.
    effect(() => {
      const first = this.keys.value()?.rows[0];

      untracked(() => {
        if (first && !this._selectedKey()) {
          void this.select(first.key);
        }
      });
    });

    // Another locale means other values in the editor.
    effect(() => {
      this._target();

      untracked(() => {
        if (this._selectedKey()) {
          this.discardSuggestion();
          this._usageLimit.set(USAGE_PAGE_SIZE);
          void this.reloadDetail();
        }
      });
    });

    // Editing or reloading a catalog can remove the matches of its last page.
    effect(() => {
      const keys = this.keys.value();
      const status = this.keys.status();
      const page = this._page();

      if (keys && status === 'ready') {
        const last = Math.max(0, Math.ceil(keys.matching / PAGE_SIZE) - 1);

        if (page > last) {
          this._page.set(last);
        }
      }
    });
  }

  // #endregion

  // #region Properties

  /**
   * Gets the frame of the view.
   *
   * @readonly
   */
  public readonly overview = new AsyncValue<CatalogOverview>(() =>
    this._api.request('catalog.overview', { projectId: this.requireProject(), refresh: true }),
  );

  /**
   * Gets the rows of the table.
   *
   * @readonly
   */
  public readonly keys = new AsyncValue<CatalogKeys>(() =>
    this._api.request('catalog.keys', {
      projectId: this.requireProject(),
      namespace: this._namespace(),
      search: this._search().text,
      filter: this._filter(),
      targetLocale: this._target(),
      offset: this._page() * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
  );

  /**
   * Gets the details of the selected key.
   *
   * @readonly
   */
  public readonly detail = new AsyncValue<CatalogKeyDetail | null>(async () => {
    const key = this._selectedKey();

    return key
      ? this._api.request('catalog.keyDetail', {
          projectId: this.requireProject(),
          key,
          targetLocale: this._target(),
        })
      : null;
  });

  /**
   * Gets the form of the search.
   *
   * @readonly
   */
  public readonly searchForm = form(this._search);

  /**
   * Gets the form of the locale that is edited.
   *
   * @readonly
   */
  public readonly targetForm = form(this._targetModel);

  /**
   * Gets the form of the editor.
   *
   * @readonly
   */
  public readonly editorForm = form(this._editor);

  /**
   * Gets the form of a new locale.
   *
   * @readonly
   */
  public readonly newLocaleForm = form(this._newLocale);

  /**
   * Gets the filter.
   *
   * @readonly
   */
  public readonly filter = this._filter.asReadonly();

  /**
   * Gets the namespaces of the tree.
   *
   * @readonly
   */
  public readonly namespaces = computed(() => {
    const all = this.overview.value()?.namespaces ?? [];
    const listed = all.slice(0, this._namespaceLimit());

    return listed.map((namespace) => ({
      ...namespace,
      label: formatCount(namespace.count),
      isActive: namespace.name === this._namespace(),
    }));
  });

  /**
   * Gets what "N more" holds together.
   *
   * @readonly
   */
  public readonly moreNamespaces = computed(() => {
    const all = this.overview.value()?.namespaces ?? [];
    const rest = all.slice(this._namespaceLimit());

    return rest.length > 0
      ? {
          label: `${rest.length} more`,
          count: formatCount(rest.reduce((sum, namespace) => sum + namespace.count, 0)),
        }
      : null;
  });

  /**
   * Gets the prefix all keys share.
   *
   * @readonly
   */
  public readonly prefix = computed(() => this.overview.value()?.prefix ?? '');

  /**
   * Gets the locales that can be edited.
   *
   * @readonly
   */
  public readonly targetLocales = computed(() => {
    const overview = this.overview.value();

    return (overview?.locales ?? [])
      .filter((locale) => locale.file !== null && locale.code !== overview?.baseLocale)
      .map((locale) => ({
        code: locale.code,
        label: `${localeName(locale.code)} (${locale.code})`,
      }));
  });

  /**
   * Gets the locale that is edited.
   *
   * @readonly
   */
  public readonly target = computed(() => this._target());

  /**
   * Gets the name of the base locale.
   *
   * @readonly
   */
  public readonly baseName = computed(() => localeName(this.overview.value()?.baseLocale ?? 'en'));

  /**
   * Gets the header of the base locale.
   *
   * @readonly
   */
  public readonly baseHeader = computed(() => `${this.baseName()} · base`);

  /**
   * Gets the name of the locale that is edited.
   *
   * @readonly
   */
  public readonly targetHeader = computed(() => {
    const target = this._target();

    return target ? localeName(target) : 'No target locale';
  });

  /**
   * Gets the header of the table.
   *
   * @readonly
   */
  public readonly keysHeader = computed(() => {
    const keys = this.keys.value();
    const namespace = this._namespace();

    return keys
      ? [namespace, `${formatCount(keys.matching)} of ${formatCount(keys.total)} keys`]
          .filter((part) => part !== null)
          .join(' · ')
      : 'Keys';
  });

  /**
   * Gets the rows with their badges.
   *
   * @readonly
   */
  public readonly rows = computed(() =>
    (this.keys.value()?.rows ?? []).map((row) => ({
      ...row,
      badges: flagsOf(row),
      isSelected: row.key === this._selectedKey(),
    })),
  );

  /**
   * Gets the zero-based page of keys.
   *
   * @readonly
   */
  public readonly page = this._page.asReadonly();

  /**
   * Gets how many rows a page can hold.
   *
   * @readonly
   */
  public readonly pageSize = PAGE_SIZE;

  /**
   * Gets how many keys match the current query across all pages.
   *
   * @readonly
   */
  public readonly matchingCount = computed(() => this.keys.value()?.matching ?? 0);

  /**
   * Gets the revealed source usages of the selected key.
   *
   * @readonly
   */
  public readonly usages = computed(() =>
    (this.detail.value()?.usages ?? []).slice(0, this._usageLimit()),
  );

  /**
   * Gets how many usages have not been revealed yet.
   *
   * @readonly
   */
  public readonly moreUsages = computed(() =>
    Math.max(0, (this.detail.value()?.usages.length ?? 0) - this._usageLimit()),
  );

  /**
   * Gets the selected key.
   *
   * @readonly
   */
  public readonly selectedKey = this._selectedKey.asReadonly();

  /**
   * Gets whether the value differs from the catalog.
   *
   * @readonly
   */
  public readonly isDirty = computed(() => {
    const detail = this.detail.value();

    return detail !== null && this._editor().value !== (detail.target ?? '');
  });

  /**
   * Gets whether the comment differs from the catalog.
   *
   * @readonly
   */
  public readonly isCommentDirty = computed(() => {
    const detail = this.detail.value();

    return detail !== null && detail.comment !== null && this._editor().comment !== detail.comment;
  });

  /**
   * Gets the AI providers with their true state.
   *
   * @readonly
   */
  public readonly providers = new AsyncValue<ReadonlyArray<AiProvider>>(() =>
    this._api.request('ai.providers', {}),
  );

  /**
   * Gets whether a provider can answer.
   *
   * @readonly
   */
  public readonly hasProvider = computed(() =>
    (this.providers.value() ?? []).some((provider) => provider.state === 'ready'),
  );

  /**
   * Gets whether Codex is available to the engine for a suggestion.
   */
  public readonly codexAvailable = computed(() =>
    (this.providers.value() ?? []).some(
      (provider) => provider.id === 'codex' && provider.state === 'ready',
    ),
  );

  /**
   * Gets a suggested value. It stays a proposal: Apply fills the editor and saves nothing.
   *
   * @readonly
   */
  public readonly suggestion = this._suggestion.asReadonly();

  /**
   * Gets what the suggestion says about its placeholders.
   *
   * @readonly
   */
  public readonly suggestionNote = computed(() => {
    const suggestion = this._suggestion();

    return suggestion
      ? `${suggestion.providerName} · ${suggestion.problem ?? 'placeholders kept'}`
      : '';
  });

  /**
   * Gets whether a suggestion is on its way.
   *
   * @readonly
   */
  public readonly isSuggesting = computed(() => this._suggesting() !== null);

  /**
   * Gets why the last suggestion failed.
   *
   * @readonly
   */
  public readonly suggestError = this._suggestError.asReadonly();

  /**
   * Gets the label of the button.
   *
   * @readonly
   */
  public readonly suggestLabel = computed(() => {
    const target = this.target();

    return target ? `Suggest ${localeName(target)}` : 'Suggest';
  });

  /**
   * Gets whether the catalog format has a place for comments.
   *
   * @readonly
   */
  public readonly commentsSupported = computed(
    () => this.overview.value()?.commentsSupported ?? false,
  );

  /**
   * Gets what the last save did.
   *
   * @readonly
   */
  public readonly outcome = this._outcome.asReadonly();

  /**
   * Gets why the last save failed.
   *
   * @readonly
   */
  public readonly message = this._message.asReadonly();

  /**
   * Gets whether a save is going on.
   *
   * @readonly
   */
  public readonly busy = this._busy.asReadonly();

  /**
   * Gets whether the dialog of a new locale is open.
   *
   * @readonly
   */
  public readonly addingLocale = this._addingLocale.asReadonly();

  /**
   * Gets whether the new locale can be added.
   *
   * @readonly
   */
  public readonly canAddLocale = computed(
    () => LOCALE_TAG.test(this._newLocale().code.trim()) && !this._busy(),
  );

  // #endregion

  // #region Methods

  /**
   * Loads the view.
   *
   * @returns When it is loaded.
   */
  public async load(): Promise<void> {
    await this.reload();

    const key = this._route?.snapshot.queryParamMap.get('key');

    if (key && this.overview.value()) {
      await this.open(key);
    }
  }

  /**
   * Opens a key that a result of the search names: the table shows it, and the editor holds it.
   *
   * @param key The key.
   * @returns When its details are loaded.
   */
  public async open(key: string): Promise<void> {
    this._page.set(0);
    this._namespace.set(null);
    this._filter.set('all');
    this._search.set({ text: key });
    await this.select(key);
  }

  /**
   * Selects the next key that still needs something: one its target lacks, or one with a flag. After the last it starts over.
   *
   * @returns When its details are loaded.
   */
  public async selectNextOpen(): Promise<void> {
    const rows = this.keys.value()?.rows ?? [];
    const isOpen = (row: CatalogKeyRow): boolean =>
      row.target === null || row.target.length === 0 || row.flags.length > 0;
    const current = rows.findIndex((row) => row.key === this._selectedKey());
    const next = [...rows.slice(current + 1), ...rows.slice(0, current + 1)].find((row) =>
      isOpen(row),
    );

    if (next) {
      await this.select(next.key);
    }
  }

  /**
   * Shows one namespace, or all of them.
   *
   * @param name The namespace, or `null` for all.
   */
  public pickNamespace(name: string | null): void {
    this._namespace.set(name === this._namespace() ? null : name);
    this._page.set(0);
  }

  /**
   * Reveals the next group of namespaces.
   */
  public showMoreNamespaces(): void {
    this._namespaceLimit.update((limit) => limit + LISTED_NAMESPACES);
  }

  /**
   * Sets the filter.
   *
   * @param filter The filter.
   */
  public pickFilter(filter: CatalogFilter): void {
    this._filter.set(filter);
    this._page.set(0);
  }

  /**
   * Selects a bounded page without changing the selected key or editor draft.
   *
   * @param page - The zero-based page index.
   */
  public pickPage(page: number): void {
    if (Number.isInteger(page)) {
      const last = Math.max(0, Math.ceil(this.matchingCount() / PAGE_SIZE) - 1);

      this._page.set(Math.max(0, Math.min(page, last)));
    }
  }

  /**
   * Reveals the next group of source usages.
   */
  public showMoreUsages(): void {
    this._usageLimit.update((limit) => limit + USAGE_PAGE_SIZE);
  }

  /**
   * Selects a key.
   *
   * @param key The key.
   * @returns When its details are loaded.
   */
  public async select(key: string): Promise<void> {
    this.discardSuggestion();
    this._usageLimit.set(USAGE_PAGE_SIZE);
    this._selectedKey.set(key);
    this._outcome.set(null);
    this._message.set(null);
    await this.reloadDetail();
  }

  /**
   * Saves the value, as a change set for that catalog.
   *
   * @returns When it is done.
   */
  public async save(): Promise<void> {
    const key = this._selectedKey();
    const locale = this._target();

    if (key && locale && this.isDirty()) {
      await this.write(
        () =>
          this._api.request('catalog.setValue', {
            projectId: this.requireProject(),
            key,
            locale,
            value: this._editor().value,
          }),
        'value',
      );
    }
  }

  /**
   * Goes back to the value of the catalog.
   */
  public revert(): void {
    const detail = this.detail.value();

    this._editor.update((editor) => ({ ...editor, value: detail?.target ?? '' }));
  }

  /**
   * Asks for a value from the base value, the comment and the instructions of the project.
   *
   * @returns When the answer is there.
   */
  public async suggest(): Promise<void> {
    const key = this._selectedKey();
    const locale = this.target();

    if (!key || !locale) {
      return;
    }

    const requestId = crypto.randomUUID();

    this._suggesting.set(requestId);
    this._suggestion.set(null);
    this._suggestError.set(null);

    try {
      const suggestion = await this._api.request('ai.suggestValue', {
        requestId,
        projectId: this.requireProject(),
        key,
        locale,
        comment: this._editor().comment,
      });

      if (this._suggesting() === requestId) {
        this._suggestion.set(suggestion);
      }
    } catch (error) {
      if (this._suggesting() === requestId) {
        this._suggestError.set(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (this._suggesting() === requestId) {
        this._suggesting.set(null);
      }
    }
  }

  /**
   * Fills the editor with the suggestion, without saving.
   */
  public applySuggestion(): void {
    const suggestion = this._suggestion();

    if (suggestion) {
      this._editor.update((editor) => ({ ...editor, value: suggestion.value }));
      this._suggestion.set(null);
    }
  }

  /**
   * Goes back to no suggestion, and cancels one that is on its way.
   */
  public discardSuggestion(): void {
    const requestId = this._suggesting();

    if (requestId) {
      void this._api.request('ai.cancel', { requestId });
    }

    this._suggesting.set(null);
    this._suggestion.set(null);
    this._suggestError.set(null);
  }

  /**
   * Saves the comment, as a change set for that catalog.
   *
   * @returns When it is done.
   */
  public async saveComment(): Promise<void> {
    const key = this._selectedKey();
    const locale = this._target() ?? this.overview.value()?.baseLocale;

    if (key && locale && this.isCommentDirty()) {
      await this.write(
        () =>
          this._api.request('catalog.setComment', {
            projectId: this.requireProject(),
            key,
            locale,
            comment: this._editor().comment,
          }),
        'comment',
      );
    }
  }

  /**
   * Opens the dialog of a new locale.
   */
  public openAddLocale(): void {
    this._newLocale.set({ code: '' });
    this._addingLocale.set(true);
  }

  /**
   * Closes the dialog of a new locale.
   */
  public closeAddLocale(): void {
    this._addingLocale.set(false);
  }

  /**
   * Adds a locale as a copy of the base locale, for every catalog of it.
   *
   * @returns When it is done.
   */
  public async addLocale(): Promise<void> {
    if (this.canAddLocale()) {
      await this.write(
        () =>
          this._api.request('catalog.addLocale', {
            projectId: this.requireProject(),
            locale: this._newLocale().code.trim(),
          }),
        null,
      );
      this._addingLocale.set(false);
    }
  }

  /**
   * @private
   */
  private async write(
    request: () => Promise<WriteOutcome>,
    field: 'value' | 'comment' | null,
  ): Promise<void> {
    if (this._busy()) {
      return;
    }

    const key = this._selectedKey();
    const locale = this._target();
    const submitted = this._editor();

    this._busy.set(true);
    this._message.set(null);

    try {
      const outcome = await request();

      this._outcome.set(outcome);

      if (outcome.state === 'applied') {
        await this.reload();
        await this.detail.reload();
      }

      if (
        field &&
        outcome.state !== 'unchanged' &&
        key === this._selectedKey() &&
        locale === this._target()
      ) {
        const detail = this.detail.value();
        const saved = field === 'value' ? (detail?.target ?? '') : (detail?.comment ?? '');

        // Saving one field leaves the other draft, and any edits made during the save, in place.
        this._editor.update((editor) =>
          editor[field] === submitted[field] ? { ...editor, [field]: saved } : editor,
        );
      }
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    } finally {
      this._busy.set(false);
    }
  }

  /**
   * Refreshes catalog data without reopening a route's initial key or replacing editor drafts.
   *
   * @private
   */
  private async reload(): Promise<void> {
    void this.providers.reload();
    await this.overview.reload();

    const overview = this.overview.value();

    if (overview) {
      if (
        !overview.locales.some((locale) => locale.code === this._target() && locale.file !== null)
      ) {
        this._targetModel.set({
          code:
            overview.locales.find(
              (locale) => locale.file !== null && locale.code !== overview.baseLocale,
            )?.code ?? '',
        });
      }

      await this.keys.reload();
    }
  }

  /**
   * @private
   */
  private async reloadDetail(): Promise<void> {
    await this.detail.reload();

    const detail = this.detail.value();

    this._editor.set({ value: detail?.target ?? '', comment: detail?.comment ?? '' });
  }

  /**
   * @private
   */
  private requireProject(): string {
    const project = this._shell.project();

    if (!project) {
      throw new Error('No project is open.');
    }

    return project.id;
  }

  // #endregion
}

// #region Imports

import { computed, inject, Injectable, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import type {
  ProjectSettings,
  ProjectSettingsChanges,
  WriteOutcome,
} from '@pixel-brewery/wortlaut-contracts';
import {
  AsyncValue,
  DesktopApi,
  formatName,
  localeName,
  presetName,
  RunCenter,
  ShellSession,
} from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * The presets a project can choose.
 */
const PRESETS = ['angular', 'lit', 'react', 'stencil', 'vue'] as const;

/**
 * The formats a catalog can be read in.
 */
const FORMATS = ['json', 'resx', 'po'] as const;

/**
 * What a locale tag looks like.
 */
const LOCALE_TAG = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/;

/**
 * The lists of chips with their field for a new entry.
 */
export type SettingsList = 'targetLocales' | 'usedKeys' | 'identicalKeys' | 'identicalValues';

/**
 * The lists of Analyzer defaults with what they say.
 */
const EXCEPTION_LISTS: ReadonlyArray<{
  id: Exclude<SettingsList, 'targetLocales'>;
  label: string;
  hint: string;
}> = [
  {
    id: 'usedKeys',
    label: 'Used keys',
    hint: 'Keys that other code composes at runtime. Exact keys, globs or /regex/.',
  },
  {
    id: 'identicalKeys',
    label: 'Identical keys',
    hint: 'May equal the base locale. * matches any characters.',
  },
  {
    id: 'identicalValues',
    label: 'Identical values',
    hint: 'Brand names, units and abbreviations that need no translation.',
  },
];

/**
 * Compares two lists without looking at their order.
 *
 * @param a The one list.
 * @param b The other list.
 * @returns Whether they hold the same entries.
 */
function isSameList(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  return a.length === b.length && a.every((entry) => b.includes(entry));
}

/**
 * Owns Settings: project. Saving builds one change set against the file each value comes from, so it is a normal diff in the
 * repository. A folder comes from a native dialog and main checks that it lies inside the project.
 */
@Injectable()
export class SettingsProjectViewPresenter {
  // #region Fields

  private readonly _api = inject(DesktopApi);
  private readonly _shell = inject(ShellSession);
  private readonly _runs = inject(RunCenter);
  private readonly _model = signal({
    preset: '',
    format: 'json',
    prefix: '',
    suffix: '',
    baseLocale: '',
  });
  private readonly _lists = signal<Readonly<Record<SettingsList, ReadonlyArray<string>>>>({
    targetLocales: [],
    usedKeys: [],
    identicalKeys: [],
    identicalValues: [],
  });
  private readonly _rules = signal<ReadonlySet<string>>(new Set());
  private readonly _entries = signal({
    targetLocales: '',
    usedKeys: '',
    identicalKeys: '',
    identicalValues: '',
  });
  private readonly _sourceRoot = signal<{ token: string; displayPath: string } | null>(null);
  private readonly _addedRoots = signal<ReadonlyArray<{ token: string; displayPath: string }>>([]);
  private readonly _removedRoots = signal<ReadonlySet<number>>(new Set());
  private readonly _outcome = signal<WriteOutcome | null>(null);
  private readonly _message = signal<string | null>(null);
  private readonly _busy = signal(false);

  // #endregion

  // #region Properties

  /**
   * Gets whether a project is open.
   *
   * @readonly
   */
  public readonly hasProject = computed(() => this._shell.project() !== null);

  /**
   * Gets the settings of the open project.
   *
   * @readonly
   */
  public readonly settings = new AsyncValue<ProjectSettings | null>(async () => {
    const project = this._shell.project();

    return project ? this._api.request('project.settings', { projectId: project.id }) : null;
  });

  /**
   * Gets the form of the values.
   *
   * @readonly
   */
  public readonly form = form(this._model);

  /**
   * Gets the form of the new entries of the lists.
   *
   * @readonly
   */
  public readonly entriesForm = form(this._entries);

  /**
   * Gets the presets with their names.
   *
   * @readonly
   */
  public readonly presets = PRESETS.map((id) => ({ id, name: presetName(id) }));

  /**
   * Gets the catalog formats with their names.
   *
   * @readonly
   */
  public readonly formats = FORMATS.map((id) => ({ id, name: formatName(id) }));

  /**
   * Gets the base locale choices: the locales the project has.
   *
   * @readonly
   */
  public readonly baseLocales = computed(() => {
    const settings = this.settings.value();
    const codes = Array.from(
      new Set([settings?.baseLocale ?? 'en', ...(settings?.targetLocales ?? [])]),
    );

    return codes.map((code) => ({ code, label: `${localeName(code)} (${code})` }));
  });

  /**
   * Gets the source root to show.
   *
   * @readonly
   */
  public readonly sourceRoot = computed(
    () => this._sourceRoot()?.displayPath ?? this.settings.value()?.sourceRoot ?? '',
  );

  /**
   * Gets the resource roots to show.
   *
   * @readonly
   */
  public readonly resourceRoots = computed(() => [
    ...(this.settings.value()?.resourceRoots ?? []).flatMap((label, index) =>
      this._removedRoots().has(index)
        ? []
        : [{ id: `existing-${index}`, label, index, token: null }],
    ),
    ...this._addedRoots().map((root) => ({
      id: root.token,
      label: root.displayPath,
      index: -1,
      token: root.token,
    })),
  ]);

  /**
   * Gets the chips of the target locales.
   *
   * @readonly
   */
  public readonly targetLocales = computed(() => this._lists().targetLocales);

  /**
   * Gets the lists of Analyzer defaults with their entries.
   *
   * @readonly
   */
  public readonly exceptionLists = computed(() =>
    EXCEPTION_LISTS.map((list) => ({ ...list, items: this._lists()[list.id] })),
  );

  /**
   * Gets the rules with their state.
   *
   * @readonly
   */
  public readonly rules = computed(() =>
    (this.settings.value()?.rules ?? []).map((rule) => ({
      id: rule.id,
      isChecked: this._rules().has(rule.id),
    })),
  );

  /**
   * Gets what would change.
   *
   * @readonly
   */
  public readonly changes = computed<ProjectSettingsChanges>(() => {
    const settings = this.settings.value();

    if (!settings) {
      return {};
    }

    const model = this._model();
    const lists = this._lists();
    const rules = Array.from(this._rules());
    const changes: ProjectSettingsChanges = {};
    const enabledBefore = settings.rules.filter((rule) => rule.enabled).map((rule) => rule.id);

    if (model.preset !== (settings.preset ?? '')) {
      changes.preset = (model.preset || null) as ProjectSettings['preset'];
    }

    if (model.format !== settings.format) {
      changes.format = model.format as ProjectSettings['format'];
    }

    if (model.prefix !== settings.prefix) {
      changes.prefix = model.prefix;
    }

    if (model.suffix !== settings.suffix) {
      changes.suffix = model.suffix;
    }

    if (model.baseLocale !== settings.baseLocale) {
      changes.baseLocale = model.baseLocale;
    }

    if (!isSameList(lists.targetLocales, settings.targetLocales)) {
      changes.targetLocales = [...lists.targetLocales];
    }

    if (!isSameList(rules, enabledBefore)) {
      changes.rules = rules;
    }

    for (const name of ['usedKeys', 'identicalKeys', 'identicalValues'] as const) {
      if (!isSameList(lists[name], settings[name])) {
        changes[name] = [...lists[name]];
      }
    }

    const sourceRoot = this._sourceRoot();

    if (sourceRoot) {
      changes.sourceRootToken = sourceRoot.token;
    }

    if (this._addedRoots().length > 0) {
      changes.addResourceRootTokens = this._addedRoots().map((root) => root.token);
    }

    if (this._removedRoots().size > 0) {
      changes.removeResourceRoots = Array.from(this._removedRoots());
    }

    return changes;
  });

  /**
   * Gets whether anything changed.
   *
   * @readonly
   */
  public readonly isDirty = computed(() => Object.keys(this.changes()).length > 0);

  /**
   * Gets what the last save did.
   *
   * @readonly
   */
  public readonly outcome = this._outcome.asReadonly();

  /**
   * Gets why the last action failed.
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

  // #endregion

  // #region Methods

  /**
   * Loads the settings and starts from them.
   *
   * @returns When they are loaded.
   */
  public async load(): Promise<void> {
    await this._runs.connect();
    await this.settings.reload();
    this.discard();
  }

  /**
   * Goes back to the values of the project.
   */
  public discard(): void {
    const settings = this.settings.value();

    if (settings) {
      this._model.set({
        preset: settings.preset ?? '',
        format: settings.format,
        prefix: settings.prefix,
        suffix: settings.suffix,
        baseLocale: settings.baseLocale,
      });
      this._lists.set({
        targetLocales: settings.targetLocales,
        usedKeys: settings.usedKeys,
        identicalKeys: settings.identicalKeys,
        identicalValues: settings.identicalValues,
      });
      this._rules.set(
        new Set(settings.rules.filter((rule) => rule.enabled).map((rule) => rule.id)),
      );
      this._entries.set({
        targetLocales: '',
        usedKeys: '',
        identicalKeys: '',
        identicalValues: '',
      });
      this._sourceRoot.set(null);
      this._addedRoots.set([]);
      this._removedRoots.set(new Set());
    }
  }

  /**
   * Saves what changed, as one change set.
   *
   * @returns When it is done.
   */
  public async save(): Promise<void> {
    const project = this._shell.project();

    if (!project || !this.isDirty()) {
      return;
    }

    this._busy.set(true);
    this._message.set(null);

    try {
      this._outcome.set(
        await this._api.request('config.update', {
          projectId: project.id,
          changes: this.changes(),
        }),
      );
      await this.settings.reload();
      this.discard();
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    } finally {
      this._busy.set(false);
    }
  }

  /**
   * Turns a rule on or off. Setting what is already set changes nothing, because a checkbox also reports the state it was
   * bound to.
   *
   * @param id The rule.
   * @param isChecked Whether it runs.
   */
  public setRule(id: string, isChecked: boolean): void {
    if (this._rules().has(id) !== isChecked) {
      const next = new Set(this._rules());

      if (isChecked) {
        next.add(id);
      } else {
        next.delete(id);
      }

      this._rules.set(next);
    }
  }

  /**
   * Adds the entry that was typed for a list.
   *
   * @param list The list.
   */
  public addEntry(list: SettingsList): void {
    const entry = this._entries()[list].trim();

    if (!entry || this._lists()[list].includes(entry)) {
      return;
    }

    if (list === 'targetLocales' && !LOCALE_TAG.test(entry)) {
      this._message.set(`'${entry}' is no locale. Write it like fr or pt-BR.`);

      return;
    }

    this._message.set(null);
    this._lists.update((lists) => ({ ...lists, [list]: [...lists[list], entry] }));
    this._entries.update((entries) => ({ ...entries, [list]: '' }));
  }

  /**
   * Removes an entry from a list. Closing a locale never deletes a file.
   *
   * @param list The list.
   * @param entry The entry.
   */
  public removeEntry(list: SettingsList, entry: string): void {
    this._lists.update((lists) => ({
      ...lists,
      [list]: lists[list].filter((candidate) => candidate !== entry),
    }));
  }

  /**
   * Chooses the source root in a native dialog. Main refuses a folder outside of the project.
   *
   * @returns When it is done.
   */
  public async chooseSourceRoot(): Promise<void> {
    const folder = await this.chooseFolder();

    if (folder) {
      this._sourceRoot.set(folder);
    }
  }

  /**
   * Adds a resource root through a native dialog. Main refuses a folder outside of the project.
   *
   * @returns When it is done.
   */
  public async addResourceRoot(): Promise<void> {
    const folder = await this.chooseFolder();

    if (folder) {
      this._addedRoots.update((roots) => [...roots, folder]);
    }
  }

  /**
   * Takes a resource root out of the project's settings. The folder stays where it is.
   *
   * @param root The chip of the root.
   * @param root.index The position of an existing root.
   * @param root.token The token of a root that was just added.
   */
  public removeResourceRoot(root: { index: number; token: string | null }): void {
    if (root.token) {
      this._addedRoots.update((roots) =>
        roots.filter((candidate) => candidate.token !== root.token),
      );
    } else {
      this._removedRoots.update((removed) => new Set([...removed, root.index]));
    }
  }

  /**
   * @private
   */
  private async chooseFolder(): Promise<{ token: string; displayPath: string } | null> {
    const project = this._shell.project();

    if (!project) {
      return null;
    }

    this._message.set(null);

    try {
      return (
        await this._api.request('dialog.chooseFolder', {
          insideToken: null,
          insideProjectId: project.id,
        })
      ).folder;
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));

      return null;
    }
  }

  // #endregion
}

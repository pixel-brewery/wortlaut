// #region Imports

import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type {
  RulePackAccess,
  RulePackAvailable,
  RulePackEntry,
  RulePackUpdate,
  RulePackWrite,
  RuleSeverity,
} from '@pixel-brewery/wortlaut-contracts';
import {
  AsyncValue,
  countOf,
  DesktopApi,
  RunCenter,
  ShellSession,
} from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

const LIST_PAGE_SIZE = 50;
const RULE_PAGE_SIZE = 100;

/**
 * The severities a rule can have.
 */
const SEVERITIES: ReadonlyArray<{ value: RuleSeverity; label: string }> = [
  { value: 'error', label: 'Error' },
  { value: 'warning', label: 'Warning' },
  { value: 'off', label: 'Off' },
];

/**
 * Writes a content hash short enough to read.
 *
 * @param hash The hash.
 * @returns For example `sha256:fdaa4ba6…7d36`.
 */
export function shortHash(hash: string): string {
  return `${hash.slice(0, 'sha256:'.length + 8)}…${hash.slice(-4)}`;
}

/**
 * Writes what a pack may do as the badges of Source and trust.
 *
 * @param access What the pack may do.
 * @returns The badges.
 */
export function accessBadges(
  access: RulePackAccess,
): Array<{ label: string; variant: 'success' | 'neutral' | 'warning' }> {
  return [
    ...(access.declarative
      ? [{ label: 'Declarative, runs no code', variant: 'success' as const }]
      : []),
    ...(access.readsCatalogs ? [{ label: 'Reads catalogs', variant: 'neutral' as const }] : []),
    access.readsSource
      ? { label: 'Reads source code', variant: 'neutral' as const }
      : { label: 'No source code', variant: 'success' as const },
    access.network
      ? { label: 'Uses the network', variant: 'warning' as const }
      : { label: 'No network', variant: 'success' as const },
    ...(access.ai ? [{ label: 'Uses AI', variant: 'warning' as const }] : []),
  ];
}

/**
 * Writes the rows of Source and trust.
 *
 * @param pack The pack.
 * @param update What its source says now.
 * @param appVersion The version of the app, which is the version of the built-in rules.
 * @returns The rows.
 */
export function sourceRows(
  pack: RulePackEntry,
  update: RulePackUpdate | null,
  appVersion: string | null,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [{ label: 'Source', value: pack.source }];
  const version = pack.locked ? appVersion : pack.version;

  if (version) {
    rows.push({ label: 'Version', value: version });
  }

  if (pack.commit) {
    rows.push({ label: 'Pinned commit', value: pack.commit.slice(0, 7) });
  }

  if (pack.hash) {
    rows.push({ label: 'Content hash', value: shortHash(pack.hash) });
  }

  if (pack.refusal?.foundHash) {
    rows.push({ label: 'Found on disk', value: shortHash(pack.refusal.foundHash) });
  }

  if (update?.available) {
    rows.push({ label: 'Update available', value: update.summary });
  } else if (update?.failure) {
    rows.push({ label: 'Update check', value: update.failure });
  }

  if (pack.repositories.length > 1) {
    rows.push({ label: 'Pinned in', value: pack.repositories.join(', ') });
  }

  return rows;
}

/**
 * Owns Rule packs: the packs of the open workspace, what they are worth, whether they run and whether their source has
 * something new. Every change is a change set per repository, and a changed pack waits here until someone reviews it.
 */
@Injectable()
export class RulePacksViewPresenter {
  // #region Fields

  private readonly _api = inject(DesktopApi);
  private readonly _shell = inject(ShellSession);
  private readonly _runs = inject(RunCenter);
  private readonly _pickedId = signal<string | null>(null);
  private readonly _updates = signal<Readonly<Record<string, RulePackUpdate>>>({});
  private readonly _write = signal<RulePackWrite | null>(null);
  private readonly _message = signal<string | null>(null);
  private readonly _busy = signal(false);
  private readonly _checking = signal(false);
  private readonly _reviewing = signal<string | null>(null);
  private readonly _revision = signal(0);
  private readonly _packLimit = signal(LIST_PAGE_SIZE);
  private readonly _ruleLimit = signal(RULE_PAGE_SIZE);

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `RulePacksViewPresenter` class.
   */
  public constructor() {
    // An approval in Review or another view may change what the lock file says while this is open.
    effect(() => {
      this._runs.changes();

      untracked(() => {
        if (this.list.value() !== null) {
          void this.reload();
        }
      });
    });
  }

  // #endregion

  // #region Properties

  /**
   * Gets the packs of the workspace.
   *
   * @readonly
   */
  public readonly list = new AsyncValue<Array<RulePackEntry>>(() =>
    this._api.request('rulePack.list', { workspaceId: this.requireWorkspace() }),
  );

  /**
   * Gets the packs that can be added.
   *
   * @readonly
   */
  public readonly available = new AsyncValue<Array<RulePackAvailable>>(() =>
    this._api.request('rulePack.available', { workspaceId: this.requireWorkspace() }),
  );

  /**
   * Gets the severities a rule can have.
   *
   * @readonly
   */
  public readonly severities = SEVERITIES;

  /**
   * Gets the cards of the packs.
   *
   * @readonly
   */
  public readonly packs = computed(() =>
    (this.list.value() ?? []).map((pack) => ({
      id: pack.id,
      name: pack.name,
      about: pack.description,
      count: countOf(pack.rules.length, 'rule'),
      isRefused: pack.refusal !== null,
      isOff: pack.refusal === null && !pack.enabled,
      isSelected: pack.id === this.selected()?.id,
    })),
  );

  /**
   * The visible portion of installed packs.
   */
  public readonly visiblePacks = computed(() => this.packs().slice(0, this._packLimit()));

  /**
   * Whether more installed packs can be shown.
   */
  public readonly hasMorePacks = computed(() => this.packs().length > this._packLimit());

  /**
   * Gets the selected pack: the one picked, or the first that failed its verification, or the first.
   *
   * @readonly
   */
  public readonly selected = computed(() => {
    const packs = this.list.value() ?? [];

    return (
      packs.find((pack) => pack.id === this._pickedId()) ??
      packs.find((pack) => pack.refusal !== null) ??
      packs[0] ??
      null
    );
  });

  /**
   * Gets the rules of the selected pack, under a key that builds their controls anew once a write told them where they stand.
   *
   * @readonly
   */
  public readonly rules = computed(() => {
    const revision = this._revision();

    return (this.selected()?.rules ?? []).map((rule) => ({
      ...rule,
      track: `${rule.id}:${rule.severity}:${revision}`,
    }));
  });

  /**
   * The visible portion of the selected pack's rules.
   */
  public readonly visibleRules = computed(() => this.rules().slice(0, this._ruleLimit()));

  /**
   * Whether more rules can be shown without changing their configuration.
   */
  public readonly hasMoreRules = computed(() => this.rules().length > this._ruleLimit());

  /**
   * Gets what the source of the selected pack says now.
   *
   * @readonly
   */
  public readonly update = computed(() => {
    const id = this.selected()?.id;

    return id ? (this._updates()[id] ?? null) : null;
  });

  /**
   * Gets the rows of Source and trust.
   *
   * @readonly
   */
  public readonly sourceRows = computed(() => {
    const pack = this.selected();

    return pack ? sourceRows(pack, this.update(), this._shell.info()?.version ?? null) : [];
  });

  /**
   * Gets the badges of Source and trust.
   *
   * @readonly
   */
  public readonly accessBadges = computed(() => {
    const pack = this.selected();

    return pack ? accessBadges(pack.access) : [];
  });

  /**
   * Gets whether Review update is there: for something new, and for a pack that failed, which a reviewed pin can repair.
   *
   * @readonly
   */
  public readonly canReviewUpdate = computed(
    () => this.update()?.available === true && this.update()?.updateId !== null,
  );

  /**
   * Gets whether the source of the selected pack is being asked.
   *
   * @readonly
   */
  public readonly checking = this._checking.asReadonly();

  /**
   * Gets the update under review.
   *
   * @readonly
   */
  public readonly reviewing = computed(() => {
    const id = this._reviewing();

    return id ? (this._updates()[id] ?? null) : null;
  });

  /**
   * Gets the new pin of the update under review.
   *
   * @readonly
   */
  public readonly reviewPin = computed(() => {
    const update = this.reviewing();
    const next = update?.next;

    if (!next) {
      return [];
    }

    const isSameVersion = update.repositories.every(
      (repository) => repository.version === next.version,
    );

    return [
      ...(next.commit
        ? [{ label: 'New commit', value: next.commit.slice(0, 7) }]
        : next.version
          ? [{ label: isSameVersion ? 'Version' : 'New version', value: next.version }]
          : []),
      { label: 'New content hash', value: shortHash(next.hash) },
    ];
  });

  /**
   * Gets what the last write did per repository.
   *
   * @readonly
   */
  public readonly results = computed(() =>
    (this._write()?.results ?? []).map((result, index) => ({
      ...result,
      id: `${index}:${result.repository}`,
    })),
  );

  /**
   * Gets why the last action failed.
   *
   * @readonly
   */
  public readonly message = this._message.asReadonly();

  /**
   * Gets whether an action is going on.
   *
   * @readonly
   */
  public readonly busy = this._busy.asReadonly();

  /**
   * Gets whether Dry run keeps a change from being written.
   *
   * @readonly
   */
  public readonly dryRun = this._shell.dryRun;

  // #endregion

  // #region Methods

  /**
   * Loads the view.
   *
   * @returns When it is loaded.
   */
  public async load(): Promise<void> {
    await this._runs.connect();
    await this._shell.refresh();
    await this.reload();
  }

  /**
   * Selects a pack and asks its source whether it has something new.
   *
   * @param id The pack.
   * @returns When its source answered.
   */
  public async pick(id: string): Promise<void> {
    this._pickedId.set(id);
    this._ruleLimit.set(RULE_PAGE_SIZE);
    await this.checkUpdate();
  }

  /**
   * Shows the next portion of installed packs.
   */
  public showMorePacks(): void {
    this._packLimit.update((limit) => limit + LIST_PAGE_SIZE);
  }

  /**
   * Shows the next portion of the selected pack's rules.
   */
  public showMoreRules(): void {
    this._ruleLimit.update((limit) => limit + RULE_PAGE_SIZE);
  }

  /**
   * Turns the selected pack on or off. Setting what is already set changes nothing, because a switch also reports the state it
   * was bound to.
   *
   * @param enabled Whether it runs.
   * @returns When it is done.
   */
  public async setEnabled(enabled: boolean): Promise<void> {
    const pack = this.selected();

    if (pack && !pack.locked && !pack.refusal && pack.enabled !== enabled) {
      await this.write(() =>
        this._api.request('rulePack.setEnabled', {
          workspaceId: this.requireWorkspace(),
          packId: pack.id,
          enabled,
        }),
      );
    }
  }

  /**
   * Sets what a rule is worth. Setting what is already set changes nothing, because a select also reports the value it was bound
   * to.
   *
   * @param ruleId The rule.
   * @param severity The new severity.
   * @returns When it is done.
   */
  public async setSeverity(ruleId: string, severity: RuleSeverity): Promise<void> {
    const rule = this.selected()?.rules.find((candidate) => candidate.id === ruleId);

    if (rule && rule.severity !== severity) {
      await this.write(() =>
        this._api.request('rulePack.setSeverity', {
          workspaceId: this.requireWorkspace(),
          ruleId,
          severity,
        }),
      );
    }
  }

  /**
   * Opens Review update. Nothing is written until it is approved.
   */
  public openReview(): void {
    const update = this.update();

    if (update?.available) {
      this._reviewing.set(update.packId);
    }
  }

  /**
   * Closes Review update without writing anything.
   */
  public closeReview(): void {
    this._reviewing.set(null);
  }

  /**
   * Pins what the review showed. With Dry run on it waits in Review.
   *
   * @returns When it is done.
   */
  public async approveUpdate(): Promise<void> {
    const update = this.reviewing();

    if (update?.updateId) {
      const updateId = update.updateId;

      await this.write(() =>
        this._api.request('rulePack.update', { workspaceId: this.requireWorkspace(), updateId }),
      );
      this._reviewing.set(null);
    }
  }

  /**
   * Shows what a write did and reads again what it changed.
   *
   * @param write What it did.
   * @returns When the view is up to date.
   */
  public async showWrite(write: RulePackWrite): Promise<void> {
    this._write.set(write);
    this._message.set(null);
    this._updates.set({});
    this._revision.update((revision) => revision + 1);
    await this._shell.refresh();
    await this.reload();
  }

  /**
   * @private
   */
  private async write(request: () => Promise<RulePackWrite>): Promise<void> {
    this._busy.set(true);
    this._message.set(null);

    try {
      await this.showWrite(await request());
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
      this._revision.update((revision) => revision + 1);
    } finally {
      this._busy.set(false);
    }
  }

  /**
   * @private
   */
  private async reload(): Promise<void> {
    await Promise.all([this.list.reload(), this.available.reload()]);
    await this.checkUpdate();
  }

  /**
   * Asks the source of the selected pack, once per pack until something is written. It reads and changes nothing, and a source
   * that cannot be reached is an answer like any other.
   *
   * @private
   */
  private async checkUpdate(): Promise<void> {
    const pack = this.selected();

    if (!pack || pack.locked || this._updates()[pack.id]) {
      return;
    }

    this._checking.set(true);

    try {
      const update = await this._api.request('rulePack.checkUpdate', {
        workspaceId: this.requireWorkspace(),
        packId: pack.id,
      });

      this._updates.update((updates) => ({ ...updates, [pack.id]: update }));
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    } finally {
      this._checking.set(false);
    }
  }

  /**
   * @private
   */
  private requireWorkspace(): string {
    const workspace = this._shell.workspace();

    if (!workspace) {
      throw new Error('No workspace is open.');
    }

    return workspace.id;
  }

  // #endregion
}

// #region Imports

import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { form } from '@angular/forms/signals';
import { Router } from '@angular/router';
import type {
  AiProvider,
  GenerateCommand,
  GenerateEstimate,
  GenerateInput,
  GenerateOverview,
} from '@pixel-brewery/wortlaut-contracts';
import {
  AiHandoff,
  AsyncValue,
  bindShortcuts,
  describeProviderState,
  DesktopApi,
  formatCount,
  formatTokens,
  formatTokensAtLeast,
  localeList,
  localeName,
  RunCenter,
  ShellSession,
} from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * How long the view waits after a change before it asks main again.
 */
const REFRESH_DELAY_MS = 200;

/**
 * The size of a sample of Test on 10 keys first.
 */
const SAMPLE_SIZE = 10;

/**
 * What a locale tag looks like.
 */
const LOCALE_TAG = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/;

/**
 * Which keys a run translates, as the view offers it.
 */
export type GenerateKeyChoice = 'all' | 'new' | 'missing' | 'namespace' | 'keys';

/**
 * Says how far a target locale is.
 *
 * @param target The locale.
 * @param baseName The name of the base locale.
 * @returns For example `7 identical to English`.
 */
export function describeTarget(
  target: GenerateOverview['targets'][number],
  baseName: string,
): string {
  if (target.isNew) {
    return 'New locale';
  }

  const parts = [
    ...(target.missing > 0 ? [`${formatCount(target.missing)} missing`] : []),
    ...(target.identical > 0 ? [`${formatCount(target.identical)} identical to ${baseName}`] : []),
  ];

  return parts.length > 0 ? parts.join(', ') : 'Complete';
}

/**
 * Owns Generate: set up: everything a run starts with. The values live here until the run starts, and main works out what they
 * would take, because the engine owns selection, estimate, prompt and the command line.
 */
@Injectable()
export class GenerateSetupViewPresenter {
  // #region Fields

  private readonly _api = inject(DesktopApi);
  private readonly _shell = inject(ShellSession);
  private readonly _center = inject(RunCenter);
  private readonly _router = inject(Router);
  private readonly _handoff = inject(AiHandoff);
  private readonly _targets = signal<ReadonlySet<string>>(new Set());
  private readonly _addedTargets = signal<ReadonlyArray<string>>([]);
  private readonly _choice = signal<GenerateKeyChoice>('all');
  private readonly _keys = signal<ReadonlyArray<string> | null>(null);
  private readonly _provider = signal<GenerateInput['provider'] | null>(null);
  private readonly _temperature = signal(0.7);
  private readonly _review = signal(true);
  private readonly _protect = signal(true);
  private readonly _model = signal({
    limit: '',
    chunk: '10',
    instructions: '',
    namespace: '',
    model: '',
    newLocale: '',
  });
  private readonly _addingLocale = signal(false);
  private readonly _message = signal<string | null>(null);
  private readonly _busy = signal(false);
  private _timer: ReturnType<typeof setTimeout> | null = null;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `GenerateSetupViewPresenter` class.
   */
  public constructor() {
    bindShortcuts({ run: () => this.start() });

    // Every control updates the line, the estimate and the prompt.
    effect(() => {
      const draft = this.draft();

      untracked(() => {
        if (draft && this.overview.value()) {
          this.scheduleRefresh();
        }
      });
    });
    effect(() => {
      const provider = this._provider();

      untracked(() => {
        if (provider) {
          void this.models.reload().then(() => this.adoptModel());
        }
      });
    });
    inject(DestroyRef).onDestroy(() => {
      if (this._timer) {
        clearTimeout(this._timer);
      }
    });
  }

  // #endregion

  // #region Properties

  /**
   * Gets what the set up starts from.
   *
   * @readonly
   */
  public readonly overview = new AsyncValue<GenerateOverview>(() =>
    this._api.request('generate.overview', { projectId: this.requireProject() }),
  );

  /**
   * Gets the providers with their true state.
   *
   * @readonly
   */
  public readonly providers = new AsyncValue<ReadonlyArray<AiProvider>>(() =>
    this._api.request('ai.providers', {}),
  );

  /**
   * Gets the models of the chosen provider.
   *
   * @readonly
   */
  public readonly models = new AsyncValue<ReadonlyArray<string>>(async () => {
    const provider = this._provider();

    return provider ? (await this._api.request('ai.models', { providerId: provider })).models : [];
  });

  /**
   * Gets what the setup would take.
   *
   * @readonly
   */
  public readonly estimate = new AsyncValue<GenerateEstimate>(() =>
    this._api.request('generate.estimate', this.requireDraftRequest()),
  );

  /**
   * Gets the real prompt.
   *
   * @readonly
   */
  public readonly prompt = new AsyncValue<string>(
    async () => (await this._api.request('generate.prompt', this.requireDraftRequest())).text,
  );

  /**
   * Gets the command line that does the same.
   *
   * @readonly
   */
  public readonly sameAs = new AsyncValue<GenerateCommand>(() =>
    this._api.request('generate.command', this.requireDraftRequest()),
  );

  /**
   * Gets the form of the text controls.
   *
   * @readonly
   */
  public readonly form = form(this._model);

  /**
   * Gets the target locales with their state.
   *
   * @readonly
   */
  public readonly targets = computed(() => {
    const overview = this.overview.value();
    const selected = this._targets();
    const baseName = localeName(overview?.baseLocale ?? 'en');

    return [
      ...(overview?.targets ?? []).map((target) => ({
        code: target.locale,
        name: localeName(target.locale),
        state: describeTarget(target, baseName),
        isChecked: selected.has(target.locale),
      })),
      ...this._addedTargets().map((code) => ({
        code,
        name: localeName(code),
        state: 'New locale',
        isChecked: selected.has(code),
      })),
    ];
  });

  /**
   * Gets what the base locale is called.
   *
   * @readonly
   */
  public readonly baseName = computed(() => localeName(this.overview.value()?.baseLocale ?? 'en'));

  /**
   * Gets which keys a run translates.
   *
   * @readonly
   */
  public readonly choice = this._choice.asReadonly();

  /**
   * Gets how many keys came from a finding.
   *
   * @readonly
   */
  public readonly seededKeys = computed(() => this._keys()?.length ?? 0);

  /**
   * Gets the providers as the choices show them.
   *
   * @readonly
   */
  public readonly providerChoices = computed(() =>
    (this.providers.value() ?? []).map((provider) => ({
      ...provider,
      state2: describeProviderState(provider),
      isChecked: provider.id === this._provider(),
    })),
  );

  /**
   * Gets the chosen provider.
   *
   * @readonly
   */
  public readonly provider = computed(
    () =>
      (this.providers.value() ?? []).find((provider) => provider.id === this._provider()) ?? null,
  );

  /**
   * Gets whether the chosen provider is a local assistant.
   *
   * @readonly
   */
  public readonly isLocal = computed(() => this.provider()?.kind !== 'key');

  /**
   * Gets the temperature, 0.0 to 1.0.
   *
   * @readonly
   */
  public readonly temperature = this._temperature.asReadonly();

  /**
   * Gets the temperature as the view shows it.
   *
   * @readonly
   */
  public readonly temperatureText = computed(() => this._temperature().toFixed(1));

  /**
   * Gets whether a run waits for a review.
   *
   * @readonly
   */
  public readonly review = this._review.asReadonly();

  /**
   * Gets whether a flagged row may not be accepted.
   *
   * @readonly
   */
  public readonly protect = this._protect.asReadonly();

  /**
   * Gets what is wrong with the limit.
   *
   * @readonly
   */
  public readonly limitError = computed(() => {
    const text = this._model().limit.trim();

    return text === '' || /^[1-9]\d*$/.test(text)
      ? null
      : 'A limit is a whole number, or empty for no limit.';
  });

  /**
   * Gets what is wrong with the chunk size.
   *
   * @readonly
   */
  public readonly chunkError = computed(() => {
    const size = Number(this._model().chunk);

    return Number.isInteger(size) && size >= 1 && size <= 100
      ? null
      : 'A chunk holds 1 to 100 keys.';
  });

  /**
   * Gets the figures of This run.
   *
   * @readonly
   */
  public readonly summary = computed(() => {
    const estimate = this.estimate.value();
    const names = Array.from(this._targets());

    return [
      { label: 'Locales', value: names.length > 0 ? localeList(names) : 'None' },
      { label: 'Keys', value: formatCount(estimate?.keys ?? 0) },
      { label: 'Chunks', value: formatCount(estimate?.chunks ?? 0) },
      {
        label: 'Estimated tokens',
        value: estimate?.tokensAreLowerBound
          ? formatTokensAtLeast(estimate.estimatedTokens)
          : formatTokens(estimate?.estimatedTokens ?? 0),
      },
    ];
  });

  /**
   * Gets what the estimate of tokens covers.
   *
   * @readonly
   */
  public readonly tokensNote = computed(() => this.estimate.value()?.tokensNote ?? null);

  /**
   * Gets why a run cannot start, or `null` when it can.
   *
   * @readonly
   */
  public readonly blocker = computed(() => {
    const provider = this.provider();

    if (this._targets().size === 0) {
      return 'Choose a target locale.';
    }

    if (!provider) {
      return 'Choose a provider.';
    }

    if (
      provider.state === 'not-installed' ||
      provider.state === 'signed-out' ||
      provider.state === 'no-key'
    ) {
      return `${provider.name} is not set up: ${describeProviderState(provider)}. Open Manage providers.`;
    }

    if (this.limitError() ?? this.chunkError()) {
      return this.limitError() ?? this.chunkError();
    }

    return this.estimate.value()?.keys === 0 ? 'No key matches this setup.' : null;
  });

  /**
   * Gets whether a run can start.
   *
   * @readonly
   */
  public readonly canStart = computed(() => this.blocker() === null && !this._busy());

  /**
   * Gets the run that is going on for this project.
   *
   * @readonly
   */
  public readonly activeRunId = computed(() => this.overview.value()?.activeRunId ?? null);

  /**
   * Gets the last run of this project.
   *
   * @readonly
   */
  public readonly latestRunId = computed(() => this.overview.value()?.latestRunId ?? null);

  /**
   * Gets whether Dry run is on.
   *
   * @readonly
   */
  public readonly dryRun = this._shell.dryRun;

  /**
   * Gets whether the dialog of a new locale is open.
   *
   * @readonly
   */
  public readonly addingLocale = this._addingLocale.asReadonly();

  /**
   * Gets whether the new locale reads as one.
   *
   * @readonly
   */
  public readonly canAddLocale = computed(
    () => LOCALE_TAG.test(this._model().newLocale.trim()) && !this._busy(),
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
   * Gets the setup as the controls hold it.
   *
   * @private
   * @readonly
   */
  private readonly draft = computed<
    (Omit<GenerateInput, 'locales'> & { locales: Array<string> }) | null
  >(() => {
    const provider = this._provider();
    const model = this._model();
    const choice = this._choice();
    const chunk = Number(model.chunk);

    if (!provider || !Number.isInteger(chunk) || chunk < 1 || chunk > 100 || this.limitError()) {
      return null;
    }

    return {
      locales: Array.from(this._targets()),
      scope: choice === 'new' || choice === 'missing' ? choice : 'all',
      namespace: choice === 'namespace' && model.namespace ? model.namespace : null,
      keys: choice === 'keys' ? [...(this._keys() ?? [])] : null,
      limit: model.limit.trim() ? Number(model.limit) : null,
      provider,
      model: this.provider()?.kind === 'key' ? model.model : '',
      temperature: this._temperature(),
      chunkSize: chunk,
      instructions: model.instructions,
      reviewBeforeWriting: this._review(),
      protectPlaceholders: this._protect(),
    };
  });

  // #endregion

  // #region Methods

  /**
   * Loads the view, with what another screen handed over.
   *
   * @returns When it is loaded.
   */
  public async load(): Promise<void> {
    const seed = this._handoff.takeGenerate();

    await Promise.all([this.overview.reload(), this.providers.reload()]);

    const overview = this.overview.value();

    if (overview) {
      this.adoptDefaults(overview);
    }

    if (seed?.input) {
      this.adoptInput(seed.input);
    }

    if (seed?.keys) {
      this._keys.set(seed.keys);
      this._choice.set('keys');
    }
  }

  /**
   * Turns a target locale on or off.
   *
   * @param code The locale.
   * @param isChecked The new value.
   */
  public setTarget(code: string, isChecked: boolean): void {
    this._targets.update((targets) => {
      const next = new Set(targets);

      if (isChecked) {
        next.add(code);
      } else {
        next.delete(code);
      }

      return next;
    });
  }

  /**
   * Chooses which keys a run translates.
   *
   * @param choice The choice.
   */
  public pickChoice(choice: GenerateKeyChoice): void {
    this._choice.set(choice);

    if (choice === 'namespace' && !this._model().namespace) {
      const first = this.overview.value()?.namespaces[0]?.path ?? '';

      this._model.update((model) => ({ ...model, namespace: first }));
    }
  }

  /**
   * Forgets the keys a finding handed over.
   */
  public clearSeededKeys(): void {
    this._keys.set(null);
    this._choice.set('all');
  }

  /**
   * Chooses a provider.
   *
   * @param provider The provider.
   */
  public pickProvider(provider: GenerateInput['provider']): void {
    this._provider.set(provider);
  }

  /**
   * Sets the temperature from the slider, which counts in tenths.
   *
   * @param tenths The value of the slider.
   */
  public setTemperature(tenths: number): void {
    this._temperature.set(Math.round(tenths) / 10);
  }

  /**
   * Sets whether a run waits for a review.
   *
   * @param review The new value.
   */
  public setReview(review: boolean): void {
    this._review.set(review);
  }

  /**
   * Sets whether a flagged row may not be accepted.
   *
   * @param protect The new value.
   */
  public setProtect(protect: boolean): void {
    this._protect.set(protect);
  }

  /**
   * Opens the dialog of a new locale.
   */
  public openAddLocale(): void {
    this._model.update((model) => ({ ...model, newLocale: '' }));
    this._addingLocale.set(true);
  }

  /**
   * Closes the dialog of a new locale.
   */
  public closeAddLocale(): void {
    this._addingLocale.set(false);
  }

  /**
   * Adds a validated locale to the project, as a change set, and to this run.
   *
   * @returns When it is done.
   */
  public async addLocale(): Promise<void> {
    const locale = this._model().newLocale.trim();

    if (!this.canAddLocale()) {
      return;
    }

    this._busy.set(true);
    this._message.set(null);

    try {
      await this._api.request('generate.addLocale', { projectId: this.requireProject(), locale });

      if (!this.targets().some((target) => target.code === locale)) {
        this._addedTargets.update((added) => [...added, locale]);
      }

      this.setTarget(locale, true);
      this._addingLocale.set(false);
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    } finally {
      this._busy.set(false);
    }
  }

  /**
   * Puts the whole command line on the clipboard: a long one shows only part of its keys.
   *
   * @returns When it is there.
   */
  public async copySameAs(): Promise<void> {
    const command = this.sameAs.value()?.command;

    if (command) {
      await this._api.request('clipboard.writeText', { text: command });
    }
  }

  /**
   * Starts the run. It lives in main, so the view can come and go.
   *
   * @returns When the view of the run is open.
   */
  public async start(): Promise<void> {
    const input = this.draft();

    if (!input || !this.canStart()) {
      return;
    }

    this._busy.set(true);
    this._message.set(null);

    try {
      const run = await this._center.start({
        command: 'generate',
        projectId: this.requireProject(),
        input,
      });

      await this._router.navigate(['/generate/runs', run.id]);
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    } finally {
      this._busy.set(false);
    }
  }

  /**
   * Goes to the test lab with this setup.
   *
   * @returns When it is open.
   */
  public async testFirst(): Promise<void> {
    const input = this.draft();

    if (input) {
      this._handoff.offerTest({ input, size: SAMPLE_SIZE });
      await this._router.navigate(['/test-lab/translation']);
    }
  }

  /**
   * Opens a run.
   *
   * @param runId The run.
   * @returns When it is open.
   */
  public async openRun(runId: string): Promise<void> {
    await this._router.navigate(['/generate/runs', runId]);
  }

  /**
   * @private
   */
  private adoptDefaults(overview: GenerateOverview): void {
    const { defaults, targets } = overview;
    const ready = this.providers.value()?.find((provider) => provider.state === 'ready');

    this._targets.set(
      new Set(targets.filter((target) => target.selected).map((target) => target.locale)),
    );
    this._provider.set(
      defaults.defaultProvider ?? ready?.id ?? this.providers.value()?.[0]?.id ?? null,
    );
    this._temperature.set(defaults.temperature);
    this._review.set(defaults.safety.reviewBeforeWriting);
    this._protect.set(defaults.safety.protectPlaceholders);
    this._model.update((model) => ({
      ...model,
      chunk: String(defaults.chunkSize),
      limit: defaults.limit === null ? '' : String(defaults.limit),
      instructions: defaults.instructions,
      model: defaults.model,
    }));
  }

  /**
   * @private
   */
  private adoptInput(input: GenerateInput): void {
    const namespace = input.namespace ?? '';

    this._targets.set(new Set(input.locales));
    this._provider.set(input.provider);
    this._temperature.set(input.temperature);
    this._review.set(input.reviewBeforeWriting);
    this._protect.set(input.protectPlaceholders);
    this._choice.set(input.keys ? 'keys' : namespace ? 'namespace' : input.scope);
    this._keys.set(input.keys);
    this._model.update((model) => ({
      ...model,
      chunk: String(input.chunkSize),
      limit: input.limit === null ? '' : String(input.limit),
      instructions: input.instructions,
      namespace,
      model: input.model,
    }));
  }

  /**
   * Keeps a model of the chosen provider.
   *
   * @private
   */
  private adoptModel(): void {
    const models = this.models.value() ?? [];

    if (models.length > 0 && !models.includes(this._model().model)) {
      this._model.update((model) => ({ ...model, model: models[0] }));
    }
  }

  /**
   * @private
   */
  private scheduleRefresh(): void {
    if (this._timer) {
      clearTimeout(this._timer);
    }

    this._timer = setTimeout(() => {
      this._timer = null;
      void Promise.all([this.estimate.reload(), this.prompt.reload(), this.sameAs.reload()]);
    }, REFRESH_DELAY_MS);
  }

  /**
   * @private
   */
  private requireDraftRequest(): { projectId: string; input: GenerateInput } {
    const input = this.draft();

    if (!input) {
      throw new Error('This setup is not complete.');
    }

    return { projectId: this.requireProject(), input: input as GenerateInput };
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

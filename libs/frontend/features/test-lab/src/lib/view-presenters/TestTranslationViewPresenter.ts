// #region Imports

import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { form } from '@angular/forms/signals';
import { Router } from '@angular/router';
import type {
  AiProvider,
  GenerateInput,
  TestSample,
  TestSetup,
  TestTranslation,
} from '@pixel-brewery/wortlaut-contracts';
import {
  AiHandoff,
  AsyncValue,
  bindShortcuts,
  DesktopApi,
  formatCount,
  formatDuration,
  localeName,
  ShellSession,
} from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * How many keys a sample holds unless the user came with a size.
 */
const DEFAULT_SIZE = 7;

/**
 * A row of the sample.
 */
interface ISampleRow {
  key: string;
  base: string;
  comment: string;
}

/**
 * Says what a finished setup did.
 *
 * @param setup The setup.
 * @returns For example `1.2 s · ≈ 412 tokens · 1 issue`.
 */
export function describeSetupResult(setup: TestTranslation['setups'][number] | undefined): string {
  if (!setup || setup.status === 'running') {
    return setup ? 'Running' : 'Not run yet';
  }

  if (setup.status !== 'done') {
    return setup.status === 'stopped' ? 'Stopped' : 'Failed';
  }

  return [
    formatDuration(setup.durationMs ?? 0),
    setup.estimatedTokens === null ? '– tokens' : `≈ ${formatCount(setup.estimatedTokens)} tokens`,
    setup.issues === 1 ? '1 issue' : `${setup.issues} issues`,
  ].join(' · ');
}

/**
 * Owns Test lab: translation. It compares two setups on a sample of real keys, over the path of every translation. Nothing is
 * written, and no change set is built. The comparison lives in main, so a reload finds it again.
 */
@Injectable()
export class TestTranslationViewPresenter {
  // #region Fields

  private readonly _api = inject(DesktopApi);
  private readonly _shell = inject(ShellSession);
  private readonly _router = inject(Router);
  private readonly _handoff = inject(AiHandoff);
  private readonly _model = signal({
    namespace: '',
    locale: '',
    text: '',
    instructions: '',
    providerA: '',
    providerB: '',
  });
  private readonly _setups = signal<ReadonlyArray<TestSetup>>([]);
  private readonly _size = signal(DEFAULT_SIZE);
  private readonly _own = signal<ReadonlyArray<ISampleRow>>([]);
  private readonly _result = signal<TestTranslation | null>(null);
  private readonly _message = signal<string | null>(null);
  private _base: GenerateInput | null = null;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `TestTranslationViewPresenter` class.
   */
  public constructor() {
    bindShortcuts({ run: () => this.run() });
    const stopListening = this._api.onEvent((event) => {
      if (event.type === 'test.translationUpdated' && event.id === this._result()?.id) {
        void this.fetch(event.id);
      }
    });

    inject(DestroyRef).onDestroy(stopListening);
    effect(() => {
      const { namespace, providerA, providerB } = this._model();

      untracked(() => {
        if (this.sample.value() && namespace !== this._loadedNamespace) {
          void this.sample.reload();
        }

        [providerA, providerB].forEach((id, index) => {
          if (id && this._setups()[index] && this._setups()[index].provider !== id) {
            this.pickProvider(index, id);
          }
        });
      });
    });
  }

  // #endregion

  // #region Properties

  private _loadedNamespace = '';

  /**
   * Gets the sample.
   *
   * @readonly
   */
  public readonly sample = new AsyncValue<TestSample>(async () => {
    const { namespace } = this._model();
    const sample = await this._api.request('test.sample', {
      projectId: this.requireProject(),
      namespace: namespace || null,
      size: this._size(),
    });

    this._loadedNamespace = namespace;

    return sample;
  });

  /**
   * Gets the providers with their true state.
   *
   * @readonly
   */
  public readonly providers = new AsyncValue<ReadonlyArray<AiProvider>>(() =>
    this._api.request('ai.providers', {}),
  );

  /**
   * Gets the form of the sample.
   *
   * @readonly
   */
  public readonly form = form(this._model);

  /**
   * Gets the two setups with what they did.
   *
   * @readonly
   */
  public readonly setups = computed(() => {
    const result = this._result();

    return this._setups().map((setup, index) => {
      const provider = this.providers.value()?.find((candidate) => candidate.id === setup.provider);
      const done = result?.setups[index];

      return {
        index,
        name: index === 0 ? 'A' : 'B',
        setup,
        isKey: provider?.kind === 'key',
        result: describeSetupResult(done),
        failure: done?.status === 'failed' ? done.failure : null,
      };
    });
  });

  /**
   * Gets the sentence about the sample.
   *
   * @readonly
   */
  public readonly sampleText = computed(() => {
    const sample = this.sample.value();
    const count = this.sampleRows().length;
    const { locale } = this._model();

    return sample
      ? `${count} keys, ${localeName(sample.baseLocale)} to ${locale ? localeName(locale) : '…'}`
      : '';
  });

  /**
   * Gets what the run covers.
   *
   * @readonly
   */
  public readonly sampleRows = computed(() => [
    ...(this.sample.value()?.rows ?? []),
    ...this._own(),
  ]);

  /**
   * Gets whether a comparison is going on.
   *
   * @readonly
   */
  public readonly isRunning = computed(() => this._result()?.isRunning ?? false);

  /**
   * Gets the label of the button.
   *
   * @readonly
   */
  public readonly runLabel = computed(() => (this._result() ? 'Run again' : 'Run'));

  /**
   * Gets whether a comparison can start.
   *
   * @readonly
   */
  public readonly canRun = computed(
    () =>
      !this.isRunning() &&
      this._setups().length === 2 &&
      this.sampleRows().length > 0 &&
      this._model().locale !== '',
  );

  /**
   * Gets whether a text can be added.
   *
   * @readonly
   */
  public readonly canAddText = computed(() => this._model().text.trim().length > 0);

  /**
   * Gets the rows of the result.
   *
   * @readonly
   */
  public readonly rows = computed(() => {
    const result = this._result();

    return (result?.rows ?? []).map((row) => {
      const cell = (index: number): { value: string; note: string | null } => {
        const found = result?.setups[index]?.results.find((candidate) => candidate.key === row.key);

        return { value: found?.value ?? '–', note: found?.note ?? null };
      };

      return { key: row.key, base: row.base, a: cell(0), b: cell(1) };
    });
  });

  /**
   * Gets the name of the base locale.
   *
   * @readonly
   */
  public readonly baseName = computed(() => localeName(this.sample.value()?.baseLocale ?? 'en'));

  /**
   * Gets why the last action failed.
   *
   * @readonly
   */
  public readonly message = this._message.asReadonly();

  // #endregion

  // #region Methods

  /**
   * Loads the view: the setup Generate handed over, or the last comparison.
   *
   * @returns When it is loaded.
   */
  public async load(): Promise<void> {
    const seed = this._handoff.takeTest();

    if (seed) {
      this._size.set(seed.size);
      this._base = seed.input;
      this._model.update((model) => ({
        ...model,
        namespace: seed.input.namespace ?? '',
        locale: seed.input.locales[0] ?? '',
        instructions: seed.input.instructions,
      }));
    }

    await Promise.all([this.sample.reload(), this.providers.reload()]);

    const sample = this.sample.value();
    const providers = this.providers.value() ?? [];

    if (sample) {
      this._model.update((model) => ({
        ...model,
        locale: model.locale || sample.locales[0] || '',
        instructions: seed ? model.instructions : sample.instructions,
      }));
    }

    const first = seed
      ? {
          provider: seed.input.provider,
          model: seed.input.model,
          temperature: seed.input.temperature,
        }
      : this.setupOf(providers[0]);
    const second = this.setupOf(
      providers.find((provider) => provider.id !== first.provider && provider.state === 'ready') ??
        providers.find((provider) => provider.id !== first.provider),
    );

    this._setups.set([first, second]);
    this._model.update((model) => ({
      ...model,
      providerA: first.provider,
      providerB: second.provider,
    }));

    if (!seed) {
      await this.fetch(null);
    }
  }

  /**
   * Changes a setup.
   *
   * @param index The setup.
   * @param change What changes.
   */
  public setSetup(index: number, change: Partial<TestSetup>): void {
    this._setups.update((setups) =>
      setups.map((setup, position) => (position === index ? { ...setup, ...change } : setup)),
    );
  }

  /**
   * Chooses the provider of a setup.
   *
   * @param index The setup.
   * @param id The provider.
   */
  public pickProvider(index: number, id: string): void {
    const provider = this.providers.value()?.find((candidate) => candidate.id === id);

    if (provider) {
      this.setSetup(index, this.setupOf(provider));
    }
  }

  /**
   * Compares the two setups. Nothing is written.
   *
   * @returns When main knows.
   */
  public async run(): Promise<void> {
    if (!this.canRun()) {
      return;
    }

    this._message.set(null);

    try {
      this._result.set(
        await this._api.request('test.translate', {
          projectId: this.requireProject(),
          locale: this._model().locale,
          rows: this.sampleRows().map(({ key, base, comment }) => ({ key, base, comment })),
          setups: [...this._setups()],
          instructions: this._model().instructions,
        }),
      );
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Stops the comparison.
   *
   * @returns When main knows.
   */
  public async cancel(): Promise<void> {
    const id = this._result()?.id;

    if (id) {
      await this._api.request('test.cancelTranslation', { id });
    }
  }

  /**
   * Adds a text to this sample only.
   */
  public addText(): void {
    const text = this._model().text.trim();

    if (text) {
      this._own.update((own) => [
        ...own,
        { key: `own.text${own.length + 1}`, base: text, comment: '' },
      ]);
      this._model.update((model) => ({ ...model, text: '' }));
    }
  }

  /**
   * Goes to Generate with a setup.
   *
   * @param index The setup.
   * @returns When it is open.
   */
  public async useSetup(index: number): Promise<void> {
    const setup = this._setups()[index];
    const { locale, namespace, instructions } = this._model();

    this._handoff.offerGenerate({
      input: {
        locales: locale ? [locale] : [],
        scope: 'all',
        namespace: namespace || null,
        keys: null,
        limit: null,
        chunkSize: 10,
        reviewBeforeWriting: true,
        protectPlaceholders: true,
        ...this._base,
        provider: setup.provider,
        model: setup.model,
        temperature: setup.temperature,
        instructions,
      },
    });
    await this._router.navigate(['/generate']);
  }

  /**
   * @private
   */
  private setupOf(provider: AiProvider | undefined): TestSetup {
    return {
      provider: provider?.id ?? 'claude-code',
      model:
        provider?.id === 'openai'
          ? 'gpt-4o-mini'
          : provider?.id === 'google'
            ? 'gemini-2.5-flash'
            : '',
      temperature: 0.7,
    };
  }

  /**
   * @private
   */
  private async fetch(id: string | null): Promise<void> {
    this._result.set(await this._api.request('test.translation', { id }));
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

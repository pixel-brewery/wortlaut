// #region Imports

import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { form } from '@angular/forms/signals';
import type { TestDetectResult, TestPreset } from '@pixel-brewery/wortlaut-contracts';
import { AsyncValue, DesktopApi, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * The most source lines or matches added to the view at once.
 */
const PAGE_SIZE = 100;

/**
 * Owns Test lab: detector. It runs the real detector on the text in the view, in main, and nothing is written.
 */
@Injectable()
export class TestDetectorViewPresenter {
  // #region Fields

  private readonly _api = inject(DesktopApi);
  private readonly _shell = inject(ShellSession);
  private readonly _presetId = signal<TestPreset['id']>('angular');
  private readonly _fileName = signal<string | null>(null);
  private readonly _pasted = signal({ text: '' });
  private readonly _isPasting = signal(false);
  private readonly _lineLimit = signal(PAGE_SIZE);
  private readonly _matchLimit = signal(PAGE_SIZE);
  private readonly _sourceLines = computed(() => this.content().split('\n'));
  private readonly _matchedLines = computed(
    () => new Set((this.result.value()?.matches ?? []).map((match) => match.line)),
  );

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `TestDetectorViewPresenter` class.
   */
  public constructor() {
    // The result follows the preset, the file and the text.
    effect(() => {
      this._presetId();
      this.content();
      this.fileName();

      untracked(() => {
        this._lineLimit.set(PAGE_SIZE);
        this._matchLimit.set(PAGE_SIZE);

        if (this.presets.value()) {
          void this.result.reload();
        }
      });
    });
  }

  // #endregion

  // #region Properties

  /**
   * Gets the presets with their samples.
   *
   * @readonly
   */
  public readonly presets = new AsyncValue<Array<TestPreset>>(() =>
    this._api.request('test.presets', { projectId: this._shell.project()?.id ?? null }),
  );

  /**
   * Gets what the detector finds.
   *
   * @readonly
   */
  public readonly result = new AsyncValue<TestDetectResult>(() =>
    this._api.request('test.detect', {
      projectId: this._shell.project()?.id ?? null,
      preset: this._presetId(),
      fileName: this.fileName(),
      content: this.content(),
    }),
  );

  /**
   * Gets the form of pasted code.
   *
   * @readonly
   */
  public readonly pasteForm = form(this._pasted);

  /**
   * Gets the presets for the segment.
   *
   * @readonly
   */
  public readonly presetTabs = computed(() =>
    (this.presets.value() ?? []).map((preset) => ({
      id: preset.id,
      name: preset.name,
      isChecked: preset.id === this._presetId(),
    })),
  );

  /**
   * Gets the sample files of the preset, which follow from the file types it reads.
   *
   * @readonly
   */
  public readonly sampleTabs = computed(() =>
    (this.currentPreset()?.samples ?? []).map((sample) => ({
      fileName: sample.fileName,
      isChecked: sample.fileName === this.fileName(),
    })),
  );

  /**
   * Gets the name of the file, whose type chooses the detector.
   *
   * @readonly
   */
  public readonly fileName = computed(() => {
    const samples = this.currentPreset()?.samples ?? [];

    return (
      samples.find((sample) => sample.fileName === this._fileName())?.fileName ??
      samples[0]?.fileName ??
      'panel.ts'
    );
  });

  /**
   * Gets the text the detector reads.
   *
   * @readonly
   */
  public readonly content = computed(() => {
    const pasted = this._pasted().text;

    return this._isPasting() || pasted
      ? pasted
      : (this.currentPreset()?.samples.find((sample) => sample.fileName === this.fileName())
          ?.content ?? '');
  });

  /**
   * Gets whether the view shows the text field for pasted code.
   *
   * @readonly
   */
  public readonly isPasting = this._isPasting.asReadonly();

  /**
   * Gets the lines of the source, with those that hold a match marked.
   *
   * @readonly
   */
  public readonly lines = computed(() => {
    const matched = this._matchedLines();

    return this._sourceLines()
      .slice(0, this._lineLimit())
      .map((text, index) => ({ number: index + 1, text, isMatch: matched.has(index + 1) }));
  });

  /**
   * Gets the total source line count, including lines not displayed yet.
   *
   * @public
   * @readonly
   */
  public readonly lineCount = computed(() => this._sourceLines().length);

  /**
   * Gets whether more source lines can be displayed.
   *
   * @public
   * @readonly
   */
  public readonly hasMoreLines = computed(() => this.lineCount() > this._lineLimit());

  /**
   * Gets the matches for the table.
   *
   * @readonly
   */
  public readonly matches = computed(() =>
    (this.result.value()?.matches ?? []).slice(0, this._matchLimit()).map((match, index) => ({
      id: index,
      position: `Line ${match.line}, column ${match.column}`,
      value: match.value,
      type: match.isHardCoded ? 'Hard-coded' : 'Key',
      variant: match.isHardCoded ? ('warning' as const) : ('neutral' as const),
    })),
  );

  /**
   * Gets the full match count, including matches not displayed yet.
   *
   * @public
   * @readonly
   */
  public readonly matchCount = computed(() => this.result.value()?.matches.length ?? 0);

  /**
   * Gets whether more matches can be displayed.
   *
   * @public
   * @readonly
   */
  public readonly hasMoreMatches = computed(() => this.matchCount() > this._matchLimit());

  /**
   * Gets the title of the matches.
   *
   * @readonly
   */
  public readonly matchesTitle = computed(() => {
    const count = this.matchCount();

    return count === 1 ? '1 match' : `${count} matches`;
  });

  // #endregion

  // #region Methods

  /**
   * Loads the view.
   *
   * @returns When it is loaded.
   */
  public async load(): Promise<void> {
    await this.presets.reload();
    await this.result.reload();
  }

  /**
   * Picks a preset, and the first sample it reads.
   *
   * @param id The preset.
   */
  public pickPreset(id: TestPreset['id']): void {
    this._presetId.set(id);
    this._fileName.set(null);
  }

  /**
   * Picks a sample file, and goes back from pasted code to the sample.
   *
   * @param fileName The file.
   */
  public pickSample(fileName: string): void {
    this._fileName.set(fileName);
    this._isPasting.set(false);
    this._pasted.set({ text: '' });
  }

  /**
   * Replaces the sample with the user's code.
   */
  public startPasting(): void {
    this._pasted.set({ text: this.content() });
    this._isPasting.set(true);
  }

  /**
   * Shows the code the user pasted with its matches.
   */
  public finishPasting(): void {
    this._isPasting.set(false);
  }

  /**
   * Displays the next page of the current source without changing the detector input.
   *
   * @public
   */
  public showMoreLines(): void {
    this._lineLimit.update((limit) => limit + PAGE_SIZE);
  }

  /**
   * Displays the next page of the current result without rerunning the detector.
   *
   * @public
   */
  public showMoreMatches(): void {
    this._matchLimit.update((limit) => limit + PAGE_SIZE);
  }

  /**
   * @private
   */
  private currentPreset(): TestPreset | undefined {
    return this.presets.value()?.find((preset) => preset.id === this._presetId());
  }

  // #endregion
}

// #region Imports

import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import type { AppInfo, AppSettingsView, ColorMode } from '@pixel-brewery/wortlaut-contracts';
import {
  AsyncValue,
  DesktopApi,
  ShellSession,
  ShortcutCenter,
  type ShortcutAction,
} from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * The line the app gives the command line.
 */
const INSTALL_COMMAND = 'yarn add @pixel-brewery/wortlaut-app';

/**
 * The shortcuts of the app.
 */
const SHORTCUTS: ReadonlyArray<{ action: ShortcutAction; label: string }> = [
  { action: 'search', label: 'Search keys, files and commands' },
  { action: 'run', label: 'Run the current command' },
  { action: 'suggest', label: 'Suggest with AI' },
  { action: 'next', label: 'Next open finding' },
];

/**
 * Writes a size in bytes for the environment table.
 *
 * @param bytes The bytes.
 * @returns The text.
 */
export function formatMemory(bytes: number): string {
  return `${Math.round(bytes / 1024 ** 3)} GB`;
}

/**
 * Writes what a bug report wants to know about this computer. It holds no path, no key and nothing of a repository.
 *
 * @param info What the app says about itself.
 * @returns The text.
 */
export function bugReportOf(info: AppInfo): string {
  return [
    `${info.name} ${info.version}`,
    `Platform: ${info.platform}`,
    `Arch: ${info.arch}`,
    `Cpus: ${info.cpus}`,
    `Ram: ${formatMemory(info.totalMemory)}`,
  ].join('\n');
}

/**
 * Owns Settings: application. A change applies immediately, so there is no Save.
 */
@Injectable()
export class SettingsAppViewPresenter {
  // #region Fields

  private readonly _api = inject(DesktopApi);
  private readonly _shell = inject(ShellSession);
  private readonly _shortcuts = inject(ShortcutCenter);
  private readonly _message = signal<string | null>(null);
  private readonly _note = signal<string | null>(null);
  private readonly _current = signal<AppSettingsView | null>(null);

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `SettingsAppViewPresenter` class.
   */
  public constructor() {
    // The mode can change without this view: the system decides until the user picks one.
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)') as
      MediaQueryList | undefined;
    const followMode = (event: MediaQueryListEvent): void => {
      this._current.update(
        (current) => current && { ...current, activeColorMode: event.matches ? 'dark' : 'light' },
      );
    };

    media?.addEventListener('change', followMode);
    inject(DestroyRef).onDestroy(() => {
      media?.removeEventListener('change', followMode);
    });
  }

  // #endregion

  // #region Properties

  /**
   * Gets the settings as main has them.
   *
   * @readonly
   */
  public readonly settings = new AsyncValue<AppSettingsView>(async () => {
    const settings = await this._api.request('app.getSettings', {});

    this._current.set(settings);

    return settings;
  });

  /**
   * Gets the settings as they are right now, after the last change.
   *
   * @readonly
   */
  public readonly values = this._current.asReadonly();

  /**
   * Gets what the app says about this computer.
   *
   * @readonly
   */
  public readonly environment = computed(() => {
    const info = this._shell.info();

    return info
      ? [
          { label: 'Wortlaut', value: info.version },
          { label: 'Platform', value: info.platform },
          { label: 'Arch', value: info.arch },
          { label: 'Cpus', value: String(info.cpus) },
          { label: 'Ram', value: formatMemory(info.totalMemory) },
        ]
      : [];
  });

  /**
   * Gets the shortcuts as they read on this platform.
   *
   * @readonly
   */
  public readonly shortcuts = computed(() => {
    this._shell.info();

    return SHORTCUTS.map(({ action, label }) => ({ label, keys: this._shortcuts.labelOf(action) }));
  });

  /**
   * Gets the line that adds the command line to a project.
   *
   * @readonly
   */
  public readonly installCommand = INSTALL_COMMAND;

  /**
   * Gets why the last action failed.
   *
   * @readonly
   */
  public readonly message = this._message.asReadonly();

  /**
   * Gets what the last action did.
   *
   * @readonly
   */
  public readonly note = this._note.asReadonly();

  // #endregion

  // #region Methods

  /**
   * Loads the view.
   *
   * @returns When it is loaded.
   */
  public async load(): Promise<void> {
    await Promise.all([this.settings.reload(), this._shell.loadInfo()]);
  }

  /**
   * Sets whether the app starts in dry run. The switch of the title bar stays as it is until the next start.
   *
   * @param startInDryRun The new value.
   * @returns When main knows.
   */
  public setStartInDryRun(startInDryRun: boolean): Promise<void> {
    return this.change({ startInDryRun });
  }

  /**
   * Sets whether runs write what they do in detail to their log.
   *
   * @param verboseLog The new value.
   * @returns When main knows.
   */
  public setVerboseLog(verboseLog: boolean): Promise<void> {
    return this.change({ verboseLog });
  }

  /**
   * Sets whether runs reuse the results of files that did not change.
   *
   * @param cacheResults The new value.
   * @returns When main knows.
   */
  public setCacheResults(cacheResults: boolean): Promise<void> {
    return this.change({ cacheResults });
  }

  /**
   * Picks the color mode.
   *
   * @param colorMode The mode.
   * @returns When main knows.
   */
  public setColorMode(colorMode: ColorMode): Promise<void> {
    return this.change({ colorMode });
  }

  /**
   * Copies the line that adds the command line to a project.
   *
   * @returns When it is copied.
   */
  public copyInstallCommand(): Promise<void> {
    return this.copy(INSTALL_COMMAND, 'Copied the command.');
  }

  /**
   * Copies what a bug report wants to know.
   *
   * @returns When it is copied.
   */
  public async copyBugReport(): Promise<void> {
    const info = this._shell.info();

    if (info) {
      await this.copy(bugReportOf(info), 'Copied for a bug report.');
    }
  }

  /**
   * Saves the effective settings to a file of the user's choice, without secrets: of the open project, or else of all projects.
   *
   * @returns When it is done.
   */
  public async exportRunConfiguration(): Promise<void> {
    const workspace = this._shell.workspace();

    if (!workspace) {
      return;
    }

    this._message.set(null);
    this._note.set(null);

    try {
      const { file } = await this._api.request('config.exportRun', {
        workspaceId: workspace.id,
        projectId: this._shell.project()?.id ?? null,
      });

      this._note.set(file ? `Saved to ${file}` : null);
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * @private
   */
  private async copy(text: string, note: string): Promise<void> {
    this._message.set(null);

    try {
      await this._api.request('clipboard.writeText', { text });
      this._note.set(note);
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * A switch also reports the state it was bound to, so a value that did not change goes nowhere.
   *
   * @private
   */
  private async change(
    change: Partial<
      Pick<AppSettingsView, 'startInDryRun' | 'verboseLog' | 'cacheResults' | 'colorMode'>
    >,
  ): Promise<void> {
    const current = this._current();

    if (
      !current ||
      Object.entries(change).every(
        ([name, value]) => current[name as keyof AppSettingsView] === value,
      )
    ) {
      return;
    }

    this._message.set(null);

    const { startInDryRun, verboseLog, cacheResults, colorMode } = { ...current, ...change };

    try {
      this._current.set(
        await this._api.request('app.saveSettings', {
          startInDryRun,
          verboseLog,
          cacheResults,
          colorMode,
        }),
      );
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    }
  }

  // #endregion
}

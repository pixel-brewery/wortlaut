// #region Imports

import type { ColorMode } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * What the app asks of the operating system. Keeping it behind this contract keeps every request testable without
 * Electron.
 *
 * @public
 */
export interface INativeHost {
  /**
   * Shows the native folder dialog.
   *
   * @returns The chosen path, or `null` when the user cancelled.
   */
  chooseFolder(): Promise<string | null>;

  /**
   * Opens a file in the application the system associates with it. A file that could run instead only shows in its folder.
   *
   * @param path The absolute path.
   */
  openPath(path: string): Promise<void>;

  /**
   * Shows the native dialog to save a file and writes it.
   *
   * @param options What the dialog offers, and the text of the file.
   * @returns The path the file went to, or `null` when the user cancelled.
   */
  saveTextFile(options: {
    title: string;
    defaultName: string;
    text: string;
  }): Promise<string | null>;

  /**
   * Shows the native dialog to open a file and reads it, within a bound.
   *
   * @param options What the dialog says.
   * @returns The name and the text of the file, or `null` when the user cancelled.
   * @throws Error when the file is too large or cannot be read.
   */
  openTextFile(options: {
    title: string;
    maxBytes: number;
  }): Promise<{ name: string; text: string } | null>;

  /**
   * Sets the color mode of the app, or lets the system decide.
   *
   * @param mode The mode.
   */
  setColorMode(mode: ColorMode | null): void;

  /**
   * Says which color mode the app shows right now.
   *
   * @returns The mode.
   */
  activeColorMode(): ColorMode;

  /**
   * Puts text on the clipboard.
   *
   * @param text The text.
   */
  writeClipboard(text: string): Promise<void>;
}

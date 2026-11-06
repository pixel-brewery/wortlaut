// #region Types

type PaneStorage = Pick<Storage, 'getItem' | 'setItem'>;
type PaneUnit = 'px' | '%';

// #endregion

/**
 * Remembers user-adjusted pane sizes on this device. Storage is optional for the layout.
 */
export class PaneSizeMemory {
  // #region Ctor

  /** Uses the device's optional store for pane preferences. */
  public constructor(private readonly _storage: PaneStorage | undefined) {}

  // #endregion

  // #region Methods

  /** Reads a size in its native resize mode, ignoring missing or invalid preferences. */
  public read(pane: string, unit: PaneUnit = 'px'): number | undefined {
    try {
      const value = this._storage?.getItem(this.key(pane, unit));
      const pattern = unit === '%' ? /^\d+(?:\.\d+)?$/ : /^\d+$/;
      const size = value && pattern.test(value) ? Number(value) : Number.NaN;

      return this.isValid(size, unit) ? size : undefined;
    } catch {
      return undefined;
    }
  }

  /** Stores a user-adjusted size without making storage availability a layout requirement. */
  public remember(pane: string, size: number, unit: PaneUnit = 'px'): void {
    if (!this.isValid(size, unit)) {
      return;
    }

    try {
      const value = unit === 'px' ? Math.max(1, Math.round(size)) : size;
      this._storage?.setItem(this.key(pane, unit), String(value));
    } catch {
      // A blocked or full store only loses the remembered preference.
    }
  }

  private key(pane: string, unit: PaneUnit): string {
    return `wortlaut.pane.${pane}${unit === '%' ? '.ratio' : ''}`;
  }

  private isValid(size: number, unit: PaneUnit): boolean {
    return Number.isFinite(size) && size > 0 && (unit === 'px' || size < 100);
  }

  // #endregion
}

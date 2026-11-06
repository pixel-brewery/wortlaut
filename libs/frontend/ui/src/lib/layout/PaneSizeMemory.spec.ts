// #region Imports

import { describe, expect, it, vi } from 'vitest';
import { PaneSizeMemory } from './PaneSizeMemory';

// #endregion

describe('PaneSizeMemory', () => {
  it('remembers independent pane sizes across views', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const memory = new PaneSizeMemory(storage);

    memory.remember('runs.list', 321.4);
    memory.remember('translations.editor', 480);

    expect(new PaneSizeMemory(storage).read('runs.list')).toBe(321);
    expect(memory.read('translations.editor')).toBe(480);
    expect(memory.read('review.list')).toBeUndefined();
  });

  it.each(['0', '-1', 'Infinity', 'NaN', '280px', ''])(
    'ignores an invalid stored size: %s',
    (value) => {
      expect(
        new PaneSizeMemory({ getItem: () => value, setItem: vi.fn() }).read('pane'),
      ).toBeUndefined();
    },
  );

  it('preserves proportional sizes independently of absolute sizes', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const memory = new PaneSizeMemory(storage);

    memory.remember('overview.coverage', 523);
    memory.remember('overview.coverage', 64.90683, '%');

    expect(new PaneSizeMemory(storage).read('overview.coverage', '%')).toBe(64.90683);
    expect(memory.read('overview.coverage')).toBe(523);
    expect(memory.read('overview.rules', '%')).toBeUndefined();
  });

  it.each(['0', '100', '101', '-1', 'Infinity', 'NaN'])(
    'ignores an invalid stored proportion: %s',
    (value) => {
      expect(
        new PaneSizeMemory({ getItem: () => value, setItem: vi.fn() }).read('pane', '%'),
      ).toBeUndefined();
    },
  );

  it('keeps layout usable when storage is missing, blocked or full', () => {
    const unavailable = new PaneSizeMemory(undefined);
    const blocked = new PaneSizeMemory({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    });

    expect(unavailable.read('pane')).toBeUndefined();
    expect(blocked.read('pane')).toBeUndefined();
    expect(() => unavailable.remember('pane', 300)).not.toThrow();
    expect(() => blocked.remember('pane', 300)).not.toThrow();
  });

  it('does not save invalid or collapsed sizes', () => {
    const setItem = vi.fn();
    const memory = new PaneSizeMemory({ getItem: () => null, setItem });

    for (const size of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      memory.remember('pane', size);
      memory.remember('pane', size, '%');
    }
    memory.remember('pane', 100, '%');
    memory.remember('pane', 101, '%');

    expect(setItem).not.toHaveBeenCalled();
  });
});

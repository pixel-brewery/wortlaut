// #region Imports

import { WorkspaceCodeSchema } from '@pixel-brewery/wortlaut-contracts';
import { describe, expect, it } from 'vitest';
import { customWorkspaceColor, workspaceCodeOf, workspaceColorValue } from './workspaceIdentity';

// #endregion

describe('workspaceCodeOf', () => {
  it('takes the initials of two words and the start of one', () => {
    expect(workspaceCodeOf('Pixel Brewery')).toBe('PB');
    expect(workspaceCodeOf('Acme')).toBe('AC');
    expect(workspaceCodeOf('acme-shop')).toBe('AS');
    expect(workspaceCodeOf('  ')).toBe('');
  });

  it('gives what the contract accepts', () => {
    for (const name of ['Müller GmbH', 'ÄÖ', '42 Things', 'x']) {
      expect(WorkspaceCodeSchema.safeParse(workspaceCodeOf(name)).success).toBe(true);
    }
  });
});

describe('workspaceColorValue', () => {
  it('renders custom RGB identity after schema normalization without changing the color', () => {
    const saved = customWorkspaceColor('#ab12Ef');

    expect(saved).toBe('#AB12EF');
    if (saved !== undefined) {
      expect(workspaceColorValue(saved)).toBe('#AB12EF');
    }
  });

  it('resolves legacy named accents to usable RGB values', () => {
    for (const color of ['teal', 'blue', 'violet', 'orange', 'green'] as const) {
      expect(workspaceColorValue(color)).toMatch(/^#[0-9a-f]{6}$/iu);
    }
  });

  it.each(['rgb(171 205 239)', 'rgb(171, 205, 239)'])(
    'normalizes the actual Mosaik picker output %s to the saved RGB contract',
    (value) => {
      expect(customWorkspaceColor(value)).toBe('#ABCDEF');
    },
  );

  it('preserves the RGB range endpoints without clamping other colors', () => {
    expect(customWorkspaceColor('rgb(0 255 0)')).toBe('#00FF00');
  });

  it.each([
    null,
    12,
    'blue',
    '#abc',
    '#12345678',
    'hsl(1 20% 30%)',
    'rgb(256 0 0)',
    'rgb(-1 0 0)',
    'rgb(1 2 3 / 0.5)',
    'rgb(1 2 3 / 1)',
    'rgba(1, 2, 3, 0.5)',
    'rgb(1, 2 3)',
    'rgb(10% 20% 30%)',
    'rgb(NaN 2 3)',
  ])('rejects incomplete or non-RGB picker output %s', (value) => {
    expect(customWorkspaceColor(value)).toBeUndefined();
  });
});

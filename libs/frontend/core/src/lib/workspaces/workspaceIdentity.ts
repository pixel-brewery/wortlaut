// #region Imports

import type { WorkspaceColor } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * Derives the short code of a workspace from its name: the initials of the first two words, or the first two letters
 * of a single word.
 *
 * @param name The name.
 * @returns The code in capitals, or nothing when the name holds no letter or digit.
 */
export function workspaceCodeOf(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
  const letters = words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0]?.slice(0, 2) ?? '');

  return letters.toLocaleUpperCase('en').replace(/[^\p{Lu}\p{Nd}]/gu, '');
}

/**
 * The stable Tailwind 600 accents used for workspace identity.
 * These are selectable content colors; application surfaces continue to use the active Mosaik theme.
 */
export const WORKSPACE_COLORS = [
  { id: 'red', token: '#dc2626' },
  { id: 'orange', token: '#ea580c' },
  { id: 'yellow', token: '#ca8a04' },
  { id: 'green', token: '#16a34a' },
  { id: 'cyan', token: '#0891b2' },
  { id: 'blue', token: '#2563eb' },
  { id: 'violet', token: '#7c3aed' },
  { id: 'pink', token: '#db2777' },
  { id: 'slate', token: '#475569' },
] as const;

/**
 * Resolves saved named accents and custom RGB colors to a CSS color without changing their identity.
 *
 * @param color The saved accent.
 * @returns Its opaque RGB hex value.
 */
export function workspaceColorValue(color: WorkspaceColor): string {
  if (color.startsWith('#')) {
    return color.toUpperCase();
  }

  return WORKSPACE_COLORS.find((preset) => preset.id === color)?.token ?? '#0d9488';
}

/**
 * Accepts an opaque RGB color from a picker and normalizes it for the profile contract.
 *
 * @param value The picker output.
 * @returns The normalized color, or nothing for an incomplete or unsupported value.
 */
export function customWorkspaceColor(value: unknown): WorkspaceColor | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  if (/^#[0-9a-f]{6}$/iu.test(value)) {
    return `#${value.slice(1).toUpperCase()}`;
  }

  // Mosaik's hex input emits chroma.css(): modern space-separated RGB or the older comma form.
  // Accept only three opaque integer channels; alpha, percentages and out-of-range values stay invalid.
  const rgb = /^rgb\(([^()]*)\)$/iu.exec(value);

  if (!rgb) {
    return undefined;
  }

  const body = rgb[1].trim();
  const channels = body.includes(',')
    ? body.split(',').map((channel) => channel.trim())
    : body.split(/\s+/u);

  if (
    channels.length !== 3 ||
    channels.some((channel) => !/^\d{1,3}$/u.test(channel) || Number(channel) > 255)
  ) {
    return undefined;
  }

  return `#${channels
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

// #region Imports

import type { IIconDefinition } from '@pixel-brewery/mosaik-icons';
import { REGION_FLAGS } from './RegionFlags';

// #endregion

/**
 * Reicon flags under the names shared by every Mosaik icon-bearing control in the app.
 *
 * @public
 */
export const localeFlagIcons: Readonly<Record<string, IIconDefinition>> = Object.fromEntries(
  Object.entries(REGION_FLAGS).map(([region, definition]) => [`localeFlag${region}`, definition]),
);

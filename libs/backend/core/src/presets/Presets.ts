// #region Imports

import type { ILogger } from '@pixel-brewery/utilities';
import { AngularPreset } from './AngularPreset.js';
import type { IFrameworkPreset } from './interfaces/IFrameworkPreset.js';
import { LitPreset } from './LitPreset.js';
import { ReactPreset } from './ReactPreset.js';
import { StencilPreset } from './StencilPreset.js';
import { VuePreset } from './VuePreset.js';

// #endregion

/**
 * The available presets.
 *
 * @public
 */
export enum Presets {
  Angular = 'angular',
  Lit = 'lit',
  React = 'react',
  Stencil = 'stencil',
  Vue = 'vue',
}

export namespace Presets {
  /**
   * Gets the preset.
   *
   * @param logger The logger.
   * @param preset The preset to get.
   * @returns The preset.
   */
  export function get(logger: ILogger, preset: Presets | unknown): IFrameworkPreset {
    switch (preset) {
      case Presets.Angular:
        return new AngularPreset(logger);
      case Presets.Lit:
        return new LitPreset(logger);
      case Presets.React:
        return new ReactPreset(logger);
      case Presets.Stencil:
        return new StencilPreset(logger);
      case Presets.Vue:
        return new VuePreset(logger);
      default:
        throw new Error('Unknown preset');
    }
  }
}

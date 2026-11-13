// #region Imports

import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { IResourceGeneratorStrategy } from '../generator/strategies/interfaces/IResourceGeneratorStrategy.js';
import { suggestPatterns } from './AiProposals.js';

// #endregion

describe('suggestPatterns', () => {
  it('explains why a proposed pattern was stopped and keeps the usable proposals', async () => {
    const emitter = new EventEmitter();
    const pattern = '/(a+)+/';
    const strategy: IResourceGeneratorStrategy = {
      on: emitter.on.bind(emitter),
      transcribe: () => Promise.reject(new Error('Only free completion is used for proposals.')),
      complete: () => Promise.resolve(JSON.stringify([pattern, 'loc.nav.*'])),
    };

    const result = await suggestPatterns(strategy, {
      keys: [`${'a'.repeat(36)}!`, 'loc.nav.title'],
    });

    expect(result.proposals).toEqual([{ pattern: 'loc.nav.*', matchCount: 1 }]);
    expect(result.dropped).toEqual([expect.stringContaining(`'${pattern}' was stopped`)]);
  });
});

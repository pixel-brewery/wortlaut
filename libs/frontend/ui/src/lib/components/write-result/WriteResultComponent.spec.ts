// #region Imports

import { describe, expect, it, vi } from 'vitest';

// #endregion

vi.mock('@pixel-brewery/mosaik-elements-angular/components/anchor', () => ({ AnchorComponent: class {} }));
vi.mock('@pixel-brewery/mosaik-elements-angular/components/message', () => ({ MessageComponent: class {} }));

describe('describeWrite', () => {
    it('says what a change did, and that a change in Review wrote nothing', async () => {
        // arrange
        const { describeWrite } = await import('./WriteResultComponent');

        // act & assert
        expect(describeWrite(null)).toBeNull();
        expect(describeWrite({ state: 'applied', changeSetId: 'c1', runId: 'r1', files: ['a.json', 'b.ts'] })).toEqual({ variant: 'success', header: 'Written', content: 'a.json, b.ts', goesToReview: false });
        expect(describeWrite({ state: 'pending', changeSetId: 'c1', runId: 'r1', files: ['a.json'] })).toEqual({ variant: 'info', header: 'Waiting in Review', content: 'Nothing was written. a.json', goesToReview: true });
        expect(describeWrite({ state: 'unchanged', changeSetId: null, runId: null, files: [] })).toMatchObject({ header: 'Nothing to change' });
    });
});

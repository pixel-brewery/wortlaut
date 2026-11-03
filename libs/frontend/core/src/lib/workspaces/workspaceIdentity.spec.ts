// #region Imports

import { WorkspaceCodeSchema } from '@pixel-brewery/wortlaut-contracts';
import { describe, expect, it } from 'vitest';
import { workspaceCodeOf } from './workspaceIdentity';

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

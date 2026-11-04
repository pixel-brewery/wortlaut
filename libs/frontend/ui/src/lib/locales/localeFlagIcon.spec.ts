// #region Imports

import { reiconAustriaFlags, reiconBrazilFlags, reiconHongKongFlags, reiconPortugalFlags, reiconTaiwanFlags, reiconUnitedKingdomFlags, reiconUnitedStatesFlags } from '@pixel-brewery/mosaik-icons/reicon/flags';
import { describe, expect, it } from 'vitest';
import { localeFlagIcon } from './localeFlagIcon';
import { localeFlagIcons } from './localeFlagIcons';

// #endregion

describe('localeFlagIcon', () => {
    it.each([
        { code: 'en', icon: reiconUnitedKingdomFlags },
        { code: 'pt', icon: reiconPortugalFlags },
        { code: 'en-US', icon: reiconUnitedStatesFlags },
        { code: 'pt_BR', icon: reiconBrazilFlags },
        { code: 'de-AT', icon: reiconAustriaFlags },
        { code: 'zh_Hant_HK', icon: reiconHongKongFlags }
    ])('chooses the appropriate default or explicit country for $code', ({ code, icon }) => {
        const name = localeFlagIcon(code);

        expect(name).toBeDefined();
        expect(name && localeFlagIcons[name]).toBe(icon);
    });

    it('infers a script-specific region when the locale has none', () => {
        const name = localeFlagIcon('zh-Hant');

        expect(name).toBeDefined();
        expect(name && localeFlagIcons[name]).toBe(reiconTaiwanFlags);
    });

    it.each([undefined, null, '', '!!', 'und', 'und-US', 'mul', 'zxx', 'zz', 'zz-US', 'custom'])('keeps an absent, invalid or unknown language without a flag: %s', (code) => {
        expect(localeFlagIcon(code)).toBeUndefined();
    });

    it.each(['es-419', 'en-001', 'en-ZZ', 'fr-RE'])('does not substitute another country for an unsupported explicit region: %s', (code) => {
        expect(localeFlagIcon(code)).toBeUndefined();
    });
});

// #region Imports

import { describe, expect, it } from 'vitest';
import { opensWithoutRunning } from './OpenableFile';

// #endregion

describe('opensWithoutRunning', () => {
    it.each(['lang.de.json', 'lang.de.po', 'lang.de.RESX', 'view.html', 'view.ts', 'view.vue'])('takes %s for a document', (file) => {
        // act & assert
        expect(opensWithoutRunning(file)).toBe(true);
    });

    it.each(['view.js', 'view.mjs', 'view.jsx', 'run.command', 'run.bat', 'run.exe', 'run.vbs', 'run.app', 'run.hta', 'run', 'lang.de.json.exe'])('does not take %s for one', (file) => {
        // act & assert
        expect(opensWithoutRunning(file)).toBe(false);
    });
});

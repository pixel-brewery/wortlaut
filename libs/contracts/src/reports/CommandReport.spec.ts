// #region Imports

import { describe, expect, it } from 'vitest';
import { CommandFailureReportSchema, CommandReportSchema } from './CommandReport';

// #endregion

describe('CommandReportSchema', () => {
    it('accepts what the CLI prints for scripts', () => {
        // act
        const result = CommandReportSchema.safeParse({ ok: true, command: 'sort', runId: null, state: 'succeeded', writeMode: 'apply', changeSet: null, findings: [], data: { files: [] } });

        // assert
        expect(result.success).toBe(true);
    });

    it('keeps success and failure apart by their ok field', () => {
        // act
        const result = CommandReportSchema.safeParse({ ok: false, command: 'sort', runId: null, state: 'failed', writeMode: 'apply', changeSet: null, findings: [], data: null });

        // assert
        expect(result.success).toBe(false);
    });

    it('names the files of a failure', () => {
        // act
        const result = CommandFailureReportSchema.parse({
            ok: false,
            command: 'changes',
            error: { code: 'change-set-conflict', message: 'lang.en.json changed', files: ['lang.en.json'], changeSetId: null, runId: 'run' }
        });

        // assert
        expect(result.error.files).toEqual(['lang.en.json']);
    });
});

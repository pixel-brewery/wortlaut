// #region Imports

import { describe, expect, it } from 'vitest';
import { RunRecordSchema, type RunRecord } from './RunRecord';

// #endregion

describe('RunRecordSchema', () => {
    it('accepts a run', () => {
        // act
        const result = RunRecordSchema.safeParse(createRun({}));

        // assert
        expect(result.success).toBe(true);
    });

    it('rejects a run whose options hold a secret, at any depth', () => {
        // act
        const result = RunRecordSchema.safeParse(createRun({ generate: { apiKey: 'sk-secret' } }));

        // assert
        expect(result.success).toBe(false);
    });

    it('rejects a field nobody declared', () => {
        // act
        const result = RunRecordSchema.safeParse({ ...createRun({}), token: 'sk-secret' });

        // assert
        expect(result.success).toBe(false);
    });
});

function createRun(options: Record<string, unknown>): RunRecord {
    return {
        schemaVersion: 1,
        id: '20261102T100000000Z-abcd',
        command: 'sort',
        surface: 'cli',
        state: 'succeeded',
        writeMode: 'apply',
        dryRun: false,
        cwd: '/project',
        startedAt: '2026-11-02T10:00:00.000Z',
        finishedAt: '2026-11-02T10:00:01.000Z',
        durationMs: 1000,
        options,
        log: [],
        droppedLogEntries: 0,
        findings: [],
        changeSet: null,
        failure: null
    };
}

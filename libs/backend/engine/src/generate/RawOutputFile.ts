// #region Imports

import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// #endregion

/**
 * Keeps the raw answers of a run in a private temporary file, for debugging, when Keep raw AI output asks for it. Answers hold
 * catalog text and no key.
 *
 * @internal
 * @param runId The run.
 * @param log Says where the file is, once.
 * @returns What takes an answer.
 */
export function createRawOutputFile(runId: string, log: (line: string) => void): (text: string) => void {
    const file = join(tmpdir(), `wortlaut-raw-${runId}.log`);
    let isAnnounced = false;

    return (text) => {
        appendFileSync(file, `${text}\n`, { mode: 0o600 });

        if (!isAnnounced) {
            isAnnounced = true;
            log(`Raw answers go to ${file}`);
        }
    };
}

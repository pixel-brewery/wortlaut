// #region Imports

import { readFileSync } from 'node:fs';
import type { ChangeSet } from '@pixel-brewery/wortlaut-contracts';
import { ChangeSetApplier } from '../ChangeSetApplier';
import { ChangeSetJournal } from '../ChangeSetJournal';

// #endregion

/**
 * A process that applies a change set the way the engine does and dies without any warning after the first rename: `kill -9`, with
 * no error to catch and no `finally` to run.
 *
 * Arguments: the journal directory, the file of the change set and the index of the rename to die after.
 */
const [, , journalDirectory, changeSetFile, dieAfter] = process.argv;
const changeSet = JSON.parse(readFileSync(changeSetFile, 'utf8')) as ChangeSet;

new ChangeSetApplier({
    journal: new ChangeSetJournal(journalDirectory),
    onRenamed: (index) => {
        if (index === Number(dieAfter)) {
            process.kill(process.pid, 'SIGKILL');
        }
    }
}).apply(changeSet);

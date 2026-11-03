// #region Imports

import type { Finding, RunCommandName } from '@pixel-brewery/wortlaut-contracts';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * What a change to the rule packs of a repository records. It names no file and no value of a pack's content.
 *
 * @public
 */
export interface IRulePackChangeOptions {
    action: 'add' | 'update' | 'enable' | 'disable' | 'severity';
    source?: string;
    pack?: string;
    rule?: string;
    severity?: string;
}

/**
 * Proposes what a change to the rule packs of one repository writes, as one change set. The files were worked out before: the
 * lock file, the pinned copy of a pack and settings.
 *
 * @internal
 */
export class RulePackChangeUseCase implements IUseCase<IRulePackChangeOptions, Array<string>> {

    // #region Fields

    public readonly command: RunCommandName;

    private readonly _detail: string;
    private readonly _files: ReadonlyMap<string, string>;
    private readonly _notes: ReadonlyArray<string>;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `RulePackChangeUseCase` class.
     *
     * @param command The command to record.
     * @param detail What the change set says it is.
     * @param files The new contents by path.
     * @param notes What a reviewer should read with it.
     */
    public constructor(command: RunCommandName, detail: string, files: ReadonlyMap<string, string>, notes: ReadonlyArray<string> = []) {
        this.command = command;
        this._detail = detail;
        this._files = files;
        this._notes = notes;
    }

    // #endregion

    // #region Methods

    /**
     * @override
     */
    public detail(): string {
        return this._detail;
    }

    /**
     * @override
     */
    public execute(_options: IRulePackChangeOptions, context: IUseCaseContext): Promise<IUseCaseOutput<Array<string>>> {
        for (const [path, content] of this._files) {
            context.changes.propose(path, content);
        }

        for (const note of this._notes) {
            const finding: Finding = { rule: 'rule-pack', severity: 'info', message: note, file: null, locale: null };

            context.changes.addFinding(finding);
        }

        return Promise.resolve({ result: Array.from(this._files.keys()), data: { files: Array.from(this._files.keys()) } });
    }

    // #endregion

}

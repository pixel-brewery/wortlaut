// #region Imports

import type { IResourceGeneratorStrategy } from '@pixel-brewery/wortlaut-ai';
import { EngineError } from '../errors/EngineError.js';
import type { TranslationSession } from '../generate/TranslationSession.js';
import { composeTargets } from '../generate/composeTargets.js';
import type { IUseCase, IUseCaseContext, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * The options of a hosted run, as a run record keeps them. A key is no part of them.
 *
 * @internal
 */
export interface ITranslationRunOptions {
    strategy: string;
    model?: string;
    temperature?: number;
    locales: Array<string>;
    baseLocale: string;
    chunkSize: number;
    limit: number | null;
    scope?: string;
    namespace: string | null;
    keyCount: number | null;
    review: boolean;
    type: string;
    resourceRoot: string | Array<string>;
}

/**
 * Runs a session as one recorded run. It takes the state of every target before the first request, so a file that changes
 * during a long run fails the apply. A failed, stopped or quit run writes nothing: what it finished waits in the review list.
 *
 * @internal
 */
export class TranslationRunUseCase implements IUseCase<ITranslationRunOptions, TranslationSession> {

    // #region Fields

    public readonly command = 'generate';

    private readonly _session: TranslationSession;
    private readonly _strategy: IResourceGeneratorStrategy;
    private readonly _secrets: ReadonlyArray<string>;
    private readonly _keepPartial: boolean;
    private readonly _onStart: (context: IUseCaseContext) => void;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `TranslationRunUseCase` class.
     *
     * @param session The session.
     * @param strategy The strategy.
     * @param secrets What must stay out of everything the run stores.
     * @param keepPartial Whether a stopped run keeps what it finished.
     * @param onStart Hands over the context of the run.
     */
    public constructor(session: TranslationSession, strategy: IResourceGeneratorStrategy, secrets: ReadonlyArray<string>, keepPartial: boolean, onStart: (context: IUseCaseContext) => void) {
        this._session = session;
        this._strategy = strategy;
        this._secrets = secrets;
        this._keepPartial = keepPartial;
        this._onStart = onStart;
    }

    // #endregion

    // #region Methods

    /**
     * @override
     */
    public detail(options: ITranslationRunOptions): string {
        return `${options.strategy}: ${options.baseLocale} to ${options.locales.join(', ')}`;
    }

    /**
     * @override
     */
    public async execute(_options: ITranslationRunOptions, context: IUseCaseContext): Promise<IUseCaseOutput<TranslationSession>> {
        const session = this._session;

        for (const secret of this._secrets) {
            context.scrubber.add(secret);
        }

        for (const target of session.targetPaths) {
            context.changes.snapshot(target);
            session.noteRead(target);
        }

        this._onStart(context);

        await session.run(this._strategy, context.signal, (line) => context.logger.log(line));

        const failed = session.status === 'stopped';

        if (!failed || this._keepPartial) {
            for (const { path, content } of await composeTargets(session, null)) {
                context.changes.propose(path, content);
            }
        }

        session.partial = failed;

        return {
            result: session,
            data: { status: session.status, translated: session.translatedCount() },
            failure: failed ? new EngineError('run-stopped', 'The run was stopped. Nothing was written.') : null
        };
    }

    // #endregion

}

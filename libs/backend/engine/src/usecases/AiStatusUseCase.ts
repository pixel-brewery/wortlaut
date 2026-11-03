// #region Imports

import type { IAiProviderHost, IAiProviderInfo } from '@pixel-brewery/wortlaut-ai';
import type { IUseCase, IUseCaseOutput } from '../runs/CommandRunner.js';

// #endregion

/**
 * Asks every provider for its true state. It starts no login and installs nothing.
 *
 * @internal
 */
export class AiStatusUseCase implements IUseCase<Record<string, never>, Array<IAiProviderInfo>> {

    // #region Fields

    public readonly command = 'ai.status';

    private readonly _host: IAiProviderHost;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `AiStatusUseCase` class.
     *
     * @param host The providers.
     */
    public constructor(host: IAiProviderHost) {
        this._host = host;
    }

    // #endregion

    // #region Methods

    /**
     * @override
     */
    public async execute(): Promise<IUseCaseOutput<Array<IAiProviderInfo>>> {
        const providers = await this._host.list();

        return { result: providers, data: { providers } };
    }

    // #endregion

}

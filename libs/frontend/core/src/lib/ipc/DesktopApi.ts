// #region Imports

import { Injectable } from '@angular/core';
import type { IpcEvent, IpcMethod, IpcRequest, IpcResponse, IWortlautApi } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * Connects Angular to the validated bridge of the sandboxed preload. It is the renderer's only way to reach the engine.
 */
@Injectable({ providedIn: 'root' })
export class DesktopApi {

    // #region Methods

    /**
     * Sends a request.
     *
     * @param method The name of the request.
     * @param payload The payload.
     * @returns The validated response.
     */
    public request<M extends IpcMethod>(method: M, payload: IpcRequest<M>): Promise<IpcResponse<M>> {
        return this.bridge().request(method, payload);
    }

    /**
     * Subscribes to events.
     *
     * @param listener Receives each validated event.
     * @returns The function that ends the subscription.
     */
    public onEvent(listener: (event: IpcEvent) => void): () => void {
        return this.bridge().onEvent(listener);
    }

    /**
     * @private
     */
    private bridge(): IWortlautApi {
        const api = (window as Window & { wortlaut?: IWortlautApi }).wortlaut;

        if (!api) {
            throw new Error('Wortlaut runs only in its desktop window.');
        }

        return api;
    }

    // #endregion

}

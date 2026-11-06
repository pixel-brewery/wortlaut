// #region Imports

import type { IpcEvent } from './IpcEvents.js';
import type { IpcMethod, IpcRequest, IpcResponse } from './IpcContract.js';

// #endregion

/**
 * What the sandboxed preload exposes to the renderer. No Electron primitive escapes.
 *
 * @public
 */
export interface IWortlautApi {
  /**
   * Sends a request and resolves with its validated response.
   *
   * @param method The name of the request.
   * @param payload The payload.
   * @returns The response.
   * @throws Error with a message that is safe to show.
   */
  request<M extends IpcMethod>(method: M, payload: IpcRequest<M>): Promise<IpcResponse<M>>;

  /**
   * Subscribes to validated events.
   *
   * @param listener Receives each event.
   * @returns The function that ends the subscription.
   */
  onEvent(listener: (event: IpcEvent) => void): () => void;
}

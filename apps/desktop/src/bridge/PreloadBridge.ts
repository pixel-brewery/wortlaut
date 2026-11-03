// #region Imports

import { IPC_CHANNELS, IPC_CONTRACT, IpcEventSchema, IpcRequestEnvelopeSchema, IpcResponseEnvelopeSchema, type IpcEvent, type IpcMethod, type IpcRequest, type IpcResponse, type IWortlautApi } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * The part of `ipcRenderer` that the bridge uses.
 *
 * @public
 */
export interface IIpcRendererLike {
    invoke(channel: string, ...args: Array<unknown>): Promise<unknown>;
    on(channel: string, listener: (event: unknown, payload: unknown) => void): unknown;
    removeListener(channel: string, listener: (event: unknown, payload: unknown) => void): unknown;
}

/**
 * Creates what the renderer gets: `request` and `onEvent`, nothing else. Everything that arrives from main is validated
 * here before the renderer sees it.
 *
 * @public
 * @param ipc The `ipcRenderer`.
 * @param createId Creates the id that a response must carry.
 * @returns The API.
 */
export function createPreloadBridge(ipc: IIpcRendererLike, createId: () => string = () => crypto.randomUUID()): IWortlautApi {
    return {
        async request<M extends IpcMethod>(method: M, payload: IpcRequest<M>): Promise<IpcResponse<M>> {
            const correlationId = createId();
            const envelope = IpcRequestEnvelopeSchema.parse({ correlationId, method, payload: IPC_CONTRACT[method].request.parse(payload) });
            const response = IpcResponseEnvelopeSchema.parse(await ipc.invoke(IPC_CHANNELS.request, envelope));

            if (response.correlationId !== correlationId) {
                throw new Error('The answer does not belong to this request.');
            }

            if (!response.ok) {
                throw new Error(response.error.message);
            }

            return IPC_CONTRACT[method].response.parse(response.data) as IpcResponse<M>;
        },
        onEvent(listener: (event: IpcEvent) => void): () => void {
            const handle = (_event: unknown, raw: unknown): void => {
                const event = IpcEventSchema.safeParse(raw);

                if (event.success) {
                    listener(event.data);
                }
            };

            ipc.on(IPC_CHANNELS.event, handle);

            return () => {
                ipc.removeListener(IPC_CHANNELS.event, handle);
            };
        }
    };
}

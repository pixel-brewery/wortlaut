// #region Imports

import { randomUUID } from 'node:crypto';
import {
  IPC_CONTRACT,
  IpcRequestEnvelopeSchema,
  IpcResponseEnvelopeSchema,
  type IpcMethod,
  type IpcPayload,
  type IpcResponse,
  type IpcResponseEnvelope,
} from '@pixel-brewery/wortlaut-contracts';
import { EngineError } from '@pixel-brewery/wortlaut-engine';

// #endregion

/**
 * The longest message a failure carries.
 */
const MAX_MESSAGE_LENGTH = 2000;

/**
 * What answers each request.
 *
 * @public
 */
export type IpcHandlers = {
  [M in IpcMethod]: (payload: IpcPayload<M>) => IpcResponse<M> | Promise<IpcResponse<M>>;
};

/**
 * The boundary of the main process: it refuses a sender it does not trust, validates every request before a handler sees
 * it and every response before it leaves, and turns a failure into a message that is safe to show.
 *
 * @public
 */
export class IpcRouter {
  // #region Fields

  private readonly _handlers: IpcHandlers;
  private readonly _scrub: (text: string) => string;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `IpcRouter` class.
   *
   * @param handlers What answers each request.
   * @param scrub Removes what must not leave the main process from a message.
   */
  public constructor(handlers: IpcHandlers, scrub: (text: string) => string) {
    this._handlers = handlers;
    this._scrub = scrub;
  }

  // #endregion

  // #region Methods

  /**
   * Answers a request.
   *
   * @param raw What arrived on the channel.
   * @param trusted Whether the sender is the app's own window.
   * @returns The response. It never rejects.
   */
  public async handle(raw: unknown, trusted: boolean): Promise<IpcResponseEnvelope> {
    const envelope = IpcRequestEnvelopeSchema.safeParse(raw);
    const correlationId = envelope.success ? envelope.data.correlationId : randomUUID();

    if (!trusted) {
      return this.fail(correlationId, 'untrusted-sender', 'This window may not talk to Wortlaut.');
    }

    if (!envelope.success) {
      return this.fail(correlationId, 'invalid-request', 'The request is not valid.');
    }

    const { method, payload } = envelope.data;
    const input = IPC_CONTRACT[method].request.safeParse(payload);

    if (!input.success) {
      return this.fail(correlationId, 'invalid-request', `The request ${method} is not valid.`);
    }

    try {
      const handler = this._handlers[method] as (payload: unknown) => unknown;
      const data = IPC_CONTRACT[method].response.parse(await handler(input.data));

      return IpcResponseEnvelopeSchema.parse({ correlationId, ok: true, data });
    } catch (error) {
      return this.fail(
        correlationId,
        error instanceof EngineError ? error.code : 'request-failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * @private
   */
  private fail(correlationId: string, code: string, message: string): IpcResponseEnvelope {
    return {
      correlationId,
      ok: false,
      error: { code, message: this._scrub(message).slice(0, MAX_MESSAGE_LENGTH) },
    };
  }

  // #endregion
}

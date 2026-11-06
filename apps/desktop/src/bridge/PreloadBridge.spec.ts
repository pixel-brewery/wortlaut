// #region Imports

import { IPC_CHANNELS } from '@pixel-brewery/wortlaut-contracts';
import { describe, expect, it, vi } from 'vitest';
import { isFolderDropTarget } from './FolderDrop';
import { createPreloadBridge, type IIpcRendererLike } from './PreloadBridge';

// #endregion

const ID = '6f1b1c1e-0d3a-4f5e-9a2b-1c2d3e4f5a6b';
const SHELL_STATE = {
  workspace: null,
  project: null,
  provider: null,
  dryRun: true,
  pendingChanges: 0,
};

function createIpc(
  answer: (envelope: { correlationId: string }) => unknown,
): IIpcRendererLike & { listeners: Set<(event: unknown, payload: unknown) => void> } {
  const listeners = new Set<(event: unknown, payload: unknown) => void>();

  return {
    listeners,
    invoke: vi.fn((_channel: string, envelope: unknown) =>
      Promise.resolve(answer(envelope as { correlationId: string })),
    ),
    on: (_channel, listener) => listeners.add(listener),
    removeListener: (_channel, listener) => listeners.delete(listener),
  };
}

describe('createPreloadBridge', () => {
  it('exposes only request and onEvent', () => {
    expect(Object.keys(createPreloadBridge(createIpc(() => null))).sort()).toEqual([
      'onEvent',
      'request',
    ]);
  });

  it('sends a validated request on the fixed channel and returns the validated response', async () => {
    const ipc = createIpc(({ correlationId }) => ({ correlationId, ok: true, data: SHELL_STATE }));

    await expect(createPreloadBridge(ipc, () => ID).request('shell.state', {})).resolves.toEqual(
      SHELL_STATE,
    );
    expect(ipc.invoke).toHaveBeenCalledWith(IPC_CHANNELS.request, {
      correlationId: ID,
      method: 'shell.state',
      payload: {},
    });
  });

  it('refuses to send a request that does not match its schema', async () => {
    const ipc = createIpc(() => null);
    const request = createPreloadBridge(ipc, () => ID).request('run.get', {
      runId: '../../etc/passwd',
    });

    await expect(request).rejects.toThrow();
    expect(ipc.invoke).not.toHaveBeenCalled();
  });

  it('refuses a response that breaks the contract', async () => {
    const ipc = createIpc(({ correlationId }) => ({
      correlationId,
      ok: true,
      data: { ...SHELL_STATE, path: '/etc' },
    }));

    await expect(createPreloadBridge(ipc, () => ID).request('shell.state', {})).rejects.toThrow();
  });

  it('refuses a response to another request', async () => {
    const ipc = createIpc(() => ({
      correlationId: '00000000-0000-4000-8000-000000000000',
      ok: true,
      data: SHELL_STATE,
    }));

    await expect(createPreloadBridge(ipc, () => ID).request('shell.state', {})).rejects.toThrow(
      'The answer does not belong to this request.',
    );
  });

  it('turns a failure into an error with the message of main', async () => {
    const ipc = createIpc(({ correlationId }) => ({
      correlationId,
      ok: false,
      error: { code: 'x', message: 'The folder is gone.' },
    }));

    await expect(createPreloadBridge(ipc, () => ID).request('shell.state', {})).rejects.toThrow(
      'The folder is gone.',
    );
  });

  it('passes on valid events only and ends a subscription', () => {
    const ipc = createIpc(() => null);
    const listener = vi.fn();
    const stop = createPreloadBridge(ipc).onEvent(listener);
    const [handle] = ipc.listeners;

    handle(null, { type: 'folder.dropFailed', message: 'No.' });
    handle(null, {
      type: 'folder.dropped',
      folder: { token: '/etc', displayPath: '/etc', name: 'etc' },
    });
    handle(null, { type: 'unknown' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ type: 'folder.dropFailed', message: 'No.' });

    stop();

    expect(ipc.listeners.size).toBe(0);
  });
});

describe('isFolderDropTarget', () => {
  it('accepts only a marked element in the path', () => {
    const element = (marked: boolean): EventTarget =>
      ({ hasAttribute: () => marked }) as unknown as EventTarget;

    expect(isFolderDropTarget([element(false), element(true)])).toBe(true);
    expect(isFolderDropTarget([element(false)])).toBe(false);
    expect(isFolderDropTarget([{} as EventTarget])).toBe(false);
  });
});

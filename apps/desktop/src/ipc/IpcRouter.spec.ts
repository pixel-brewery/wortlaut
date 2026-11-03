// #region Imports

import { EngineError } from '@pixel-brewery/wortlaut-engine';
import { describe, expect, it, vi } from 'vitest';
import { IpcRouter, type IpcHandlers } from './IpcRouter';

// #endregion

const ID = '6f1b1c1e-0d3a-4f5e-9a2b-1c2d3e4f5a6b';
const SHELL_STATE = { workspace: null, project: null, provider: null, dryRun: true, pendingChanges: 0 };

function createRouter(overrides: Partial<IpcHandlers> = {}): IpcRouter {
    return new IpcRouter({ 'shell.state': () => SHELL_STATE, ...overrides } as IpcHandlers, (text) => text.split('/work/me').join('~'));
}

describe('IpcRouter', () => {
    it('answers a valid request', async () => {
        await expect(createRouter().handle({ correlationId: ID, method: 'shell.state', payload: {} }, true))
            .resolves.toEqual({ correlationId: ID, ok: true, data: SHELL_STATE });
    });

    it('refuses an untrusted sender before anything runs', async () => {
        const handler = vi.fn(() => SHELL_STATE);
        const response = await createRouter({ 'shell.state': handler }).handle({ correlationId: ID, method: 'shell.state', payload: {} }, false);

        expect(response).toMatchObject({ ok: false, error: { code: 'untrusted-sender' } });
        expect(handler).not.toHaveBeenCalled();
    });

    it('refuses an unknown method and a broken envelope', async () => {
        await expect(createRouter().handle({ correlationId: ID, method: 'fs.readFile', payload: {} }, true)).resolves.toMatchObject({ ok: false, error: { code: 'invalid-request' } });
        await expect(createRouter().handle('nonsense', true)).resolves.toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    });

    it('refuses a payload that does not match its schema, before the handler sees it', async () => {
        const handler = vi.fn();
        const router = createRouter({ 'project.inspectFolder': handler });

        await expect(router.handle({ correlationId: ID, method: 'project.inspectFolder', payload: { folderToken: '/etc', catalogFolderTokens: [], preset: null } }, true))
            .resolves.toMatchObject({ correlationId: ID, ok: false, error: { code: 'invalid-request' } });
        expect(handler).not.toHaveBeenCalled();
    });

    it('refuses a response that breaks the contract, so nothing unchecked reaches the renderer', async () => {
        const router = createRouter({ 'shell.state': () => ({ ...SHELL_STATE, secret: 'sk-1' }) as never });
        const response = await router.handle({ correlationId: ID, method: 'shell.state', payload: {} }, true);

        expect(response.ok).toBe(false);
        expect(JSON.stringify(response)).not.toContain('sk-1');
    });

    it('turns a failure into a stable code and a message without the home directory', async () => {
        const router = createRouter({ 'project.summary': () => { throw new EngineError('project-folder-missing', 'The folder /work/me/app is gone.'); } });

        await expect(router.handle({ correlationId: ID, method: 'project.summary', payload: { projectId: 'p1' } }, true))
            .resolves.toEqual({ correlationId: ID, ok: false, error: { code: 'project-folder-missing', message: 'The folder ~/app is gone.' } });
    });

    it('bounds the message of a failure and never rejects', async () => {
        const router = createRouter({ 'project.summary': () => { throw new Error('x'.repeat(5000)); } });
        const response = await router.handle({ correlationId: ID, method: 'project.summary', payload: { projectId: 'p1' } }, true);

        expect(response).toMatchObject({ ok: false, error: { code: 'request-failed' } });
        expect(response.ok === false && response.error.message.length).toBe(2000);
    });
});

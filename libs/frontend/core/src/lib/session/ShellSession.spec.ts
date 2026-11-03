// #region Imports

import { TestBed } from '@angular/core/testing';
import { Router, type UrlTree } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopApi } from '../ipc/DesktopApi';
import { ShellSession } from './ShellSession';
import { workspaceOpenGuard } from './workspaceOpenGuard';

// #endregion

const STATE = {
    workspace: { id: 'w1', code: 'AC', color: 'teal', name: 'Acme' },
    project: { id: 'p1', name: 'Shop' },
    provider: null,
    dryRun: true
};

function setUp(request: (method: string, payload: unknown) => Promise<unknown>): ShellSession {
    TestBed.configureTestingModule({
        providers: [
            { provide: DesktopApi, useValue: { request: vi.fn(request) } },
            { provide: Router, useValue: { parseUrl: (url: string) => ({ url }) } }
        ]
    });

    return TestBed.inject(ShellSession);
}

describe('ShellSession', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('starts with nothing open and says so about AI', () => {
        const session = setUp(() => Promise.resolve(STATE));

        expect(session.workspace()).toBeNull();
        expect(session.project()).toBeNull();
        expect(session.providerLabel()).toBe('No AI provider');
        expect(session.dryRun()).toBe(true);
    });

    it('reads the state from main', async () => {
        const session = setUp(() => Promise.resolve(STATE));

        await session.refresh();

        expect(session.workspace()?.name).toBe('Acme');
        expect(session.project()?.name).toBe('Shop');
    });

    it('closes a project through main', async () => {
        const request = vi.fn((_method: string, _payload: unknown) => Promise.resolve<unknown>({ ...STATE, project: null }));
        const session = setUp(request);

        await session.setProject(null);

        expect(request).toHaveBeenCalledWith('shell.setProject', { projectId: null });
        expect(session.project()).toBeNull();
    });

    it('reads the app information once and tells the page the platform', async () => {
        const request = vi.fn((_method: string, _payload: unknown) => Promise.resolve<unknown>({ name: 'Wortlaut', version: '0.2.0', platform: 'darwin', arch: 'arm64', cpus: 8, totalMemory: 1 }));
        const session = setUp(request);

        await session.loadInfo();
        await session.loadInfo();

        expect(request).toHaveBeenCalledTimes(1);
        expect(session.info()?.version).toBe('0.2.0');
        expect(document.documentElement.dataset['platform']).toBe('darwin');
    });

    it('lets a view of the shell open only while a workspace is open', async () => {
        setUp(() => Promise.resolve(STATE));

        await expect(TestBed.runInInjectionContext(() => workspaceOpenGuard({} as never, {} as never))).resolves.toBe(true);

        TestBed.resetTestingModule();
        setUp(() => Promise.resolve({ ...STATE, workspace: null }));

        const result = await TestBed.runInInjectionContext(() => workspaceOpenGuard({} as never, {} as never)) as unknown as UrlTree & { url: string };

        expect(result.url).toBe('/welcome');
    });
});

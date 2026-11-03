// #region Imports

import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { DesktopApi } from '@pixel-brewery/wortlaut-frontend-core';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IShellNavigationGroup } from '../contracts/IShellNavigation';
import { SHELL_NAVIGATION } from '../contracts/shellTokens';
import { AppShellViewPresenter } from './AppShellViewPresenter';

// #endregion

const NAVIGATION: ReadonlyArray<IShellNavigationGroup> = [
    {
        label: 'Workspace',
        needsProject: false,
        items: [
            { label: 'Projects', icon: 'folder', route: '/projects', match: '/projects' },
            { label: 'Rule packs', icon: 'skills', route: '/rule-packs', match: '/rule-packs', isAboutWorkspace: true }
        ]
    },
    { label: 'Decide', needsProject: false, items: [{ label: 'Review', icon: 'review', route: '/review', match: '/review', showsPendingChanges: true }] },
    {
        label: 'Verify',
        needsProject: true,
        items: [
            { label: 'Test lab', icon: 'lab', route: '/test-lab/translation', match: '/test-lab' },
            { label: 'Runs', icon: 'flow', route: '/runs', match: '/runs' }
        ]
    }
];

const STATE = { workspace: { id: 'w1', code: 'AC', color: 'teal', name: 'Acme' }, project: { id: 'p1', name: 'Shop' }, provider: null, dryRun: true, pendingChanges: 3 };
const INFO = { name: 'Wortlaut', version: '0.2.0', platform: 'darwin', arch: 'arm64', cpus: 8, totalMemory: 1 };

function setUp(url: string, state: unknown = STATE) {
    const events = new Subject<unknown>();
    const router = { url, events };

    TestBed.configureTestingModule({
        providers: [
            AppShellViewPresenter,
            { provide: Router, useValue: router },
            { provide: SHELL_NAVIGATION, useValue: NAVIGATION },
            { provide: DesktopApi, useValue: { onEvent: () => () => undefined, request: vi.fn((method: string) => Promise.resolve(method === 'app.getInfo' ? INFO : method === 'run.active' ? [] : state)) } }
        ]
    });

    return {
        presenter: TestBed.inject(AppShellViewPresenter),
        goTo: (next: string) => {
            router.url = next;
            events.next(new NavigationEnd(1, next, next));
        }
    };
}

function items(presenter: AppShellViewPresenter) {
    return presenter.navigation().flatMap((group) => group.items);
}

describe('AppShellViewPresenter', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('disables project items until a project is open', async () => {
        const { presenter } = setUp('/projects', { ...STATE, project: null });

        await presenter.load();

        expect(items(presenter).map((item) => [item.label, item.disabled])).toEqual([['Projects', false], ['Rule packs', false], ['Review', false], ['Test lab', true], ['Runs', true]]);
    });

    it('enables them with an open project', async () => {
        const { presenter } = setUp('/runs');

        await presenter.load();

        expect(items(presenter).every((item) => !item.disabled)).toBe(true);
    });

    it('lets the active item follow the route, with everything below it', async () => {
        const { presenter, goTo } = setUp('/projects');

        await presenter.load();
        expect(items(presenter).filter((item) => item.isActive).map((item) => item.label)).toEqual(['Projects']);

        goTo('/runs/20261102-abc');
        expect(items(presenter).filter((item) => item.isActive).map((item) => item.label)).toEqual(['Runs']);

        goTo('/test-lab/key-patterns');
        expect(items(presenter).filter((item) => item.isActive).map((item) => item.label)).toEqual(['Test lab']);

        goTo('/projects-of-another-kind');
        expect(items(presenter).some((item) => item.isActive)).toBe(false);
    });

    it('knows when Settings is active', () => {
        const { presenter, goTo } = setUp('/settings/project');

        expect(presenter.settingsActive()).toBe(true);

        goTo('/overview');
        expect(presenter.settingsActive()).toBe(false);
    });

    it('shows the real version once it is known', async () => {
        const { presenter } = setUp('/overview');

        expect(presenter.versionLabel()).toBe('');

        await presenter.load();

        expect(presenter.versionLabel()).toBe('Wortlaut 0.2.0');
    });

    it('counts what waits in Review on its entry', async () => {
        // arrange
        const { presenter } = setUp('/overview');

        // act
        await presenter.load();

        // assert
        const items = presenter.navigation().flatMap((group) => group.items);

        expect(items.find((item) => item.label === 'Review')?.count).toBe(3);
        expect(items.find((item) => item.label === 'Projects')?.count).toBe(0);
    });

    it('turns Dry run off once, although a switch also reports the state it was bound to', async () => {
        // arrange
        const { presenter } = setUp('/overview');
        const api = TestBed.inject(DesktopApi) as unknown as { request: ReturnType<typeof vi.fn> };

        await presenter.load();

        // act
        await presenter.session.setDryRun(true);

        // assert
        expect(api.request).not.toHaveBeenCalledWith('app.setDryRun', expect.anything());

        // act
        await presenter.session.setDryRun(false);

        // assert
        expect(api.request).toHaveBeenCalledWith('app.setDryRun', { dryRun: false });
    });

    it('shows no project in the title bar on a view about the workspace, and keeps it open', async () => {
        // arrange
        const onPacks = setUp('/rule-packs/add');

        await onPacks.presenter.load();

        // assert
        expect(onPacks.presenter.project()).toBeNull();
        expect(onPacks.presenter.session.project()?.name).toBe('Shop');
        expect(onPacks.presenter.navigation().find((group) => group.label === 'Verify')?.items[0].disabled).toBe(false);

        TestBed.resetTestingModule();

        // arrange
        const elsewhere = setUp('/runs');

        await elsewhere.presenter.load();

        // assert
        expect(elsewhere.presenter.project()?.name).toBe('Shop');
    });
});

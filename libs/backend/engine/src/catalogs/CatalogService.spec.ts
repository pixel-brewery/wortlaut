// #region Imports

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUIET_LOGGER } from '../io/QuietLogger';
import { WortlautEngine } from '../WortlautEngine';
import type { CatalogService } from './CatalogService';

// #endregion

const KEY_COUNT = 13102;

describe('CatalogService', () => {
    let root: string;
    let projectId: string;
    let catalogs: CatalogService;

    beforeAll(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-catalog-pages-')));

        const repository = join(root, 'project');
        const resources = join(repository, 'src/i18n');
        const keys = Array.from({ length: KEY_COUNT }, (_value, index) => `k${String(index).padStart(5, '0')}`);

        mkdirSync(resources, { recursive: true });
        writeFileSync(join(repository, 'wortlaut.config.json'), JSON.stringify({ actions: { detect: { root: 'src', resourceRoot: ['i18n'], preset: 'angular', type: 'json', resourceKey: { prefix: 'loc' } }, analyze: { baseLocale: 'en' } } }));
        writeFileSync(join(resources, 'lang.en.json'), JSON.stringify({ loc: { section: Object.fromEntries(keys.map((key, index) => [key, `English ${index % 2 === 0 ? 'even' : 'odd'} ${key}`])) } }));
        writeFileSync(join(resources, 'lang.de.json'), JSON.stringify({ loc: { section: Object.fromEntries(keys.map((key) => [key, `German ${key}`])) } }));

        const engine = new WortlautEngine({ surface: 'desktop', logger: QUIET_LOGGER, profileRoot: join(root, 'profile'), home: root, env: {} });
        const registered = engine.workspaces.register({
            inspection: engine.inspector.inspect(repository),
            workspace: { kind: 'new', name: 'Catalog', code: 'CA', color: 'teal' },
            preset: 'angular',
            baseLocale: 'en',
            targetLocales: ['de']
        });

        projectId = registered.projectId;
        catalogs = engine.catalogs;
    });

    afterAll(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it.each([
        { offset: 0, count: 200, first: 'loc.section.k00000', last: 'loc.section.k00199' },
        { offset: 5000, count: 200, first: 'loc.section.k05000', last: 'loc.section.k05199' },
        { offset: 13000, count: 102, first: 'loc.section.k13000', last: 'loc.section.k13101' }
    ])('returns a bounded catalog page at offset $offset', ({ offset, count, first, last }) => {
        const page = catalogs.keys({ projectId, namespace: null, search: '', filter: 'all', targetLocale: 'de', offset, limit: 200 });

        expect(page.rows).toHaveLength(count);
        expect(page.rows[0].key).toBe(first);
        expect(page.rows.at(-1)?.key).toBe(last);
        expect(page).toMatchObject({ matching: KEY_COUNT, total: KEY_COUNT });
    });

    it('applies the offset after filtering and preserves both counts', () => {
        const page = catalogs.keys({ projectId, namespace: null, search: 'odd', filter: 'all', targetLocale: 'de', offset: 5000, limit: 200 });

        expect(page.rows).toHaveLength(200);
        expect(page.rows[0].key).toBe('loc.section.k10001');
        expect(page).toMatchObject({ matching: KEY_COUNT / 2, total: KEY_COUNT });
    });

    it('returns an empty page after the end without losing the catalog counts', () => {
        const page = catalogs.keys({ projectId, namespace: null, search: '', filter: 'all', targetLocale: 'de', offset: 13200, limit: 200 });

        expect(page).toEqual({ rows: [], matching: KEY_COUNT, total: KEY_COUNT });
    });
});

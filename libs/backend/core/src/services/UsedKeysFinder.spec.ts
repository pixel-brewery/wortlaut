// #region Imports

import { describe, expect, it } from 'vitest';
import { UsedKeysFinder } from './UsedKeysFinder';

// #endregion

describe('UsedKeysFinder', () => {
    it('finds keys that templates, pipes and code use as string literals', () => {
        // arrange
        const sources = [
            '<mosaik-text [text]="t(\'loc.assemblies.fields.crewUserIds\')" />',
            '<span>{{ \'loc.orders.title\' | translate }}</span>',
            'const title = this.translate.translate("loc.orders.description");',
            'export const HINT = { labelKey: `loc.orders.hint` };'
        ];
        const keys = ['loc.assemblies.fields.crewUserIds', 'loc.orders.title', 'loc.orders.description', 'loc.orders.hint', 'loc.orders.unused'];

        // act
        const usedKeys = new UsedKeysFinder().find(sources, keys, { prefix: 'loc' });

        // assert
        expect([...usedKeys].sort()).toEqual(['loc.assemblies.fields.crewUserIds', 'loc.orders.description', 'loc.orders.hint', 'loc.orders.title']);
    });

    it('finds the keys that a template literal composes', () => {
        // arrange
        const sources = ['label: this.translate.translate(`loc.webhooks.eventTypes.${event.key}.label`)'];
        const keys = ['loc.webhooks.eventTypes.order.created.label', 'loc.webhooks.eventTypes.task.label', 'loc.webhooks.eventTypes.order.created.description'];

        // act
        const usedKeys = new UsedKeysFinder().find(sources, keys, { prefix: 'loc' });

        // assert
        expect([...usedKeys].sort()).toEqual(['loc.webhooks.eventTypes.order.created.label', 'loc.webhooks.eventTypes.task.label']);
    });

    it('finds the keys that a concatenated literal ending with a dot composes', () => {
        // arrange
        const sources = ['return t(\'loc.customers.contactTypes.\' + contact.type);'];
        const keys = ['loc.customers.contactTypes.phone', 'loc.customers.contactTypes.email', 'loc.customers.title'];

        // act
        const usedKeys = new UsedKeysFinder().find(sources, keys, { prefix: 'loc' });

        // assert
        expect([...usedKeys].sort()).toEqual(['loc.customers.contactTypes.email', 'loc.customers.contactTypes.phone']);
    });

    it('does not count keys below a literal that only names their common start', () => {
        // arrange
        const sources = ['const section = \'loc.customers\';'];
        const keys = ['loc.customers', 'loc.customers.title'];

        // act
        const usedKeys = new UsedKeysFinder().find(sources, keys, { prefix: 'loc' });

        // assert
        expect([...usedKeys]).toEqual(['loc.customers']);
    });

    it('derives composed keys only from literals that start with the key prefix', () => {
        // arrange
        const sources = ['const label = t(`${area}.title`);', 'const other = t(\'app.\' + area);'];
        const keys = ['loc.orders.title', 'loc.tasks.title'];

        // act
        const usedKeys = new UsedKeysFinder().find(sources, keys, { prefix: 'loc' });

        // assert
        expect([...usedKeys]).toEqual([]);
    });

    it('counts the keys of a declared pattern as used without any source mentioning them', () => {
        // arrange
        const keys = ['loc.api.error.ORDER_NOT_FOUND', 'loc.api.error.TASK_NOT_FOUND', 'loc.orders.title'];

        // act
        const usedKeys = new UsedKeysFinder().find([], keys, { prefix: 'loc', usedKeys: ['loc.api.error.*'] });

        // assert
        expect([...usedKeys].sort()).toEqual(['loc.api.error.ORDER_NOT_FOUND', 'loc.api.error.TASK_NOT_FOUND']);
    });

    describe('declared used keys', () => {
        it('counts a declared exact key as used, and no key that only starts with it', () => {
            // arrange
            const keys = ['loc.orders.title', 'loc.orders.title.hint', 'loc.orders.titles'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: ['loc.orders.title'] });

            // assert
            expect([...usedKeys]).toEqual(['loc.orders.title']);
        });

        it('keeps a trailing * matching the rest of the key across segments', () => {
            // arrange
            const keys = ['loc.api.error', 'loc.api.error.notFound', 'loc.api.error.validation.required', 'loc.api.errors.notFound', 'loc.api.warning.expired'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: ['loc.api.error.*', 'loc.api.warn*'] });

            // assert
            expect([...usedKeys].sort()).toEqual(['loc.api.error.notFound', 'loc.api.error.validation.required', 'loc.api.warning.expired']);
        });

        it('matches within one segment with a * inside a pattern', () => {
            // arrange
            const keys = ['loc.orders.title', 'loc.orders.list.title', 'loc.title', 'loc.orders.title.hint'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: ['loc.*.title'] });

            // assert
            expect([...usedKeys]).toEqual(['loc.orders.title']);
        });

        it.each([
            ['loc.**.title', ['loc.orders.list.title', 'loc.orders.title', 'loc.title']],
            ['**.title', ['loc.orders.list.title', 'loc.orders.title', 'loc.title', 'title']],
            ['loc.orders.**', ['loc.orders.list.title', 'loc.orders.subtitle', 'loc.orders.title']]
        ])('matches any number of whole segments with %s', (entry, expected) => {
            // arrange
            const keys = ['title', 'loc.title', 'loc.orders', 'loc.orders.title', 'loc.orders.list.title', 'loc.orders.subtitle', 'app.loc.titles'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: [entry] });

            // assert
            expect([...usedKeys].sort()).toEqual(expected);
        });

        it('matches one or more whole segments with *.**', () => {
            // arrange
            const keys = ['loc.search.search', 'loc.search.web.search', 'loc.search.web.site.search', 'loc.search.web.research'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: ['loc.search.*.**.search'] });

            // assert
            expect([...usedKeys].sort()).toEqual(['loc.search.web.search', 'loc.search.web.site.search']);
        });

        it('matches one character other than a dot with ?', () => {
            // arrange
            const keys = ['loc.step1.title', 'loc.step10.title', 'loc.step.title', 'loc.step..title'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: ['loc.step?.title'] });

            // assert
            expect([...usedKeys]).toEqual(['loc.step1.title']);
        });

        it('matches exactly one final segment with *? at the end', () => {
            // arrange
            const keys = ['loc.countries', 'loc.countries.de', 'loc.countries.de.name'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: ['loc.countries.*?'] });

            // assert
            expect([...usedKeys]).toEqual(['loc.countries.de']);
        });

        it('matches each alternative of braces and nothing else', () => {
            // arrange
            const keys = ['loc.orders.open.label', 'loc.orders.closed.label', 'loc.orders.canceled.label', 'loc.orders.open,closed.label', 'loc.orders.{open,closed}.label'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: ['loc.orders.{open,closed}.label'] });

            // assert
            expect([...usedKeys].sort()).toEqual(['loc.orders.closed.label', 'loc.orders.open.label']);
        });

        it('expands nested braces whose alternatives contain dots and wildcards', () => {
            // arrange
            const keys = ['loc.orders.open.label', 'loc.orders.closed.label', 'loc.orders.canceled.label', 'loc.tasks.done.label', 'loc.tasks.done.hint.label'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: ['loc.{orders.{open,closed},tasks.*}.label'] });

            // assert
            expect([...usedKeys].sort()).toEqual(['loc.orders.closed.label', 'loc.orders.open.label', 'loc.tasks.done.label']);
        });

        it('expands braces before it applies the meaning of a trailing *', () => {
            // arrange
            const keys = ['loc.reports.sales.tour', 'loc.reports.sales.tour.steps.first', 'loc.reports.sales.export.tour', 'loc.reports.sales.title'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: ['loc.reports.*.tour{,.*}'] });

            // assert
            expect([...usedKeys].sort()).toEqual(['loc.reports.sales.tour', 'loc.reports.sales.tour.steps.first']);
        });

        it('matches the whole key with a regular expression entry', () => {
            // arrange
            const keys = ['loc.step1.title', 'loc.step10.title', 'loc.stepX.title', 'loc.step1.title.hint', 'app.loc.step1.title'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: ['/loc\\.step\\d+\\.title/'] });

            // assert
            expect([...usedKeys].sort()).toEqual(['loc.step1.title', 'loc.step10.title']);
        });

        it('matches no key partially', () => {
            // arrange
            const keys = ['app.loc.orders.title', 'loc.orders.titles', 'loc.orders.title.hint'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: ['loc.orders.title', 'loc.*.title', 'loc.orders.t?tle', '/loc\\.orders\\.title/'] });

            // assert
            expect([...usedKeys]).toEqual([]);
        });

        it('matches case-sensitively', () => {
            // arrange
            const keys = ['loc.orders.title', 'loc.Orders.title', 'LOC.orders.title', 'loc.orders.Title'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: ['loc.orders.t*', '/loc\\.orders\\.title/'] });

            // assert
            expect([...usedKeys]).toEqual(['loc.orders.title']);
        });

        it('matches wildcard characters literally when they are escaped', () => {
            // arrange
            const keys = ['loc.faq.what?', 'loc.faq.whatX', 'loc.faq.{id}', 'loc.faq.id'];

            // act
            const usedKeys = new UsedKeysFinder().find([], keys, { usedKeys: ['loc.faq.what\\?', 'loc.faq.\\{id\\}'] });

            // assert
            expect([...usedKeys].sort()).toEqual(['loc.faq.what?', 'loc.faq.{id}']);
        });

        it.each([
            ['loc.orders.{open,closed', 'the \'{\' at position 12 has no closing \'}\''],
            ['loc.orders.open}', 'the \'}\' at position 16 has no opening \'{\''],
            ['loc.orders.{open}.label', 'the braces at position 12 hold a single alternative'],
            ['loc.orders**', '\'**\' must be a whole segment'],
            ['loc.***.label', '\'***\' is no wildcard'],
            ['loc.orders\\', 'the \'\\\' at the end escapes no character'],
            ['', 'an empty entry matches no key'],
            [`loc.${'{a,b}'.repeat(14)}`, 'its braces expand to more than 10000 patterns'],
            ['/loc.orders', 'a regular expression is written as /expression/flags'],
            ['/loc\\.orders(/', 'Invalid regular expression'],
            ['/loc\\.orders/g', 'the flags \'g\' are not supported']
        ])('rejects the invalid entry %j with an error that names it', (entry, reason) => {
            // arrange
            const keys = ['loc.orders.title'];

            // act
            const find = (): Set<string> => new UsedKeysFinder().find([], keys, { usedKeys: ['loc.orders.title', entry] });

            // assert
            expect(find).toThrow(`The usedKeys entry '${entry}' is invalid: ${reason}`);
        });
    });

    describe('locate', () => {
        it('names the file and line of literal and composed usages', () => {
            // arrange
            const sources = [
                { file: 'a.ts', content: 'const a = 1;\nt(\'loc.title\');\n' },
                { file: 'b.ts', content: 'translate(`loc.status.${state}.label`);\nx(\'loc.title\', \'loc.title\');' }
            ];

            // act
            const usages = new UsedKeysFinder().locate(sources, ['loc.title', 'loc.status.open.label', 'loc.unused'], { prefix: 'loc' });

            // assert
            expect(usages.get('loc.title')).toEqual([{ file: 'a.ts', line: 2 }, { file: 'b.ts', line: 2 }]);
            expect(usages.get('loc.status.open.label')).toEqual([{ file: 'b.ts', line: 1 }]);
            expect(usages.has('loc.unused')).toBe(false);
        });
    });
});

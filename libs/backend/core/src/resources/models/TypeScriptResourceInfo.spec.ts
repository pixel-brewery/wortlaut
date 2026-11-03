// #region Imports

import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { TypeScriptResourceInfo } from './TypeScriptResourceInfo';

// #endregion

const LONG_VALUE = 'Die Auftragsdaten sind unvollständig oder widersprüchlich. Prüfe den Kunden, die Adressen, Positionen und Konditionen.';

function createResource(content: Record<string, string>): TypeScriptResourceInfo {
    return new TypeScriptResourceInfo({
        name: 'lang.de.ts',
        path: '/i18n/lang.de.ts',
        locale: 'de',
        content: () => content
    });
}

/**
 * Formats a generated resource the way Prettier does with single quotes and a print width of 120:
 * single-quoted values, long properties wrapped after the equals sign.
 */
function formatLikePrettier(source: string): string {
    return source.replace(/^( {4}static readonly '[^']+': string = )"((?:[^"\\]|\\.)*)";$/gm, (_, declaration: string, value: string) => {
        const quoted = `'${JSON.parse(`"${value}"`).replace(/'/g, "\\'")}'`;

        return `${declaration}${quoted};`.length > 120
            ? `${declaration.trimEnd()}\n        ${quoted};`
            : `${declaration}${quoted};`;
    });
}

describe('TypeScriptResourceInfo', () => {
    it('keeps a key with a quote a string in the generated code', () => {
        // arrange
        const key = "a'; static { globalThis.owned = 1; } static b = 'c\\";
        const generated = createResource({ [key]: 'value', plain: 'text' }).toString();

        // act
        const generatedClass = new Project({ useInMemoryFileSystem: true }).createSourceFile('resource.ts', generated).getClasses()[0];
        const names = generatedClass.getStaticProperties().map((property) => property.getName());

        // assert
        expect(generatedClass.getStaticBlocks()).toEqual([]);
        expect(names).toHaveLength(2);
        expect(names).toContain("'plain'");
        expect(generated).not.toContain('\n    static {');
    });

    it('makes an identifier of a file name that holds anything else', () => {
        // arrange
        const generated = new TypeScriptResourceInfo({ name: 'a{}class x.de.ts', path: '/i18n/lang.de.ts', locale: 'de-AT', content: () => ({}) }).toString();

        // act
        const classes = new Project({ useInMemoryFileSystem: true }).createSourceFile('resource.ts', generated).getClasses();

        // assert
        expect(classes.map((declaration) => declaration.getName())).toEqual(['a__class_x_de_AT']);
    });

    it('is up to date with a generated file that a formatter reformatted', () => {
        // arrange
        const resource = createResource({ 'loc.orders.title': 'Aufträge', 'loc.api.error.INVALID_ORDER_COMPOSITION': LONG_VALUE });
        const formatted = formatLikePrettier(resource.toString());

        // act
        const isUpToDate = resource.isUpToDate(formatted);

        // assert
        expect(formatted).not.toBe(resource.toString());
        expect(isUpToDate).toBe(true);
    });

    it('is not up to date when a value changed', () => {
        // arrange
        const previous = formatLikePrettier(createResource({ 'loc.orders.title': 'Aufträge', 'loc.orders.hint': 'Hinweis' }).toString());
        const resource = createResource({ 'loc.orders.title': 'Aufträge', 'loc.orders.hint': 'Neuer Hinweis' });

        // act
        const isUpToDate = resource.isUpToDate(previous);

        // assert
        expect(isUpToDate).toBe(false);
    });

    it('is not up to date when the keys are in another order than in the source resource', () => {
        // arrange
        const previous = createResource({ 'loc.orders.hint': 'Hinweis', 'loc.orders.title': 'Aufträge' }).toString();
        const resource = createResource({ 'loc.orders.title': 'Aufträge', 'loc.orders.hint': 'Hinweis' });

        // act
        const isUpToDate = resource.isUpToDate(previous);

        // assert
        expect(isUpToDate).toBe(false);
    });

    it('is not up to date with a file whose generated class has another shape', () => {
        // arrange
        const resource = createResource({ 'loc.orders.title': 'Aufträge' });
        const withoutMethods = resource.toString().replace(/\n {4}\/\*\*\n {5}\* Returns all properties[\s\S]*?\n {4}}\n/g, '\n');

        // act
        const isUpToDate = resource.isUpToDate(withoutMethods);

        // assert
        expect(withoutMethods).not.toContain('static entries()');
        expect(isUpToDate).toBe(false);
    });
});

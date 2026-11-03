// #region Imports

import type { IResourceInfo } from '../models/interfaces/IResourceInfo';

// #endregion

/**
 * Identifies the catalog of a resource: its type, its directory and its file name without the locale segment. The files
 * `i18n/lang.de.json`, `i18n/lang.nl.json` and a default-locale `i18n/lang.json` are the locales of one catalog.
 * Resources without a path, such as resources created in memory, share one catalog per type.
 *
 * @internal
 * @param resource The resource.
 * @returns The catalog identifier.
 */
export function getResourceCatalog(resource: Pick<IResourceInfo, 'path' | 'locale' | 'type'>): string {
    const path = resource.path.replace(/\\/g, '/');
    const directoryLength = path.lastIndexOf('/') + 1;
    const fileName = path.slice(directoryLength);
    const localeSegment = `.${resource.locale}.`;
    const localeIndex = resource.locale ? fileName.lastIndexOf(localeSegment) : -1;
    const catalogFileName = localeIndex >= 0
        ? `${fileName.slice(0, localeIndex)}${fileName.slice(localeIndex + localeSegment.length - 1)}`
        : fileName;

    return `${resource.type}:${path.slice(0, directoryLength)}${catalogFileName}`;
}

/**
 * Gets the other locales of the catalog of a resource.
 *
 * @internal
 * @param resource The resource.
 * @param resources The resources to search.
 * @returns The resources of the same catalog in another locale, in the order of `resources`.
 */
export function getOtherCatalogLocales(resource: IResourceInfo, resources: ReadonlyArray<IResourceInfo>): Array<IResourceInfo> {
    const catalog = getResourceCatalog(resource);

    return resources.filter((candidate) => candidate.locale !== resource.locale && getResourceCatalog(candidate) === catalog);
}

/**
 * Finds the resource of the catalog of a resource in a given locale.
 *
 * @internal
 * @param resource The resource.
 * @param resources The resources to search.
 * @param locale The locale to find.
 * @returns The first resource of the same catalog in the locale, or `null` when there is none.
 */
export function findCatalogLocale(resource: IResourceInfo, resources: ReadonlyArray<IResourceInfo>, locale: string): IResourceInfo | null {
    const catalog = getResourceCatalog(resource);

    return resources.find((candidate) => candidate.locale === locale && getResourceCatalog(candidate) === catalog) ?? null;
}

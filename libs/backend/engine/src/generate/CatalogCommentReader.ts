// #region Imports

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CatalogComments, COMMENTS_FILE_NAME, PoText, ResourceMode, ResourceTransformer, type IResourceInfo } from '@pixel-brewery/wortlaut-core';
import { QUIET_LOGGER } from '../io/QuietLogger.js';

// #endregion

/**
 * Finds the comments of a catalog for the prompt, wherever its format keeps them: RESX and PO in the file itself, and JSON in
 * the comments file of the project. They reach the model as data, next to the value they explain.
 *
 * @internal
 * @param folder The folder of the project.
 * @param catalog The catalog of the base locale.
 * @returns What reads the comment of a key.
 */
export function createCommentReader(folder: string, catalog: IResourceInfo): (key: string) => string {
    if (catalog.type === ResourceMode.Json) {
        const file = resolve(folder, COMMENTS_FILE_NAME);

        if (!existsSync(file)) {
            return () => '';
        }

        const comments = CatalogComments.ofCatalog(readFileSync(file, 'utf8'), CatalogComments.catalogIdOf(folder, catalog));

        return (key) => comments[key] ?? '';
    }

    const models = new ResourceTransformer(QUIET_LOGGER).transform(catalog);
    const comments = new Map(models.map((model) => [model.key, PoText.commentText(model.comment ?? '')]));

    return (key) => comments.get(key) ?? '';
}

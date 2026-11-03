/**
 * `ResourceMode` Enum which describes possible options.
 *
 * @public
 */
export const ResourceMode = {

    /**
     * `json` - JSON mode.
     */
    Json: 'json',

    /**
     * `resx` - RESX mode.
     */
    Resx: 'resx',

    /**
     * `po` - PO mode.
     */
    Po: 'po'

} as const;

/**
 * @public
 */
export type ResourceMode = (typeof ResourceMode)[keyof typeof ResourceMode];

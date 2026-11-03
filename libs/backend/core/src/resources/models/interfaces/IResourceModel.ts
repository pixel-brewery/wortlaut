/**
 * Interface for the resource model.
 *
 * @public
 */
export interface IResourceModel {

    // #region Properties

    /**
     * The key of the transform model
     */
    readonly key: string;

    /**
     * The value of the transform model
     */
    readonly value: string;

    /**
     * The comment of the transform model
     */
    readonly comment: string;

    // #endregion

}

export const RESOURCE_MODEL_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'ResourceModel',
    type: 'object',
    properties: {
        key: {
            type: 'string',
            description: 'The key of the transform model'
        },
        value: {
            type: 'string',
            description: 'The value of the transform model'
        },
        comment: {
            type: 'string',
            description: 'The comment of the transform model'
        }
    },
    required: ['key', 'value', 'comment'],
    additionalProperties: false
} as const;

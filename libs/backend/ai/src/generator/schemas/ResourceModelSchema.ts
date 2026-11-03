/**
 * JSON Schema (draft-07) describing a single resource model element.
 *
 * @remarks
 * Used with the Vercel AI SDK `jsonSchema()` helper so that
 * `generateObject({ output: 'array', schema: jsonSchema(RESOURCE_MODEL_SCHEMA) })`
 * produces an `Array<IResourceModel>`.
 *
 * @public
 */
export const RESOURCE_MODEL_SCHEMA = {
    type: 'object' as const,
    properties: {
        key: {
            type: 'string' as const,
            description: 'The key of the resource model. Must not be translated.'
        },
        value: {
            type: 'string' as const,
            description: 'The translated value of the resource model.'
        },
        comment: {
            type: 'string' as const,
            description: 'The comment of the resource model.'
        }
    },
    required: ['key', 'value', 'comment'],
    additionalProperties: false as const
};

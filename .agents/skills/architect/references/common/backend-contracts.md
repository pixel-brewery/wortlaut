# HTTP request, response and generated-client contracts

Read for endpoint models, transport wiring, validation, serialization, OpenAPI, uploads and clients. Combine the local `backend-contracts.md` with this guide: its verified projection and bootstrap rules are part of the operation contract.

For every transport, keep one owned runtime contract, validate untrusted input, preserve the distinction between domain values and wire projection, and verify serialization together with actual consumers. Preserve versioning, errors, status/media types and backward compatibility at the real boundary. IPC, stdio and framework-neutral contracts use their local validators and transport owners.

## Conditional NestJS HTTP guidance

The following NestJS, Swagger, Zod and response-envelope details apply only when the consuming project uses that stack. They are not requirements to add those dependencies to a framework-neutral library or desktop/IPC application. A derived project's explicit transport adaptations retain the general contract and validation foundations above.

## Availability and migration

Inspect the operation, installed Nest/Swagger/Zod/Archipel APIs, actual bootstrap, generated OpenAPI, configured generator/templates and real consumers. Standard Schema is supported only when runtime validation, response serialization, JSON Schema/OpenAPI projection and the real client path all work for the boundary.

Use Zod through NestJS Standard Schema for new or materially changed supported contracts. Evaluate request and response independently; a schema-native request plus legacy response is valid. For a genuinely unsupported stage, keep the established class-validator/class-transformer/`ApiProperty` Request/Response fallback and report the precise limitation. Lack of familiarity or missing bootstrap wiring alone is not unsupported framework capability. Complete canonical wiring within the authorized migration; do not partially emulate dependencies.

Retain legacy `ValidationPipe` while class contracts remain. Schema adoption requires the actual `StandardSchemaValidationPipe` and `StandardSchemaSerializerInterceptor`; preserve configured validation status, error mapping and options. Verify coexistence instead of switching the backend from one migrated operation.

## One owned contract

- Place new contracts in the owning feature's `models/requests/` or `models/responses/`, including class fallbacks. Preserve deliberate existing locations until a scoped migration moves the contract and callers together.
- Schema constants end in `RequestSchema`/`ResponseSchema`; files and inferred types end in `Request`/`Response`, never `Dto`/`DTO`. Queries and filters are requests.
- Export one runtime schema and its inferred type as a cohesive module. No parallel handwritten class/interface/JSON Schema with the same fields.
- Use `z.strictObject` by default for inputs; express bounds, defaults, arrays, coercion and cross-field refinements once. Handler-facing types use `z.output<typeof Schema>`; distinguish response construction `z.input` from serialized output when transformations differ.
- Attach input with `@Body({ schema })`, `@Query({ schema })` or `@Param({ schema })`. The global pipe owns parsing; do not repeat `parse`/`safeParse` in controllers or services.
- Keep stable OpenAPI component identities through schema metadata such as `.meta({ id: 'WidgetResponse' })`. Backend schemas remain backend-owned; frontend clients/models come through OpenAPI generation.
- Mapping profiles and typed mapping-key constants own transport projection. Services return domain values; controllers invoke the mapper and response factory.

## Runtime envelope versus public projection

For supported JSON success responses, create one module-level `ResponseReturn2.schema(DataSchema, optionalStableEnvelopeId)` and attach the full wire schema to `@SerializeOptions`. Pass the exact same data-schema constant to `.ok`, `.created` or `.accepted`; schema identity avoids running a non-idempotent transform twice.

| Verified consumer                                                                                                  | OpenAPI/client projection                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Generator returns the documented HTTP body directly                                                                | Publish the full wire schema, including an envelope when present                                              |
| Established transport extracts envelope `data` as payload `T`, directly or inside its typed success/failure result | Preserve the proven payload component/projection, extraction and public result contract; verify per operation |
| Unknown or incompatible path                                                                                       | Inspect and prove compatibility before migrating; retain the legacy response boundary                         |

The local project guide chooses the verified path. Do not infer envelope-marker support from a package declaration or transfer another project's Swagger projection blindly. Keep actual HTTP status, response helper, serialization, OpenAPI and consumer result consistent.

A `204` is bodyless: `@HttpCode(HttpStatus.NO_CONTENT)`, `Promise<void>`, no serializer/body schema. SSE, streaming and binary downloads retain their media type and lifecycle; do not force them into JSON envelopes.

## Multipart and verification

File interceptors need multipart OpenAPI `consumes`, an object body, the exact file field with `type: 'string'`/`format: 'binary'`, and matching requiredness. Enforce file size/count/content limits before persistence. Reuse the canonical filename decoder/normalizer exactly once and safe Unicode content-disposition construction.

For each migrated operation capture route, operation/component IDs, accepted inputs, status/media types and real consumer behavior. Generate and compare the affected OpenAPI operation/components, regenerate all affected clients through their actual owner, and verify a real wire-boundary consumer. Cover meaningful valid/invalid/unknown/cross-field input, transformations, serialization, status, mixed validation and special transport paths. Never claim runtime migration from a skill-only edit.

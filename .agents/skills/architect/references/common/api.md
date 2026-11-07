# Resource-oriented API URLs

Use [backend contracts](backend-contracts.md) for models, runtime schemas, envelopes and client compatibility. These rules govern new or deliberately migrated routes; preserve existing published routes/operation IDs outside that scope.

- Use meaningful resource nouns and plural collection names, not CRUD verbs: `POST /users`, `GET /users/{userId}`.
- Use lowercase kebab-case path segments, no trailing slash or format extension. Negotiate representation with media-type headers.
- Nest only for a real parent-child relationship; avoid deep arbitrary hierarchy and exposed database/implementation details.
- Path parameters identify resources; query parameters filter, sort and paginate. Use cursor pagination where the dataset demands it.
- Use the API's existing versioning convention and preserve older contracts until their deliberate deprecation/migration.
- Represent search, reports and workflow/action-like capabilities as meaningful resources/subresources when possible, without inventing persisted entities solely for URL grammar.
- Keep HTTP method/status/media type, actual body and OpenAPI aligned: `200` success, `201` creation, `202` accepted work, `204` bodyless success; use established validation/auth/not-found/conflict errors.
- Preserve consistent requiredness, optionality, arrays, nullability, formats, resource scope and safe machine-readable error codes.
- Hypermedia links are optional when an actual contract uses them; do not add them as generic framework ceremony.

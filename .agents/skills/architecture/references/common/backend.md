# Backend layering and source conventions

Read for application services, transport controllers, queries, entities, persistence and composition. Combine [backend contracts](backend-contracts.md), [platform](platform.md), [backend safety](backend-safety.md) and [testing](testing.md) when those boundaries change. NestJS/Prisma and `repository.execute(query)` details below apply to projects using those established owners; other stacks retain the same ownership and failure principles through their local contracts.

- Keep bootstrap/composition thin and behavior in the repository's established feature owners. Local project guidance decides whether those owners are application modules or libraries; do not relocate them from generic advice.
- Controllers declare transport and call orchestration/mapping only. No private helpers, business decisions, persistence or file algorithms. Split workflow-oriented routes into focused controllers and declare static paths before parameterized paths.
- Services orchestrate domain policy, repositories and transaction boundaries. Return domain/entity values; never construct response literals, `satisfies SomeResponse`, `toResponse()` or transport mapping helpers inside services.
- Use the established `repository.execute(query)` path and typed query factories; keep direct Prisma access in the data-access owner. Avoid N+1, large OFFSET scans and unnecessary payloads; use indexes, batching and appropriate pagination. Random large-dataset selection needs a bounded deterministic/preselected strategy.
- Use pure typed entities at service/repository seams. Keep them independent of transport schemas, provider SDKs and framework services; align persisted fields with the real Prisma projection. Give enriched projections an explicit type rather than unsafe casts or pretending computed fields are stored entities.
- Use feature modules, constructor-injected Nest providers and dynamic `register`/`registerAsync` configuration where appropriate. Expose only genuinely consumed public seams. Keep vendor implementations behind adapters.
- Preserve strict TypeScript, ESM/module-resolution, interface naming and local region/member order. Imports are contiguous. Prefer inferred obvious types, explicit public contracts, enumless unions and real methods; never use `any` or unchecked ORM/API casts.
- One public export per file is the default. A transport runtime schema plus its directly inferred type is a cohesive exception. Internal types stay with their actual owner.
- Follow local TSDoc rules and explain non-obvious intent. English code/comments do not override the language of product documentation.
- Never expose secrets or hardcode credentials. Use validated configuration, the existing authentication/authorization guards and configured HTTP security (Helmet, CORS, limits and input validation). Password storage uses the established salted Argon2/authentication owner where applicable, not a second feature-local implementation.

## Persistence and failure behavior

Use migrations, constraints, relations, indexes and transaction boundaries for actual invariants. Never edit an applied migration; regenerate Prisma through the owning Nx target after schema changes. Shared-environment migrations/seeds require the repository's environment authority.

Prefer typed domain errors and centralized exception mapping. Preserve safe machine-readable public error codes and internal causes without exposing secrets or provider internals. Only an explicitly optional capability may degrade to a documented fallback.

Caches have explicit scope, key, TTL, size and invalidation. Personalized state must not become stale through an undocumented cache. Workers and externally retried writes need durable idempotency, bounded retry and observable exhaustion; use the established platform owner.

Use configured correlation/logging, relevant metrics and health/readiness. Verify service decisions, denial/no-side-effect, persistence, errors and integration consequences in proportion to risk; a test per trivial public method is not required.

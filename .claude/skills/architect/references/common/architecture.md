# Architecture, ownership and migration

Read for solution design, cross-cutting concerns, refactoring, competing implementations, shared capabilities and migrations. Apply the [workflow](workflow.md) and the local project boundaries.

For repository layout, application/package placement or an owner relocation, also read the [repository structure recommendation](repository-structure.md). Select its applicable profile while preserving deliberate local owners until a scoped migration changes them.

## Calibrate the design

- Local behavior has one owner and no evidenced substitution, compatibility or operational concern: keep it local.
- A shared runtime capability has several consumers or centralized runtime policy: give it one public owner within that runtime.
- A platform capability has independent consumers/providers, long-lived contracts/state or operational significance: define its complete contract, policies, lifecycle, compatibility and enforcement.
- Add interfaces, registries, providers and layers only for actual variation, ownership, lifecycle, compatibility or enforcement needs. Compose behavior and isolate what varies; do not build a universal framework for a single use case.

## Define every applicable dimension

| Dimension           | Required decision                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Intent and scope    | Actors, outcomes, guarantees, non-goals and canonical owner                                      |
| Boundaries          | Stable domain concepts, volatile infrastructure, public seams and dependency direction           |
| Contracts           | Input/output meaning, runtime validation, configuration, persisted/provider data and safe errors |
| Context             | Resource, actor, tenant where applicable, session/request scope and authoritative authorization  |
| State and lifecycle | Registration, startup, execution, change, context switch, disposal and shutdown                  |
| Consistency         | Transactions, revisions, ordering, races, idempotency, partial failure and reconciliation        |
| Evolution           | Backward/forward/runtime compatibility, versions, deterministic migrations and rollback          |
| Integration         | Post-commit events, webhooks/mail, provider effects, observability and recovery                  |
| Resources           | Payload, deadline, concurrency, retry, buffer/cache/queue limits and backpressure                |
| Enforcement         | Exports, Nx boundaries, generators, lint or meaningful contract/architecture tests               |

Validate configuration and registrations before first use when failure is deterministic. Reject duplicate IDs, missing dependencies and incompatible policies. Do not add a registry where a direct owner suffices.

For long-lived state, define explicit behavior for unknown/newer versions; never destroy it as a silent fallback. Migrations must validate before/after, have unambiguous source/target paths and preserve recoverability. Distinguish actual atomicity from a sequence that can partially fail.

## Produce and verify the requested result

A substantive design should explain the verified current state, target responsibilities/contracts, security and failure behavior, migration/coexistence/rollback, implementation order and objective acceptance criteria. Use a diagram when it removes ambiguity. Scale detail to the task and honor the requested format.

Search the affected scope for active duplicates and bypasses, migrate callers through the owner and enforce the boundary where needed. Test credible public behavior, denial, lifecycle, provider, migration and compatibility failures. Apply the local documentation and consequence checks; ordinary architecture work does not imply a full Definition of Done or a release.

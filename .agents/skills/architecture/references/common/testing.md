# Meaningful, deterministic testing

Read with the production domain guide and local `testing.md`. Local project guidance decides browser conventions, the supported runner and test helper restrictions.

## Spec ownership before editing

Before creating, renaming or extending a non-browser spec, locate and read its real production owner and existing spec. The spec must sit beside that source file and use its exact basename and casing with only `.spec` inserted: `Class.ts` → `Class.spec.ts`. Removing `.spec` must identify the existing production file. This applies equally to unit, integration, PostgreSQL, contract, API and regression tests; select execution through runner configuration, not extra scenario or technology suffixes.

Add scenarios to the owner's suite; for behavior spanning files, use the real coordinating owner or distribute cases across their actual owners. Keep helpers and fixtures as ordinary adjacent modules. Do not create separate test directories, orphan scenario specs, empty production files, barrels or harness classes to manufacture ownership. Existing violations are cleanup work, never precedent: consolidate affected cases and remove the orphan. Verify imports, source existence, runner discovery and build exclusions after moves. Browser location and naming follow the explicit local browser contract.

## Value and structure

Name the observable behavior, invariant, decision, validation, permission boundary, state transition, side effect, public contract or regression before adding a test. A changed line/control/public method/coverage gap is insufficient. Choose the lowest reliable layer; duplicate across layers only for distinct failure modes.

Do not pin incidental labels/static copy, variants, appearance, CSS classes, generated styles, icons, spacing or layout. Exact text is justified for material results, validation, status, generated content or required notices. Component event, keyboard, accessibility and conversion contracts are behavior; local selector rules still apply.

Use English behavioral test names, clear Arrange/Act/Assert with one meaningful Act and focused assertions. Follow local production-owner filename and helper rules; never invent an empty source owner to justify a spec. Keep fixtures typed, secrets fake and state isolated.

For the TypeScript stack described here, Vitest is the standard below the browser boundary and Playwright owns browser/UI tests. Other language stacks follow their established local runner. Inspect the actual resolved project runner/configuration before using its APIs or claiming a target exists. Use configured coverage thresholds as evidence, not a reason to mirror implementation or test trivial delegation. No new Jest suites in the Vitest-based stack.

## Credible failures

Cover relevant boundaries, invalid runtime inputs, unknown fields, sequence/re-entrancy, races/overlap, cancellation, limits, disposal, dependency failure, denied access and no-side-effect outcomes. Do not manufacture impossible states or weaken an assertion around a real bug. Follow the repository's defect reporting policy.

Use `vi` spies/mocks/timers in configured Vitest suites, deterministic clock/UUID/randomness and seeded selection where needed. Restore mocks/timers/global/zone state between tests. Real relational integration uses the existing database/server and fixture strategy permitted by the local environment contract. Isolate fixture records with unique markers and targeted cleanup or complete rollback; do not automatically provision databases, schemas or containers, reset data or replay migrations. Preserve genuine independent transactions for concurrency checks. Domain unit tests do not require a database. Avoid overmocking the boundary an integration test claims to verify.

## Angular and API

Angular tests use the owner's actual form model, public inputs/outputs/rendered behavior and supported TestBed providers such as `provideHttpClient`/`provideHttpClientTesting`. Put `NgOptimizedImage` in imports where needed. DOM interaction follows local selectors; CSS and incidental design-system assertions do not prove behavior.

Nest unit tests use typed provider overrides; API tests use a real bootstrapped test HTTP server/Supertest. Mirror every active production validation path, options/status, serializer and exception filters. Test legacy/schema coexistence when wiring changes. Assert actual safe domain error mapping, meaningful headers/status/body and generated contract compatibility, not an invented universal error envelope.

External-client tests cover meaningful response/schema failure, deadline/retry/idempotency and circuit-breaker behavior when owned by that client. Pagination/cache/aggregate cases protect real bounds, invalidation and numeric correctness. Execute focused configured Nx targets, follow actual CI ordering, and state the limits of evidence.

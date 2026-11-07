# Platform integration and runtime readiness

Read for backend providers, shared capabilities, ports/adapters, configuration, external I/O and long-lived resources. These rules do not turn browser components or every local utility into Nest services.

## Ownership and configuration

Inspect installed public platform capabilities and active integrations before adding auth, configuration, database, logging, storage, OpenAPI, intelligence, health, caching or queues. Prefer public extension points and a small product-owned adapter. Keep product data/policy out of shared frameworks; a genuine framework defect belongs to its source, with review/release authority preserved. Do not copy, patch, fork or compensate for owned framework responsibilities in an application.

Use an explicit abstract base for a replaceable runtime seam and inject concrete adapters through the project's composition boundary. In NestJS, the abstract class is also the DI token and injectable adapters extend it; framework-neutral projects use constructor composition and explicit factories. Pure type-only contracts may remain interfaces. Hide vendor SDK types and expose stable typed intent/results/errors.

Use the project's typed configuration owner. In the Archipel stack, use `ConfigService`, typed `createConfigKey<T>()` entries and one exported provider config-entries collection; framework-neutral hosts supply typed options. Validate critical configuration at startup; document safe noncritical defaults. Environment access stays at the configured bootstrap boundary. Follow the local secret source/synchronization policy.

## State, idempotency and limits

Singleton providers keep injected dependencies, validated config and bounded shared caches, never mutable current-user/tenant/session/request context. Pass context per call or use the established scoped mechanism. Initialize clients eagerly in lifecycle or once with a shared Promise; avoid asynchronous initialization races and listener registration per request.

Define transaction/revision/compare-and-swap behavior for competing writes. In-memory locks do not coordinate processes. Caller-owned idempotency keys remain stable across retries; use provider support and durable deduplication where required, and document non-idempotent limitations.

Bound deadlines, retries, concurrency, payloads, caches, registries, buffers, pools and queue/retention depth. Define eviction, expiry, flush/backpressure and disposal. Use named configurable budgets appropriate to the operation; short health checks and AI streams have different limits. Retry only transient safely repeatable failures with bounded backoff/jitter; prevent retry amplification and use a justified circuit breaker.

## Lifecycle, health and diagnostics

Keep heavy I/O out of constructors. Initialize through the real lifecycle, fail early for deterministic config errors, close connections/listeners, cancel timers, drain transports and flush required buffers on shutdown. Bound shutdown and do not assume cross-provider hook order.

Reuse the configured health/readiness owner for I/O dependencies; checks are lightweight, independently bounded and safe. Historical missing-package tables are not evidence about current capabilities.

Use the shared structured logger/telemetry with correlation ID, module/provider, operation, result and duration. Propagate/log material errors, retain causes internally and wrap SDK errors in stable typed failures. Redact credentials/private payloads from logs, exceptions, health and metric labels. Optional telemetry may degrade with diagnostics; critical failures cannot become silent success.

## Compatibility and validation

Public ports/config/payloads are consumer contracts. Adding a required port method can break every adapter; define coexistence, deprecation and migration. Explain required rebuild/version follow-up and leave publication to the owner.

Verify meaningful provider contracts, startup failure, isolation, initialization/concurrency, retries/idempotency, bounds and cleanup. Do not introduce infrastructure or impossible failure cases solely to satisfy a checklist.

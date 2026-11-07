# Authorization, read isolation and integration integrity

Read for protected resources, files, downloads, AI, untrusted destinations, events, mail or cleanup. Apply the local project owners and gates; do not invent tenant, billing or storage concepts absent from the capability.

## Authorization and AI

Resolve actor and applicable resource/tenant ownership from authenticated server context. A supplied identifier or hidden frontend action is not authorization. Enforce domain permission and applicable availability, entitlement, quota/credit and rate limits before provider calls, usage charges, persistence/file writes, events or queueing. Fail closed; test meaningful denials with no-side-effect assertions. Non-AI workflows retain independent availability.

An action advertised as AI executes the configured AI path. Deterministic checks may supplement it or provide an explicit provider-failure fallback, never silently impersonate it. Dialog-scoped assistance receives the complete current unsaved snapshot, rejects oversized input and never requires persistence or replaces editable input with the stored entity. Persisted data is only explicitly identified authorized reference data. Suggestions remain transient; applying changes local state and saving is separate. Required usage/payment/audit records are independent of analyzed-object mutation.

## Reads, files and drafts

GET and read-oriented `find`, `get`, `list`, `search`, `load`, `preview`, `download` and `content` observe business state and files. They never repair, clear, archive, delete, publish or enqueue resource changes. Missing blobs/dependent records are mapped integrity/availability failures: preserve references and emit safe diagnostics. Access telemetry/audit may record the access but cannot reconcile the resource.

Repair is an explicit authenticated, scoped, auditable, idempotent command/operator job with dry-run and concurrency protection. Shared/remote persisted references require compatible durable storage; fail before accepting work when storage and database environments are incompatible.

Restorable deletion/archive keeps required files. Irreversible erasure or expired retention uses an authoritative state transition and retry-safe, auditable physical cleanup. Do not delete a blob first and then hope its reference transaction commits. Download negative cases prove no DB write, deletion, event, webhook, email or queue side effect.

Use persisted draft creation when the workflow needs a real parent ID for sub-resources before saving; define ownership, finalization, discard and orphan retention. Do not create drafts merely for scalar editing or AI assistance. Creation mechanism and publication status are independent.

## Outbound network boundary

Treat destinations from users, models, tools and stored settings/references as untrusted. Use the project's canonical network owner with public HTTPS validation, no embedded credentials, DNS/connect consistency, redirect policy, named deadlines and bounded responses. Validate at connection time; a save-time check is insufficient after DNS changes. Never follow an unvalidated redirect. Keep fixed deployment-controlled providers in their explicit trust boundary and do not leak IPs, headers, credentials or private error bodies.

## Events, webhooks and mail

Publish consequences after authoritative commit. When loss would break a contract, persist the event/outbox/delivery atomically and retry independently. Give events and deliveries scoped stable deduplication keys; avoid a generic listener duplicating an already transactionally persisted event.

Advertised event catalogs and implemented mail templates require real senders/emission paths. Update payload/version, permissions, generated contracts, localization, template parameters/seed data, links/expiry, attachments, retry/exhaustion and documentation together. Webhooks contain no reusable credentials. Business-critical delivery uses durable recovery; immediate dispatch is a latency optimization.

Check and report integration consequences according to local completion rules. Test credible trigger, denial, duplicates, retry, exhaustion, URL restrictions and cleanup at the actual owning boundary.

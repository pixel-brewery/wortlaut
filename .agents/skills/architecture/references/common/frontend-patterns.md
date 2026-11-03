# Forms, presenters and stable composition

Read for forms, commands, async options, drawers, routing, localization and server-state synchronization. Preserve the actual framework/owner; apply a View/Presenter stack only where the project uses it.

## Forms and actions

Use the framework's typed form model, schema validators and existing form-state integration; Angular Signal Forms projects use typed Signal Form models and field signals. Observe the owned field state for cascading resets/invariants without feedback loops. Invalid submit produces actionable inline feedback and focus/scroll through a DOM owner; do not call the mutation. Define duplicate-request protection separately from validity. The local project decides footer visibility/disabled behavior.

In a presenter architecture, Views compose templates, presenters own application state/commands, directives own DOM coordination and pure pipes own display transformations. Expose read-only signals and commands with deliberate enabled-state signals; keep handlers private. Do not disguise presentation formatting methods as getters or inject DOM querying into presenters.

Reusable behaviors expose the deliberate Command/Signal and extension-point contract. Choose simple override or module-private WeakMap state/factory ownership as appropriate; initialize in the real injection context and dispose through the lifecycle. Never expose another behavior's WeakMap.

## Stable, accessible UI

Keep mounted select/combo controls stable and render current options directly. Do not recreate a control or bind two controls to one form field to force collection refresh. Verify append/replacement/initially-empty options and framework model propagation when that boundary changes.

Reserve loading/validation/counter space, preserve surrounding dimensions and scroll, and avoid state-driven movement of unrelated controls. Capability/permission gates can remove actions; temporary state must follow the local stable-layout and executable-feedback rules.

Drawers have one constrained scroll owner, not independently scrolling shell and pane. Reuse the installed design system's semantic controls (Mosaik where used) for focus, keyboard, accessibility and interaction. Menu actions are separate menu items with no nested independent button/press-button; destructive press-and-hold behavior outside menus uses the owned control when required by the local policy. Simple empty states stay inline unless a wrapper owns actual behavior.

Use typed DataTable display/sort projections with deliberate null ordering; apply actual project selection/default settings. Use theme tokens and the local layout owner; do not copy another project's CSS policy or table flags.

Bookmarkable views and shareable state use the established router/overlay owner. Generated API providers belong to their owning feature where feature composition exists and receive the configured API root from the application boundary.

## Localization, time and synchronization

User-facing errors, hints, empty states, accessibility and fallback copy belong to locale catalogs. Store typed errors/translation keys in state and translate at rendering; keep deliberately displayable server detail within its contract. Scan touched UI and regenerate derived catalogs through their owner. Use [date/time contracts](date-time.md) and canonical formatters.

Load initially, on explicit refresh and after targeted mutation/invalidation. For externally originated changes, use the established authenticated multiplexed push owner, with authorized resource scope, post-commit emission, coalesced invalidation and reconnect gap recovery. Bound backoff and dispose on logout/context change. A UI clock/debounce/single-operation retry is distinct from domain polling; the local project defines its push requirement and missing-infrastructure policy.

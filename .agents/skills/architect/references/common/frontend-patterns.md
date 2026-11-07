# Forms, presenters and stable composition

Read for forms, commands, async options, drawers, routing, localization and server-state synchronization. Preserve the actual framework/owner. Angular application work also loads the mandatory [Angular contract](angular.md); other frameworks keep their actual composition model.

## Forms and actions

Use the framework's typed form model, schema validators and existing form-state integration; the Angular contract requires typed Signal Forms and `effect()` for field dependencies. Observe owned state without feedback loops. Invalid submit reveals inline feedback, a validation notification and focus/scroll through a UI owner without calling the mutation. Keep duplicate-request protection separate from validity. Angular drawer footers retain executable visible actions; permissions and immutable state determine rendering, not a validity-based disabled button.

In a presenter architecture, Views compose templates, presenters own application state/commands, directives own DOM coordination and pure pipes own display transformations. Expose read-only signals and commands with deliberate enabled-state signals; keep handlers private. Do not disguise presentation formatting methods as getters or inject DOM querying into presenters. The concrete Angular public API, empty View class and composable behavior requirements are defined once in [Angular presenters](angular-presenters.md).

Reusable behaviors expose the deliberate Command/Signal and extension-point contract. Choose simple override or module-private WeakMap state/factory ownership as appropriate; initialize in the real injection context and dispose through the lifecycle. Never expose another behavior's WeakMap.

## Stable, accessible UI

Keep mounted select/combo controls stable and render current options directly. Do not recreate a control or bind two controls to one form field to force collection refresh. Verify append/replacement/initially-empty options and framework model propagation when that boundary changes.

Reserve loading/validation/counter space, preserve surrounding dimensions and scroll, and avoid state-driven movement of unrelated controls. Capability/permission gates can remove actions; temporary state must follow the local stable-layout and executable-feedback rules.

Drawers have one constrained scroll owner, not independently scrolling shell and pane. Reuse the installed design system's semantic controls (Mosaik where used) for focus, keyboard, accessibility and interaction. Menu actions are separate menu items with no nested independent button/press-button; destructive press-and-hold behavior outside menus uses the owned control when required by the local policy. Simple empty states stay inline unless a wrapper owns actual behavior.

Use typed DataTable display/sort projections with deliberate null ordering and explicit sorting/resizing/selection configuration. The [Angular table contract](angular.md#typed-data-tables) specifies the required projections and flags while retaining deliberate product defaults. Use theme tokens and the appropriate layout/style owner.

Bookmarkable views and shareable state use the established router/overlay owner. Generated API providers belong to their owning feature where feature composition exists and receive the configured API root from the application boundary.

## Localization, time and synchronization

User-facing errors, hints, empty states, accessibility and fallback copy belong to locale catalogs. Store typed errors/translation keys in state and translate at rendering; keep deliberately displayable server detail within its contract. Scan touched UI and regenerate derived catalogs through their owner. Use [date/time contracts](date-time.md) and canonical formatters.

Load initially, on explicit refresh and after targeted mutation/invalidation. For externally originated changes, use the central authenticated multiplexed push owner, with authorized resource scope, post-commit emission, coalesced invalidation and reconnect gap recovery. Do not replace missing push infrastructure with frontend polling or create per-feature streams; surface the required owner. Bound backoff and dispose on logout/context change. A UI clock/debounce/single-operation retry is distinct from periodic domain refetching. This contract does not add a server or transport to a project with no such production boundary.

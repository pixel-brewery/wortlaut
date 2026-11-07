# Angular application contract

Apply this contract to Angular application work with [frontend](frontend.md), [frontend patterns](frontend-patterns.md) and the local project rules. The ownership, Signal Forms, Command and migration rules below are requirements, not optional patterns. They do not install Angular, ngpel, Mosaik or Tailwind in another stack. Inspect the consumer's installed public APIs before using a package-specific binding. An unsupported Angular version or missing integration is a prerequisite to resolve explicitly, not permission to introduce mixed form owners or upgrade dependencies silently.

Select the detailed guides for the boundary being changed:

| Boundary | Read |
| --- | --- |
| View classes, Commands, DOM/display ownership, Close and Undo/Redo composition | [Angular presenters](angular-presenters.md) |
| Drawers, message boxes, dialogs, toasts and other public UI services | [Angular service APIs and origins](angular-services.md) |
| Collections with one or several presentations, custom views, field metadata, filters and saved presets | [Collections and filtering](angular-collections.md) |
| Instants, date controls, day filters and display pipes | [Date and time](date-time.md) |
| Form, Command, invalid-submit and browser evidence | [Testing](testing.md), with the production guide and local runner/selector contract |

## Views and application state

Concrete application `*View` component classes are empty. Feature Views compose their template and imports and use the actual `View<Presenter>` / `VIEW_PRESENTER` integration; static Views do not need an invented presenter. Put state and actions in a ViewPresenter, host/DOM/focus coordination in standalone Directives, and stateless display transformations in standalone pure Pipes. Do not move code-behind into a formatting getter or a DOM-querying service.

Each concrete application View owns `<ViewName>.ts`, `<ViewName>.html` and `<ViewName>.scss` as siblings. Reference its own external template and stylesheet; do not share View files or add inline templates/styles. The SCSS file is empty or contains only `:host { display: block; }`. Abstract bases and reusable library controls keep their actual library contract; this application-View rule does not rewrite published framework components.

When touching a View with code-behind or a presenter with template-called public handlers, move that behavior to the appropriate owner in the same change and preserve its observable behavior. Use the verified Command bindings from [the presenter guide](angular-presenters.md); an application facade's old aliases are not automatically public ngpel APIs.

## Typed Signal Forms and submit behavior

Use only typed Signal Forms from `@angular/forms/signals` in this Angular contract: a typed model, `form(...)`, `FieldTree<T>` and schema-owned validation. Bind a field with the installed `FormField` integration and let `mosaik-form-field` receive its actual field state where Mosaik is used. Migrate touched `FormGroup`/`FormControl` owners; do not retain both models in a presenter or bind multiple controls as owners of the same field.

Define requiredness, bounds and cross-field validity in schema/reusable validators. Enforce dependent field values, exclusive choices and cascading resets through `effect()` observing field signals in the presenter's real injection/lifecycle context. Guard writes for equality and ownership so the effect converges and does not overwrite user edits repeatedly. Do not add `(checked)`, `(changed)` or other DOM change handlers to duplicate Signal Form value propagation. A distinct user action still uses a Command.

Every drawer submit reaches its handler. Run the root Signal Form validation on each activation; if a dynamic form is owned by a nested UI control, invoke its public validation contract as well. Reveal field errors, focus or scroll to the first invalid field/section through the existing UI owner, and show a localized validation notification. Invalid data must not call the mutation. A non-field prerequisite must produce explicit feedback rather than a silent return. [The services guide](angular-services.md) distinguishes Mosaik's `SignalFormValidator` from the application's notification and DOM owners.

Visible drawer-footer actions remain executable: do not disable them or use `Command.canExecute` to block validation feedback. Permissions, immutable state and unavailable actions decide whether an action is rendered. Keep in-flight/busy state, idempotency and duplicate-request guards separate from validity; repeated clicks during an active request must not issue another mutation, and must retain understandable feedback.

## Navigation and overlay ownership

Every navigable page, detail view and navigation-driven editor has a bookmarkable URL. Declare feature-owned routes, lazy-load route-level Views and use stable lowercase kebab-case `RoutePath` constants from the actual public router owner. Reflect shareable tabs, filters and wizard positions in route/query state. Restore that state on reload and direct navigation.

A contextual drawer preserves the mounted page, its query parameters and fragment. Use the established `ContextOverlayService` and feature-owned target registration so opening, stacked state, closing and browser history follow one URL contract. Do not add `/new` or `/:id` page routes solely to simulate a context drawer, or call `Location.go` from a feature. Use the real registration/provider package identified in [service origins](angular-services.md); an application-specific wrapper is not a universal Mosaik API.

Use `DrawerService` for a drawer, `MessageBoxService` for a message/confirmation box, `DialogService` for a dialog component/template, and `ToastService` for transient toast presentation. Route-driven context belongs to the router integration above them. A transient feedback overlay does not automatically become a navigable page.

## Tailwind composition and Mosaik appearance

For the Angular/Mosaik application contract, Tailwind owns outer layout: flex/grid, placement, sizes, spacing, scrolling and responsive composition. Mosaik owns every available semantic component, including controls, cards/parts, badges, dividers, menus, state components and their behavior. Use the applicable project Designer contract before visual decisions. Tokens alone do not make a handmade replacement acceptable.

Visual utility values must use the documented active `--mosaik-*` tokens or a documented application utility whose values preserve that contract. Do not introduce literal colors, ad hoc typography/weight/tracking/line-height, radii, shadows, opacity or decorative effects. Component custom properties are appearance APIs, not a way to erase internal anatomy or padding from a layout class. Motion uses the installed Mosaik integration, not arbitrary animation utilities.

Own each application's Tailwind entry point, source scanning and custom `@utility` declarations there. Include every consuming application/library path in its real scan configuration; do not assume a sibling app's utilities are available. Migrate touched legacy component SCSS layout to the owning Tailwind composition, retaining only the minimal host rule. Do not leave competing layout owners.

Reusable application-owned controls with an explicit custom-style contract expose simple descriptive `part` names on their own styleable elements. Their minimal theme-aware stylesheet selects those hooks with `[part='name']`; Tailwind classes still arrange layout, and documented variant classes represent state only. This is a narrow reusable-control owner, not an exception for feature Views or a license to rebuild existing Mosaik semantics. Select the actual configured theme and its public SCSS API instead of importing a fixed Joy mixin into every consumer. Prefer the maintained theme/component owner for unavoidable appearance changes; do not copy old native-button, local-font-override or `::ng-deep` examples over the stricter Designer contract. A shadow component's public `::part()` API is distinct from selectors over an application control's own `part` attributes.

When matching an existing drawer/editor, reuse its semantic shell, section compound, dividers, pane-scroll owner and footer. Apply anchors, IDs and directives to the existing semantic boundary rather than adding a duplicate wrapper. Show technical metadata only when the user can act on it; do not turn internal IDs, hashes or versions into decorative heading badges.

## Typed data tables

Define rows and columns with the installed `IDataTableColumnDefinition<TItem>` contract. Every data column declares a stable `key`, localized `title`, `pathFn` and `sortFn`; a pure actions column has no data path/comparator. `pathFn` is the documented dotted path or typed value getter. `sortFn(a, b, dir)` returns the final comparison, including direction exactly once. Choose deliberate null ordering, locale-aware text comparison and numeric/instant comparison; never sort formatted date/currency strings by accident. Keep display formatting in pure Pipes/cell templates and column-title translation reactive to locale changes, not frozen as long-lived presenter strings.

Declare `sortable`, `resizable`, `alternating`, `columnChoosable`, `selectionMode` and `selectionType` explicitly on each table. A common application profile is `true`, `true`, `true`, `true`, `single`, `row`; different product defaults are deliberate local contracts that still state all six choices. Do not silently omit a flag or mistake this profile for the component's own defaults.

Use `mosaikColumnDef` with `mosaikCellDef` for semantic custom cells such as badges and action controls. Keep row/value projections typed at their owning boundary. The inspected public `ICellDefContext` exposes `unknown` row/value members: do not invent generic directive parameters, use `$any` or assume that a public generic column type types every template. Narrow through a verified projection/guard in the appropriate UI owner before binding fields.

## Generated transport and server state

Generated OpenAPI clients/models are read-only. Correct their backend contract or generator and regenerate through the configured owner; do not patch generated files or import backend implementation, validation or shared application model source into the frontend. Each generated API provider belongs to its feature provider/adapter, which accepts the API root from the application composition boundary. The shell composes features, not individual generated clients; an empty default API root is not deployment configuration.

Load server-backed state at entry, on explicit refresh and after targeted mutation/invalidation. For external changes, use one central authenticated multiplexed push transport per browser session, with feature subscriptions to typed authorized scopes. SSE is the transport where the project selects it; do not create a stream per resource or periodic refetch loops in stores, presenters, guards, effects or interceptors. Emit after commit, use the shared cross-instance backbone when deployed across processes, coalesce duplicate invalidations and reconcile missed changes after reconnect with a cursor/sequence or one explicit reload. Bound reconnection backoff and dispose subscriptions on teardown, logout and context change. When the shared push owner is missing, surface that prerequisite rather than add polling. UI clocks, debouncing and retries for one action do not authorize scheduled domain reloads.

## Locale, temporal values and AI actions

Own labels, errors, hints, search groups, empty states, accessible names and fallback copy in supported locale catalogs. Keep typed error codes/translation keys in state and translate at the render boundary with the installed translation Directive/Pipe. An imperative Command notification may use the actual translation service. Preserve raw server detail only when its contract makes it displayable. Check touched templates/TypeScript for user-facing literals, catalog parity and required generation.

Use Angular's standard display Pipes and the canonical calendar-day adapter described in [date/time](date-time.md). Browser-zone display and local-day filters do not imply a fixed user zone or replace an organization's business-calendar contract.

An action presented as AI must issue the real authorized AI request. Analyze the current in-memory content/form, including unsaved edits; do not save or finalize the object before analysis or as its side effect. Deterministic preparation or an explicit failure fallback does not silently replace AI. Applying a suggestion may change the editable model; persistence remains a separate explicit save/apply contract.

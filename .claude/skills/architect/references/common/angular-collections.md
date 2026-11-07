# Angular collections and filtering

Read with [Angular](angular.md), [presenters](angular-presenters.md), [frontend patterns](frontend-patterns.md) and the local project contract for any collection presentation: a single table, list, calendar, board or custom view, as well as collections offering several presentations. Shared field metadata, filtering, saved filters and export integration belong to the same pattern. Apply it even when the request names only one filter or presentation. Reuse the existing supported owner; this guide does not install ngpel or migrate a project's frontend.

## Apply the pattern from the first presentation

The pattern separates collection metadata/state, feature orchestration and rendering. It is useful with one presentation; a view selector or a second mode is not a prerequisite. Compose the capabilities the collection actually needs. A single presentation can reuse the field/filter/export model directly without adding switching UI, dummy views or preference state solely for switching. With the ngpel factory, configure that one supported view and its default; an application-owned implementation can express its single presentation directly.

Applications may adapt this pattern and provide their own collection model, projection, renderer or integration adapter for a specialized presentation. Preserve the same owners for field identity, filter semantics, data access, Commands and lifecycle. Reuse shared capabilities that fit, and place application-specific behavior in the established application UI/feature owner. An adapter may compose or implement `ICollectionView` when that contract fits, or expose an explicit typed collection contract when additional capabilities need their own boundary. Extensibility does not require inheriting the library's private class or making every presentation look like a built-in kind.

## Identify the actual collection owner

The public `@pixel-brewery/ngpel-ui` root exports `createCollectionView`, `ICollectionView`, `defineCollectionField` and `defineTableCollectionView`, `defineGalleryCollectionView`, `defineCalendarCollectionView`, `defineFlowCollectionView`. The factory returns a signal-based configuration model. Its `CollectionView` implementation is private; it is not a public View, ViewModel superclass, Presenter or automatic rendering host. There is no verified `/collection` package entry.

Inspect the consumer's installed exports and existing imports first. An application facade can still own a separate implementation with additional configuration and different controller signatures. Preserve that deliberate boundary until an authorized migration verifies every caller; do not relabel a local implementation as a public reexport or copy it into a feature.

Built-in kinds and view types are `table`, `gallery`, `calendar` and `flow`. A feature may use its own typed view keys; `viewKind` selects the projection. There is no built-in `CollectionViewType.List`: `CollectionListComponent` is a separate renderer, and Compound's `List`/`Single` layout is another contract. A responsive list can render the same table collection without becoming an independent data owner.

These are the inspected factory's built-ins, not a closed list of presentations allowed by the architecture. A custom `TView` key names a view; it does not add a new factory projection kind. For a specialized kind, supply the owning typed projection and rendering/model adapter or application implementation. Keep its metadata, filters and query integration aligned with the collection contract. Do not pass an unsupported discriminator through a cast or invent a public registration API; a reusable library extension belongs at its actual public owner.

## Compose model, presenter and host

| Owner | Responsibility |
| --- | --- |
| Collection model | Shared field metadata, filter state and typed presentation projections; supported/active view state where the chosen implementation needs it |
| Feature ViewPresenter and services | Items, data access, loading/errors, query and paging state, domain selection, permissions, refresh and mutation Commands |
| Existing View/template and rendering adapters | Render the single or selected presentation, bind its items/projections and route control interactions to their Command/controller owner |
| Filter controller | Filter-panel state, apply and named-preset Commands, with configured preference storage and feature-owned apply/restore callbacks |
| Project navigation/preference adapter | URL parsing, supported-view restoration, history and the project's documented preference priority |

Keep one stable collection model per owned collection. Construct it in the presenter's real initialization context; do not create it in a template Pipe, read accessor or render effect. Flow configuration creates a persisted column-expansion preference through `localStorageSignal`, which requires an Angular injection context and `DestroyRef`. Compose presenter controllers with `usePresenterController` from `@pixel-brewery/ngpel-mvp` so their host/lifecycle remains owned.

Expose the typed library or application-owned collection model through a read-only accessor where its binding contract requires it; expose ordinary feature state as read-only Signals and actions as Commands. Model mutation methods are invoked through the owning action/controller path. Typed resolver callbacks required by projection configuration are not extra public presenter formatting helpers.

When several presentations are offered, switching uses the established presenter Command and a supported key. In ngpel's model, `canActivateView()` checks membership and `setActiveView()` ignores unsupported keys. An invalid configured default falls back to the first definition, while an empty view list fails. Prefer an explicitly valid default. The factory materializes the first configuration of each kind: declaring several independently configured tables or calendars does not provide multiple runtime projections. These are concrete factory limits, not a prohibition on application-owned implementations with different presentation contracts.

The ngpel model does not own items, a datasource, selection, pagination, sort state, backend mutations or URL synchronization. Active-view persistence is not automatic. Add mode/history preferences only when the feature needs them; reuse the project's real navigation/preference adapter and preserve its documented restoration priority rather than introducing another writable mode store. A custom implementation keeps these ownership boundaries explicit instead of hiding data access or domain mutations inside rendering.

## Fields are the common metadata boundary

Define each shared field once with a stable typed key, title and deliberate value/sort projections. `ICollectionField` derives table columns, filter definitions and export columns from that metadata. Use its table/filter/export inclusion contracts; table-only action columns belong in the table configuration's `additionalColumns`. Do not maintain parallel field inventories that disagree about keys or meaning.

For a specialized presentation, adapt the same relevant field identities and filter/export semantics through its typed projection. It can introduce presentation-specific metadata without duplicating the feature's query or filter owner. No table projection is required merely to use the pattern or its filtering capabilities.

Keep the [typed table contract](angular.md#typed-data-tables): pure actions differ from data columns, sorting uses real values, component flags remain explicit, and semantic cells use the actual column/cell integration. `table.columnDefinitions()` is typed; `templateColumnDefinitions()` broadens the template boundary and does not make unknown items safe without the matching projection/guard.

Localize titles, labels, options and saved-filter summaries through the established locale owner. The factory materializes metadata from its configuration; a Signal around that initial value does not prove automatic locale or async-option updates. Inspect the installed update seam. Do not rebuild the whole model on locale/options changes and lose active mode, filters or controller identity.

## Filtering belongs to the same composition

Use the collection's `filterDefinitions`, `activeFilters` and `isFilterActive` as the existing shared state when that model owns filtering. The feature's apply path updates that owner, translates values to the real query, resets/reconciles paging and selection as required, and performs the appropriate load. `setFilterValues()` alone only changes model state; it does not filter items or execute a request.

This filtering composition also applies with a single or custom presentation. A custom model can supply the relevant Signals and apply/restore callbacks to the shared filter controller without using the ngpel collection factory or pretending to be a table. Expose only the capabilities the feature uses.

`FilterBarComponent` owns its internal typed Signal Forms and emits `filterChange`. Bind its definitions/current values and route the output through the installed Command/adapter contract. Do not put a second generic form owner over its fields or bind ordinary public presenter event handlers.

The public integration is `usePresenterController(createFilterController(config))`. `createFilterController` comes from `@pixel-brewery/ngpel-ui`; the host adapter comes from `@pixel-brewery/ngpel-mvp`. Its configuration receives `activeFilters`, `isFilterActive`, `applyFilterValues` and a `savedFilterStorageKey`. Pass the existing state and callback, rather than maintaining a second writable filter copy.

The controller exposes filter visibility and apply/save/delete/apply-saved Commands. Closing the panel changes visibility; it does not clear active criteria. Clearing filters uses the same apply path with the appropriate empty values and query/paging reconciliation. Saved-filter changes and choosing a saved filter are distinct operations.

Named presets and the currently active filter have separate persistence contracts. Optional `livePreference` supplies a different `storageKey`, `restoreValues` and optional `openWhenActive`. Restore values before the first load through `restoreValues`; that callback does not issue another load. Reuse the configured preference storage/codec and feature-scoped keys. Do not claim a product-specific preference controller or extra configuration key is part of the public API.

Standard `FilterValues` are key/value records. Advanced values carry `mode: 'advanced'` and a nested `root` group with AND/OR conditions and typed rule operators. Preserve that structure through the query, saved-filter and export adapters. Do not flatten it into unrelated standard fields, lose group precedence or stringify arrays, ranges and trees into display text.

The query adapter owns allowed field/operator mappings, typed values and the backend contract. Keep `0` and `false` distinct from absent/empty values; handle empty text, cleared selections and date ranges deliberately. Use the canonical [date/time](date-time.md) conversion for instant versus calendar-day filters. Backend authorization remains authoritative, including for restored preferences and exports.

An apply/restore path coordinates the affected representations. A changed filter may invalidate pagination, board completeness, calendar data or selection; use the existing feature's explicit reset/reconciliation policy. Cancel or ignore obsolete requests, preserve loading/error ownership and do not let a late response reinstate an older filter result.

Verify the exact metadata layer before configuring advanced controls. A capability on `IFilterDefinition` is not automatically available on `ICollectionField.filter`; application extensions and function-valued option providers are not interchangeable with the inspected public options-array contract.

## Respect each presentation's data boundary

- Table and responsive list can share items, criteria, actions and paging. Keep stable item keys and explicit selection adaptation; the collection model does not unify component selection payloads.
- Gallery supplies text/icon resolvers. Use the existing list/gallery renderer and semantic template parts instead of inventing a universal host.
- Calendar can use a separate `TCalendarItem`. Its required key/start/end/title resolvers project events; start/end return `Date`. The feature owns the visible-range query, current range, time-zone policy and controlled mutation Commands. A page of table rows is not automatically complete calendar data.
- Flow supplies stable item/column keys, declared columns, title resolvers and a dedicated column-expansion storage key. The feature owns grouping, completeness and mutations. Do not treat a first paginated response as the complete board, or assume a projection callback moves a domain item. Reuse bounded loading and the actual component's controlled-mutation integration when the feature permits dragging.
- A custom presentation declares its own typed projection, required data scope and interaction adapter. It uses the existing feature's identities, filter/query semantics and action owners; it can be the collection's only presentation. Verify that contract instead of assuming the library supplies its rendering or mutations.

Export configuration also stops at a boundary: `CollectionExportService.open()` returns a field/format choice or cancellation; the feature/server performs the authorized export. The current `buildExportFilters()` produces simple `contains` entries using `String(value)`. It is not a lossless codec for advanced groups, range operators or arbitrary backend filters. Use the established export query adapter so the exported scope matches the active criteria.

## Evidence and compatibility

For capabilities actually exposed, verify filtering and saved presets, standard/advanced query semantics, `0`/`false` and temporal boundaries, stale responses, required data completeness, selection and permission changes, export scope/cancellation, and controller teardown. Verify supported/invalid modes and restoration when switching exists. A single or custom presentation needs evidence for its own projection and shared integration, without artificial multi-view scaffolding. Reuse the real owners' existing tests; static metadata shape or a mode button alone does not prove the flow.

Public API details were checked against ngpel source and built declarations at `d2340fa00b5e84b59da10442f0964320710f4302` (workspace version `0.0.3`, Angular peers `>=22 <23`). This records source behavior, not a verified registry installation. Compare each consumer's installed public exports and local adapters before adoption; missing capabilities are prerequisites rather than permission for silent upgrades or copied implementations.

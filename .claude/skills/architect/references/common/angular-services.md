# Angular UI service contracts

Read for Angular applications that already use Mosaik or ngpel. Apply [frontend patterns](frontend-patterns.md) and the local project contract alongside this reference. These APIs do not add Angular, Mosaik or ngpel to another stack.

Resolve the installed version, public entrypoint, provider registration and nearest working caller before implementation. The contracts below were checked against Mosaik workspace package manifests at `0.1.192` and ngpel at `0.0.3`; this is source evidence, not a claim that a consumer runs those builds. Prefer the consumer's installed declarations when versions differ. Import package exports rather than copying a service or reaching through a product's internal barrel.

## Mosaik overlays

The following classes, provider functions, config/ref interfaces and injection tokens are exported by **`@pixel-brewery/mosaik-elements-angular`**. Its package root exports `src/index.ts` → `src/cdk/Cdk.ts`; component secondary entrypoints are not service entrypoints. Compose the needed providers at the existing application/environment boundary and inject that service instance into the action owner.

| Exported service | Purpose and actual call | Returned value | Provider |
| --- | --- | --- | --- |
| `DrawerService` | Open drawer content with `show<TData, TResult>(ComponentOrTemplate, config?)` | `IDrawerRef<TData, TResult>` | `provideDrawers(...)` |
| `DialogService` | Open dialog content with `show<TData, TResult>(ComponentOrTemplate, config?)` | `IDialogRef<TData, TResult>` | `provideDialogs(...)` |
| `MessageBoxService` | Ask for a built-in message-box decision with `show<TData>(config?)`; config carries `header`, `message`, `buttons` and optional `intl` button labels | `IMessageBoxRef<TData, MessageBoxResult>` | `provideMessageBoxes(options?)` |
| `ToastService` | Show transient feedback with `show<TData, TResult>(config?)`, or custom content with `show<TData, TResult>(ComponentOrTemplate, config?)` | `IToastRef<TData, TResult>` | `provideToasts(...)` |
| `SheetService` | Open sheet content with `show<TData, TResult>(ComponentOrTemplate, config?)` | `ISheetRef<TData, TResult>` | `provideSheets(...)` |

`ComponentOrTemplate` means an Angular `Type<unknown>` or `TemplateRef<TData>`. Each `show` returns its ref synchronously. Select the service by the actual surface: a drawer uses `DrawerService`, a dialog uses `DialogService`, a message box uses `MessageBoxService`, and a toast uses `ToastService`. A component's historical filename is not its surface contract.

Use typed `config.data` and the matching content tokens: `DRAWER_REF`/`DRAWER_REF_DATA`, `DIALOG_REF`/`DIALOG_REF_DATA`, `SHEET_REF`/`SHEET_REF_DATA` or `TOAST_REF`/`TOAST_REF_DATA`. Size, backdrop, implicit-close and navigation options belong to the corresponding config interface. Reuse configured defaults and breakpoint/stack features; do not create another provider instance merely to change one opening's options.

### Results and lifetime

The refs expose `closed: Observable<ICancel<TResult>>`, with `reason: 'positive' | 'negative' | 'none'` and optional `result`. A semantic close emits once and completes. Handle the reason before consuming the payload; cancellation is not a successful mutation. `Cancel.positive(value)`, `Cancel.negative()` and `Cancel.none()` are public Angular helpers. `MessageBoxResult` is exported by `@pixel-brewery/mosaik-elements-foundation`; affirmative buttons map to a positive reason, while No/Cancel map to negative.

Inside drawer, dialog or sheet content, close through the injected ref with the appropriate `Cancel` value. For transient message boxes/toasts, use their button/timeout contract and service `close(ref)` for an explicit dismissal. The services also expose `isShown(ref)` and inherited `count: Observable<number>`. Visual detachment, navigation and a semantic result are separate paths; do not assume every teardown supplies a positive result or emits the same close notification. Bind caller subscriptions to their Angular owner, for example with `takeUntilDestroyed(destroyRef)`.

For unsaved changes, the documented `closeAttempted` stream carries outside/Escape attempts and a synchronous `preventClose()` method. Apply the actual installed contract and dispose the subscription with its content owner. Preserve one scroll owner and the existing focus behavior; the service owns mounting the overlay, not saving application data.

For example, in the existing command/action owner, after injecting `DrawerService` and obtaining its `DestroyRef`:

```ts
const ref = drawers.show<IEditorData, IEditorResult>(EditorView, { data: editorData });
ref.closed.pipe(takeUntilDestroyed(destroyRef)).subscribe(outcome => {
    if (outcome.reason === 'positive' && outcome.result !== undefined) {
        applyEditorResult(outcome.result);
    }
});
```

`IEditorData`, `IEditorResult`, `EditorView` and `applyEditorResult` stand for the feature's existing contract and owner. Import `takeUntilDestroyed` from `@angular/core/rxjs-interop`; keep application behavior out of a View when the local presenter architecture requires that boundary.

## Other Mosaik Angular services

Every export in this table is also imported from **`@pixel-brewery/mosaik-elements-angular`**.

| Export | Purpose, usage and ownership |
| --- | --- |
| `TourService` | Register definitions through `provideTours(...sourcesAndFeatures)`. `start(tourId, stepId?, contextSignal?)`, `next()`, `previous()`, `showStep(stepId)`, `finish()`, `skip()` and `end(reason?)` return `Promise<boolean>`. Observe `activeTourId`, `activeStep`, `isActive` and `lastFailure` signals. It owns one tour element and releases router/listener/context resources with its injector's `DestroyRef`; await the operation rather than treating it as an overlay ref. |
| `BreakpointService` | `provideBreakpoints(config?)` supplies the service and alias registry. `isMatched(aliasOrAliases)` is a boolean snapshot; `observe(aliasOrAliases)` returns `Observable<boolean>`. `watch(...)` emits through `changed: Observable<void>` and returns a cleanup function. Use the registered aliases and release watches/subscriptions with the owner. |
| `ThemeService` | Angular integration provided and initialized by `provideTheme({ theme, mode, overrides? })`. `applyTheme(mode)` changes the mode; `schemes` and `palettes` expose available names. Initialization owns an observer subscription released through `DestroyRef`. Configure once at composition rather than repeatedly calling `initialize()` from views. |
| `TranslateService` | Supply `provideTranslationRegistry(config?)`, then register catalogs through `provideTranslations(...)` where used. `translate(key, ...args): string`, `currentLanguage`, `addTranslations(lang, data)` and `languageChanged: Observable<string>` are the public contract. Imperative feedback can use the service; template text uses the installed `TranslateDirective`/`TranslatePipe`. A translated string is a snapshot unless recomputed when the language changes. Scope observable subscriptions to the owner. |
| `SignalFormValidator` | Supplied by `provideForms()`. `validate(fieldTree, hooks?): void` marks traversed fields touched and invokes `onEachError`, then either `onErrors` or `onSuccess(rawValue)`. `collectErrors(...)` returns `ISignalValidationIssue[]` (`path`, `errors`, optional `fieldRef`); `isValid(...)` returns a boolean. The fluent alternative is `build(form).onErrors(...).onSuccess(...).run()`. It is synchronous validation over the existing Signal Forms tree, not a save operation or DOM-focus service. |
| `ViewSlotRegistry` | Register static views with `provideViewSlot(slotId, definitions)` or provider-owned views with `provideViewSlotFrom(slotId, providerType)`. `getViews<T>(slotId)` and `getActiveViews<T>(slotId, selectionSignal)` return signals of `IViewSlotDefinition<T>[]`; `hasViews`/`hasActiveViews` return boolean signals. Use public view definitions/outlets. A caller that dynamically `register`s a view owns its matching `unregister(slotId, viewId)`. |
| `TimeUpdateService` | Supplied by `provideTimeUpdates()`. Shared `getSecondTick()`, `getMinuteTick()`, `getHourTick()` and `getMidnightTick()` streams emit epoch milliseconds. Names describe display granularity: the checked first three implementations tick every 2 seconds, 30 seconds and 5 minutes. Unsubscribe with the display owner. These streams refresh local time presentation, not server data; do not treat the fixed-interval midnight implementation as a time-zone/DST scheduling engine. See [date/time](date-time.md). |

The similarly named services from **`@pixel-brewery/mosaik-elements-foundation`** are different public APIs. Its overlay services and `ThemeService` use framework-neutral singleton/configuration contracts, such as `ToastService.instance.open(...)` and `ThemeService.configure(...)` before first singleton access. They are not substitutes for Angular `inject(ToastService).show(...)` or Angular `provideTheme(...)`. Keep package-qualified identity explicit when both layers are involved.

## ngpel services and adjacent helpers

Use these only when their packages and application composition are already present. An application may wrap a public service with additional policy or maintain a separate same-name implementation; inspect the export and provider before replacing its import.

| Public entrypoint and export | Contract |
| --- | --- |
| `@pixel-brewery/ngpel-core/notification`: `NotificationService`, `provideNotification`, `INotification` | Compose the service with `provideNotification(...features)`. `showInfo`, `showWarning`, `showError` and `showSuccess` take title/content/options and return `INotification`; `push(message)` also returns that record. Its text properties are signals, with identity, duration and timestamp data. `all()`, `remove(id?)` and `changed` manage/observe history. Presentation depends on composed interceptors; the core service does not itself imply a Mosaik toast. There is no verified public class/value named `Notification` in this entrypoint. |
| `@pixel-brewery/ngpel-router`: `ContextOverlayService`, `provideContextOverlayRouting`, `provideContextOverlayTarget` | Compose URL synchronization once with `provideContextOverlayRouting(optionsOrFactory)`, including the application's `supportsPath` policy. `provideContextOverlayTarget(factory)` registers an `IContextOverlayTarget` with `key`, `canOpen` and `prepare` loader contracts. `open(key, id?, context?, transient?)` returns whether the address was accepted, not a content ref or load-completion promise. `closed` emits closed addresses; `closedOutcome` emits interactive `{ state, result }` outcomes. URL-driven closes/disposal are silent. Injector destruction disposes synchronization. |
| `@pixel-brewery/ngpel-ui/context-overlay`: `provideContextDrawerTarget`, `IContextDrawerTarget` | Adapts Mosaik drawers to the router's generic overlay contract. Its factory provides `canOpen(mode)`, `loadView(mode)`, `detailData`, optional `createData`/`resolveDetailData`, and lifecycle callbacks. Its `onClosed` receives `ICancel<TResult> | undefined`. Use this adapter for a registered drawer rather than assuming the generic router helper accepts the same descriptor. |
| `@pixel-brewery/ngpel-router`: `RoutePath` | Immutable value helper, not an injected service. `RoutePath.create('items').withParam(':id')` creates a path template; `toRoute()` adds its leading slash and `format('id', value)` URL-encodes one declared parameter. Initial templates have no leading slash, query or fragment. Preserve a product-local path helper's deliberate differences. |
| `@pixel-brewery/ngpel-core`: `toCalendarDate`, `fromCalendarDate`, `normalizeCalendarDate` | Date helpers, not injected services or display Pipes. `toCalendarDate(Date)` reads local day parts and returns `YYYY-MM-DD` or `undefined`; `fromCalendarDate(value)` returns the local control date or `null`; `normalizeCalendarDate(value)` returns a canonical day or `undefined`. The latter two accept documented legacy date-times as well as date-only values; preserve the consuming API's migration contract. |
| `@pixel-brewery/ngpel-ui`: `ViewportClearanceService` | Root-provided layout coordination. `reserve(edge, host?)` returns `{ update(distance), release() }`; release the reservation when its DOM owner ends. `bottom`, `right` and `blocked` are signals. `blockForContent()` and `openLayer(root)` return release functions. Prefer the existing directive/DOM owner when it already manages these lifetimes. |

## Where to verify a changed contract

- Mosaik Angular package `package.json` and `src/index.ts` → `src/cdk/Cdk.ts`; service/ref/config/provider files under `src/cdk/overlays/{drawer,dialog,message-box,toast,sheet,tour}`. Supporting services live in `src/cdk/{breakpoint,theme,translate,forms,view-slots,services}`.
- Mosaik Foundation package `package.json`, `src/Index.ts` and the exported singleton implementations; distinguish their signatures from the Angular adapters.
- ngpel package primary `src/index.ts`, secondary-entrypoint `ng-package.json` and built `package.json` exports. Notification exports are in core `src/notification/index.ts`; generic overlay/path exports are in router `src/index.ts`; drawer adaptation is in UI `src/context-overlay/index.ts` and clearance in UI `src/viewport-clearance/ViewportClearanceService.ts`.

Verify both the public declaration and a real caller's result handling. Source inspection establishes the available contract; provider composition, rendering, focus, mode changes and disposal still need task-appropriate application verification when behavior changes.

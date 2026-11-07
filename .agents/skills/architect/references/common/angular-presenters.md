# Angular Views, ViewPresenters and behaviors

Read with [Angular](angular.md) for Angular screen composition, Commands, presenter state, close behavior or undo/redo. [Services](angular-services.md) own application operations and external I/O. These are mandatory ownership rules for the supported Angular contract; they do not introduce Angular, ngpel or a replacement frontend stack into a non-Angular project.

## View and presenter boundary

Every concrete Angular `*View` component has an empty class body. Its decorator owns the template, stylesheet, imports, change-detection strategy and providers. Do not put fields, constructors, getters, methods, lifecycle hooks, event handlers, DOM queries or compatibility code in a concrete View. Apply the same boundary when changing a View that already contains code-behind: relocate that behavior through its actual owner while preserving the flow.

A stateful View extends `View<TPresenter>` and provides its presenter per View instance. A static View stays empty without an invented presenter. In the supported three-file layout, a concrete View references its own matching `.html` and `.scss`; shared templates or stylesheets do not replace an explicit reusable owner.

| Owner | Responsibility |
| --- | --- |
| View and template | Composition, binding and the existing controls |
| ViewPresenter | Application-facing UI state, orchestration and Commands |
| Service | Application operations, persistence and external collaborators |
| Directive | Host-element behavior, DOM events, attributes, focus, scrolling and element coordination |
| Pure Pipe | Stateless display transformations, formatting and display-only mapping |

The ViewPresenter's template-facing contract consists of read-only Signal getters, Command getters and typed form accessors. Its public lifecycle methods and explicitly declared behavior extension points serve their owners, not template event calls. Keep mutable state and ordinary handlers private; name a handler for its Command, such as `onExecuteSaveCommand`. Loading/reloading helpers remain private and are called from lifecycle or Command handlers.

Expose private writable signals with `asReadonly()` and create derived `computed` signals once. A getter returns the owned Signal; it does not format a value or recreate derived state on every read. Read-only signal access does not make an object deeply immutable: replace changed model values rather than mutating an object that another signal or history entry retains.

Keep the typed form model and its validation in the presenter/form owner. Form accessors expose the supported binding contract, such as `FieldTree<T>` in a Signal Forms project; they do not justify arbitrary public mutation methods. Observe field signals for application invariants rather than routing ordinary form changes through DOM handlers. Apply the form and submit-feedback contract in [Angular](angular.md).

Do not expose formatting, translation, DOM-ID construction, CSS/ARIA mapping or other display helpers as presenter methods. Moving the same helper into a getter does not fix the ownership error. Use built-in or dedicated standalone pure Pipes for display, simple template bindings for direct values, and Directives for DOM-dependent work. Presenters and application Services do not resolve elements through `ElementRef`, `Renderer2`, DOM queries or observers. Application-relevant state remains a Signal; a rendering-only transformation remains at the rendering boundary.

Compose strings in Angular templates only with template-literal interpolation, never `+` concatenation. This includes labels, text, translation keys and attributes such as `[attr.test-id]="`item-${item.id}`"`. Reserve `+` for numeric arithmetic. Keep expressions to reads, comparisons, boolean composition, simple arithmetic/interpolation and Pipes; move transformation algorithms to their proper Pipe/Directive owner.

## Use the installed MVP contract

The public entrypoint for the shared implementation is `@pixel-brewery/ngpel-mvp`. It exports `View`, `ViewPresenter`, `VIEW_PRESENTER`, `provideViewPresenter`, `Command`, `command`, `CommandDirective`, `Closeable`, `ICloseable`, `Trackable`, `ITrackable`, `withUndoRedo`, `ITrackableSignal`, `PresenterBehaviorBase` and `PresenterBehaviorReturn`.

Check the consumer's installed version and public declarations before changing its integration. Import through that public entrypoint or an existing documented application adapter; do not deep-import its implementation or reproduce the library inside a feature. If ngpel is absent, preserve these ownership rules through the existing supported seams and resolve whether dependency adoption is authorized. Reading this guide does not authorize an installation, version upgrade or stack migration.

For an existing ngpel application, the View binding is:

```typescript
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommandDirective, provideViewPresenter, View } from '@pixel-brewery/ngpel-mvp';
import { EditorViewPresenter } from '../view-presenters/EditorViewPresenter';

@Component({
    selector: 'app-editor',
    templateUrl: './EditorView.html',
    styleUrl: './EditorView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommandDirective],
    providers: [provideViewPresenter(EditorViewPresenter)]
})
export class EditorView extends View<EditorViewPresenter> {}
```

Add the owning template's controls, Directives and Pipes to its imports. `provideViewPresenter()` supplies `{ provide: VIEW_PRESENTER, useClass: ... }`; an existing explicit provider for that token is the same ownership mechanism. Every concrete presenter carries its own `@Injectable()`. The base View drives initialization and disposal; do not override it in the empty concrete View.

## Commands are the action boundary

Construct each action through `command<T>(handler, canExecute?)` or the installed asynchronous Command factory. Own the Command privately and expose a public getter. Its handler delegates to private presenter methods and application Services. Pair each Command with its named read-only `canX` execution Signal and use that Signal as its `canExecute` source. Reuse the gates already supplied by a composed behavior rather than maintaining a second copy.

Bind Commands through the actual installed Directive. In ngpel's public `CommandDirective`, the aliases are `ngpCommand`, `ngpCommandParameter` and `ngpCommandParameterFromEvent`. A project-owned adapter can expose different aliases; inspect its contract instead of mixing them. For example, where Mosaik and its button wrapper are already installed:

```html
<mosaik-button [ngpCommand]="{ click: presenter.closeCommand }" />
<mosaik-button [ngpCommand]="{ click: presenter.selectCommand }" [ngpCommandParameter]="item.id" />
```

The event-to-Command map uses actual DOM/custom event names. The ngpel Directive rejects modifier strings such as `keydown.enter`. Its event mapper accepts a function, not a boolean; by default it passes `CustomEvent.detail`, or the original event for an ordinary event. Keep event adaptation in the Directive/adapter owner instead of adding public presenter event helpers. Never replace this binding with `(click)="presenter.onExecuteClose()"` or direct template calls to a private handler.

Distinguish capability gates from user-correctable validation. Where the application requires an executable submit/footer action, keep the handler reachable so it can reveal inline validation and recovery feedback without executing an invalid mutation. Busy/re-entrancy protection must not silently become a validity gate. Do not add a disabled binding merely because a Command exposes `canExecute`.

## Compose close and undo/redo behavior

Reuse the public mixins rather than adding parallel close/history state to each presenter. Composition reads inside-out: `Trackable(Closeable(ViewPresenter))` applies `Closeable`, then `Trackable`.

| Behavior | View-facing contract | Presenter setup or extension |
| --- | --- | --- |
| `Closeable` / `ICloseable` | `closeCommand`, `canClose` | Override `onExecuteClose()` for the actual close; use `setCanExecuteClose(boolean)` to update its gate |
| `Trackable` / `ITrackable` | `undoCommand`, `redoCommand`, `canUndo`, `canRedo` | Call `withUndoRedo(host, initialValue, options?)` once during construction |

`onExecuteClose()` and `setCanExecuteClose()` are the verified public ngpel names. They are deliberate subclass/control extension points, not extra template methods; stale examples named `onClose()` or `setCanClose()` do not establish those exports. A concrete close action must perform the application's real close through its owned router/overlay/service. The mixin's default close hook does nothing.

```typescript
import { inject, Injectable, type Signal } from '@angular/core';
import { Router } from '@angular/router';
import { RoutePath } from '@pixel-brewery/ngpel-router';
import {
    Closeable,
    type ITrackableSignal,
    Trackable,
    ViewPresenter,
    withUndoRedo
} from '@pixel-brewery/ngpel-mvp';

const ITEMS_ROUTE_PATH = RoutePath.create('items');

@Injectable()
export class EditorViewPresenter extends Trackable(Closeable(ViewPresenter)) {
    private readonly _router = inject(Router);
    private readonly _model: ITrackableSignal<{ name: string }>;

    public constructor() {
        super();
        this._model = withUndoRedo(this, { name: '' }, { capacity: 100 });
    }

    public get model(): Signal<{ name: string }> {
        return this._model.value.asReadonly();
    }

    public override onExecuteClose(): void {
        void this._router.navigateByUrl(ITEMS_ROUTE_PATH.toRoute());
    }
}
```

This example closes a routed editor by returning to its declared `/items` route; use the application's actual router/overlay close contract. Its edit Commands still belong to the presenter. Private edit handlers write through the returned tracked model's `value.set()` or `value.update()`. Do not expose the writable `ITrackableSignal` wholesale to templates or mutate retained objects in place. The inherited undo/redo Commands use the same tracked model and gates. Read the installed options before choosing history limits or recording filters; do not invent a parallel history manager.

Create behavior setup in the concrete presenter's constructor or a private method invoked synchronously from it, after `super()` and before reading behavior getters. Create Angular forms and `effect()` work in the real injection context with the correct destruction scope, not in an arbitrary later callback or `initialize()` method. The current synchronous `command()` and `withUndoRedo()` factories themselves do not call Angular injection APIs; the constructor rule establishes predictable setup and lifetime rather than an invented injection requirement for those factories.

## Behavior implementation and disposal

Use the library's `PresenterBehaviorBase` and `PresenterBehaviorReturn<TBase, TBehavior>` contracts when an actual reusable capability needs a new mixin. Its inner class is abstract, calls `super(...args)` before its own setup and preserves the composed base contract. Keep the TypeScript-required variadic constructor type narrowly confined to that mixin seam; it is not permission to introduce `any` into application contracts.

Choose one ownership pattern for the behavior:

- A simple override behavior owns its Command and private gate and declares the small extension point a concrete presenter implements. `Closeable` uses this pattern. Ordinary application handlers remain private; the mixin's declared extension point is the narrow public exception.
- A stateful factory behavior keeps its registry in a module-private `WeakMap` keyed by its behavior interface. Public interfaces expose read-only Signals and Commands; exported setup functions take the host first. `Trackable` and `withUndoRedo()` use this pattern. Getters resolve that private state; do not duplicate it in a consumer or expose the registry/internal accessors through the public entrypoint.

Keep state isolated per presenter. Export the mixin, its interface as a type, and intended setup functions from the owning public entrypoint. Do not mix a second state channel into a behavior whose contract already selects an override or WeakMap owner.

Use the actual lifecycle: `ViewPresenter.initialize()` owns application startup; override it only in the presenter and call `super.initialize()`. Dispose presenter subscriptions, effects, history and in-flight operations through their owning destruction scope and base lifecycle. The ngpel base also registers disposal with its injector's `DestroyRef`; its managed teardown coordinates View and injector destruction. `Trackable.dispose()` clears history and calls `super.dispose()`. A concrete override must preserve that chain, avoid duplicate teardown effects and prevent delayed work from updating a disposed presenter.

## Verify behavior through public contracts

Select focused evidence with [testing](testing.md) and the actual production owners. Verify Command execution and its gate, state projection, constructor setup, separate presenter histories, undo/redo ordering, branching after undo and disposal through the real owner. For close behavior, exercise `closeCommand`, including a closed gate and the actual close effect; do not call a private handler or inspect the WeakMap.

For form submissions, verify invalid input produces the required feedback and no mutation, and distinguish duplicate-request protection from validation. For rendered integration, verify the installed Directive's event/parameter contract and the actual navigation, overlay, focus or selection outcome. Static template wording, private-state inspection and a mock of the entire presenter do not establish the flow. Keep runner selection, spec ownership and browser authorization under the consuming repository's existing testing contract.

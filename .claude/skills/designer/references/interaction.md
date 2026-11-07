# Using a Mosaik screen

Verify the assembled screen through its real controls. Read their documentation for the selected framework and installed version; a component's presence alone does not verify the surrounding application behavior.

## Follow an action

Start at the screen's normal entry point and complete its main task. Check the selected navigation entry, current item and available next action. When an edit is possible, verify how unsaved values, saving and reverting are represented.

For a control that starts asynchronous work, inspect its pending, completed and failed outcomes. Use the documented busy state to make pending work clear and prevent unintended repeated submissions. Empty collections and empty search results should explain their different next steps. Choose `BusyState`, `EmptyState`, `ErrorState` or `SuccessState` where those components fit the region.

Keep useful input available after an error and make the actual recovery action visible. Exercise partial results, revision conflicts or connection loss when the product supports those situations. Do not invent a recovery mechanism that the application's data layer does not provide.

## Operate without a pointer

Follow the task with Tab and Shift+Tab, then the documented keys for the focused component. Inspect the visible focus indication, field labels and names of icon actions. Selected and invalid states must be understandable without relying on color or hover alone.

Open and dismiss the overlays used by the flow. Check where focus enters and where it returns. Include slotted controls and portalled content in this check: a working field on the page does not establish that its dialog version works too. Inspect the actual rendered control and the project's accessibility target before reporting an accessibility result.

## Fit the supported layouts

Use the application's existing breakpoints and the widths it promises to support. At narrow, intermediate and wide layouts, check the primary task, navigation, long labels, translated content, tables and open overlays. Constrain necessary table scrolling to its own region. Keep actions reachable with touch as well as keyboard.

Use theme tokens for layout values and let content wrap or resize within its container. On a fixed Claude Design board, demonstrate another layout on an appropriate board rather than treating a scaled screenshot as a responsive implementation. In Studio, use the current authoring rules for breakpoint frames.

## Check visual feedback

Inspect hover, focus, selection, disabled and pending feedback in the supported color modes. Use existing component behavior and the project's animation facilities for transitions. Honor reduced-motion preferences and keep the task usable when animation is reduced.

Record the route or board, modes, sizes, actions and states actually inspected. The static checker does not establish a successful task, screen-reader behavior or contrast on the rendered screen. Report those limits when the corresponding check was unavailable.

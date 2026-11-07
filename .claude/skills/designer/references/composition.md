# Composing a Mosaik screen

Read the owning application's design sources and the appropriate canvas, application or Studio guide before arranging the screen. The existing theme, wrapper integration and catalog determine the available building blocks.

## Describe the task

Identify what the user needs to inspect or change and the action that completes that task. Use that to decide which information belongs together and which action deserves emphasis. For a small correction, inspect the affected region rather than planning the whole product again.

Search the Mosaik templates and recipes using the task's terms. Read a suitable composition and its option schema before adapting it. Keep the catalog IDs for the report. An unsuitable recipe can be rejected; construct the needed screen from documented Mosaik components instead.

## Assemble the view

Use the project's existing page shell and navigation. Place the main information and its action together, then add supporting regions. Keep one solid primary action per view and use neutral/plain actions for supporting work. Status variants retain their documented meaning.

Map each control to [the component guide](components.md). Use the framework's Mosaik wrappers in application code, the documented imports on a Claude Design board, and the catalog's authoring contract in Studio. Layout containers in application and Claude Design code use flex/grid; component internals stay owned by Mosaik.

Apply typography roles and layout tokens to the surrounding content. Reuse the current theme's color, spacing and shape decisions. If the user requests a theme change, change its maintained source using [foundations](foundations.md), then inspect the affected controls in the supported modes.

Populate the view with consistent data. Counts, totals, labels and detail panels must describe the same records. Identify sample content clearly, and keep prototype behavior distinguishable from a connected product.

## Change an existing view

Locate its route, state and event owners before moving controls. Retain selections, entered values, validation and focus behavior unless the request changes them. Check the same task before and after the edit. A request to adjust appearance does not itself change data contracts or storage behavior.

For a focused visual pass, inspect grouping, alignment, wrapping, icon registration and the prominence of actions. For wording changes, use the product's language and describe the actual action or recovery step. A requested review reports the observed issue and proposed correction without editing the view.

## Check the result

Follow [interaction](interaction.md) and [review](review.md) on the rendered screen. Run the checker for its surface and the project's relevant checks. Report the foundation sources, catalog entries, exceptions and behavior actually verified.

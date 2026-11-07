# Component and layout boundary

Read before composing UI or judging component compliance. The requirement concerns semantic roles, not just clickable elements. A token-colored `div` is still a handmade Card, and a styled `span` is still a handmade Badge.

## Use the existing component

Map every visible UI role through [the component guide](components.md) and current component documentation. Use the framework's actual Mosaik exports, documented `mosaik-*` elements or the surface's tested adapter composition. Trace aliases and local wrappers to their implementation. A familiar name such as `Button` or a `mosaik-` prefix does not prove its origin or existence.

| Role | Required composition |
| --- | --- |
| Actions, inputs and selection | Mosaik Button/Clickable, input or selection family, with documented events and state props |
| Cards, panels and tiles | Mosaik Card/Region/Tile and their real parts/slots |
| Status, labels and feedback | Mosaik Badge/Chip/Message/Banner and the appropriate state component |
| Menus, navigation, lists and tables | The matching Mosaik root and documented item/row/cell anatomy |
| Empty, loading, error and success states | The matching Mosaik state/progress component, with useful content and recovery actions |
| Overlays, resizable panes and popups | The matching Mosaik component and its documented lifecycle/composition |

Do not rebuild these with native controls, event handlers or ARIA roles on plain markup, foreign UI libraries, visual Tailwind utilities or copied CSS. Mosaik tokens do not make a replacement legitimate. A local feature component is allowed when it composes verified Mosaik primitives and owns product behavior; its rendered internals remain in scope.

## What plain markup can do

- Arrange structure with flex/grid, responsive placement, sizing, spacing, alignment and overflow. Use the Mosaik Tailwind preset for layout utilities and the theme spacing unit. A layout container does not paint its own card, badge, divider or state appearance.
- Render semantic headings and body text with the exact `font: var(--mosaik-typography-<role>)` contract. Do not alter that role's font, weight, tracking or line height locally. Use documented Mosaik Text when its API fits; semantic heading tags remain appropriate where Text has no heading-role API.
- Render technical values, source examples and logs as semantic `code`/`pre` content. These are content, not hidden implementations of controls.
- Apply the theme's page background, foreground and base typography at the document baseline. That baseline does not authorize token-colored panels or independent control skins.

Tailwind is for layout only, apart from an exact Mosaik font-token binding for permitted semantic text. `bg-*`, `rounded-*`, `border-*`, `shadow-*`, independent typography utilities such as `font-bold`/`text-xl`, and arbitrary component-token declarations are not layout just because they appear in a `class` attribute. Use a Mosaik component or the maintained theme owner for the requested visual decision. Component-internal overrides, such as resetting Card padding through arbitrary utility properties, do not count as layout. Tested engine-composition adapters in [canvas](canvas.md), such as raw slotted parts, remain scoped to that surface and version; they do not waive the appearance boundary.

Custom CSS needs the same review as utility classes. Include every stylesheet that supplies a used class, imported style or inline-template style. If the source cannot establish what a dynamic class, style, generated element or wrapper renders, report it as unverifiable and inspect its owner. Do not turn an unresolved source into a successful compliance claim.

## Domain data and illustrations

A literal color, number or string passed as domain data to a documented Mosaik component prop can be valid: a ColorSwatch may display an edited palette value. Keep that data inside its documented specimen/preview boundary. It must not override the application's theme, component anatomy or status colors. Distinguish data from CSS used to restyle app chrome.

Only a noninteractive SVG/canvas illustration without a suitable component can declare `data-mosaik-illustration="specific reason"` on its own root. Report its location, data purpose and remaining accessibility checks. This declaration cannot cover a parent screen, an HTML control, an interactive diagram, an existing UI component, app chrome or controls inside the illustration. Its controls remain real Mosaik components. A broad ancestor marker does not exempt descendants from their rules.

`data-mosaik-exception` and `mosaik-exception:` are not bypasses. When a component seems absent, search the configured MCP catalog and installed docs, record what was searched and report the remaining capability. A broken component is a Mosaik defect to reproduce; it is not permission to replace it silently.

## Evidence before completion

1. Inventory the affected semantic roles and their documented Mosaik components, parts/slots and import sources. Trace local wrappers and aliases. Include states and overlays that appear only after interaction.
2. Run the checker for the full affected owner, including templates, inline templates and CSS/SCSS. Name the inspected files, findings, unsupported/dynamic scope and every illustration declaration. Resolve violations; disclose source the checker could not establish.
3. Review remaining composition, token/preset ownership and actual component API against the installed version and catalog evidence. Static counts do not prove exclusive component use, complete style coverage or absence of dynamically constructed UI.
4. Open and use the rendered view in the supported modes, widths and keyboard paths. Report actual observations separately from source evidence and from checks not performed.

The native-browser maintenance check on 5 November 2026 exercised real Mosaik 0.1.185 Soho Card, Badge, Button and Message, a working Button action and light/dark switching. It did not execute Claude Design's `x-import` engine. Keep the versioned canvas compatibility evidence in [canvas](canvas.md) separate.

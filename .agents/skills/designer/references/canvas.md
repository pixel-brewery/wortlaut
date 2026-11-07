# Claude Design canvas

Real Mosaik components on a Design canvas. Everything here was tested on a live canvas with Mosaik 0.1.185 unless marked otherwise.

## Setup

Start the canvas with the account's **Mosaik Design System** artifact as its design system, so its files are copied to `ds/mosaik/`. Find it with the Artifact tool's listing for the type "Design System". Weight is no reason to rebuild components: a board loads a few MiB, and a copy of 15 MB per board still opened a canvas of 28 boards in about 15 seconds.

The canvas editor cannot edit inside a component's shadow DOM. That is accepted: a board that shows the real thing is worth more than one whose pixels can be dragged.

## Board skeleton

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Screen name</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="ds/mosaik/tokens.css">
<link rel="stylesheet" href="ds/mosaik/components/bundle.css">
<script src="ds/mosaik/components/lib/mosaik-soho.js"></script>
<script src="ds/mosaik/components/bundle.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>body{margin:0}</style>
</helmet>
<x-import component-from-global-scope="Mosaik.MosaikThemeProvider" theme="soho" mode="{{mode}}">
<div data-theme="{{mode}}" style="min-height:100vh;background:var(--mosaik-scheme-background);color:var(--mosaik-scheme-foreground);font:var(--mosaik-typography-body2)">
  <!-- the screen -->
</div>
</x-import>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"mode":{"editor":"enum","options":["light","dark"],"default":"light"},"$preview":{"width":1440,"height":900}}'>
class Component extends DCLogic {
  renderVals() {
    return { mode: this.props.mode ?? 'light', yes: true };
  }
}
</script>
</body>
</html>
```

- `{{ }}` is a dotted lookup, never an expression. `renderVals()` returns every boolean and number used in a hole.
- Attributes on `x-import` are kebab-case props.
- A shared shell goes in its own boards through `dc-import`, each with its own provider and `mode` passed down.

## Scripts

The README of your copy names the scripts, and its version decides. A copy made before the bundle was split has no `components/lib/mosaik-*.js`, and `bundle.js` alone is enough there.

From the split on, load these before `bundle.js`:

| Needed for | Script in `ds/mosaik/components/lib/` |
| --- | --- |
| Each theme the board uses | `mosaik-soho.js`, `mosaik-joy.js`, `mosaik-memphis.js`, `mosaik-cosmopolitan.js` |
| `Chart`, `ChartToolbox` | `mosaik-charts.js` |
| `Pendulum`, `Helix` | `mosaik-three.js` |
| `CodeEditor` | `mosaik-code.js`, and `mosaik-prettier.js` for its format command |
| `Map` | `mosaik-map.js` |
| `Spline` | `mosaik-spline.js` |

A theme script loaded after `bundle.js` has no effect. Without its theme script a component is a bare element in a serif font. Without its runtime it stays empty or shows its fallback, and the rest of the board keeps working. Updating an older copy means adding the theme script to every board.

## Setting the theme

- **A base theme:** `theme="soho"`, `"joy"`, `"memphis"` or `"cosmopolitan"`. All four render with their real anatomy. Load the matching font in `<helmet>`.
- **Overrides:** pass a merged object, created once so its identity stays stable:

  ```js
  renderVals() {
    if (!this.theme) {
      const merge = (a, b) => {
        if (!b || typeof b !== 'object' || Array.isArray(b) || !a || typeof a !== 'object') return b === undefined ? a : b;
        const out = { ...a };
        for (const key of Object.keys(b)) out[key] = merge(a[key], b[key]);
        return out;
      };
      this.theme = merge(window.Mosaik.SohoTheme.SOHO_THEME, { layout: { radius: '4px' } });
    }
    return { theme: this.theme, mode: this.props.mode ?? 'light' };
  }
  ```

  Then use `theme="{{theme}}"`. Details are in [foundations](foundations.md).
- `ds/mosaik/tokens.css` is a Soho snapshot for plain markup. The provider overwrites `--mosaik-*` at runtime, so those follow the theme. `--font-sans` and `--font-mono` come from that snapshot and stay on Soho's stack, so in other themes use `font: var(--mosaik-typography-<role>)`.
- `MosaikThemeProvider` exists only in this bundle. Product code uses `provideTheme` or `Theme2`, see [application](application.md).

## How the canvas changes components

The canvas wraps every import in a `display: contents` host and moves its `style` attribute onto a wrapper. From that follow most traps:

- `style` on `x-import` only places and sizes the outer slot. Inline custom properties never reach the component.
- Containers that read direct children see only the hosts, so items must be raw elements inside an imported container.
- Parts that normally assign their own slot do not do so here, so write the `slot` attribute on every raw part.
- `::slotted()` rules of a parent do not reach imported children.

## Mounting by need

| Need | Use | Notes |
| --- | --- | --- |
| Button | `Mosaik.Button` `label` `variant` `appearance` `size` `icon` `on-click` | |
| Button that navigates | `<a href="X.dc.html" style="display:inline-flex;text-decoration:none;color:inherit"><div style="display:flex;pointer-events:none"><x-import …Button…></x-import></div></a>` | A Button directly inside `<a>` swallows the click |
| Text link | `Mosaik.Anchor` `href` `label` | |
| Status pill | `Mosaik.Badge` `label` `variant` `appearance="soft"` | |
| Toggle pill | `Mosaik.Chip` `label` `is-checkable="{{yes}}"` `is-checked` `on-toggled` | |
| Text field | `Mosaik.Textbox` `label` `value` `on-input`, read `event.target.value` | With `label` set, `placeholder` shows only on focus. When it must be visible, use a plain `span` label plus `aria-label`. |
| Multi-line | `Mosaik.Textbox` `multiline="{{yes}}"` `multiline-rows="{{three}}"` | |
| Number | `Mosaik.Numberbox` `label` `value` `min` `max` | |
| Secret | `Mosaik.Passwordbox` `label` `value` `revealable="{{yes}}"` | |
| Search | `Mosaik.Searchbox` `placeholder` `size="small"` | `style` max-width has no effect, wrap it in a sized `div` |
| Dropdown | `Mosaik.Select` `label` `value` `on-selection-changed`, with raw `<mosaik-select-item value="a" label="A" is-selected="true">` | Read `event.target.value` |
| Slider | `Mosaik.Slider` `min` `max` `step` `value` `on-range-value-changed` | Whole numbers only: a fractional step ignores the start value. Scale instead, 0 to 10 for 0.0 to 1.0. No visible label, add a `span`. |
| Progress | `Mosaik.ProgressBar` `min` `max` `value` | Always pass `min` and `max` |
| Segmented control | `Mosaik.Segment` with raw `<mosaik-segment-item label="All" is-checked="{{f.on}}" onClick="{{f.pick}}">` | |
| Tabs | A `flex:none` column `div` around `Mosaik.TabStrip` `has-indicator="{{yes}}"`, with raw `<mosaik-tab-strip-item label is-selected onClick>` | Without the wrapper the strip stretches tall in a flex column |
| Tabs to other boards | Inside the strip: `<a href="X.dc.html" style="display:contents;…"><mosaik-tab-strip-item …></a>` | |
| Radio cards | `Mosaik.ChoiceGroup` `on-choice-changed`, read `event.target.value`, with raw `<mosaik-choice label additional value is-checked>` | `onClick` on a raw `mosaik-choice` does not fire |
| Switch | `Mosaik.ToggleSwitch` `label` `is-checked` `on-checked` `on-unchecked` | |
| Checkbox | `Mosaik.Checkbox` `label` `is-checked` `on-checked` `on-unchecked` | |
| Icon | `Mosaik.Icon` `icon` `size="small"` | See the icon names below |
| Key hint | `Mosaik.Kbd` with the keys as children | |
| Status dot | `Mosaik.Dot` `variant` `fill="full"` | |
| Inline notice | `Mosaik.Message` `variant` `header` `content` | |
| Collapsible | `Mosaik.Expander` `header` `is-expanded` with children | |
| Navigation row | `<a href="X.dc.html" style="display:block;…"><mosaik-menu-item label icon is-active></a>` | |
| Selectable list row | `Mosaik.List` with raw `<mosaik-list-item is-selected="{{row.on}}" onClick="{{row.pick}}">` and rich children | Selection paints on its own. `row.on` is `true` or `undefined`. |
| Any rich clickable area | `Mosaik.Clickable` `on-click` `aria-label` with the content as children | Has its own padding. Remove it in `<helmet>` when it wraps a laid-out row: `mosaik-clickable{--clickable-padding-top:0;--clickable-padding-right:0;--clickable-padding-bottom:0;--clickable-padding-left:0}` |
| Clickable tile | `Mosaik.Tile` with children | |
| Radio | `Mosaik.Radio` `label` `is-checked` | A raw `mosaik-radio` in a `RadioGroup` does not show as checked |
| Color choice | `Mosaik.ColorSwatch` `value` `name` `is-checked` `on-click` | `value` takes a token: `var(--mosaik-color-secondary-200)` |
| Dialog | `Mosaik.Dialog` `is-open` `has-backdrop` `width` with raw parts, see below | |
| Card, panel | `Mosaik.Card` with raw parts, see below | Text only: its props `header`, `sub-header`, `content` |
| Page section with a title | `Mosaik.Toolbar` `title`, with raw `<mosaik-button slot="end" …>` | |

## Icon names

Unknown names render nothing, without an error. The provider registers Mosaik's Reicon set and these aliases, so prefer them:

`add`, `arrowRight`, `azureDevOps`, `board`, `bot`, `branch`, `checkCircle`, `checkmark`, `checkmarkCircle`, `chevronLeft`, `chevronRight`, `claude`, `clear`, `clipboardTask`, `comment`, `cloudArrowRight`, `copy`, `delete`, `disconnect`, `download`, `edit`, `error`, `errorCircle`, `executionOutline`, `eyeShow`, `filter`, `flow`, `folder`, `folderOpen`, `games`, `github`, `homeOutline`, `info`, `leaderboard`, `mic`, `open`, `openai`, `panelLeft`, `panelLeftContract`, `panelRight`, `panelRightContract`, `person`, `play`, `save`, `search`, `settings`, `skills`, `sparkle`, `sync`, `warning`, `weatherMoon`, `weatherSunny`.

## Tables

Only through `x-import` and with `columns`. A raw `mosaik-table` stacks its cells.

```html
<x-import component-from-global-scope="Mosaik.Table" columns="minmax(0, 1fr) 120px" appearance="plain">
  <x-import component-from-global-scope="Mosaik.TableHeader"><x-import component-from-global-scope="Mosaik.TableHeaderRow">
    <x-import component-from-global-scope="Mosaik.TableHeaderCell" text="Key"></x-import>
    <x-import component-from-global-scope="Mosaik.TableHeaderCell" text="State"></x-import>
  </x-import></x-import>
  <x-import component-from-global-scope="Mosaik.TableBody">
    <sc-for list="{{rows}}" as="row" hint-placeholder-count="5">
      <x-import component-from-global-scope="Mosaik.TableBodyRow" on-click="{{row.pick}}" is-selected="{{row.on}}">
        <x-import component-from-global-scope="Mosaik.TableBodyCell" text="{{row.key}}"></x-import>
        <x-import component-from-global-scope="Mosaik.TableBodyCell"><x-import component-from-global-scope="Mosaik.Badge" label="Pass" variant="success" appearance="soft"></x-import></x-import>
      </x-import>
    </sc-for>
  </x-import>
</x-import>
```

Row hover and selection do not reach the cells, because the host between row and cell blocks `::slotted`: only the single hovered cell tints, and `is-selected` paints nothing. Put this rule in `<helmet>` on every board with a table:

```css
mosaik-table-body-row:hover mosaik-table-body-cell{--table-body-cell-state-color:color-mix(in oklab,var(--mosaik-color-neutral-100) 50%,transparent);--table-body-cell-state-opacity:1}
mosaik-table-body-row[aria-selected="true"] mosaik-table-body-cell,mosaik-table-body-row[is-selected="true"] mosaik-table-body-cell{--table-body-cell-state-color:var(--mosaik-color-neutral-100);--table-body-cell-state-opacity:1}
```

Do not add `selection-mode` when the board owns the selection state, because the table then toggles rows on its own.

## Raw item attributes

On raw `mosaik-*` elements any attribute value counts as true, including `"false"`. Pass `true` or `undefined` from `renderVals()`: `on: active ? true : undefined`.

## Cards and dialogs

Both take raw parts with their `slot` attributes. Without `slot` the parts stay invisible, and imported parts (`Mosaik.CardContent`) render empty even with one.

```html
<x-import component-from-global-scope="Mosaik.Card">
  <mosaik-card-header slot="header" text="Title" sub-text="Subtitle"></mosaik-card-header>
  <mosaik-card-content slot="content"><!-- rich content --></mosaik-card-content>
  <mosaik-card-actions slot="actions"><!-- buttons --></mosaik-card-actions>
</x-import>
```

A plain `<div slot="content">` works as well, when the padding of `mosaik-card-content` is unwanted.

- **Action in the header:** put it in `slot="suffix"` of the raw `mosaik-card-header`.
- **Tinted or selected:** `appearance="soft"` gives the muted surface, `is-selected="{{p.selected}}"` the selected one. Pass `true` or `undefined`.
- **Equal heights in a row:** wrap the import in a flex column and let it grow, because the host between them is `display: contents`:

  ```html
  <section aria-label="Title" style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column">
    <x-import component-from-global-scope="Mosaik.Card" style="flex:1 1 auto;display:flex;flex-direction:column;min-width:0">…</x-import>
  </section>
  ```

  Add `mosaik-card{flex:1 1 auto}mosaik-card::part(content){flex:1 1 auto}` to `<helmet>`.
- **Dense screens:** Soho's card is generous, with 24px around its parts. Component tokens change that for one board, in `<helmet>`: `mosaik-card{--card-padding-bottom:0}` and `--card-header-padding-*` on `mosaik-card-header`. They do not work inline on `x-import`.

```html
<x-import component-from-global-scope="Mosaik.Dialog" is-open="{{yes}}" has-backdrop="{{yes}}" width="720px" click-outside-to-close="{{no}}" press-escape-to-close="{{no}}">
  <mosaik-dialog-header slot="header">
    <mosaik-dialog-header-text slot="header" text="Title"></mosaik-dialog-header-text>
    <mosaik-dialog-header-sub-text slot="subHeader" text="What this does."></mosaik-dialog-header-sub-text>
  </mosaik-dialog-header>
  <mosaik-dialog-content slot="content"><!-- rich content, imports allowed --></mosaik-dialog-content>
  <mosaik-dialog-actions slot="actions"><!-- buttons --></mosaik-dialog-actions>
</x-import>
```

Give a dialog its own board, and keep it open there.

## Bundle version

Everything here was tested with the 0.1.185 bundle. These traps are fixed in the Mosaik source after that version, so drop the workaround once the Design System bundle is newer: the `Textbox` placeholder with a label in Soho, `"false"` on raw items, `onClick` on a raw `mosaik-choice`, a raw `mosaik-radio` not showing as checked, fractional `Slider` steps, and the table rule in `<helmet>`.

## What was tested

Read a component's documentation before you judge it. In the first test run, about half of the components that looked broken only had a wrong prop: `ColorSwatch` takes `value` rather than `color`, `Disclosure` takes `summary`, `Stepper` items take `header`, `Paginator` takes `total` and `rows`.

**Works:** Actionbar (raw group and items), Anchor, Autocompletebox, Avatar, Badge, Banner (`header`, `sub-header`, `variant`), Breadcrumb (raw items), BusyState, Button, ButtonGroup (imported Buttons), Card (props, or raw parts with `slot`), Cell (`label`, raw children in `slot="end"`), Checkbox, Chip, Chipbox, ChoiceGroup, Clickable, Code, Colorbox, ColorSwatch, Combo (raw items), CompoundButton (`label`, `icon`), Datebox, Dialog, Disclosure (`summary`), Divider, Dot, DropdownButton, DropZone (children in its default slot), EmptyState, ErrorState, Expander, Filebox, Hint, Icon, Kbd, List (raw items with rich children), Menu (raw items), Message, MeterBar, Numberbox, Paginator (`total`, `rows`, `show-page-links`), Passwordbox, Persona, ProgressBar, ProgressRing, Radio, Searchbox, Segment, SegmentBar (`max`, raw items), Select, Slider, SplitButton, Stepper (raw items with `header`, `description`), SuccessState, Tab (raw `mosaik-tab-item` with panel children), TabStrip, Table, Text, Textbox, Tile (children), Timebox, Timeline (raw items with `slot` on marker, content and opposite), ToggleButton, ToggleSwitch, Toolbar (`title`, raw children in `slot="end"`), Tooltip (around a Button), Tree (raw items).

**Works since the split:** Chart (`display`, `series`, `height`), CodeEditor (`language`, `value`), Helix, Pendulum (`src`). On a canvas Map reports that it could not load its resources, and Spline needs a reachable scene file or shows its fallback.

**Renders incompletely:** ColorSwatchGroup (raw swatches overlap, so use a flex row of imported swatches), RadioGroup (raw `is-checked` and group `value` show nothing as checked).

**Renders empty on a canvas:** Card with children that have no `slot`, imported Card parts, raw `mosaik-card`, Timeline items without `slot`.

**Not tested:** Drawer, Sheet, Toast, Page and App with their documented slots, Skeleton. Try anything else on a small test board first, and add what you learn to your report.

## What stays plain markup on a canvas

- Layout: flex and grid `div`, `main`, `section`, `aside`, `nav`
- Headings and helper text: `h1`, `h2`, `p`, `span` with `font:var(--mosaik-typography-<role>)`
- Technical values and logs: `code`, `pre`
- Diagrams and data marks that are not progress

## Conventions

No hex colors, no emoji, no overriding of component internals. Each board carries `mode` in `data-props`, and the checker's `row-state-rule` warns when the table rule above is missing.

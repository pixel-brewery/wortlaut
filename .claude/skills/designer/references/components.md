# Components

Which Mosaik component answers which need, and the rules they share. Names are the React and canvas exports; the tag is `mosaik-` plus the kebab-case name (`ToggleSwitch`, `mosaik-toggle-switch`). Mosaik 0.1.185 has 383 components, so search before concluding that something is missing: `search_components`, `find_similar_components`, `get_component_docs`. These names route the search; verify the actual export, tag, props and slots against the installed package and configured MCP catalog before use.

Every available semantic role in the table uses its real component, including noninteractive surfaces and status. A token-styled `div` Card, `span` Badge, plain message or hand-painted loading state fails the same rule as a native button. Trace framework aliases and local feature wrappers to their Mosaik composition. A count or prefix is not provenance; unknown components and unresolved wrappers remain findings. Follow [compliance](compliance.md) for the permitted plain-markup boundary.

## By need

| Need | Component |
| --- | --- |
| Action | `Button`, `CompoundButton`, `SplitButton`, `DropdownButton`, `ToggleButton`, `ButtonGroup`, `ToggleButtonGroup`, `Fab`, `RepeatButton` |
| Link | `Anchor` |
| Text input | `Textbox`, `Passwordbox`, `Searchbox`, `Richtextbox`, `Pinbox` |
| Number, date and time | `Numberbox`, `Datebox`, `Timebox`, `Datetimebox`, `Durationbox`, `Calendar` |
| Choosing one or more | `Select`, `Combo`, `Autocompletebox`, `Chipbox`, `Checkbox`, `CheckboxGroup`, `Radio`, `RadioGroup`, `Choice`, `ChoiceGroup`, `ToggleSwitch`, `Segment` |
| Range | `Slider`, `Slider2`, `Knob`, `Rating`, `ScrubSlider` |
| File and color | `Filebox`, `FileUpload`, `FilePicker`, `DropZone`, `Colorbox`, `ColorPicker` |
| Form | `Form`, `FormField` |
| Application frame | `App`, `AppHeader`, `Page`, `PageHeader`, `PageContent`, `Footer` |
| Navigation | `Menu`, `MenuItem`, `Tab`, `TabStrip`, `Breadcrumb`, `Stepper`, `Wizard`, `Paginator`, `Tree`, `Toolbar`, `Actionbar` |
| Tabular data | `Table` and its parts, `DataList`, `Paginator` |
| Lists | `List`, `Listing`, `Timeline`, `TileList` |
| Surfaces | `Card` and its parts, `Tile`, `Cell`, `Expander`, `Region`, `Divider` |
| Identity | `Avatar`, `AvatarGroup`, `Persona` |
| Status and labels | `Badge`, `Chip`, `Dot`, `Indicator`, `Ribbon` |
| Progress | `ProgressBar`, `ProgressRing`, `MeterBar`, `MeterRing`, `SegmentBar`, `SegmentRing`, `Gauge`, `Skeleton` |
| Feedback | `Message`, `Banner`, `Toast`, `MessageBox`, `Hint`, `Tooltip`, `Toggletip` |
| Whole-area states | `EmptyState`, `ErrorState`, `SuccessState`, `BusyState` |
| Overlays | `Dialog`, `Drawer`, `Sheet`, `Popup`, `Dropdown`, `Tour` |
| Content | `Text`, `Icon`, `Image`, `Code`, `Kbd`, `Illustration`, `Chart` |
| Chat and prompts | `Chat`, `ChatMessage`, `PromptBox`, `ChatPromptBox` |
| Scheduling and boards | `Scheduler`, `FlowBoard`, `Flow`, `TileManager` |

## Shared vocabulary

| Prop | Values |
| --- | --- |
| `variant` | `default`, `primary`, `secondary`, `tertiary`, `danger`, `warning`, `success`, `info`, `neutral`, `highlight` |
| `appearance` | `default`, `outline`, `plain`, `soft`, `solid` |
| `size` | `tiny`, `small`, `medium`, `large`, `giant` |
| `elevation` | `none`, `light`, `semilight`, `regular`, `semibold`, `bold`, `extrabold` |

`size` and `elevation` are names. A number is silently invalid. Not every component takes every prop, so read its documentation.

## Composition rules

These fail silently, which makes them easy to miss:

1. **Text goes through attributes, not children.** `label` on Button, Checkbox, Radio, Chip, Badge, ToggleSwitch, MenuItem, Textbox, Select. `text` on Text, Avatar, CardTitle. `header`, `sub-header` and `content` on Card, Banner, Message, Expander and the state components. A bare child no slot takes disappears.
2. **Containers need their parts.** A `Card` projects `CardHeader`, `CardContent`, `CardActions` and `CardFooter`, and a button placed directly inside it disappears.
3. **`Text` has no typography prop.** Semantic headlines are plain elements with the exact `font: var(--mosaik-typography-headline3)` role. Do not layer local weight, tracking or line-height adjustments over it.
4. **`icon` is the icon name on every component.** A name that is not registered renders nothing, without an error.
5. **Layout is native CSS.** `Stack` is deprecated, even where older documents or catalog recipes still use it. Take a recipe's anatomy and rebuild its layout natively.

## Traps

- `Tab` hides its header with fewer than two `TabItem`s, and an unselected `TabItem` is hidden, so select one.
- `ProgressBar` defaults to a maximum of 1. Pass `min` and `max`.
- `Skeleton` paints nothing without `shimmer`.
- `Numberbox` wants a number as `value`, `Datebox` a `Date`.
- `onChanged` is the generic property-change event, not a value change. Use the events the component documents.
- A `Textbox` with `label` shows its `placeholder` only on focus.

## Where the truth is

The component's own documentation, through `get_component_docs` and `lookup_component_api`. In the Mosaik repository: `apps/frontend/mosaik-showcase/llms/mosaik-<tag>.md`. In the Design System artifact: `components/<Name>/README.md` and `components/index.d.ts`.

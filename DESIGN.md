# Wortlaut interface foundations

- Theme: Soho, from `provideWortlautDesign` and the existing frontend contract.
- Modes: light and dark, following the system or the saved application preference.
- Primary color, type and shape: the unmodified Soho theme; its Inter font, spacing,
  radius and stroke tokens remain authoritative.
- Product language: English, from the project contract.
- Surface: native Electron desktop application, with standalone Angular views and
  the installed public Mosaik Angular components.

## Workspace and project setup

The workspace list keeps identity, repository, project facts and actions together.
The creation form separates identity, color and repository selection. Its action
stays visible while the list and form content have their own bounded scroll areas.
Workspace accent colors are user data: nine Tailwind600 presets
or a custom opaque RGB color selected through Mosaik. They do not override the app theme.
ColorBox owns the custom HEX draft and opens an RGB editor. This preserves six-digit
typing while [Mosaik's HEX popup edit defect](https://github.com/RueDeRennes/mosaik/issues/1199)
is pending upstream.

Custom header and footer content fills its Card slot, so the associated divider spans
the full inner width. Static card content allows native scroll chaining to the view
or list around it. Only actual scroll owners contain overscroll: the setup content,
workspace list, creation form and modal language list. There is no global wheel
handler or containment rule on every Card.

Removing a saved workspace requires a completed Mosaik PressButton hold followed by
a Mosaik MessageBox confirmation whose initial action is Cancel. Removal concerns
the saved workspace in Wortlaut; repository folders and files remain intact.

Project setup keeps a side stepper and a persistent action footer. The three steps
group source configuration and catalogs, base and target languages, then optional
AI connections. Local assistants and API-key providers are separate choice groups
with registered Mosaik provider icons and actual connection state.
The public ChoiceGroup root part owns the provider grid; local choices stack in
compact windows, while wide layouts show three local and two API choices.

Native folder selection uses a real Mosaik FileBox with its public suffix slot and
a Mosaik browse action. Main opens the native dialog and retains the filesystem
grant; the renderer sends only opaque folder tokens. The FileBox's built-in browser
file input is readonly and its public browse part is hidden, so one action opens
one native dialog. Repository configuration remains the source of truth.

The target-language Plus button opens a searchable, multiple-selection Mosaik
dialog. Search and actions stay visible while only the language list scrolls.
Cancel and Escape discard the draft. Existing locale identifiers, including regional
codes, are preserved; choosing a new language creates no translation file.
The 184 offered ISO languages have portable English names when the desktop runtime
does not provide them through `Intl.DisplayNames`.
The target list starts with detected catalog locales and explicitly added targets.
Unselected language suggestions do not create cards; the empty state points to Plus.

## Language identity

Structured locale labels and language choices use the rounded Reicon flag assets
from the installed `@pixel-brewery/mosaik-icons/reicon/flags` package, alongside
the existing textual name and locale code. The flag is decorative. Explicit regions
are retained; language-only identifiers use a representative region, with GB for
English and PT for Portuguese. Unknown, non-country and unsupported regions keep
their text without a substitute country flag. Script variants follow the locale's
likely region. Catalog identifiers and persisted settings remain unchanged.

The shared UI owner maps supported ISO regions to actual Mosaik definitions and
registers stable aliases for controls whose icon input requires a string. Selects
use the public icon slot for options and the prefix slot for the selected value.
Reicon paths without a fill keep SVG's intrinsic black through the public symbol
and icon parts, so dark mode does not recolor national flags.

The Mosaik MCP catalog was unavailable for this addition after an availability
retry. The installed 0.1.187 Icon, Select, SelectItem, Chip, Badge and Segment APIs
and Soho tokens supplied the component evidence. No new Studio tree was authored.

Language identity passed `yarn verify`; the final label and list wrapping refinements
also passed the renderer build. The application checker inspected 215 files with
zero errors, warnings or exceptions. Framework mode does not count components;
source inspection found 506 Mosaik elements across the 12 modified existing
templates and one in the new shared locale label.

Native checks inspected locale labels in Overview, Translations, Analyze, Generate
setup, Test Translation, Workspace/Project/AI settings and Projects in light and
dark modes, including regional identifiers and an unknown code without a flag.
Setup's empty target state and German/French picker selection were exercised in
dark mode. Widths of 1440 and 1800 CSS pixels were inspected. These are focused
checks of language identity, not a repeat of every workflow. A completed Generate
run and live AI inference were not exercised natively; the former retains its
presenter test coverage. No user catalog change was applied.

## Catalog references

The Mosaik MCP server informed this implementation with `template-onboarding`
(Workspace page), `recipe-onboarding-wizard` and its options, the Angular framework
guide, and documentation for FileBox, Stepper, Choice, PressButton, MessageBox,
ColorBox, ColorPicker, ColorSwatchGroup and Dialog. The recipe's composition is adapted to
native CSS grid/flex instead of its deprecated `mosaik-stack` markup. No Studio
IElement tree is produced, so Studio tree validation does not apply.

Use the Pixel Brewery `designer` skill's application checker and the repository
verification commands, then inspect the changed screens in both modes and at
compact and wide desktop sizes. Static checking alone is not interaction evidence.

## Verified scope

The application checker reports zero errors, warnings and exceptions for the three
authored onboarding templates. Its framework mode does not count component use;
source inspection counts 86 Mosaik elements across those templates.

Local verification includes `yarn verify`, native package verification on macOS
arm64, and the built and packaged desktop acceptance runner. The runner exercises
15 views in both color modes, real wheel input over workspace cards at wide and
compact sizes, and hold/cancel/confirm removal with repository-byte preservation.
Native onboarding checks cover folder selection and cancellation, inferred and
chosen source roots, language names/search/multiple selection/reopening/cancellation,
list scrolling with fixed search/actions, provider selection with keyboard and
cross-group changes, and custom HEX entry/RGB picker persistence. These checks
do not exercise real provider login or inference.

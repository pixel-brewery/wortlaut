# Foundations

How to set theme, color, type and shape, and how to record them. Read this before overriding a value.

## The model

Mosaik is one token vocabulary with several value sets. Only the names are fixed. A product picks a base theme and overrides values, and every component follows because components read tokens, never literals. A product adds neither tokens nor component anatomy.

Consumers use the `--mosaik-*` custom properties. Never address a theme by its own prefix such as `--joy-*`, because that breaks when the theme changes. Tokens govern real components; they do not authorize rebuilding a Card, Badge or another semantic UI role in plain markup. Apply [the component and layout boundary](compliance.md).

Each theme also carries its own component anatomy, not only its values. A Soho `Textbox` has its label above the field, a Joy `Textbox` floats it inside. Memphis and Cosmopolitan uppercase some labels. Changing the base theme therefore changes more than colors, so choose it first and check the result on screen.

## The theme object

Verified against Mosaik 0.1.185:

| Key | Content |
| --- | --- |
| `name` | Selects the component anatomy. Keep it: overrides must not change it. |
| `fontFamily` | The base font stack |
| `layout` | `radius`, `space`, `thickness` |
| `scheme.light`, `scheme.dark` | `surface`, `contrast`, `background`, `foreground`, `highlight`, `middlelight`, `lowlight`, `transparent`, `semiTransparent`, `disabled`, `selection` |
| `palette.light`, `palette.dark` | `primary`, `secondary`, `tertiary`, `info`, `warning`, `danger`, `success`, `highlight`, `neutral`, each a ramp with the steps `0`, `50`, `100` to `900` |
| `typography` | Roles `headline1` to `headline6`, `subtitle1`, `subtitle2`, `body1`, `body2`, `button`, `caption`, `overline`, `supporting` |
| `elevation` | `light`, `semilight`, `regular`, `semibold`, `bold`, `extrabold` per mode |
| `duration` | `short`, `medium`, `long` |

The base themes are exported as `SohoTheme.SOHO_THEME`, `JoyTheme.JOY_THEME`, `MemphisTheme.MEMPHIS_THEME` and `CosmopolitanTheme.COSMOPOLITAN_THEME` from `@pixel-brewery/mosaik-themes`.

## Overriding values

An override is a partial theme, deep-merged onto the base. Change as little as the brief needs.

```ts
const overrides = {
  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
  layout: { radius: '6px' },
  palette: {
    light: { primary: { /* full ramp, 0 to 900 */ } },
    dark: { primary: { /* full ramp, 0 to 900 */ } },
  },
};
```

Tested on a canvas with a Soho base: `fontFamily`, `layout.radius`, `layout.thickness` and `palette.light.primary` all take effect at runtime.

### Color

- **There is no `scheme.primary`.** The primary color lives in `palette.<mode>.primary`, and step `500` is the core value.
- Override the whole ramp in both modes. Components use several steps for hover, pressed and soft fills, and a partial ramp leaves the old color in those states. The `create_theme` guide of the MCP server describes how to derive a ramp, including the dark-mode inversion.
- Check contrast when you set a color: text on a solid primary needs at least 4.5:1, in both modes. A base theme's own values are not yours to work around. Joy's white on `#e91e63` is 4.35:1, for example: keep solid primary actions and report it as a finding.
- Look at how the base theme uses its ramp before you promise an exact color. Cosmopolitan fills labelled controls with step `700` and darkens to `800` on hover, in both modes, so a brand color at step `500` appears on buttons only if you shift the ramp. Say so in your report.
- Reversing the light ramp is the default recipe for dark mode, and Joy works that way. Soho, Memphis and Cosmopolitan tune their dark ramps by hand, so read the base theme's `palette.dark.primary` first and build yours the same way.
- `scheme.selection` does not follow the primary color. Cosmopolitan keeps a fixed cyan there, so a new primary usually needs a matching `scheme.<mode>.selection`.
- `danger`, `warning`, `success` and `info` mean status. Do not spend them on branding.
- Do not tint chrome with the primary color. Borders, shadows and page backgrounds stay neutral, and the primary marks actions.
- One solid primary action per view.

### Fonts

- Setting `fontFamily` alone does not reach everything. In the test above, button labels and some control labels stayed in the base font, because each typography role carries its own font family. To change the font completely, also set the family on the `typography` roles, then check buttons and labels on screen.
- Nothing in a theme ships a `@font-face`, so always load the font. On a canvas, Google Fonts is the only allowed host.
- Theme fonts to load: Soho `Inter`, Joy `Nunito`, Memphis `Space Grotesk`, Cosmopolitan `Noto Sans` (`Segoe UI` where installed).
- In semantic headings/body text use the exact `font: var(--mosaik-typography-body2)` or other role shorthand. It follows the theme. Do not restyle the role locally with separate font-family, weight, tracking or line-height choices; a requested typography change belongs to the maintained theme source.

### Shape and spacing

| Token | Effect | Sensible range |
| --- | --- | --- |
| `layout.radius` | Rounds every surface | 0 to 2px crisp, 4 to 8px neutral, 10 to 12px soft |
| `layout.thickness` | Width of borders, dividers and indicators | 1px hairline, 2px strong. More is a deliberate brand statement. |
| `layout.space` | Base unit of every padding, gap and margin | 8px default, 10px chunky. It scales the whole interface, so change it last. |

Component sizes are the names `tiny`, `small`, `medium`, `large` and `giant`, never numbers. A layout `gap` uses the same names (2, 4, 8, 16, 32px) or a length built from `--mosaik-layout-space`.

### Tokens at the consumption boundary

- The document baseline uses `var(--mosaik-scheme-background)` and `var(--mosaik-scheme-foreground)`. Semantic text can use the documented foreground/secondary-text token with its exact typography role.
- Layout uses `var(--mosaik-layout-space)` and the matching Tailwind preset. A theme's radius, thickness and elevation values belong to its real component appearance; do not copy them onto a plain panel.
- Semantic headings/body text use `var(--mosaik-typography-<role>)` as the exact `font` shorthand.
- Colors passed to documented Mosaik data props, such as a palette value in a ColorSwatch specimen, remain domain data. Scope them to that preview; they do not recolor app chrome or status states.

Use the actual Card, Divider, Badge and state components for surfaces, separators and feedback. Even a perfectly tokenized CSS reconstruction violates the component boundary. Requested theme changes flow through the maintained theme source and its generator/browser checks.

## A completely new theme

Overrides cover almost every brand. Only if the base anatomy still fights the brief, follow the MCP pipeline in this order: `get_token_schema`, `create_theme`, `get_theme_examples`, `validate_theme`.

## Recording the foundations

In a repository, `DESIGN.md` is the record and `tools/design-md.config.json` drives it:

```json
{
  "name": "Example on Mosaik Soho",
  "description": "Light-mode value snapshot of the theme this product renders.",
  "base": "soho",
  "overrides": { "kind": "module", "path": "src/theme/overrides.ts", "export": "themeOverrides" }
}
```

Use the project's existing generator scripts and installed version. When the installed package exposes the binary directly, the equivalent commands are:

```bash
yarn exec mosaik-design-md generate --config tools/design-md.config.json
yarn exec mosaik-design-md check --config tools/design-md.config.json
```

Do not install `@latest`, add a second theme dependency or change the lockfile merely to generate documentation. If the generator is absent, report that tooling gap and preserve the existing authored record; dependency changes require their own task scope.

The generator seeds the prose from the base theme and later rewrites only the generated regions. Add a short "Foundations" section with the decision list from Step 1, because the reasons are what a later session needs.

On a canvas without a repository, add the decision list as a canvas note and keep the values in the provider.

## Where the details are

Each theme ships two documents in `@pixel-brewery/mosaik-themes`, under `design/<theme>/`: `DESIGN.<theme>.md` for the rules and the anatomy, `COMPONENTS.<theme>.md` for every component token with its resolved value. When sources disagree, the token sources win over the compiled artifacts, and those win over the documents.

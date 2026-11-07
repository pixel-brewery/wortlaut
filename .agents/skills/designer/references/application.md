# Application code

Mosaik in real code. Get the current starting point from the MCP server (`get_framework_guide`, `get_starter_template`, `get_inline_boilerplate`) and use this page for what those do not decide.

## Packages

| Purpose | Package |
| --- | --- |
| Web components, for Lit and plain pages | `@pixel-brewery/mosaik-elements-foundation` |
| Framework wrappers | `@pixel-brewery/mosaik-elements-angular`, `-react`, `-vue`, `-svelte` |
| Themes, tokens, `mosaik-design-md` | `@pixel-brewery/mosaik-themes` |
| Icons | `@pixel-brewery/mosaik-icons` |

## Activating the theme

Three things must be in place before components render, and each fails without an error:

1. **The theme must be applied before element modules evaluate.** A component picks its stylesheet when its class is finalized. Without an applied theme it renders as a bare shadow-DOM element in a serif font.
2. **The font must be loaded.** No theme ships a `@font-face`.
3. **Icons must be registered.** Mosaik ships no icons by default:

   ```ts
   import { ReiconAliases } from '@pixel-brewery/mosaik-elements-foundation/icons/reicon';
   import { IconRegistry } from '@pixel-brewery/mosaik-icons';

   IconRegistry.instance.registerSet('reicon', ReiconAliases);
   IconRegistry.instance.setDefaultSet('reicon');
   ```

   Controls use icons internally as well: `Select` needs `chevron-expand-y`, `Timebox` needs `clock` and `clear`. If they are not registered, those symbols stay empty without an error.

Also set a page font and background, because your own markup otherwise renders in the browser default:

```css
body {
  font: var(--mosaik-typography-body2);
  color: var(--mosaik-scheme-foreground);
  background: var(--mosaik-scheme-background);
}
```

### Angular

```ts
import { provideTheme } from '@pixel-brewery/mosaik-elements-angular';
import { SohoTheme } from '@pixel-brewery/mosaik-themes';

provideTheme({ theme: SohoTheme.SOHO_THEME, overrides: themeOverrides, mode: 'light' });
```

`overrides` is typed as `ThemeOverride`, a deep partial without `name`.

### React and other wrappers

```ts
import { ThemeService } from '@pixel-brewery/mosaik-elements-foundation';

ThemeService.configure({ defaultTheme: theme, defaultThemeMode: 'light', autoInitialize: false });
ThemeService.instance.initialize();
```

```tsx
<Theme2 theme={theme} global>{/* the application */}</Theme2>
```

`global` is required: overlays render through a portal outside the component tree and escape the theme scope without it. `MosaikThemeProvider` exists only in the Design System bundle for canvases, not in the packages.

### A standalone page

```html
<html lang="en" theme="soho" theme-mode="light">
  <head>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <script type="module">
      import { SohoTheme, ThemeObserverServiceLocator } from 'https://esm.run/@pixel-brewery/mosaik-themes';
      const root = document.documentElement;
      ThemeObserverServiceLocator.current.applyTheme(root.getAttribute('theme') ?? 'soho', root.getAttribute('theme-mode') ?? 'light');
      await customElements.whenDefined('mosaik-theme2');
      document.querySelector('mosaik-theme2').theme = SohoTheme.SOHO_THEME;
    </script>
    <script type="module" src="https://esm.run/@pixel-brewery/mosaik-elements-foundation"></script>
  </head>
  <body>
    <mosaik-theme2>
      <mosaik-button label="Save" variant="primary" appearance="solid"></mosaik-button>
    </mosaik-theme2>
  </body>
</html>
```

Replace the theme name and the font for the other themes. See [foundations](foundations.md) for the font of each theme.

## Writing screens

- Use the framework's Mosaik wrappers for every available semantic UI role, including Card parts, Badge, Message and state components as well as controls. Trace aliases and local feature wrappers to their actual imports and rendered composition; see [components](components.md) and [compliance](compliance.md).
- Own CSS and Tailwind arrange layout. A token-painted card, divider or badge is still a handmade replacement. Plain headings/body text may bind the exact Mosaik typography role; do not add local weight, tracking or line-height overrides.
- Component tokens (`--<component>-<token>`) are appearance API, not layout. A requested appearance change belongs to the maintained theme/component owner and its documented API and verification. Do not reset component anatomy/padding through utility-class custom properties or imitate another theme with local overrides.
- With Tailwind, use the preset `@pixel-brewery/mosaik-themes/tailwind/v4/<theme>` for layout utilities, and keep its spacing equal to `layout.space`, because `mosaik-design-md` fails on a mismatch.

## Verifying

Run the checker with `--app` on the affected UI owner, including templates, inline templates and owning CSS/SCSS. It follows supported local component/template/style references and reports unverifiable dynamic construction or provenance; include all remaining style owners explicitly. Resolve violations and disclose scope it could not inspect. The bundled component snapshot is versioned: a newer name needs verified catalog maintenance, not an exception comment.

Run the project's existing build and UI checks and use the screen in a browser in both modes. Inspect the actual theme and Tailwind preset configuration; a static component count does not prove those are active. If the project maintains `DESIGN.md`, use its established installed-generator check after visual changes and regenerate only when maintained inputs changed. Do not add or upgrade packages to make a documentation command available. Complete [the evidence pass](compliance.md).

```js
// Finds components that rendered with no size, usually wrong composition.
[...document.querySelectorAll('*')]
  .filter((e) => e.tagName.startsWith('MOSAIK-'))
  .filter((e) => e.getBoundingClientRect().height === 0)
  .map((e) => e.tagName);
```

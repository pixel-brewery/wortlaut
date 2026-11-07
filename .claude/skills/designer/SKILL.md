---
name: designer
description: Design, build, redesign and review Mosaik interfaces, including screens, dashboards, forms, prototypes, themes, accessibility, responsive layout and visual polish. Apply automatically to UI work when the project uses @pixel-brewery/mosaik-* packages, Mosaik canvases or Studio trees, even when the user does not name the skill. Detect the target app, framework, surface and existing foundations before selecting guidance. Also use for new interfaces when Mosaik is selected; do not migrate unrelated design systems or activate for backend-only work.
---

# Designer

Build interfaces from the project's Mosaik foundations and real Mosaik components. This applies to the whole UI vocabulary: a handmade card, badge or loading state is a replacement even when it uses Mosaik colors and contains a real Mosaik button. Visual similarity and token use do not establish component use.

Read this before Mosaik interface work, including a new project with an interface. Keep the user's requested mode: a design question or review stays read-only unless implementation was requested. Apply the repository's local rules and architecture skill alongside this designer; it owns visual composition and interaction, while the architect owns engineering boundaries.

When a repository requires this role and MCP catalog evidence for all design decisions, compose a local Designer through [project integration](references/project-integration.md). That reference owns the identical mandatory workflow; the local skill owns the project's foundations, permitted catalog connection and runtime constraints.

## Detect and route automatically

The user does not need a slash command, framework name or theme questionnaire. Infer the task from their request in its own language, inspect the actual target and load only the relevant guides. For example, “mach das mobil nutzbar” selects responsive work; “prüfe die Bedienbarkeit” selects a read-only review.

Run the bundled read-only discovery helper from the consuming repository, replacing the skill path with its actual installation location:

```sh
python3 .agents/skills/designer/scripts/discover_design.py path/to/view --json
```

Omit the target to inspect the current directory. Use [discovery](references/discovery.md) to interpret its evidence and resolve ambiguity. Read the nearest owning application and its imports before relying on workspace-wide dependencies; a monorepo may contain every framework. Inspect the reported foundation sources; the helper locates them, it does not evaluate theme modules or decide values. Preserve generated design documents and resolve their generator/configuration owner. Apply [the component and layout boundary](references/compliance.md) before composing or reviewing the UI.

| Requested outcome | Load after discovery |
| --- | --- |
| New screen, prototype, dashboard, landing page or form | [Composition](references/composition.md), [interaction](references/interaction.md), and the surface guide below |
| Redesign, simplify, stronger or quieter presentation | [Composition](references/composition.md), preserving the existing content, navigation and workflows |
| Usability, accessibility or design review | [Review](references/review.md); read-only unless fixes were requested |
| Mobile/tablet adaptation, states, forms or motion | [Interaction](references/interaction.md) and the relevant surface guide |
| Typography, colors, theme or visual polish | [Foundations](references/foundations.md), [composition](references/composition.md), then the affected review checks |

Combine rows when the request spans them. Do not add a new framework, animation library or a second design system to satisfy a style reference.

## The three rules

1. **Foundations come first.** Settle theme, mode, color, type and shape before composing anything.
2. **Every available semantic UI role uses its Mosaik component.** This includes actions and inputs, cards and panels, badges, menus, tables and lists, feedback, overlays and empty/loading/error states, on design canvases and in product code. Native controls, clickable or role-bearing `div`s, foreign UI primitives and CSS look-alikes are out. Map the role through [components](references/components.md), then verify the component's actual import and documented API.
3. **Tailwind and plain CSS arrange the layout; Mosaik owns component appearance.** Use the Mosaik spacing preset and `--mosaik-*` layout tokens for flex/grid, spacing, sizing and responsive placement. Do not use visual utilities or copied styles to rebuild a component. Semantic headings and body text use the exact Mosaik typography role, without local font/weight/line-height adjustments to create another typography system.

Plain markup is for structural layout containers (`div`, `main`, `section`, `nav`), semantic text and technical code content under [the permitted boundary](references/compliance.md). It is not an alternative implementation of Card, Badge, Message or another existing UI component. `mosaik-stack` is deprecated, so layout is native CSS. Domain values passed to documented Mosaik props remain data; keep their preview scope separate from app appearance.

When a need seems to have no component, search the catalog and installed documentation first. Report an unresolved capability instead of silently rebuilding it. `data-mosaik-exception` and `mosaik-exception:` comments do not waive a rule. Only a noninteractive SVG/canvas illustration may declare `data-mosaik-illustration="the reason"`; it is a reported exception, never permission to replace a component or paint app chrome. See [compliance](references/compliance.md) for its limits.

## Step 1: Settle the foundations

Take each value from the first source that has one:

1. **What the user said.** This is binding, even if you would choose differently. If you see a real problem with it, name the problem once in your report and still follow it.
2. **What the project already has:** `DESIGN.md`, `tools/design-md.config.json`, `provideTheme` or `Theme2` configuration, the provider of an existing canvas. A new screen does not re-decide an existing project.
3. **Your own decision.** Consult the catalog before choosing a missing foundation, then decide from the product and its audience without a questionnaire. Follow the catalog failure boundary below. Ask only when the user's own instructions contradict each other.

| Foundation | Start from | Change it when |
| --- | --- | --- |
| Base theme | The table below | Never left open |
| Color mode | Light and dark | The brief names one mode |
| Primary color | The theme's ramp | There is a brand color |
| Font | The theme's font | There is a brand font |
| Radius, stroke, spacing unit | The theme's values | The brand or the density calls for it |
| Interface language | The user's language or the product's | The brief says otherwise |

| Theme | Character | Font | Radius, stroke, unit | Primary | Fits |
| --- | --- | --- | --- | --- | --- |
| **Soho** | White canvas, near-black primary, quiet neutrals, small soft shadows, the shadcn/ui look | Inter | 10, 1, 8 px | `#171717` | Developer tools, desktop apps, B2B products, dense data. **Take this when nothing points elsewhere.** |
| **Joy** | Warm grey canvas, soft rounded shapes, ripple, floating labels | Nunito | 12, 2, 8 px | `#e91e63` | Consumer products, portals, onboarding, anything meant to feel friendly |
| **Memphis** | Neo-brutalism: cream page, ink outlines, hard offset shadows, uppercase labels | Space Grotesk | 8, 2, 10 px | `#8b5cf6` | Creative tools, entertainment, brand experiences that want energy |
| **Cosmopolitan** | Metro: white canvas, cyan accent, light display type, uppercase buttons, hairlines, faint sheen | Segoe UI, Noto Sans | 2, 1, 8 px | `#1ba1e2` | Business applications, dashboards, content-heavy products |

Prefer a base theme as it is. Every override is a deviation all later screens inherit, so each one needs a reason the user would recognize. Read [foundations](references/foundations.md) before you override a value, create a theme or write `DESIGN.md`.

State the result before you build, with the source of each value:

```text
Foundations
- Theme: Joy (decided: consumer booking portal)
- Mode: light and dark (decided)
- Primary: #0f766e (user)
- Font: Nunito (theme)
- Shape: radius 12px, stroke 2px, unit 8px (theme)
```

For implementation or a new design, record it where it survives this conversation: an authored section of `DESIGN.md` or its maintained source in a repository, a note on the canvas when there is no repository yet. Do not rewrite generated regions. In a review, report the existing foundations without creating files.

## Step 2: Read the guide for your surface

| You are working on | Read |
| --- | --- |
| A Claude Design canvas or a `.dc.html` file | [canvas](references/canvas.md) |
| Angular, React, Vue, Svelte or Lit code, or a standalone page | [application](references/application.md) |
| Mosaik Studio or `IElement` trees | [catalog](references/catalog.md) |

## Step 3: Consult the catalog

Consult the configured `mosaik` MCP catalog before new compositions or design decisions, following [catalog](references/catalog.md), and keep the IDs and component documentation you used. The hosted HTTP server and the versioned `@pixel-brewery/mosaik-mcp` stdio package provide the public catalog; the connection guide covers installation from GitHub Packages and offline operation. Use the transport permitted by the project, compare its catalog snapshot with the installed component package version, and report the source/version consulted. A project requiring the live Beta endpoint keeps that requirement; do not silently switch to a local snapshot. If consultation fails, retry once and report the exact failure. Continue only maintenance already established by documented installed sources when local rules permit it; do not invent a new composition or API from memory. A derived skill may require the live catalog and pause all dependent design decisions on failure. Never claim a consultation that did not happen.

## Step 4: Compose from components

Use [components](references/components.md) to map each need to a component, and take props from the component's documentation rather than from memory.

Keep one solid primary action per view. Use `variant="neutral"` or `appearance="plain"` for quiet actions: `secondary`, `tertiary` and `highlight` are accents, and `danger`, `warning`, `success` and `info` mean status.

## Step 5: Verify before you call it done

1. **Run the checker on the complete affected UI owner.** Include its templates, inline templates and owning CSS/SCSS; checking only the file containing a real Mosaik button misses the surrounding handmade UI.

   ```bash
   python3 scripts/check_design.py <file-or-folder>          # canvases
   python3 scripts/check_design.py --app <owner-folder>     # application templates and styles
   ```

   The path is relative to this skill. Resolve reported violations and unsupported or unverifiable source before claiming compliance. Report the actual inspected scope, component/provenance evidence, findings and illustration declarations. A count or zero-error scan alone proves neither exclusive Mosaik use nor a working screen; complete the manual evidence pass in [compliance](references/compliance.md). Claude Code can additionally invoke the canvas-only `--hook` adapter after writes; see [client integration](references/clients.md). Other clients run the checker explicitly; automatic skill discovery alone does not install a write hook.

2. **Open every screen** in a browser and use it. Click everything, in both modes. A file that parses is not a screen that works.
3. **Walk [the review](references/review.md)** for usability, including applicable widths, keyboard paths and states from [interaction](references/interaction.md). A checker pass does not establish accessibility or a working flow. In review-only work, report findings instead of editing the screen.

## What to report

- The foundations with their sources
- The detected target, framework/surface and selected workflow, when these affect the result
- The catalog IDs that informed the work, or that the catalog was unavailable
- The checker's inspected templates/styles, counts, findings, unverifiable scope and every illustration declaration
- The semantic UI role-to-component mapping and verified import/API sources
- Defects you found in Mosaik itself
- What you did not look at

Keep checker observations, manual source evidence and browser behavior distinct. Do not claim "only Mosaik components" from a name prefix, component count or zero-error scan. Unverified imports, dynamic construction or omitted styles remain explicit gaps.

## When Mosaik itself is the problem

Reproduce the problem in the smallest possible board or page. If a documented workaround exists, use it. Otherwise report the component, the prop and the symptom as a finding for the Mosaik repository. A misbehaving component is a defect to surface, not a reason to quietly rebuild it.

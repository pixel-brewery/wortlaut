# Discover the design context

Use the requested file, screen or application as the scope. Start with the applicable `AGENTS.md` and local architecture/design guidance; do not borrow another product's environment, theme or business rules.

## Evidence before defaults

Run `scripts/discover_design.py [target] --json` relative to the installed skill. It reads bounded project metadata and relevant source files without running application code, installing packages, contacting services or changing files. `--root` can name the repository when automatic ancestry is insufficient. Paths in its report are relative to that root.

Use the report as a starting point, then read the actual owners:

| Evidence | Decision |
| --- | --- |
| Nearest `package.json`, Nx `project.json`, imports and framework config | Use this application's integration, package manager and existing public wrapper APIs |
| `@pixel-brewery/mosaik-*`, workspace packages or actual Mosaik imports/elements | Mosaik context, including when the prompt never says Mosaik |
| `.dc.html`, `x-dc`, canvas provider/imports | Claude Design surface; load [canvas](canvas.md) |
| Framework application or standalone web page | Load [application](application.md); do not use the canvas-only provider |
| Studio authoring or an actual `IElement` design tree | Load [catalog](catalog.md); validate the tree rather than treating it as framework markup |
| `DESIGN.md`, `COMPONENTS.md`, theme config, provider or token sources | Inherit foundations; identify generated regions and their maintained source before edits |
| Several applications at repository root | Use the screen/path in the request; otherwise inspect the candidates before selecting an owner |

Root dependencies are available capabilities, not proof of which framework a particular screen uses. Prefer local imports/configuration; consult the owning project when an HTML template is ambiguous. Do not treat a file in documentation, a build directory or an unrelated application as the current UI.

The helper may report no evidence, multiple candidates, malformed metadata or a scan limit. Do not turn absence of evidence into a framework or theme claim. Narrow the target or inspect the relevant source. Ask only if the missing choice changes the requested result and cannot be resolved from the repository.

## Preserve the project

Read the user's constraints, existing design documentation, runtime theme setup, tokens, fonts, icon registration, layout conventions and a nearby working screen. A generated `DESIGN.md` is evidence of decisions, not permission to overwrite their generator output. Keep foundation sources and generated projections consistent using the project's existing commands.

For an existing Mosaik app, retain the actual theme and overrides. For a new Mosaik interface, choose missing foundations using the entrypoint's precedence. For an unrelated existing UI, do not install Mosaik or replace its design system merely because this skill is available. For a backend-only task, return to the appropriate engineering guidance.

Determine the user's intent separately from the output surface: a React file can need a read-only review, and a Studio tree can need responsive work. Choose the applicable guidance from the request and the inspected project. State material assumptions in one short sentence and continue with the authorized work.

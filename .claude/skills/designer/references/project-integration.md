# Project Designer integration

Use when a consuming repository requires one local Designer that combines this pinned foundation, its local design contract and mandatory Mosaik MCP catalog evidence. Keep the procedure here identical across consumers; local differences, including a required live endpoint or an approved versioned stdio catalog, belong to their project contract.

## Compose the local role

Install a reviewed full source commit through Skills CLI and retain the generated root `skills-lock.json`, canonical imported files and established client projections. Do not edit the imported base or manufacture its lock entry. A local role has its own repository-prefixed name and visible title, while the shared role remains `Designer`.

```markdown
---
name: project-designer
description: Apply the shared Designer and mandatory Mosaik catalog workflow to this project's UI work.
metadata:
  inherits: designer
---

# Project Designer

Read [Designer](../designer/SKILL.md),
[Project integration](../designer/references/project-integration.md) and
[the local design contract](references/project.md) first.
Apply the mandatory consumer workflow from Project integration to every design
question, new idea and UI decision; combine it with the local foundations.
```

`metadata.inherits` records the dependency; it is not an automatic inheritance engine. The explicit reads compose the rules. Route root `AGENTS.md` and the local architect to the local Designer, keeping one canonical workflow instead of copying separate variants of the MCP procedure into each file. Keep reviews/questions read-only unless implementation is authorized.

The local contract owns the existing theme, brand, language, framework, installed package version, runtime/theme owner, generated `DESIGN.md`/`COMPONENTS.md` inputs, relevant working compositions, commands and browser/runtime constraints. Current user instructions and executable owners resolve stale historical prose. Existing handmade UI is evidence to review, not a template to reproduce. Adopting this role does not authorize a redesign, dependency upgrade, external action or another runtime instance.

Declare the project's permitted catalog transport in its existing MCP registry/client configuration and the derived skill's tool dependencies when supported. Use the public HTTP endpoint `https://beta.mosaik-api.breadstone.de/api/mcp` when the project requires live Beta. A project permitting a versioned local catalog can instead configure the installed `@pixel-brewery/mosaik-mcp` stdio executable following [catalog setup](catalog.md#standalone-stdio-in-another-project). State that choice in the local contract; package availability, exact version and registry authentication are setup prerequisites. An existing requirement for the live endpoint remains binding until the owner changes it. Preserve the established configuration owner and generated client projections. A dependency declaration, configured URL, installed package or successful connection is not evidence that the required design tools were consulted for the task.

## Mandatory consumer workflow

For every design question or new idea, and before proposing, implementing or reviewing a UI/design decision:

1. Read `get_studio_authoring_rules`. Search both `list_studio_templates` and `list_studio_recipes` for the actual task. For a specific UI detail, also run the [cross-category pattern search](catalog.md#search-for-the-ui-pattern). Retrieve matching templates/recipes and inspect `get_studio_recipe_options` before selecting or adapting a composition. Reuse a suitable catalog composition; if none fits, build only from the documented component contracts obtained below.
2. Read the relevant component documentation/API and anatomy, the actual framework guide, and the token/theme guidance for the decision. Compare the selected hosted or versioned local catalog's API with the installed component package before using any component or property. Apply [the catalog conflict rule](catalog.md#conflicting-catalog-evidence) when examples disagree with those contracts. Keep the local theme and product boundaries; the catalog does not authorize an upgrade, a different brand or additional product behavior.
3. Apply [the component and layout boundary](compliance.md). Use real Mosaik semantic UI primitives and their documented parts, slots, events and state props. Tailwind/plain CSS arrange layout; no foreign controls, token-painted replacements, copied component skins or self-approved exception markers. Preserve local runtime, editing state and generation ownership.
4. For an authored `IElement` tree, run `validate_design_tree` before rendering/exporting. For framework templates, standalone markup or a design canvas, use its source/composition checks and actual browser verification instead; do not claim tree validation for those formats.
5. Check the complete affected UI owner, including templates and styles, then the project's focused build/generator/behavior checks. Inspect the actual flow, applicable widths, keyboard paths and supported appearances. Regenerate design projections only when their maintained inputs changed.

If a required catalog connection or tool fails, retry once, report the exact failure and pause the dependent design decisions. Continue independent authorized work, such as source linting or an already-defined backend task. Do not replace required catalog evidence with remembered APIs, local documentation, an invented composition or a claimed consultation. Where live Beta is required, a local stdio package is not an automatic fallback. Where local stdio is permitted, successful calls provide the same authoring/template/component evidence requirements without network access. Read-only source checks alone do not become new design decisions or runtime evidence.

Report the local foundation sources, catalog IDs and inspected options/docs, selected endpoint or MCP package version and compatibility with installed components, semantic role/component/provenance mapping, source-check scope and unresolved findings, illustration declarations, actual browser observations and checks not performed. Static counts and zero errors do not establish exclusive Mosaik use or a working flow.

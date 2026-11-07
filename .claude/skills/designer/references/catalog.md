# Catalog and MCP server

The `mosaik` MCP server holds the component documentation, the Studio templates and recipes, the framework guides and the theme tools. Its public tools read documentation or return local artifacts. They do not save, publish or run models.

## Choose the project's catalog connection

The public catalog is available through hosted HTTP or the standalone stdio package `@pixel-brewery/mosaik-mcp`. The package provides the same 32 public tools, resources and prompts, including documentation, recipe/template search, validation, framework export and local project import files. It bundles a versioned snapshot and requires no running API, database, model credential or network connection after installation. Installation and updates require registry access.

Follow the consuming project's declared transport and compatibility policy. A repository that explicitly requires the live Beta endpoint continues to use it. An approved local stdio catalog can support new design work offline through the same required tool calls; reading files or remembering an API is not equivalent to consulting that server. Never switch transports silently after a connection failure.

### Hosted HTTP

The endpoint is `https://beta.mosaik-api.breadstone.de/api/mcp`.

```bash
claude mcp add --transport http mosaik https://beta.mosaik-api.breadstone.de/api/mcp
```

```bash
codex mcp add mosaik --url https://beta.mosaik-api.breadstone.de/api/mcp
```

A newly configured server is available only after the client reconnects. Beta reflects its deployed build; the local package reflects its published version. Compare the selected snapshot with the installed component version and, for unreleased work, canonical source. Neither snapshot proves that a newer local component API is already available.

### Standalone stdio in another project

First confirm that the repository owner has published the intended package version to GitHub Packages. Prepared source or a local build does not establish registry availability. If no owner-published version exists, report that prerequisite and use the project's permitted hosted connection; this skill does not authorize publication or changing the project's required endpoint.

Use Node.js 22.18 or newer. Install an exact package version with the consuming project's existing package manager and lockfile. The registry is `https://npm.pkg.github.com`, not the public npm registry. For npm, merge these entries into the existing `.npmrc`, preserving other scopes and settings:

```ini
@pixel-brewery:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Supply `NODE_AUTH_TOKEN` through the environment or the project's existing secret mechanism. For a developer installation, use an authorized GitHub personal access token (classic) with `read:packages` and access to the package. Keep the token value out of repository files and MCP configuration. GitHub documents the authentication requirements in [its npm registry guide](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).

With `MOSAIK_MCP_VERSION` set to the confirmed owner-published version, the npm installation and local launch are:

```sh
: "${MOSAIK_MCP_VERSION:?Set a confirmed owner-published package version}"
npm install --save-dev --save-exact "@pixel-brewery/mosaik-mcp@${MOSAIK_MCP_VERSION}"
node node_modules/@pixel-brewery/mosaik-mcp/dist/main.js
```

Adapt installation to the existing package manager rather than introducing a second lockfile. For Yarn 4, configure the same scope in `.yarnrc.yml` using `npmRegistryServer: "https://npm.pkg.github.com"`, `npmAlwaysAuth: true` and `npmAuthToken: "${NODE_AUTH_TOKEN}"` under `npmScopes.pixel-brewery`, then install with `yarn add --dev --exact "@pixel-brewery/mosaik-mcp@${MOSAIK_MCP_VERSION}"`. See [Yarn's scope registry settings](https://yarnpkg.com/configuration/yarnrc#npmScopes). The direct Node launch below applies to a regular `node_modules` installation; for another linker, resolve the installed entrypoint through that package manager's local execution support without downloading packages at startup.

The package exports the `mosaik-mcp` executable. For a regular `node_modules` installation, register its already-installed Node entrypoint as a stdio server in the client's existing MCP configuration owner:

```json
{
  "command": "node",
  "args": ["node_modules/@pixel-brewery/mosaik-mcp/dist/main.js"]
}
```

Launch from the consuming project, or use the client's supported working-directory setting so it resolves that project's installed entrypoint. Do not configure `npx`, `yarn dlx` or another runtime package download as the offline launch path. The registry credential is needed for installation, not for the server's runtime. A separately named connection such as `mosaik-offline` can coexist with hosted `mosaik`; its presence does not satisfy a project rule requiring Beta consultation. Reconnect the client, verify initialization and public tool discovery, then perform the required authoring/catalog calls below.

The authenticated cloud Studio endpoint remains hosted. Its API-key grants, cloud project reads/writes and asset uploads are not part of the offline public catalog. `create_studio_project` returns a local import artifact; it does not save a cloud project. Report the package version with the catalog IDs used, and update deliberately when a newer compatible snapshot is required.

## Before composing, on any surface

1. `get_studio_authoring_rules` for the design contract.
2. `list_studio_templates` and `list_studio_recipes` for the task. For a specific UI detail, also follow [pattern search](#search-for-the-ui-pattern). Reuse what fits, and inspect it with `get_studio_template`, `get_studio_recipe` and `get_studio_recipe_options`.
3. `search_components`, `find_similar_components`, `get_component_docs`, `lookup_component_api` and `get_component_anatomy` for the components involved.
4. `get_framework_guide`, `get_starter_template` or `get_inline_boilerplate` when writing code.
5. `get_token_schema`, `create_theme`, `get_theme_examples` and `validate_theme` when a theme is involved.

Keep the IDs you used and name them in your report, together with the hosted endpoint or installed MCP package version. A template you looked at and rejected is worth naming too. Compare the returned API with the installed component package version before using a component or property. A catalog snapshot does not choose a new product theme or authorize a package upgrade.

For new ideas or composition decisions, use those contracts to compose real components instead of inventing an API or reproducing a visual reference with CSS. If the configured catalog fails, retry once and report the exact failure. Without a working permitted MCP catalog, only maintenance already established by documented installed sources can continue when local rules permit it; new design decisions remain pending. [Project integration](project-integration.md) defines the stricter mandatory consumer contract, which pauses every dependent design decision on failure. An offline stdio consultation is successful catalog evidence only when that transport is permitted and the required calls actually succeeded.

## Search for the UI pattern

When a request concerns a detail within a screen, search for that detail separately from its host. Query `list_studio_recipes` without a category filter so a pattern can turn up in a card, illustration or other surface. Use terms for the visible relationship and its domain, including common synonyms and short queries in the catalog's terminology. A result list for the host or a single wording cannot establish that the detail has no precedent. If a promising query fills the result limit, refine it or check the next page.

For example, for a colored direction icon beside a signed percentage in a table, search for market quotes or a market ticker as well as trend indicators. `recipe-bento-card--market-ticker` embeds `recipe-illustration-stats-ticker--market-quotes`, where the icon and percentage share the same semantic color. Open promising variants and any embedded recipes needed to verify the detail. Reuse the matching composition at the requested scale, keeping the host's layout and workflow. If none fits after this search, report the terms and closest matches before composing from documented components.

## Conflicting catalog evidence

The catalog is evidence, not permission to violate [the component boundary](compliance.md) or the installed API. Check option schemas and component/API documentation before copying an example; do not copy deprecated Stack, handmade surfaces/badges or undocumented prop/event meanings. Report a conflicting or stale example and resolve it from verified catalog evidence and the installed contract. If a material conflict remains unresolved, pause that design decision and continue independent work. The required MCP consultation and any project-specific live endpoint requirement still apply; remembered APIs or an invented replacement do not resolve the conflict.

## Studio and IElement trees

For Mosaik Studio, the output is an `IElement` tree, not markup. The authoring rules are binding there:

- Only documented `mosaik-*` tags, properties and slots
- Text in `props.text` of `mosaik-text`, labels in the documented label properties
- Theme tokens for colors, spacing and radii, never hexadecimal colors
- Existing recipes with their typed options, keeping `recipeId` when composing instances
- Only catalog icon names

Validate the composed tree with `validate_design_tree`, then export with `render_design_tree` or `create_studio_project`. Design changes are proposals: only the Studio client executes them, after validation and approval.

## Using the catalog on other surfaces

A Claude Design canvas or framework code is not an `IElement` tree, so `validate_design_tree` does not apply there. Use the templates and recipes as the composition to follow, and say in your report that the tree validation was not run and why. Run the surface's source checker plus [the compliance evidence pass](compliance.md) and browser checks; these do not become equivalent to a complete tree-schema validation.


## Verified transport scope

On 2026-11-07, the prepared stdio package (`0.0.0`) was checked against Mosaik `0.1.191`: initialization, authoring rules, template/recipe search, recipe options, component and token documentation, tree validation and HTML export. `recipe-social-proof-dashboard` validated without violations, and its live Studio preview rendered and changed its three metric values when switching from all channels to Instagram.

This verifies the local catalog and the existing Studio canvas. It does not establish a published registry version, a consumer installation from GitHub Packages, or Claude Design-specific bundle integration. The package's separate protocol check exercises every public tool/resource/prompt with network access blocked. Keep those evidence boundaries distinct when rolling out a newly published version.

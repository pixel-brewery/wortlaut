# Catalog and MCP server

The `mosaik` MCP server holds the component documentation, the Studio templates and recipes, the framework guides and the theme tools. Its public tools read documentation or return local artifacts. They do not save, publish or run models.

## Connecting

The endpoint is `https://beta.mosaik-api.breadstone.de/api/mcp`.

```bash
claude mcp add --transport http mosaik https://beta.mosaik-api.breadstone.de/api/mcp
```

```bash
codex mcp add mosaik --url https://beta.mosaik-api.breadstone.de/api/mcp
```

A newly configured server is available only after the client reconnects. The Beta catalog is a deployed snapshot, so compare it with the source when working on unreleased components in the Mosaik repository.

## Before composing, on any surface

1. `get_studio_authoring_rules` for the design contract.
2. `list_studio_templates` and `list_studio_recipes` for the task. Reuse what fits, and inspect it with `get_studio_template`, `get_studio_recipe` and `get_studio_recipe_options`.
3. `search_components`, `find_similar_components`, `get_component_docs`, `lookup_component_api` and `get_component_anatomy` for the components involved.
4. `get_framework_guide`, `get_starter_template` or `get_inline_boilerplate` when writing code.
5. `get_token_schema`, `create_theme`, `get_theme_examples` and `validate_theme` when a theme is involved.

Keep the IDs you used and name them in your report. A template you looked at and rejected is worth naming too.

## Studio and IElement trees

For Mosaik Studio, the output is an `IElement` tree, not markup. The authoring rules are binding there:

- Only documented `mosaik-*` tags, properties and slots
- Text in `props.text` of `mosaik-text`, labels in the documented label properties
- Theme tokens for colors, spacing and radii, never hexadecimal colors
- Existing recipes with their typed options, keeping `recipeId` when composing instances
- Only catalog icon names

Validate the composed tree with `validate_design_tree`, then export with `render_design_tree` or `create_studio_project`. Design changes are proposals: only the Studio client executes them, after validation and approval.

## Using the catalog on other surfaces

A Claude Design canvas or framework code is not an `IElement` tree, so `validate_design_tree` does not apply there. Use the templates and recipes as the composition to follow, and say in your report that the tree validation was not run and why. The checker in this skill takes its place on a canvas.

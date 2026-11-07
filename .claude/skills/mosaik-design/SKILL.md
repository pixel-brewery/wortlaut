---
name: mosaik-design
description: Compatibility entrypoint for Wortlaut UI work. Apply Wortlaut Designer, which composes the pinned shared Pixel Brewery Designer and Wortlaut's actual design-system contract.
---

# Wortlaut Designer compatibility entrypoint

Read and apply [Wortlaut Designer](../../../.agents/skills/wortlaut-designer/SKILL.md)
and its [project design contract](../../../.agents/skills/wortlaut-designer/references/project.md).
That role explicitly loads the shared Designer and mandatory catalog workflow. Do not
maintain a second theme, composition procedure, component checklist or checker here.

The old generic references route to their maintained shared counterparts. Wortlaut-specific
foundations and product decisions remain in `DESIGN.md`, the architect's frontend contract
and the local Designer contract; their actual runtime owners remain authoritative.
The compatibility checker delegates to the central Designer checker. This entrypoint
does not install a write hook or change the user's client settings.

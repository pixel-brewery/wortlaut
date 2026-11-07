---
name: wortlaut-designer
description: Design, implement and review Wortlaut interfaces using the shared Pixel Brewery Designer and Wortlaut's Soho foundations, Angular owners and reviewable translation workflows. Apply to every UI question, new idea, screen, theme, layout, prototype or usability decision.
metadata:
  inherits: designer
---

# Wortlaut Designer

Read [Designer](../designer/SKILL.md), its [mandatory project integration](../designer/references/project-integration.md), [the Wortlaut design contract](references/project.md), root [AGENTS.md](../../../AGENTS.md) and [Wortlaut Architect](../wortlaut-architect/SKILL.md) before UI work. These explicit reads compose the pinned shared foundation and this project's actual design system; `metadata.inherits` records that relationship.

The local contract owns Wortlaut's theme/runtime, product data boundaries, design sources and verification. The shared Designer owns composition, component compliance, catalog consultation and its checker. Apply its complete mandatory consumer workflow to every UI question, new idea and design decision; do not maintain a second procedure here. Keep questions and reviews read-only unless implementation was requested.

Use the project's single declared connection: local stdio `mosaik`, launched as `yarn exec mosaik-mcp` from the preinstalled exact package version. There is no hosted HTTP dependency or automatic web fallback. Follow [the local connection and compatibility contract](references/project.md#catalog-and-component-versions); report which source was actually consulted. This connection does not change the installed component APIs or authorize inference, user-file writes or publication.

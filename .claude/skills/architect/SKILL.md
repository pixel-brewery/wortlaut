---
name: architect
description: Shared engineering foundations for repository structure, architecture, implementation, refactoring, contracts, lifecycle and testing. Apply with a repository's derived architecture skill and local rules; select only the relevant domain modules.
---

# Architekt

This is the shared base for repository-specific architecture skills. Read the derived skill's project contract and the applicable `AGENTS.md` together with this base. A derived skill retains its own name, domain routing, project references and explicit compatibility decisions.

## Apply the base through the project

1. Read [the shared workflow](references/common/workflow.md), identify the requested outcome and find its actual production owners. Classify tests by both test kind and the production boundary they exercise.
2. Select all applicable foundations below, then read the derived skill's matching local references before editing. Do not load every module by default.
3. Apply ownership, typed contracts, lifecycle, resource limits, compatibility, meaningful verification and scope discipline to the actual project. Revisit routing and useful parallel work when another boundary is reached.
4. Local references specialize these foundations for the project's frameworks, transports and policies. Framework-specific examples apply only when that stack is actually used. They never introduce a framework, server, database, provider, UI or deployment into a project.
5. Preserve documented local rules and deliberate adaptations. Resolve a real conflict explicitly against the user's instructions and the most specific applicable project contract; do not silently drop a foundation or waive a structural rule because an example uses another stack. Executable configuration resolves stale paths, versions and tooling assumptions.
6. Complete the task-scoped owner/drift pass, focused verification and applicable local documentation gates. Ordinary engineering work does not imply a full architecture report, Definition of Done, release, external write or permission to message others.

For repository setup or structural work, read [Repository structure](references/common/repository-structure.md) alongside the relevant production guide. This includes creating applications/packages, placing or extracting owners, relocating code, and organizing documentation, tooling or database lifecycle. Apply the matching application, library or skill profile; existing deliberate layouts change through scoped migration rather than incidental feature work.

| Boundary | Shared foundation |
| --- | --- |
| Repository layout, application/package placement, documentation and tooling ownership | [Repository structure](references/common/repository-structure.md) |
| Nx workspace automation, custom checks, code generation, build tooling or script migration | [Nx tooling contract](references/common/nx-tooling.md), with [tooling placement](references/common/repository-structure.md#7-repository-tooling-and-infrastructure) |
| Solution design, ownership, extraction, refactoring, migration | [Architecture](references/common/architecture.md) |
| TypeScript abstraction, SOLID, composition, source/API documentation | [OOP and design patterns](references/common/oop.md) |
| Application services, orchestration, persistence, errors | [Backend](references/common/backend.md) |
| Runtime validation, serialization, HTTP or generated clients | [Contracts](references/common/backend-contracts.md), [API URLs](references/common/api.md) |
| Providers, configuration, external I/O, lifecycle, bounded resources | [Platform](references/common/platform.md) |
| Authorization, reads/files, AI, outbound destinations, events, cleanup | [Integration safety](references/common/backend-safety.md) |
| Application UI and framework integration | [Frontend](references/common/frontend.md) |
| Angular application Views, Signal Forms, Commands, routing and composition | [Angular application contract](references/common/angular.md), with [presenters](references/common/angular-presenters.md) and [service APIs](references/common/angular-services.md) for the affected boundary |
| Angular collections with one or several presentations, custom collection implementations, field-driven filtering and saved filters | [Collections and filtering](references/common/angular-collections.md) |
| Forms, commands, asynchronous collections, localization, routing | [Frontend patterns](references/common/frontend-patterns.md) |
| Calendar dates, instants, time zones, expiry and scheduling | [Date and time](references/common/date-time.md) |
| Unit, integration, component, API and contract evidence | [Testing](references/common/testing.md), plus the production foundation |
| Browser/UI acceptance | [E2E](references/common/e2e.md), plus the production foundation and actual browser/desktop contract |

## Versioned derivation

Install this skill through the Skills CLI into `.agents/skills/architect` and commit the generated root `skills-lock.json`. Pin `ref` to a full Git commit; its `computedHash` protects the installed files. This uses the standard Skills lock format, not an automatic inheritance feature of an agent client.

The local skill declares `metadata.inherits: architect`, links to this `SKILL.md`, explicitly loads it, and combines selected base modules with its own project rules. The metadata documents the dependency; the explicit instructions perform composition. Retain the same canonical tree when generating client mirrors, and include the base when exporting a portable derived skill.

Run the installed validator from the consuming repository:

```sh
python3 .agents/skills/architect/scripts/check_inheritance.py --root . --derived project-architect
```

It checks the immutable Git ref, Skills CLI content hash, explicit base dependency and local reference availability. Missing, changed or unpinned bases must be repaired before relying on the inherited guidance. Update the central source, deliberately install a reviewed commit through the Skills CLI, regenerate local client projections and rerun the check. Do not edit the installed base or copy peer repositories' common files over it.

---
name: wortlaut-architect
description: 'Design, implement, refactor, test, document or review Wortlaut engineering work. Apply shared Architecture foundations with one engine and many surfaces, reviewable change sets, rule packs, Electron process boundaries, Angular/Mosaik and Synapse.'
# Keep the inheritance checker's two-space metadata nesting.
# prettier-ignore
metadata:
  inherits: architecture
---

# Wortlaut Architect

Carry out the requested task through Wortlaut's production owners. Read the
[Architecture base](../architecture/SKILL.md), its
[shared workflow](../architecture/references/common/workflow.md), root
[AGENTS.md](../../../AGENTS.md) and the [project contract](references/project.md)
first. Apply this skill to Wortlaut engineering tasks even when it was not named;
preserve the user's requested implementation, design, explanation or review mode.

## Inherited architecture foundation

The base is installed from `pixel-brewery/skills` at the immutable commit and content
hash in [skills-lock.json](../../../skills-lock.json). `metadata.inherits` records the
dependency; reading the base and combining its modules with the local references
performs the composition. Ordinary use needs no network or peer checkout.

Select every relevant production foundation and its local application below before
editing. Add testing guidance when verifying behavior; revisit routing when the
task crosses another boundary. Load only the references needed for the task.

| Task or boundary | Shared foundation | Wortlaut application |
| --- | --- | --- |
| Ownership, solution design, extraction, refactoring or migration | [Architecture](../architecture/references/common/architecture.md) | [Architecture and source owners](references/architecture.md) |
| TypeScript contracts, composition, abstractions, exports or source documentation | [OOP and design patterns](../architecture/references/common/oop.md) | [Project and source conventions](references/project.md) |
| Detect, analyze, generate, transform, sort, change sets, runs or configuration | [Backend](../architecture/references/common/backend.md) | [Engine](references/engine.md) |
| Rule packs, the lock file and anything loaded from outside the repository | [Integration safety](../architecture/references/common/backend-safety.md) | [Engine](references/engine.md) |
| Requests, responses, events, validation or renderer and MCP projections | [Contracts](../architecture/references/common/backend-contracts.md) | [Desktop transport](references/desktop.md), [Surfaces](references/surfaces.md) |
| Electron, native dialogs, the keychain, file access, startup, cancellation or shutdown | [Platform](../architecture/references/common/platform.md), [Integration safety](../architecture/references/common/backend-safety.md) | [Desktop lifecycle](references/desktop.md) |
| CLI, Nx executor, ESLint rules, MCP server, plugins or compatibility with old names | [Contracts](../architecture/references/common/backend-contracts.md), [Platform](../architecture/references/common/platform.md) | [Surfaces](references/surfaces.md) |
| AI providers, Synapse, prompts, chunking, tokens or validating model output | [Platform](../architecture/references/common/platform.md), [Integration safety](../architecture/references/common/backend-safety.md) | [Assistants](references/assistants.md) |
| Angular views, Mosaik, forms, presenters, routing or localization | [Frontend](../architecture/references/common/frontend.md), [Frontend patterns](../architecture/references/common/frontend-patterns.md) | [Frontend and design](references/frontend.md) |
| Run history, instants, durations or date presentation | [Date and time](../architecture/references/common/date-time.md) | [Engine](references/engine.md), [Frontend and design](references/frontend.md) |
| Unit, integration, contract or tooling tests | [Testing](../architecture/references/common/testing.md), plus the production foundation | [Verification](references/testing.md) |
| Electron UI acceptance or native packaging | [E2E](../architecture/references/common/e2e.md), plus the production foundation | [Verification](references/testing.md) |

Wortlaut translates shared backend examples into framework-neutral application owners,
Zod-validated IPC and files in the user's repository and profile. It does not acquire
NestJS, Prisma, HTTP controllers, a database, tenants or billing through an example.
Public Mosaik packages own controls and themes; Synapse owns native CLI protocols and
accounts; the repository owns catalogs and configuration. These translations preserve
ownership, contracts, lifecycle, resource limits, compatibility and meaningful
verification.

Examples of combined selection:

- A new analyzer rule: Backend + Testing; combine Engine and Surfaces so the rule runs
  the same in the app, the CLI, Nx and MCP, and a rule pack can provide it.
- Translate with AI: Platform + Integration safety + Frontend + Testing; combine
  Assistants, Engine and Frontend so model output is validated, stays a proposal in a
  change set and is written only after approval.
- A new screen: Frontend + Frontend patterns + Testing; combine Frontend and Desktop so
  it renders real Mosaik components, reads through typed IPC and owns no engine logic.

## Maintaining the derivation

Maintain project rules here and shared rules upstream in `pixel-brewery/skills`.
Restore or update the base through the Skills CLI at a reviewed full commit and retain
its generated root lock entry. Never edit or reformat the imported base or copy common
modules into this derived skill. Missing or mismatched base content must be restored
before relying on inherited guidance.

Run `yarn verify:skills` (or `python3 .agents/scripts/sync_architect_core.py --check`)
after skill changes. It checks the pinned source, content hash, explicit inheritance and
all relative Markdown references in both skills. Codex UI metadata lives in
[agents/openai.yaml](agents/openai.yaml); root `AGENTS.md` is the repository entrypoint.

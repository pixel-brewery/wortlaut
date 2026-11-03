# Repository structure

Read for repository setup, application/package creation, owner placement, extraction, relocation, documentation layout, tooling organization and database lifecycle placement. Use this recommendation with the project's actual configuration, derived architect and applicable production guide.

This is the shared target vocabulary for existing and future application, library and skill repositories. Apply the matching profile during new or explicitly scoped structural work. Preserve existing deliberate owners and local adaptations until an authorized migration changes them. The recommendation does not introduce dependencies, runtime capabilities, empty layers or new execution permissions.

Contents: [boundaries and tree](#2-structure-follows-responsibility), [applications](#4-applications-what-belongs-where), [libraries](#5-production-libraries), [documentation](#6-documentation), [tooling](#7-repository-tooling-and-infrastructure), [AI configuration](#8-ai-and-repository-configuration), [tests and artifacts](#9-tests-generated-artifacts-and-local-state), [profiles](#10-repository-profiles), [adoption](#11-existing-repositories-and-adoption).

## 1. Standard roots and naming

Use the following vocabulary for the responsibilities a repository actually owns:

- `docs/`
- `apps/backend`, `apps/database`, `apps/desktop`, `apps/web` and `apps/mobile`
- `apps/web/portal` and `apps/web/site`
- `libs/backend` and `libs/frontend`
- `tools/`

Functional product documentation uses `docs/product/<capability>/`; technical documentation uses `docs/architecture/<capability>/`. The sections below define the responsibilities and additional directories around these roots.

The convention standardizes the meaning and naming of needed owners. It does not require every repository to create every directory in the example tree.

## 2. Structure follows responsibility

| Area | Responsibility | Reason |
| --- | --- | --- |
| `apps/` | Executable and operational composition: application entry points, hosts and an application's database lifecycle. | Makes startup, packaging and deployment boundaries visible. |
| `libs/` | Cohesive production capabilities with explicit public interfaces. | Keeps domain and technical ownership independent from application startup. A library may have one consumer; it need not be a general framework. |
| `docs/` | Maintained explanations, contracts, decisions and clearly classified historical evidence. | Makes product behavior and engineering decisions discoverable without reading all implementation details. |
| `tools/` | Code used to develop, generate, validate and maintain the repository. | Separates development execution from product runtime behavior. |
| `infra/` | Environment and deployment infrastructure, where the repository owns it. | Separates infrastructure topology from build and code-generation tooling. |
| `.agents/`, `AGENTS.md` | Canonical agent guidance and its project-specific application. | Gives different AI clients the same maintained instructions. |
| `.github/`, `.vscode/` | Platform integrations, CI entry points and the selected canonical MCP registry. | Uses the locations required by those integrations without hiding product implementation there. |

An application imports libraries through their public exports. A library does not import an application. Folder placement does not itself require a particular framework, database, cloud service, package manager or process model.

## 3. Application repository tree

The following is a target vocabulary. Angle brackets identify project-specific owners. Optional subdirectories are created when an actual responsibility needs them.

```text
repository/
├── apps/
│   ├── backend/
│   │   ├── api/
│   │   │   └── src/
│   │   ├── status/                     # Optional operational application
│   │   │   └── src/
│   │   └── <service>/                  # Additional independently owned runtime
│   │       └── src/
│   ├── database/
│   │   ├── <schema-owner>/             # For example, an ORM's schema directory
│   │   └── tools/                      # Application database lifecycle commands
│   ├── desktop/
│   │   ├── src/
│   │   │   ├── main/
│   │   │   ├── preload/
│   │   │   └── native/
│   │   ├── assets/
│   │   └── tools/
│   ├── web/
│   │   ├── portal/
│   │   │   ├── src/
│   │   │   ├── public/
│   │   │   └── e2e/
│   │   ├── site/
│   │   │   ├── src/
│   │   │   ├── public/
│   │   │   └── e2e/
│   │   └── <web-app>/                  # Optional showcase, studio or other app
│   └── mobile/
│       ├── android/
│       ├── ios/
│       ├── assets/
│       └── tools/
├── libs/
│   ├── backend/
│   │   ├── core/
│   │   ├── auth/
│   │   ├── database/
│   │   └── features/
│   │       └── <domain>/
│   └── frontend/
│       ├── core/
│       ├── auth/
│       ├── ui/
│       ├── shell/
│       └── features/
│           └── <domain>/
├── docs/
│   ├── README.md
│   ├── features/
│   │   └── index.md
│   ├── product/
│   │   └── <capability>/
│   │       └── README.md
│   ├── architecture/
│   │   ├── <capability>/
│   │   │   └── README.md
│   │   └── decisions/
│   ├── development/
│   ├── operations/
│   ├── api/
│   ├── plans/
│   └── legacy/
├── tools/
│   ├── workspace/
│   ├── generators/
│   ├── contracts/
│   ├── lint/
│   ├── testing/
│   ├── docs/
│   └── <tool>/
├── infra/
│   ├── containers/
│   ├── environments/
│   └── deployment/
├── .agents/
│   ├── skills/
│   │   ├── architecture/
│   │   └── <repository>-architect/
│   │       ├── SKILL.md
│   │       ├── agents/
│   │       │   └── openai.yaml
│   │       └── references/
│   └── scripts/
├── .github/
│   ├── rules/
│   └── workflows/
├── .vscode/
│   └── mcp.json
├── AGENTS.md
├── README.md
├── skills-lock.json
└── <workspace configuration>
```

Client-specific generated adapters are additional integration files, for example under `.claude`, `.codex`, `.cursor` or `.gemini`. Their exact presence follows configured clients; their guidance is derived from canonical sources rather than maintained independently.

## 4. Applications: what belongs where

### Backend applications

`apps/backend/api` owns API bootstrap, global transport configuration, application lifecycle and composition of feature modules. Product endpoints, authorization policy, domain orchestration and business queries belong to their backend feature libraries.

`apps/backend/status` is appropriate when operational status has its own executable application. A health endpoint alone does not require a second application.

`apps/backend/<service>` is available for another genuine runtime, such as a worker or a background service. Its name and documentation identify its lifecycle and consumer. The directory does not imply HTTP or remote hosting. A utility process exclusively owned and packaged by a native host can remain inside that host; it is not automatically a second backend application.

### Database lifecycle

`apps/database` owns the application's authoritative schema, ordered migration artifacts, generation configuration and controlled lifecycle commands. It is an operational project, even when it does not run a server.

The selected database technology keeps its meaningful conventions inside this boundary. For example, a Prisma-based project can use `prisma/models`, `prisma/enums` and `prisma/migrations`; another database stack uses its own schema tooling. Create multiple schema owners only for actual separately owned database lifecycles.

Runtime connections and transaction infrastructure belong to `libs/backend/database`. Domain-specific queries belong to the owning feature. A database directory is not a place for database volumes, credentials, personal dumps or arbitrary runtime files. A library repository without an application database lifecycle does not need this project.

### Web applications

`apps/web/portal` is the primary product application. `apps/web/site` is the public-facing site. Both contain application configuration, entry components, route composition, application-specific static assets and browser acceptance tests.

Product views and commands live in frontend feature libraries. Shared layout, session infrastructure and reusable UI have their technical owners under `libs/frontend`. Site business capabilities can have frontend feature owners too; being public does not make a workflow infrastructure.

Additional real web applications use `apps/web/<name>`. A library showcase, authoring studio or documentation website is named for its purpose instead of being relabeled as a product portal. A documentation website is created only when it is a real application requirement.

### Desktop application

`apps/desktop` owns desktop startup, window lifecycle, main/preload boundaries, privileged native adapters, operating-system integration and packaging. The illustrated `main`, `preload` and `native` folders are an Electron-shaped specialization, not a requirement for every desktop framework.

Where the product reuses its web UI, the host packages the existing renderer rather than creating a second implementation of its screens and domain behavior. Host packaging, renderer origin configuration and native transport remain explicit contracts. A different rendering or process model is documented as an adaptation.

### Mobile application

`apps/mobile` owns mobile host configuration, maintained Android/iOS source projects, native capabilities and packaging. Platform-required internal directories remain recognizable; this recommendation does not flatten Gradle or Xcode project conventions.

A host reusing the web renderer consumes the same frontend capabilities. A native UI variant has an explicitly documented owner rather than importing browser-only implementation accidentally. Source projects and maintained native assets are separated from copied web bundles, local SDKs and build products.

### Application-specific tools and assets

Tools used only by one application can remain at `apps/<application>/tools`; repository-wide automation belongs at root `tools`. A public static web asset belongs to its actual web application; an image used by a feature belongs beside that feature when its build supports it; a packaging icon belongs to its host. These are distinct owners, not competing generic asset buckets.

## 5. Production libraries

### Technical libraries

| Library | Responsibility | Boundary |
| --- | --- | --- |
| `libs/backend/core` | Backend-wide technical composition, transport infrastructure and lifecycle facilities. | Does not accumulate unrelated business services. |
| `libs/backend/auth` | Reusable authentication mechanisms and authenticated execution context. | Account registration, profiles and account policy remain in their business owner. |
| `libs/backend/database` | Runtime database configuration, connection/client lifecycle and transaction infrastructure. | Does not own every feature's queries or replace schema lifecycle in `apps/database`. |
| `libs/frontend/core` | Frontend-wide configuration, startup, transport and host integration facilities. | Does not become the owner of all product state. |
| `libs/frontend/auth` | Session handling, authentication transport integration and route-access infrastructure. | Product forms and account workflows stay with their feature. |
| `libs/frontend/ui` | Shared UI primitives or adapters owned by this repository. | Reuses the chosen design system instead of creating a competing component system. |
| `libs/frontend/shell` | Shared application layout, navigation and feature composition surfaces. | Consumes public feature seams instead of feature internals. |

Add or extract a technical library when it has a meaningful ownership boundary. Existing public platform packages remain the owners of capabilities they already provide; the directory layout is not a reason to reimplement them locally.

### Business feature libraries

`libs/backend/features/<domain>` and `libs/frontend/features/<domain>` own cohesive business capabilities. A domain is not automatically one table, one screen or one provider. A frontend-only or backend-only capability does not need an artificial paired library.

Features expose public entry points and keep implementation imports internal. Other features use a documented public seam, not deep imports. The frontend does not import backend runtime code, ORM entities or persistence models.

For a TypeScript feature using these framework responsibilities, use the following internal vocabulary:

```text
libs/backend/features/<domain>/
├── src/
│   ├── index.ts
│   ├── controllers/
│   ├── services/
│   ├── repositories/
│   │   └── queries/
│   ├── models/
│   │   ├── requests/
│   │   └── responses/
│   ├── mappers/
│   ├── adapters/
│   └── providers/
└── <package and project configuration>

libs/frontend/features/<domain>/
├── src/
│   ├── index.ts
│   ├── api/                          # Generated client and transport models
│   └── lib/
│       ├── providers/
│       ├── views/
│       ├── presenters/
│       ├── models/
│       ├── services/
│       ├── components/
│       └── assets/
└── <package and project configuration>
```

These folders identify responsibilities; a feature creates only the ones it needs. Requests/responses retain one feature-owned contract declaration with the appropriate runtime validation and serialization path. An adapter translates an external system; a provider supplies a documented capability or composition seam. Both folders are not mandatory for a direct implementation.

The frontend `api` boundary is separate from product behavior. Its feature provider composes transport; views and state/commands have their own production owners. Presenter-based state is used when the chosen frontend architecture uses presenters; the common convention does not add that pattern to an unrelated framework.

For HTTP APIs, backend-owned transport contracts generate frontend clients in the consuming feature. When another real transport requires an explicitly runtime-neutral schema, use a dedicated owner such as `libs/contracts/<transport>`. It exposes the transport schema and wire types through public exports, excludes runtime implementation and persistence models, and has actual producer/consumer callers. Do not create it for an HTTP boundary already served by generated clients or turn it into a catch-all shared application-model package.

## 6. Documentation

| Path | Contents | Why |
| --- | --- | --- |
| `docs/README.md` | Documentation entry point and reading paths. | Gives readers a stable starting point. |
| `docs/features/index.md` | One product capability and availability catalog. | Keeps implemented behavior, accepted target and historical status distinguishable. |
| `docs/product/<capability>/README.md` | Actors, workflows, permissions, states, validation, failures and data consequences. | Explains what a product does from the user's perspective. |
| `docs/architecture/<capability>/README.md` | Owners, contracts, dataflow, lifecycle, configuration, failure behavior and verification. | Explains how the capability is implemented and maintained. |
| `docs/architecture/decisions/` | Architecture decisions, alternatives and supersession. | Preserves rationale while current contracts describe the current state. |
| `docs/development/` | Setup, local workflows, contribution and testing guidance. | Separates developer operation from product feature contracts. |
| `docs/operations/` | Environment setup, deployment/runbooks, monitoring and recovery. | Explains operation without turning infrastructure files into prose. |
| `docs/api/` | Generated API documentation or reviewed transport snapshots. | Provides readable contract evidence with an identified generator and source. |
| `docs/plans/` | Proposals, implementation plans and migration contracts with explicit status. | Keeps intended work separate from implemented behavior. |
| `docs/legacy/` | Historical reconstruction, retained visual evidence and prior-system context. | Preserves evidence without presenting it as a current feature. |

Functional and technical feature documentation are grouped by business capability rather than by backend/frontend/database package layers. A documented capability can span several libraries; several documented capabilities can share one domain owner.

Place a document's supporting assets beside its owner. A central assets directory is justified only for assets genuinely shared by several documents. A package README remains beside its package when consumers receive it there; it links maintained project documentation rather than duplicating an entire handbook.

## 7. Repository tooling and infrastructure

`tools` owns repository automation. A useful vocabulary includes:

- `tools/workspace`: workspace checks, dependency boundaries and repository maintenance.
- `tools/generators`: maintained project/code generators and their templates.
- `tools/contracts`: contract export, client generation and generated-output drift checks.
- `tools/lint`: custom lint rules and their executable checks.
- `tools/testing`: reusable test runner/configuration infrastructure and genuinely shared test utilities. Feature specifications, owner-specific helpers and fixtures remain beside their production owner; this is not a central feature-test directory.
- `tools/docs`: documentation validation and generation.
- `tools/<tool>`: another clearly named development tool, such as a build plugin or token generator.

Build-system plugins are tooling, even when a previous repository placed them under `infra`. An independently published developer tool can retain its own package contract here when this is its actual ownership boundary. Executable status alone does not make a tool a product backend.

`infra` is optional. It contains infrastructure-as-code, container/environment definitions and deployment topology owned by the repository. Concrete vendor-specific directories follow actual use. CI entry points remain in their integration-required locations, for example `.github/workflows`, and call maintained targets or tools rather than duplicating their implementation.

Runtime product services and business policy do not belong in `tools`. Repository generators and custom lint rules do not become infrastructure because they are used in CI. Database lifecycle tools dedicated to the application can remain with `apps/database`; shared automation calls that owner instead of copying it.

## 8. AI and repository configuration

Keep canonical guidance and generated client projections distinct:

- `AGENTS.md`: compact repository authority, essential boundaries and routing to detailed guidance.
- `.agents/skills/<repository>-architect`: the repository's derived architecture skill and its local references.
- `.agents/skills/architecture`: a deliberately installed and pinned shared foundation in a consuming repository.
- `skills-lock.json`: source, immutable revision and content-hash evidence for imported skills.
- `.github/rules`: maintained rule modules, where this repository uses them.
- `.vscode/mcp.json`: the single repository MCP connection registry; generate other client formats from it.
- `.agents/scripts`: canonical AI-configuration generation, synchronization and drift checks when required.

The shared foundation belongs to its source repository; its installed consumer copy is not edited in place. Project-specific domains, environments, account connections and private identifiers stay in the derived project guidance.

Client-specific instructions, MCP projections and skill entry points are generated only for configured clients and available canonical sources. They do not become independently maintained rule systems. Client permissions and account-level access remain outside this directory convention.

Workspace configuration files stay in locations expected by their tools, usually the repository root. Examples include a package manifest, workspace/build configuration, lint configuration and a root TypeScript configuration in a TypeScript workspace. Other ecosystems retain their required manifest conventions. Root `README.md` explains repository purpose and entry commands; it does not duplicate every detailed rule.

## 9. Tests, generated artifacts and local state

Nonbrowser production tests live beside the real production owner, following the shared [testing foundation](testing.md) and applicable language conventions. Browser acceptance specifications belong to the relevant application's `e2e` owner. Native platform tests follow their platform project conventions inside the native host. A root `tests/unit` or `tests/integration` bucket is not the default for product implementation tests.

Repository tooling and published skills retain identifiable tests for their own scripts and contracts. Their profile can use an established test location while the structure is deliberately adopted; that is distinct from scattering application feature tests across a global bucket.

Generated artifacts identify their canonical input, generator, output owner and tracking policy. Build products, caches, coverage output, copied renderer bundles, downloaded SDKs and local runtime state are disposable and normally untracked. Reviewed migrations, generated API clients and transport snapshots may intentionally be tracked and protected by regeneration checks. There is no universal rule to ignore every generated file or place all generated output in one global folder.

Local credentials, database volumes and runtime uploads do not belong beside application source. Their actual storage and environment mechanism are project-specific. The shared structure does not introduce a secret store, a new database or a new service.

## 10. Repository profiles

The same root vocabulary has three initial profiles:

### Application repository

Use the application tree above for the capabilities the product actually owns. A web-only product does not gain mobile or desktop placeholders. A backend-only service does not gain an artificial paired frontend library.

### Library or SDK repository

For a library or SDK repository, the default published package owner is `libs/<package>`. Use a documented runtime grouping only when it expresses a real package-consumer boundary, such as distinct browser and server packages. Public package names and exports are independent from physical directory names. Runtime-neutral code is not forced into a backend/frontend category that misrepresents its consumers.

Real showcase or documentation applications use `apps/web/<purpose>`; examples with another execution model have an explicit application owner. Package-oriented guides can use `docs/packages/<package>`, while technical ownership remains documented under `docs/architecture`. An application database lifecycle is added only when an actual application owns it.

Keep `libs` as the package root instead of introducing a competing `packages` tree implicitly. A deliberate existing package layout is recorded in the local project contract and changed only through scoped adoption.

### Skill or instruction repository

Published skills belong to `skills/<skill>`, with the native `SKILL.md`, optional `agents/openai.yaml` and relevant `references`, `scripts` or `assets`. Repository automation and documentation follow the common responsibility boundaries. Consumer-local `.agents/skills` and publisher-owned `skills` have different roles.

This profile does not create backend/frontend applications for a repository whose product is reusable instructions. Skill-local scripts remain with the skill when they must be distributed as part of it.

## 11. Existing repositories and adoption

This is a target for both new and existing repositories. Adoption records the actual current owner, recommended owner, consumers and migration status before moving anything.

| Existing pattern | Recommended target | Required distinction |
| --- | --- | --- |
| `apps/frontend/<web-app>` | `apps/web/<web-app>` | Update actual project roots, imports, tooling, docs and packaging together. |
| A separate web renderer for a native host | A documented web application owner with native-host consumption | Confirm its real rendering/process model before deciding the target. |
| Authored documentation in `.docs` | `docs` | Distinguish authored sources from generated documentation-site output. |
| Functional handbooks in `docs/proy` | `docs/product` | Move links and catalog references with the documents; preserve their meaning and history. |
| Build plugins or generators under `infra` | Their matching `tools` owner | Retain actual deployment infrastructure under `infra`. |
| Domain implementation in a composition root | A cohesive feature-library owner where adoption requires it | Preserve contracts and behavior; avoid a generic abstraction added only to satisfy a tree. |
| A shared contracts package | An explicit reviewed transport owner | Determine whether it is an HTTP-generated client, runtime-neutral IPC schema or an accidental business-model dependency. |

Migration is a separately scoped change with impact analysis and verification. It is not performed by silently updating an installed skill. New code should follow the adopted target; temporary coexistence has a named owner and a clear completion criterion. No compatibility alias or duplicate implementation is created merely to make both layouts appear complete.

## 12. Apply and enforce the recommendation

Choose the repository profile and locate actual callers before introducing or moving an owner. For the TypeScript application profile, `src/lib` and plural frontend responsibility folders such as `providers` are the recommended default; framework-required conventions and deliberate project adaptations remain explicit in the derived skill.

The `infra` vocabulary expresses actual environment/deployment ownership. The MCP registry and its generated projections have one canonical source. Neither convention configures infrastructure or account access merely because the directories are present.

Use existing generators, package exports, dependency-boundary checks and meaningful tests to enforce concrete adopted invariants. Validators must recognize repository profiles and real runtime boundaries; do not require unused directories, mirrored features, empty tests or wording-only architecture checks. If new enforcement tooling is requested, give it an actual owner and verify both accepted and rejected behavior.

Record project-specific mappings and migration status in the derived architect. Keep one maintained structure reference here rather than duplicating this tree into every instruction file. Update the shared source deliberately, then install a reviewed immutable revision in consumers and regenerate their adapters. An edit to the shared source does not update pinned installed copies automatically.

# Nx-native repository tooling

Apply in repositories that use Nx whenever work needs a repository check, transformation, generation, build/packaging step, synchronization or other maintained development automation. Read [repository structure](repository-structure.md#7-repository-tooling-and-infrastructure) and the local project contract. This is a binding implementation convention, not merely a preference for the command used to launch a script. It does not add Nx to another repository or turn application runtime/domain behavior into development tasks.

## Reuse before creating automation

Inspect the existing task, plugin and tool owners first. Use the workspace's package manager and installed Nx version. Resolve projects and targets through `nx show projects` and `nx show project <project> --json`, including inferred targets, configurations and defaults; inspect the owning source before changing it. Use the available Nx workspace/generator guidance and installed help instead of guessing commands or API versions.

Reuse an installed official/community executor or generator when it already owns the capability. Extend the existing workspace plugin for custom behavior. A new maintained utility is not the default answer to a one-time investigation or small edit: use existing read-only tools or edit the actual owner directly. Create only the automation the ongoing workflow needs.

New custom recurring automation must be an Nx-native implementation. Do not add standalone `.js`, `.mjs`, `.cjs`, `tsx`/`ts-node` entry points, shell/Python substitutes or inline CI/package-script programs for that responsibility. Renaming a script to TypeScript or launching it from `nx:run-commands` does not satisfy this contract. Keep the implementation inside the plugin, behind its typed public Nx entry and schema.

## Choose the appropriate Nx mechanism

| Responsibility | Owner |
| --- | --- |
| Run an already supported compiler, linter, test runner, bundler or other tool | Its installed Nx integration and project target |
| Execute custom recurring checks, transforms or generated-artifact work | A typed Executor in the existing workspace plugin, configured by the consuming project's target |
| Scaffold or deliberately change authored source, projects or configuration | A Generator using Nx Devkit's `Tree`, schemas and supported composition |
| Keep derived workspace configuration aligned with its sources | A sync Generator where the installed Nx version and workflow support that contract |
| Infer repeated project/target configuration or graph metadata | An appropriate Nx plugin hook when actual repetition justifies it; graph inference remains free of unrelated file writes |
| Order existing tasks | Target dependencies and the Nx task graph; custom Executor composition only for behavior the graph cannot express correctly |

Choose by responsibility: a build-time API/token/manifest transformation can be an Executor even if its target is named `generate`. A workspace source/configuration change belongs to the Generator contract. Do not build a parallel orchestrator solely to call existing targets.

`nx:run-commands` or a target command may invoke an established external tool's public CLI when no suitable executor is available. Package-manager shortcuts and CI may delegate to the canonical Nx target. They must not contain the workflow implementation or hide a newly written repository utility behind it. Consume a versioned external tool or distributed skill helper at its public boundary rather than copying its implementation locally.

Required tool configuration files, published CLI contracts and JavaScript emitted by compilation retain their actual formats. File extensions alone do not identify a violation: the problem is a competing hand-maintained automation implementation. An executor importing its own TypeScript implementation modules is part of this Nx architecture; spawning an unrelated custom script is not a replacement for it.

## One shared structure

For new or deliberately adopted tooling, use this common layout:

```text
tools/nx-plugins/<plugin>/
├── package.json
├── project.json
├── executors.json
├── generators.json                  # Only when generators exist
└── src/
    ├── executors/<capability>/
    │   ├── executor.ts
    │   ├── schema.json
    │   ├── executor.options.ts      # Or the installed scaffold's schema types
    │   ├── executor.task.ts         # When nontrivial logic needs a separate owner
    │   └── executor.task.spec.ts
    ├── generators/<capability>/
    │   ├── generator.ts
    │   ├── schema.json
    │   ├── files/                   # Templates when required
    │   └── generator.spec.ts
    └── lib/                         # Genuinely shared plugin implementation
```

Create only the mechanisms/files needed by the capability. Keep tests beside their real production owner. A thin adapter does not require a redundant test or an empty task class just to complete this tree. Share helpers only when their callers justify it; keep capability-specific code in its own directory rather than another generic utilities folder.

Reuse an established plugin owner even if its current path differs. Record its mapping to the shared target in the derived project contract, and migrate it through scoped structural work. Do not create a second plugin, another root `scripts` tree or separate automation owners under `tools/docs`, `tools/contracts` and `.agents/scripts` merely because the task concerns different inputs. A separate plugin package needs an actual consumer/public-boundary reason.

Use the installed Nx scaffolder and the package's real registration mechanism. Named Executors/Generators resolve through the plugin package name and its registry metadata; target-inference registration in `nx.json.plugins` is a separate concern. Do not invent an executor name or register an inference plugin as a substitute for an executor registry.

## Typed, executable contracts

The Nx entry adapts validated options and `ExecutorContext` to the owned implementation. Keep nontrivial task logic separately callable/testable inside the plugin; do not give it another CLI parser or `process.argv` lifecycle. Public options, JSON schema, defaults and project configuration must agree. Resolve paths from workspace/project context and explicit options, never personal paths or an accidental shell working directory. Use installed `nx`/`@nx/*` APIs compatible with the repository, without silent dependency upgrades.

Declare the target's real inputs, outputs, configurations and task prerequisites. Include the templates, schemas, plugin implementation/tool dependencies and relevant environment that can change the result. Use project/task dependencies rather than assuming an application-only fileset covers its tooling. A cacheable target must reproduce its result from those inputs and restore the complete declared outputs. External mutations, publishing, deployment and secret synchronization are not cacheable simply because Nx runs them; they also retain their separate authorization.

Use `dependsOn` for schedulable prerequisites and preserve required ordering. Devkit `runExecutor` is direct executor composition, not the Nx task scheduler: do not assume it schedules `dependsOn` or provides task-cache behavior. When composition is necessary, explicitly handle prerequisites and await/consume every result. Propagate failure, stop dependent work and preserve cancellation/cleanup semantics. Report success only after the owned work has finished; clean up only resources created by that task.

Generators use `Tree` and supported Devkit composition for workspace writes so review/dry-run behavior remains meaningful. Keep post-generation effects explicit, preserve unrelated files, and make repeat execution deliberate. A sync/inference hook is not permission for hidden migrations, downloads or external mutations during graph discovery.

## Migration and verification

When authorized work changes an existing custom script capability, move or extend that capability through its actual Nx owner and update affected targets, package shortcuts, CI, documentation and generation callers together. Remove the superseded implementation once those callers are verified. Do not leave an old script and a new Executor implementing the same workflow, or call the old custom script from the new Executor and declare the migration complete.

Preserve existing behavior, options, exit semantics, generated-output ownership and resource/authorization limits during migration. Unrelated legacy scripts are not a mandate for a repository-wide cleanup. A blocker calls for an explicit prerequisite or scoped migration decision, not another temporary script committed as a workaround.

Verify the target resolves through Nx and exercise meaningful output/failure behavior through the configured focused Nx target. For Generators, inspect the intended `Tree` changes and repeat/conflict behavior; for Executors, verify the real transformation/check and relevant failure, ordering or cleanup boundary. Check cache/input/output behavior where it affects correctness. Registry-string assertions, a CLI alias or a green direct-script run alone do not establish an Nx-native integration. Keep runtime/application tests with their production owners.

Nx API references: [local Executors](https://nx.dev/docs/kb/local-executors), [local Generators](https://nx.dev/docs/kb/local-generators), [project/target configuration](https://nx.dev/docs/reference/project-configuration), [inputs and named inputs](https://nx.dev/docs/reference/inputs).

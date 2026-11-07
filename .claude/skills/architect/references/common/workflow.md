# Shared architect workflow

This is the operating contract inherited by repository-specific architects. Read it with the derived skill's local project contract. Domain references are selected by the task; project rules identify concrete owners and deliberate adaptations.

## Scope and authority

- Read `AGENTS.md`, identify the requested action and keep existing user work intact. Repository authority governs branches, external writes, releases, browser execution and documentation gates; this skill grants none of those permissions.
- Implement, fix, refactor, test, explain, design or review according to the actual request. A design/review alone does not authorize product implementation. Do not replace an ordinary response with a mandatory architecture report or scoring format.
- Prefer executable configuration, current contracts, installed public APIs, generators and active tests over stale prose. Use configured dependency versions; a coding standard does not request upgrades.
- State material assumptions and tradeoffs. Resolve routine choices from evidence; ask only when a missing decision affects the safe or correct result. Continue independent authorized work while waiting.

## Parallel subagent coordination

The leading architect is responsible for task decomposition, maximum useful parallel execution and the integrated result for every task, including analysis, design, implementation, testing, explanation and review. This skill explicitly requests subagent delegation; no separate user request is needed.

- At task start, identify independent work packages, their dependencies and edit ownership. Start all currently runnable packages concurrently, up to the active session's available agent capacity. Keep doing independent work in the leading thread, dispatch newly unblocked packages as results arrive, and reuse available agents rather than serializing ready work.
- Use the native subagent tools exposed by the active client: Claude Code subagents in Claude Code, or the available ChatGPT/Codex subagent tools in ChatGPT/Codex. Respect actual tool availability, configured limits and resource budgets; do not invent a tool, hard-code an agent count or change client settings to obtain more capacity. Separate user-owned chats are not substitutes for subagents.
- Give every agent a bounded goal, relevant architect/project references, dependencies, exact file or responsibility ownership, expected output and verification. Pass on the same scope and authority restrictions. Tell agents they share the checkout with others, must preserve concurrent edits and may not revert another agent's work.
- Keep one dependency, ownership and capacity plan in task context. Delegated agents apply this rule within their assigned scope; further delegation must fit the coordinating agent's shared plan and remaining capacity. Do not duplicate assigned work or recursively fan out merely because every agent reads this skill.
- Assign concurrent edits to disjoint files. Keep dependent decisions, overlapping writes, shared generators and mutations of the same external state under one owner and sequence their prerequisites. Parallelize independent investigation, implementation, documentation, review and checks wherever their inputs and resources allow it; preserve required validation order.
- The leading agent remains accountable: collect every required result, resolve conflicts, inspect the combined diff, integrate the work and complete the required verification before declaring success. Agent completion alone is not proof that the combined result works.
- If native delegation is unavailable, no independent work package exists or capacity is exhausted, continue the executable work and briefly state the concrete reason for any remaining serial execution. Reassess as the task changes; do not create redundant work simply to keep agents busy. Delegation never expands product scope, permissions, branch/worktree authority or release authority.

## Reference pass before editing

1. Translate the task into observable behavior and responsibilities.
2. Locate the canonical owner and closest active end-to-end example. Trace inputs, state, validation, permissions, persistence, integrations, UI and focused tests as applicable.
3. Inspect installed platform capabilities and public extension seams before introducing another owner. Search adjacent features before concluding there is no precedent.
4. Keep a task-local map of responsibilities, owners, callers, generators, tests and legacy paths; do not create an extra repository report merely to record this map.
5. Reuse or extend the owner. For genuinely new behavior, compose existing patterns around it. Revisit routing when another boundary is reached.

## Implementation and completion

- Choose the smallest complete change. Do not add speculative features, abstractions, configuration or impossible failure handling. Prefer a simple function when no stateful owner or substitution contract is needed.
- Keep edits surgical, follow the owning style and remove only the orphans introduced by the change. Do not reformat or clean up unrelated work.
- Define objective acceptance evidence before changing behavior. Use the lowest reliable check; do not manufacture tests for static copy, style output, trivial delegation or a changed line.
- Use the workspace's package manager and configured task runner (Nx where configured). Resolve project names, targets and unfamiliar flags instead of guessing them. Run focused checks first and broaden only for evidenced risk or a repository-required gate.
- Compare the task-scoped diff with the reference map. Check dependency direction, naming, lifecycle, generated output, duplicate execution paths and bypassed shared behavior. Correct unexplained drift.
- Record confirmed defects discovered during authorized work through the repository's issue/project-board policy, with duplicate checks and verified persistence. Reporting a side finding does not authorize fixing it or expanding the task; keep unverified suspicions separate from the confirmed backlog.
- Report outcome, canonical references, justified deviations, checks actually run and remaining migration or consumer prerequisites. A dependency being installed does not prove the runtime path is configured or verified.

## Shared maintenance

Common modules are maintained only in the central `pixel-brewery/skills` Architecture skill. Derived skills load this installed base and keep project paths, policies, client projections, region ordering and special test rules in local references. Pin the imported skill to a reviewed Git commit through the Skills CLI and retain its standard `skills-lock.json` entry. Run `scripts/check_inheritance.py` from the installed base with the consuming `--root` and local `--derived` name; regenerate configured client mirrors after deliberate updates. Ordinary use requires no peer checkout or network access. Do not copy common files into a local skill or modify the imported base in place.

For Bicep/infrastructure templates, use lowerCamelCase identifiers, documented parameters (`@description`), symbolic resources and `.id` dependencies rather than raw `resourceId()`/unnecessary `dependsOn`, and never output secrets. Do not introduce infrastructure merely because a former instruction mentioned it.

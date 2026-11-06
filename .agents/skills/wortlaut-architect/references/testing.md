# Verification

Read [the base testing module](../../architecture/references/common/testing.md) and, for UI
acceptance, [the E2E module](../../architecture/references/common/e2e.md).

## Commands

- `yarn nx run-many -t test --parallel=1` runs the unit and integration specs.
- `yarn nx run-many -t build --parallel=1` builds every project.
- `yarn verify:code` runs the repository rules, formatting, lint, types, tests and builds.
- `yarn verify` adds the fresh package-consumer tests and exercises both the built and
  packaged desktop executables. See [Contributor verification](../../../../CONTRIBUTING.md#verification).

Run only one heavy job at a time. Capture the real exit code of a command, not that of a
pipe behind it.

## What to test where

- Specs sit beside their source and assert observed behavior. Prove that a new spec fails
  without its change.
- Engine use cases are tested through their public entry with temporary directories and
  fake providers. Real AI providers are never called in tests.
- Run the CLI end to end for a command whose behavior changed, in a dry run and a real write
  against a temporary copy.
- A contract change needs tests on both sides of the boundary.

`ChangeSetRecovery.spec` bundles `changes/testing/CrashingApply.ts` and runs it as a real process that kills itself between two renames.
`apps/desktop/forge.config.spec.mjs` runs with the tests of the desktop app. A packaged app starts from
`out/Wortlaut-<platform>-<arch>`: run it with `WORTLAUT_HOME` on a temporary profile and `WORTLAUT_SECRET_STORE=memory`.

## UI evidence

A view is done when it renders in the running app, in both modes, with its real states. Use
the existing browser or the Electron window. Do not launch a separate browser profile, and
report what you could not check.

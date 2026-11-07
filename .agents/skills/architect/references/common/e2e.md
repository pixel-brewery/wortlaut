# Browser behavior and acceptance evidence

Read with the local `e2e.md`, production domain and [testing](testing.md). Repository authority determines when browser execution and any complete-suite gate are permitted.

- Add browser coverage for a meaningful user outcome or material browser/system boundary. Use a smaller reliable layer when it exposes the same risk; component, flow and journey coverage need distinct failure contracts.
- Use the actual runner/test directory, test-ID attribute, fixture API, spec naming and discovery. Do not copy another repository's selector policy or filenames. Prefer stable explicit automation IDs for application interactions; follow local rules for semantic component accessibility tests.
- Keep interactions in typed Page/Component Objects and reusable fixtures when the project has them, with business assertions in specs. Reuse existing setup/data ownership; do not introduce generic object-generator packages or helpers that bypass the behavior under test.
- Use web-first auto-retrying assertions and Playwright auto-waiting. No fixed sleeps, inflated blanket timeouts or weak assertions. Exact text is for material domain output, not locating translated controls or pinning incidental copy/style.
- Assert URL/state, public results, validation, permissions, persistence/model propagation and cleanup where affected. Mocks may isolate downstream rendering but cannot establish acceptance of a mocked routing/provider/persistence boundary.
- Codegen, locator pickers, traces and planner/healer tools are discovery input. Refactor generated actions into the owning architecture; never accept hidden fallbacks, skipped tests or weakened checks.
- Verify the real user path after final relevant code changes when browser evidence is claimed. Record route, fixture/context, viewport, actions and result. A screenshot, step list or unit test does not establish a real browser run.
- Run the focused configured task-runner path (Nx where configured), diagnose failures and report project/mode/result/artifacts. A focused pass does not prove a release candidate, full Definition of Done or deployment. Do not trigger those gates implicitly.

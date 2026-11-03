# Frontend coding and framework boundaries

Read for TypeScript/HTML/SCSS application UI, Angular and wrappers. Combine [frontend patterns](frontend-patterns.md), the local project guide and relevant tests; use the repository's dedicated component/theme guides when changing design-system source.

- Use strict types, explicit public contracts, `I` interfaces, enumless unions, real class methods, contiguous imports and the local region/member order. No `any`, unchecked transport casts, unnecessary abbreviations or duplicated keys.
- One public export per file is the default. Reuse owned controls and patterns rather than creating parallel behavior. Follow local TSDoc access/readonly/parameter conventions and document intent concisely.
- Use multiline TSDoc with a concise description, a blank line before tags, matching visibility and useful `@readonly`, `@param name - ...`, `@typeParam` and `@returns` contracts. Respect narrower public/internal/hidden rules in the component owner.
- Use installed configured dependencies; do not upgrade them merely to follow a guide. Keep secrets and raw browser globals out of reusable logic; use the existing environment/browser owner where a testable boundary is needed.
- Generated HTTP clients/models stay generated. Fix backend/OpenAPI or the generator and regenerate; never import backend implementation/schemas into a frontend feature or hand-maintain a transport copy.
- Keep loading, stale, empty, error and retry state explicit. Use central telemetry rather than stray console output; intentional randomized UI behavior must be deterministic for a stable input/seed.

## Angular

Apply this section only to Angular consumers and their local supported-version contract. It does not request Angular dependencies in other projects.

Use standalone components without redundant `standalone: true`, signals/read-only derived state, `input()`/`output()`, OnPush and native `@if`/`@for`/`@switch`. Use framework-appropriate `inject()` and run effects in an injection/lifecycle context. Signals and observables have no `$` suffix. Keep observable subscriptions scoped or use async pipe/`toSignal`.

Use Signal Forms for supported new form workflows and follow the local migration policy. Do not mix form ownership models. Cross-field validation lives in the form schema/reusable validators; reactive field invariants observe signals rather than duplicating state through DOM value-change handlers.

Keep templates declarative: property/signal reads, simple comparisons/arithmetic/interpolation and pure pipes. Use class/style bindings rather than `ngClass`/`ngStyle`, no `$any`, and `NgOptimizedImage` for applicable static images. Keep required external View files distinct according to the owning framework.

Use the real Mosaik animation bindings `mosaikAnimate`/`mosaikAnimateOptions` where available. Automation targets follow the local runner's configured explicit test-ID policy; component accessibility contracts remain behavior and use the local testing rules.

## Lit and design-system boundaries

Keep component logic, template and authored SCSS in their established separate owners. Respect lifecycle, locale/direction, public events/slots and wrapper generation. Theme/token source is authoritative; generated output is regenerated. A framework-owned projection remains in its stable render parent; do not fix collections by moving managed items individually.

Use the project's actual styling policy. Foundation theme/SCSS authoring and product Tailwind composition have different owners; one does not replace the other.

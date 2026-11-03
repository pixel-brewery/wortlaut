# Synapse distributions

These six unmodified MIT-licensed archives are the supported local archive consumer
route documented by [Synapse](https://github.com/pixel-brewery/synapse/blob/v0.0.3/.docs/guides/consumers.md#local-archive-alternative).
They let Wortlaut install without a separate GitHub Packages registry credential.

`provenance.json` records the source revision, package identities, sizes and SHA-256
digests. Each package contains its original `LICENSE`, README, native ESM modules
and TypeScript declarations. Verify the committed bytes with:

```sh
node vendor/synapse/verify.mjs
```

The complete family is pinned to `0.0.3`. Matching root Yarn `resolutions` redirect
the packages' sibling SemVer dependencies to these same archives. Application code
imports public `@pixel-brewery/synapse-*` package names; it never imports another
checkout's source or relies on a developer-specific path.

At integration, every archived `dist` file matched the available built Synapse
distribution. The source difference from `v0.0.3` to `v0.0.4` affected package
versions and architecture instructions, not runtime implementation. Existing
Synapse packaging evidence for `0.0.3` covered installed exports, declarations,
inert imports, consumer bundles and the independent meeting-notes consumer.
Wortlaut's own checks remain necessary for its host integration.

Publication, version changes and switching back to the authenticated registry are
separate owner decisions. This repository does not publish Synapse packages.

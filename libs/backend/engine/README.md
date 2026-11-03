# @pixel-brewery/wortlaut-engine

The one engine behind every Wortlaut surface: the use cases `detect`, `analyze`, `generate`, `transform`, `sort` and
`info`, configuration and path resolution, change sets with an atomic, conflict-checked apply, the review list and the
run store. It imports neither Electron nor Angular, logs only through an injected logger and reports progress as events.

```typescript
import { WortlautEngine } from '@pixel-brewery/wortlaut-engine';

const engine = new WortlautEngine({ surface: 'cli', logger, fileSystem });
const outcome = await engine.sort({ cwd, options, writeMode: 'review' });

await engine.applyChangeSet(outcome.changeSet.id, cwd);
```

By default a command builds a change set and applies it straight away. `dry-run` only reports it, and `review` leaves it
pending in the review list. The review list and the run store live in the user's profile; set `WORTLAUT_HOME` to move it.

## Package installation

With Yarn, use `nodeLinker: node-modules` in `.yarnrc.yml`. Yarn Plug'n'Play is
currently limited by Utilities 0.1.187 loading optional compiler/XML peers; see
[package installation](https://github.com/pixel-brewery/wortlaut/blob/main/docs/release.md#package-installation).

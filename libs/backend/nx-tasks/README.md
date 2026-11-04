# @pixel-brewery/wortlaut-nx-tasks

Runs Wortlaut as an Nx target. The executor calls `run()` of `@pixel-brewery/wortlaut-app`, so a target does what the command line does.

A repository usually sets the options once, under the name of the executor, and picks the command through a configuration:

```json
{
  "targetDefaults": {
    "@pixel-brewery/wortlaut-nx-tasks:wortlaut": {
      "options": {
        "actions": {
          "detect": { "resourceRoot": ["src/i18n"], "preset": "angular" },
          "analyze": { "rules": ["key-consistency", "missing-translations"] },
          "sort": { "order": "asc" }
        }
      },
      "configurations": {
        "analyze": { "mode": "analyze" },
        "sort": { "mode": "sort" }
      }
    }
  }
}
```

```json
{
  "targets": {
    "intl": { "executor": "@pixel-brewery/wortlaut-nx-tasks:wortlaut" }
  }
}
```

```bash
yarn nx run shop:intl:analyze
```

`localizator` is a second name of the same executor. The options kept their names, so moving from `@pixel-brewery/nx-tasks:localizator` only changes the name of the executor.

## When a target fails

- The options are invalid, there is no mode, or the `.env` file or a variable it should set is missing.
- The run itself fails.
- `analyze` found a rule of severity `error` or refused a pack. This applies once a repository has a lock file or severities, as for the command line. Without them the findings only appear in the log.

## Package installation

The package lies on GitHub Packages, which needs a token even for public packages. See [Releasing](https://github.com/pixel-brewery/wortlaut/blob/main/docs/release.md#package-installation).

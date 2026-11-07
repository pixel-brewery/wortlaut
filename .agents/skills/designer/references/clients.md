# Client integration

The common `SKILL.md` uses portable skill metadata. `agents/openai.yaml` enables implicit invocation in Codex. The description and intent router make the skill discoverable for relevant requests; the active client still decides when to load it. A repository can require its use by routing `AGENTS.md` and its local architect through a derived Designer. Use [project integration](project-integration.md) for the shared mandatory catalog workflow and explicit base composition.

Do not install a client hook or edit user configuration merely because the designer is invoked. The explicit checker is available on every supported client.

## Optional Claude Code write hook

The extracted checker preserves its `--hook` adapter. If hook integration is requested, merge this entry into the consuming project's existing `.claude/settings.json` hooks instead of replacing other settings:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "for d in \"$CLAUDE_PROJECT_DIR/.agents/skills\" \"$CLAUDE_PROJECT_DIR/.claude/skills\" \"$HOME/.agents/skills\" \"$HOME/.claude/skills\"; do if [ -f \"$d/designer/scripts/check_design.py\" ]; then exec python3 \"$d/designer/scripts/check_design.py\" --hook; fi; done"
          }
        ]
      }
    ]
  }
}
```

It reads the PostToolUse payload and checks only an existing `.dc.html` file named by the write. Clean files and unrelated writes stay silent; a failing canvas emits findings to stderr and returns 2. It reports after the write and does not undo it. Application work still requires an explicit batch `--app` check on the affected templates and owning styles. The hook does not establish import provenance, full style coverage or runtime behavior.

Client-specific hooks stay in client configuration rather than unsupported top-level metadata in the shared skill. Preserve the canonical CLI-installed skill, its immutable lock and any generated client projections when configuring a consumer.

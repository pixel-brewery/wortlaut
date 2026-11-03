# Security reporting

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/pixel-brewery/wortlaut/security/advisories/new).
Do not publish exploit details, credentials, API keys or the private texts of a project in
public issues or pull requests. Revoke exposed credentials with their provider first.

Include the affected version or commit, the OS, the surface (desktop app, CLI, Nx executor,
Vite plugin or MCP server), a minimal reproduction with invented strings, and the expected
behavior and impact.

## Scope

Relevant areas are the change sets and their review, the handling of API keys in the keychain,
the renderer and main boundary, folder grants, rule packs, and how catalog text and model
output are treated as untrusted. What a repository ships is untrusted as well: its catalog keys stay
data, its links do not lead Wortlaut out of it, and its settings cannot read secret variables except
into a secret setting. See the [Architect skill](.agents/skills/wortlaut-architect/SKILL.md).
Passing tests are not a general security guarantee.

Report against the current `main` or name the tested commit. Older-version maintenance
commitments and fixed response deadlines are not established. Vulnerabilities of an external
service or assistant CLI should also go to its provider.

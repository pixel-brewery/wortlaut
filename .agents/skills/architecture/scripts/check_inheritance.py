#!/usr/bin/env python3
"""Validate an installed Architecture base and its explicit local derivation."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


def folder_hash(folder: Path) -> str:
    """Use the Skills CLI's exact localeCompare ordering, including path names."""
    script = """const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.argv[1];
const files = [];
function collect(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory() && !['.git', 'node_modules'].includes(entry.name)) collect(file);
    else if (entry.isFile()) files.push(path.relative(root, file).split(path.sep).join('/'));
  }
}
collect(root);
const hash = crypto.createHash('sha256');
for (const name of files.sort((a, b) => a.localeCompare(b))) {
  hash.update(name);
  hash.update(fs.readFileSync(path.join(root, name)));
}
process.stdout.write(hash.digest('hex'));
"""
    result = subprocess.run(
        ['node', '-e', script, str(folder)], capture_output=True, text=True, check=True
    )
    return result.stdout


def frontmatter(path: Path) -> str:
    text = path.read_text(encoding='utf-8')
    match = re.match(r'\A---\r?\n(.*?)\r?\n---(?:\r?\n|$)', text, re.S)
    if not match:
        raise ValueError(f'Missing YAML frontmatter: {path}')
    return match.group(1)


def declares_inheritance(path: Path) -> bool:
    lines = frontmatter(path).splitlines()
    in_metadata = False
    for line in lines:
        if re.fullmatch(r'metadata:\s*', line):
            in_metadata = True
        elif line and not line[0].isspace():
            in_metadata = False
        elif in_metadata and re.fullmatch(r'  inherits:\s*[\'"]?architecture[\'"]?\s*', line):
            return True
    return False


def relative_links(path: Path):
    """Ignore fenced examples and external or anchor-only Markdown links."""
    fenced = False
    for line in path.read_text(encoding='utf-8').splitlines():
        if re.match(r'^\s*(```|~~~)', line):
            fenced = not fenced
            continue
        if fenced:
            continue
        for target in re.findall(r'\[[^\]\n]+\]\(([^)\s]+)\)', line):
            parts = urlsplit(target.strip('<>'))
            if parts.scheme or parts.netloc or not parts.path:
                continue
            yield (path.parent / unquote(parts.path)).resolve()


def validate_links(folder: Path, *, inherited_only: bool = False) -> list[str]:
    errors = []
    for path in sorted(folder.rglob('*.md')):
        for target in relative_links(path):
            if inherited_only and path.name != 'SKILL.md' and 'architecture' not in target.parts:
                continue
            if not target.exists():
                errors.append(f'Broken relative reference in {path}: {target}')
    return errors


def validate(root: Path, derived: str) -> list[str]:
    errors = []
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', derived) or derived == 'architecture':
        return ['Expected the name of a distinct local derived skill.']
    base = root / '.agents/skills/architecture'
    local = root / '.agents/skills' / derived
    lock_path = root / 'skills-lock.json'
    try:
        lock = json.loads(lock_path.read_text(encoding='utf-8'))
        if lock.get('version') != 1 or not isinstance(lock.get('skills'), dict):
            return ['skills-lock.json must use the standard Skills CLI version-1 skills map.']
        entry = lock['skills'].get('architecture')
        if not isinstance(entry, dict):
            return ['Architecture is missing from skills-lock.json; install it with the Skills CLI.']
        if entry.get('source') != 'pixel-brewery/skills' or entry.get('sourceType') != 'github':
            errors.append('Architecture must come from the GitHub source pixel-brewery/skills.')
        if entry.get('skillPath') != 'skills/architecture/SKILL.md':
            errors.append('Unexpected Architecture skillPath in skills-lock.json.')
        if not re.fullmatch(r'[0-9a-f]{40}', str(entry.get('ref', ''))):
            errors.append('Architecture must be pinned to a full 40-character Git commit in ref.')
        expected_hash = entry.get('computedHash', '')
        if not re.fullmatch(r'[0-9a-f]{64}', str(expected_hash)):
            errors.append('Architecture requires a Skills CLI computedHash.')
        if not (base / 'SKILL.md').is_file():
            return errors + ['Installed Architecture base is missing.']
        if any(p.is_symlink() for folder in (base, local) for p in [folder, *folder.rglob('*')]):
            return errors + ['Base and derived skills must be self-contained copies, not symlinks.']
        if folder_hash(base) != expected_hash:
            errors.append('Installed Architecture content differs from skills-lock.json; reinstall the pinned source.')
        local_entry = local / 'SKILL.md'
        if not local_entry.is_file():
            return errors + [f'Derived skill is missing: {local_entry}']
        if not declares_inheritance(local_entry):
            errors.append('The local skill must declare metadata.inherits: architecture.')
        if (base / 'SKILL.md').resolve() not in list(relative_links(local_entry)):
            errors.append('The local skill must explicitly link to ../architecture/SKILL.md.')
        if (local / 'references/common').exists():
            errors.append('The derived skill still contains a duplicate common foundation; use the installed base.')
        errors.extend(validate_links(base))
        errors.extend(validate_links(local, inherited_only=True))
    except (OSError, ValueError, AttributeError, subprocess.SubprocessError) as error:
        errors.append(f'Cannot validate Architecture inheritance: {error}')
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd(), help='Consuming repository root.')
    parser.add_argument('--derived', required=True, help='Repository-local architecture skill name.')
    args = parser.parse_args()
    errors = validate(args.root.resolve(), args.derived)
    if errors:
        print('\n'.join(f'Architecture inheritance: {error}' for error in errors), file=sys.stderr)
        return 1
    print(f'{args.derived} derives from the pinned Architecture base; lock, content and references match.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

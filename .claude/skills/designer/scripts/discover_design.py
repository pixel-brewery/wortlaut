#!/usr/bin/env python3
"""Discover the requested UI owner's Mosaik, framework and design sources without changing files."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys


SKIP = {'.git', '.yarn', '.nx', '.angular', '.next', '.svelte-kit', '.nuxt',
        'node_modules', 'dist', 'build', 'coverage', 'vendor', '__pycache__',
        'playwright-report', 'test-results', 'storybook-static'}
SOURCE_SUFFIXES = {'.html', '.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte', '.css', '.scss'}
MAX_SOURCE_FILES = 240
MAX_SOURCE_BYTES = 2 * 1024 * 1024
MAX_FILE_BYTES = 128 * 1024
MAX_DIRECTORIES = 1200
FRAMEWORK_PACKAGES = {'@angular/core': 'angular', 'react': 'react', 'vue': 'vue',
                      'svelte': 'svelte', 'lit': 'lit', 'lit-element': 'lit'}
OWNER_FILES = ('package.json', 'project.json', 'angular.json')
WRAPPERS = {'angular', 'react', 'vue', 'svelte'}
IMPORT = re.compile(r'''(?:from\s*|import\s*\(|import\s*)['"]([^'"]+)['"]''')
MOSAIK_PACKAGE = re.compile(r'^@pixel-brewery/mosaik-(?:elements(?:-(?:angular|react|vue|svelte|foundation))?|themes|icons)(?:/|$)')


def regular(path: Path) -> bool:
    return path.is_file() and not any(item.is_symlink() for item in (path, *path.parents))


def relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def ancestry(directory: Path, root: Path) -> list[Path]:
    result = []
    while directory == root or root in directory.parents:
        result.append(directory)
        if directory == root:
            break
        directory = directory.parent
    return result


def find_root(target: Path) -> Path:
    directory = target if target.is_dir() else target.parent
    package_root = None
    for ancestor in (directory, *directory.parents):
        if (ancestor / '.git').exists():
            return ancestor
        if regular(ancestor / 'package.json') or regular(ancestor / 'nx.json'):
            package_root = ancestor
    return package_root or directory


def read_text(path: Path, warnings: list[str], root: Path) -> str:
    try:
        if not regular(path):
            return ''
        if path.stat().st_size > MAX_FILE_BYTES:
            warnings.append(f'Skipped oversized file: {relative(path, root)}')
            return ''
        return path.read_text(encoding='utf-8')
    except (OSError, UnicodeDecodeError):
        warnings.append(f'Could not read: {relative(path, root)}')
        return ''


def read_metadata(path: Path, warnings: list[str], root: Path) -> dict:
    text = read_text(path, warnings, root)
    if not text:
        return {}
    try:
        data = json.loads(text)
        if not isinstance(data, dict):
            raise ValueError('Expected an object')
        return data
    except ValueError:
        warnings.append(f'Invalid JSON metadata: {relative(path, root)}')
        return {}


def files_under(directory: Path, warnings: list[str], root: Path, *, metadata: bool = False):
    visited = 0
    for current, folders, files in os.walk(directory, followlinks=False):
        folders[:] = sorted(name for name in folders if name not in SKIP
                            and not name.startswith('.') and not (Path(current) / name).is_symlink())
        visited += 1
        if visited > MAX_DIRECTORIES:
            warnings.append(f'Directory scan limit reached in {relative(directory, root)}')
            return
        for name in sorted(files):
            path = Path(current) / name
            if not regular(path):
                continue
            if metadata:
                if name in OWNER_FILES:
                    yield path
            elif path.suffix in SOURCE_SUFFIXES and not name.endswith(('.d.ts', '.g.ts')) and not re.search(r'\.(?:spec|test)\.', name):
                yield path


def package_evidence(data: dict, path: Path, root: Path) -> tuple[set[str], list[dict]]:
    frameworks: set[str] = set()
    mosaik = []
    packages = {}
    for key in ('dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'):
        value = data.get(key)
        if isinstance(value, dict):
            packages.update(value)
    own_name = data.get('name')
    if isinstance(own_name, str) and MOSAIK_PACKAGE.match(own_name):
        packages[own_name] = 'workspace-owner'
    for name in sorted(packages):
        if name in FRAMEWORK_PACKAGES:
            frameworks.add(FRAMEWORK_PACKAGES[name])
        if MOSAIK_PACKAGE.match(name):
            mosaik.append({'path': relative(path, root), 'kind': 'package', 'value': name})
            suffix = name.removeprefix('@pixel-brewery/mosaik-elements-').split('/')[0]
            if suffix in WRAPPERS:
                frameworks.add(suffix)
    executors = json.dumps(data.get('targets', {}))
    for framework in ('angular', 'react', 'vue', 'svelte'):
        if f'@nx/{framework}:' in executors or f'@nrwl/{framework}:' in executors:
            frameworks.add(framework)
    if '@angular-devkit/build-angular:' in executors or '@angular/build:' in executors:
        frameworks.add('angular')
    if path.name == 'angular.json' and isinstance(data.get('projects'), dict):
        frameworks.add('angular')
    return frameworks, mosaik


def analyze(root: Path, target: Path, owner: Path, warnings: list[str], *, candidate: bool = False) -> dict:
    local_frameworks: set[str] = set()
    inherited_frameworks: set[str] = set()
    mosaik: list[dict] = []
    surfaces: set[str] = set()
    foundations: list[dict] = []
    for directory in reversed(ancestry(owner, root)):
        for name in OWNER_FILES:
            path = directory / name
            if not regular(path):
                continue
            data = read_metadata(path, warnings, root)
            frameworks, evidence = package_evidence(data, path, root)
            if directory == owner:
                local_frameworks.update(frameworks)
            else:
                inherited_frameworks.update(frameworks)
            mosaik.extend(evidence)
            if 'mosaik-studio' in str(data.get('name', '')):
                surfaces.add('studio')
        for name in ('DESIGN.md', 'COMPONENTS.md', 'tools/design-md.config.json'):
            path = directory / name
            if not regular(path):
                continue
            item = {'path': relative(path, root), 'kind': 'theme-config' if name.endswith('.json') else 'design-document'}
            if name.endswith('.json'):
                config = read_metadata(path, warnings, root)
                if isinstance(config.get('base'), str):
                    item['theme'] = config['base']
            else:
                text = read_text(path, warnings, root)
                item['generated'] = bool(re.search(r'<!--\s*/?design-md:', text) or re.search(
                    r'\bgenerated\s+by\s+.{0,180}(?:mosaik-design-md|design-md\.mjs)', text, re.I | re.S))
            foundations.append(item)

    source_frameworks: set[str] = set()
    scan_target = target
    source_files = [scan_target] if scan_target.is_file() else files_under(scan_target, warnings, root)
    count = 0
    byte_count = 0
    source_limit = 40 if candidate else MAX_SOURCE_FILES
    for path in source_files:
        explicit_tree = scan_target.is_file() and path.suffix == '.json'
        if path.suffix not in SOURCE_SUFFIXES and not explicit_tree or not regular(path):
            continue
        # Another package is another UI owner, not evidence for this one.
        if any(directory != owner and any(regular(directory / name) for name in OWNER_FILES)
               for directory in ancestry(path.parent, owner)[:-1]):
            continue
        count += 1
        if count > source_limit or byte_count >= MAX_SOURCE_BYTES:
            warnings.append(f'Source scan limit reached in {relative(scan_target if scan_target.is_dir() else scan_target.parent, root)}')
            break
        text = read_text(path, warnings, root)
        byte_count += len(text.encode('utf-8'))
        canvas = path.name.endswith('.dc.html') or '<x-dc' in text
        if canvas:
            surfaces.add('canvas')
        for package in IMPORT.findall(text):
            base = package.split('/')[0] if not package.startswith('@') else '/'.join(package.split('/')[:2])
            if base in FRAMEWORK_PACKAGES:
                source_frameworks.add(FRAMEWORK_PACKAGES[base])
            if MOSAIK_PACKAGE.match(package):
                mosaik.append({'path': relative(path, root), 'kind': 'import', 'value': package})
                suffix = base.removeprefix('@pixel-brewery/mosaik-elements-')
                if suffix in WRAPPERS:
                    source_frameworks.add(suffix)
        if path.suffix in {'.vue', '.svelte'}:
            source_frameworks.add(path.suffix[1:])
        if re.search(r'''<mosaik-[a-z-]+\b|Mosaik\.(?:MosaikThemeProvider|Button|Textbox)\b|['"]?(?:tag|tagName)['"]?\s*:\s*['"]mosaik-''', text):
            mosaik.append({'path': relative(path, root), 'kind': 'markup', 'value': 'Mosaik components'})
        typed_tree = re.search(r'\bIElement\b', text) and re.search(r'mosaik|recipeId|validate_design_tree|render_design_tree', text, re.I)
        json_tree = explicit_tree and re.search(r'"tag"\s*:\s*"mosaik-', text) and re.search(r'"props"\s*:', text)
        if typed_tree or json_tree:
            surfaces.add('studio')
        if re.search(r'\b(?:provideTheme|ThemeService\.configure|Theme2|MosaikThemeProvider)\b|--mosaik-', text):
            foundations.append({'path': relative(path, root), 'kind': 'theme-usage'})
        if path.suffix in {'.vue', '.svelte', '.tsx', '.jsx', '.html'} and not canvas:
            surfaces.add('application')

    frameworks = source_frameworks or local_frameworks
    if not frameworks and surfaces and len(inherited_frameworks) == 1:
        frameworks = inherited_frameworks
    if not frameworks and surfaces and len(inherited_frameworks) > 1:
        warnings.append(f'Multiple ancestor frameworks; inspect the requested owner in {relative(owner, root)}')
    elif len(frameworks) > 1:
        warnings.append(f'Multiple frameworks in {relative(owner, root)}; inspect the requested source before choosing wrappers')
    if frameworks and not surfaces:
        surfaces.add('application')
    if 'canvas' in surfaces and not source_frameworks:
        frameworks = set()
    unique = lambda items: list({json.dumps(item, sort_keys=True): item for item in items}.values())
    status = 'existing-mosaik' if mosaik else 'unrelated-ui' if surfaces else 'no-ui-evidence'
    return {'scope': relative(owner, root), 'frameworks': sorted(frameworks), 'surfaces': sorted(surfaces),
            'mosaik': {'detected': bool(mosaik), 'evidence': unique(mosaik)},
            'foundations': unique(foundations), 'status': status}


def discover(root: Path, target: Path) -> dict:
    warnings: list[str] = []
    directory = target if target.is_dir() else target.parent
    owner = next((path for path in ancestry(directory, root)
                  if any(regular(path / name) for name in OWNER_FILES)), root)
    result = analyze(root, target, owner, warnings)
    result.update({'root': '.', 'target': relative(target, root), 'instructions': [], 'candidates': []})
    for ancestor in reversed(ancestry(directory, root)):
        for name in ('AGENTS.md', 'CLAUDE.md', 'GEMINI.md'):
            if regular(ancestor / name):
                result['instructions'].append(relative(ancestor / name, root))
        for base in ('.agents/skills', '.claude/skills'):
            folder = ancestor / base
            if folder.is_dir() and not folder.is_symlink():
                for skill in sorted(folder.iterdir()):
                    if not skill.is_symlink() and ('design' in skill.name or 'architect' in skill.name) and regular(skill / 'SKILL.md'):
                        result['instructions'].append(relative(skill / 'SKILL.md', root))
    if target == root:
        directories = sorted({path.parent for path in files_under(root, warnings, root, metadata=True)
                              if path.parent != root})
        for directory in directories[:80]:
            item = analyze(root, directory, directory, warnings, candidate=True)
            if item['surfaces']:
                result['candidates'].append(item)
        if len(directories) > 80:
            warnings.append('Candidate owner limit reached; rerun on the requested application or file')
        if result['candidates']:
            result['status'] = 'multiple-ui-owners' if len(result['candidates']) > 1 else 'ui-owner-candidate'
            warnings.append('Repository scope: select the requested UI owner from candidates before making design decisions')
    result['warnings'] = list(dict.fromkeys(warnings))
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', nargs='?', type=Path, help='Requested file or directory; relative to --root when supplied.')
    parser.add_argument('--root', type=Path, help='Repository root; otherwise discovered from the target ancestry.')
    parser.add_argument('--json', action='store_true', help='Print structured discovery evidence.')
    args = parser.parse_args(argv)
    target = args.target or args.root or Path.cwd()
    if args.root and args.target and not args.target.is_absolute():
        target = args.root / args.target
    if target.is_symlink() or not target.exists():
        parser.error('Target must be an existing file or directory, not a symlink.')
    if target.name.startswith('.env') or target.name in {'.npmrc', '.pypirc', 'secrets.json', 'credentials.json', 'service-account.json'}:
        parser.error('Credential and environment files are not design discovery inputs.')
    lexical_target = Path(os.path.abspath(target))
    lexical_root = Path(os.path.abspath(args.root)) if args.root else find_root(lexical_target)
    if not lexical_root.is_dir() or lexical_target != lexical_root and lexical_root not in lexical_target.parents:
        parser.error('Target must be inside the repository root.')
    if any(part in SKIP for part in lexical_target.relative_to(lexical_root).parts):
        parser.error('Target belongs to a skipped dependency or generated directory.')
    if any(path != lexical_root and path.is_symlink() for path in ancestry(lexical_target.parent if target.is_file() else lexical_target, lexical_root)):
        parser.error('Target cannot traverse a symlink.')
    target = lexical_target.resolve()
    root = lexical_root.resolve()
    result = discover(root, target)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Target: {result['target']} | owner: {result['scope']} | {result['status']}")
        print(f"Frameworks: {', '.join(result['frameworks']) or 'unresolved'}; surfaces: {', '.join(result['surfaces']) or 'unresolved'}")
        print(f"Mosaik evidence: {len(result['mosaik']['evidence'])}")
        for item in result['foundations']:
            print(f"Foundation: {item['path']} ({item['kind']})")
        for instruction in result['instructions']:
            print(f'Instruction: {instruction}')
        for candidate in result['candidates']:
            print(f"Candidate: {candidate['scope']} ({', '.join(candidate['frameworks']) or ', '.join(candidate['surfaces'])})")
        for warning in result['warnings']:
            print(f'Warning: {warning}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

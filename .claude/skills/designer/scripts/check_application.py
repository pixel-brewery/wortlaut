#!/usr/bin/env python3
"""Conservative source checks for Mosaik consumer templates and authored styles.

This is a bounded static check, not a framework compiler or a browser test. It
reports unresolved component/style expressions rather than certifying them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path
import re


APP_SUFFIXES = {'.html', '.vue', '.svelte', '.tsx', '.jsx', '.ts', '.js', '.css', '.scss'}
CATALOG = json.loads(Path(__file__).with_name('mosaik_components.json').read_text(encoding='utf-8'))
MOSAIK_TAGS = frozenset(CATALOG['tags'])
MOSAIK_EXPORTS = frozenset(CATALOG['exports'])
PACKAGE_EXPORTS = {name: frozenset(exports) for name, exports in CATALOG['package_exports'].items()}
NATIVE_CONTROLS = {
    'a', 'button', 'input', 'select', 'textarea', 'table', 'dialog', 'progress',
    'meter', 'details', 'summary', 'img', 'hr', 'output',
}
CONTROL_ROLES = {
    'button', 'checkbox', 'combobox', 'dialog', 'listbox', 'menu', 'menuitem',
    'progressbar', 'radio', 'radiogroup', 'slider', 'switch', 'tab', 'tablist',
    'link', 'alert', 'alertdialog', 'status', 'meter', 'tree', 'treeitem',
}
VOID_TAGS = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
STRUCTURAL_TAGS = {'ng-container', 'ng-template', 'ng-content', 'router-outlet', 'router-view', 'slot', 'template', 'svelte:head', 'svelte:fragment', 'svelte:window', 'svelte:document', 'svelte:body'}
TEXT_TAGS = {'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'strong', 'em', 'small', 'b', 'i', 'code', 'pre', 'kbd', 'samp', 'sub', 'sup', 'dt', 'dd'}
NATIVE_TAGS = TEXT_TAGS | VOID_TAGS | NATIVE_CONTROLS | {
    'html', 'head', 'body', 'title', 'script', 'style', 'noscript', 'div', 'main',
    'section', 'article', 'aside', 'nav', 'header', 'footer', 'address', 'figure',
    'figcaption', 'ul', 'ol', 'li', 'dl', 'form', 'label', 'fieldset', 'legend',
    'picture', 'source', 'video', 'audio', 'track', 'iframe', 'canvas', 'svg',
    'g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse',
    'text', 'tspan', 'defs', 'symbol', 'use', 'clippath', 'lineargradient',
    'radialgradient', 'stop', 'mask', 'pattern', 'foreignobject',
}
SVG_TAGS = {'svg', 'g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text', 'tspan', 'defs', 'symbol', 'use', 'clippath', 'lineargradient', 'radialgradient', 'stop', 'mask', 'pattern'}
FRAMEWORK_COMPONENTS = {
    'react': {'Fragment', 'StrictMode', 'Suspense'},
    'react-router': {'Outlet', 'Routes', 'Route'},
    'react-router-dom': {'Outlet', 'Routes', 'Route'},
    'vue': {'Fragment', 'KeepAlive', 'Suspense', 'Teleport'},
    'vue-router': {'RouterView'},
}
LAYOUT_PROPERTIES = {
    'display', 'position', 'inset', 'inset-inline', 'inset-block', 'top', 'right',
    'bottom', 'left', 'z-index', 'isolation', 'box-sizing', 'float', 'clear',
    'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
    'inline-size', 'block-size', 'min-inline-size', 'max-inline-size',
    'min-block-size', 'max-block-size', 'aspect-ratio', 'order', 'gap', 'row-gap',
    'column-gap', 'visibility', 'overflow', 'overflow-x', 'overflow-y',
    'overflow-wrap', 'overscroll-behavior', 'scrollbar-gutter', 'scroll-behavior',
    'white-space', 'word-break', 'text-align', 'text-overflow', 'text-wrap',
    'text-wrap-mode', 'text-wrap-style', 'vertical-align',
    'direction', 'writing-mode', 'pointer-events', 'contain', 'content-visibility',
    'object-fit', 'object-position', 'table-layout', 'border-collapse',
}
GLOBAL_VALUES = {'inherit', 'initial', 'unset', 'revert', 'revert-layer'}
TOKEN = re.compile(r'var\(\s*--mosaik-[\w-]+(?:\s*,[^)]*)?\)')
TYPOGRAPHY_ROLE = re.compile(r'var\(\s*--mosaik-typography-(?:headline[1-6]|subtitle[12]|body[12]|button|caption|overline|supporting)\s*\)')
TAG = re.compile(r'<\s*(/?)\s*([A-Za-z][\w:.-]*)')
DECLARATION = re.compile(r'(?:^|[;{}])\s*((?:--)?[\w-]+)\s*:\s*([^;{}]+)(?=[;} ]|$)')
IMPORT = re.compile(r'\bimport\s+(?!type\b)([^;]+?)\s+from\s*([\'"])([^\'"\n]+)\2', re.S)
MOSAIK_PACKAGE = re.compile(r'^@pixel-brewery/mosaik-elements-(?:foundation|angular|react|vue|svelte)(?:/components/[\w/-]+)?$')


@dataclass(frozen=True)
class Issue:
    path: Path
    line: int
    rule: str
    message: str
    severity: str = 'error'


@dataclass
class Inspection:
    findings: list[Issue] = field(default_factory=list)
    components: int = 0
    exceptions: list[str] = field(default_factory=list)
    files: list[Path] = field(default_factory=list)


@dataclass(frozen=True)
class Attribute:
    name: str
    value: str
    expression: bool = False


@dataclass(frozen=True)
class Element:
    tag: str
    attrs: tuple[Attribute, ...]
    offset: int
    closing: bool = False
    empty: bool = False


def verified_mosaik_tag(tag: str) -> bool:
    return tag in MOSAIK_TAGS


def verified_mosaik_export(name: str, package: str | None = None) -> bool:
    return name in (MOSAIK_EXPORTS if package is None else PACKAGE_EXPORTS.get(package, frozenset()))


def _line(source: str, offset: int) -> int:
    return source.count('\n', 0, offset) + 1


def _blank(value: str) -> str:
    return ''.join('\n' if char == '\n' else ' ' for char in value)


def _without_comments(source: str, *, javascript: bool = False) -> str:
    """Preserve offsets while excluding comments; keep quoted source intact."""
    result = list(source)
    i = 0
    while i < len(source):
        if source[i] in "\"'`":
            i = _quoted_end(source, i)
        elif source.startswith('<!--', i):
            end = source.find('-->', i + 4)
            end = len(source) if end < 0 else end + 3
            result[i:end] = _blank(source[i:end])
            i = end
        elif source.startswith('/*', i):
            end = source.find('*/', i + 2)
            end = len(source) if end < 0 else end + 2
            result[i:end] = _blank(source[i:end])
            i = end
        elif javascript and source.startswith('//', i):
            end = source.find('\n', i + 2)
            end = len(source) if end < 0 else end
            result[i:end] = _blank(source[i:end])
            i = end
        else:
            i += 1
    return ''.join(result)


def _without_strings(source: str) -> str:
    result = list(source)
    i = 0
    while i < len(source):
        if source[i] in "\"'`":
            end = _quoted_end(source, i)
            result[i:end] = _blank(source[i:end])
            i = end
        else:
            i += 1
    return ''.join(result)


def _quoted_end(source: str, start: int) -> int:
    quote = source[start]
    i = start + 1
    while i < len(source):
        if source[i] == '\\':
            i += 2
        elif source[i] == quote:
            return i + 1
        else:
            i += 1
    return len(source)


def _balanced_end(source: str, start: int, opening: str = '{', closing: str = '}') -> int:
    depth, i = 1, start + 1
    while i < len(source):
        if source[i] in "\"'`":
            i = _quoted_end(source, i)
            continue
        if source.startswith('/*', i):
            end = source.find('*/', i + 2)
            i = len(source) if end < 0 else end + 2
            continue
        if source[i] == opening:
            depth += 1
        elif source[i] == closing:
            depth -= 1
            if not depth:
                return i + 1
        i += 1
    return len(source)


def _attributes(source: str) -> tuple[Attribute, ...]:
    result = []
    i = 0
    while i < len(source):
        if source[i].isspace() or source[i] in '/>':
            i += 1
            continue
        if source[i] == '{':
            end = _balanced_end(source, i)
            result.append(Attribute('spread', source[i + 1:end - 1], True))
            i = end
            continue
        match = re.match(r'[^\s=/>]+', source[i:])
        if not match:
            i += 1
            continue
        name = match.group(0)
        i += len(name)
        while i < len(source) and source[i].isspace():
            i += 1
        value, expression = '', False
        if i < len(source) and source[i] == '=':
            i += 1
            while i < len(source) and source[i].isspace():
                i += 1
            if i < len(source) and source[i] in "\"'":
                end = _quoted_end(source, i)
                value = source[i + 1:end - 1]
                i = end
            elif i < len(source) and source[i] == '{':
                end = _balanced_end(source, i)
                value, expression = source[i + 1:end - 1], True
                i = end
            else:
                start = i
                while i < len(source) and not source[i].isspace() and source[i] != '>':
                    i += 1
                value = source[start:i].rstrip('/')
        result.append(Attribute(name, value, expression))
    return tuple(result)


def _elements(source: str, *, jsx: bool = False):
    """Walk static tags, skipping JS strings/comments outside JSX text."""
    i, depth = 0, 0
    while i < len(source):
        if source.startswith('<!--', i):
            end = source.find('-->', i + 4)
            i = len(source) if end < 0 else end + 3
            continue
        if jsx and source.startswith(('/*', '//'), i):
            marker = '*/' if source.startswith('/*', i) else '\n'
            end = source.find(marker, i + 2)
            i = len(source) if end < 0 else end + len(marker)
            continue
        if jsx and not depth and source[i] in "\"'`":
            i = _quoted_end(source, i)
            continue
        if jsx and depth and source[i] == '{':
            end = _balanced_end(source, i)
            for element in _elements(source[i + 1:end - 1], jsx=True):
                yield Element(element.tag, element.attrs, element.offset + i + 1, element.closing, element.empty)
            i = end
            continue
        if jsx and (source.startswith('<>', i) or source.startswith('</>', i)):
            closing = source.startswith('</>', i)
            depth = max(0, depth - 1) if closing else depth + 1
            i += 3 if closing else 2
            continue
        match = TAG.match(source, i)
        if not match:
            i += 1
            continue
        start, end = i, match.end()
        while end < len(source):
            if source[end] in "\"'":
                end = _quoted_end(source, end)
            elif source[end] == '{':
                end = _balanced_end(source, end)
            elif source[end] == '>':
                break
            else:
                end += 1
        if end >= len(source):
            return
        tag, closing = match.group(2), bool(match.group(1))
        if jsx and not depth and not closing and (
            (start > 0 and (source[start - 1].isalnum() or source[start - 1] in '_$]'))
            or (source[end + 1:].lstrip().startswith('(') and not re.search(r'</\s*' + re.escape(tag) + r'\s*>', source[end + 1:]))
        ):
            i = end + 1
            continue
        empty = source[end - 1:end] == '/' or tag.lower() in VOID_TAGS
        attrs = () if closing else _attributes(source[match.end():end])
        yield Element(tag, attrs, start, closing, empty)
        if tag.lower() in {'script', 'style'} and not closing:
            close = re.search(r'</\s*' + re.escape(tag) + r'\s*>', source[end + 1:], re.I)
            i = len(source) if close is None else end + 1 + close.end()
            continue
        if closing:
            depth = max(0, depth - 1)
        elif not empty:
            depth += 1
        i = end + 1


def _layout_property(name: str) -> bool:
    return name in LAYOUT_PROPERTIES or name.startswith(('flex-', 'grid-', 'align-', 'justify-', 'place-', 'margin', 'padding', 'inset-', 'scroll-margin', 'scroll-padding'))


def _zero_or_global(value: str) -> bool:
    return all(part in GLOBAL_VALUES | {'0', '0px', 'auto', 'none', 'normal'} for part in value.strip().split())


def _token_value(value: str) -> bool:
    """A token fallback must not smuggle literal visual values into a consumer."""
    if not TOKEN.search(value) or re.search(r'var\(\s*--(?!mosaik-)', value):
        return False
    if re.search(r'#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\s*\(', value, re.I):
        return False
    if re.search(r'var\([^)]*,', value):
        return False
    return True


def declaration_problem(name: str, value: str, *, base: bool = False, illustration: bool = False) -> tuple[str, str] | None:
    """Return the policy violation for one authored CSS declaration."""
    name = re.sub(r'(?<!^)([A-Z])', lambda m: '-' + m.group(1).lower(), name).lower()
    value = value.strip().removesuffix('!important').strip()
    if illustration and name in {'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin'}:
        return None
    if name.startswith('--'):
        return 'component-token-override', 'Set theme/component values through the documented theme or component API, not local custom-property overrides.'
    if _layout_property(name):
        if name.startswith(('margin', 'padding', 'scroll-margin', 'scroll-padding')) or name in {'gap', 'row-gap', 'column-gap'}:
            if not _zero_or_global(value) and not ('--mosaik-layout-space' in value and _token_value(value)):
                return 'literal-spacing', f'{name} must use --mosaik-layout-space (or zero/auto), not {value!r}.'
        return None
    if name in {'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height'}:
        if value in GLOBAL_VALUES:
            return None
        if name == 'font' and TYPOGRAPHY_ROLE.fullmatch(value):
            return None
        if name == 'font-family' and re.fullmatch(r'var\(\s*--mosaik-font-family\s*\)', value):
            return None
        return 'literal-typography', f'{name} reconstructs typography. Use the complete font:var(--mosaik-typography-<role>) and inherited text instead.'
    if name == 'color':
        if value in GLOBAL_VALUES | {'currentColor', 'currentcolor', 'transparent'} or (_token_value(value) and re.search(r'var\(\s*--mosaik-(?:color|scheme)-', value)):
            return None
        return 'literal-color', f'{name} must use a Mosaik color/scheme token, not {value!r}.'
    if base and name in {'background', 'background-color', 'color-scheme'}:
        if name == 'color-scheme' and value in {'light', 'dark', 'light dark'}:
            return None
        if _token_value(value) or value in {'transparent', 'inherit'}:
            return None
    if name.startswith(('background', 'border', 'box-shadow', 'outline', 'filter', 'text-shadow')):
        return 'hand-built-surface', f'{name} paints a custom surface. Compose the documented Mosaik Card, Badge, Divider or other component instead.'
    return 'non-layout-style', f'{name} is not layout or token typography. Use the documented Mosaik component/theme API.'


def css_declarations(source: str):
    """Find declarations inside rule blocks, or a standalone style attribute."""
    clean = source + ';'
    blocks: list[str] = []
    has_blocks = '{' in source
    start, i, parentheses = 0, 0, 0
    while i < len(clean):
        char = clean[i]
        if char in "\"'":
            i = _quoted_end(clean, i)
            continue
        if char == '(':
            parentheses += 1
        elif char == ')':
            parentheses = max(0, parentheses - 1)
        elif not parentheses and char == '{':
            blocks.append(clean[start:i].strip())
            start = i + 1
        elif not parentheses and char in ';}':
            segment = clean[start:i]
            match = re.fullmatch(r'\s*((?:--)?[\w-]+)\s*:\s*(.*?)\s*', segment, re.S)
            if match and (blocks or not has_blocks) and not any(selector.startswith('@font-face') for selector in blocks):
                selector = next((value for value in reversed(blocks) if not value.startswith('@')), '')
                yield match.group(1), match.group(2), start + match.start(1), selector
            if char == '}' and blocks:
                blocks.pop()
            start = i + 1
        i += 1


def inspect_css(source: str, path: Path, offset: int = 0, *, base: bool = False, illustration: bool = False) -> list[Issue]:
    clean = _without_comments(source)
    findings = []
    for match in re.finditer(r'#\{|\{\{|\$\{', clean):
        findings.append(Issue(path, _line(source, match.start()) + offset, 'unverified-style', 'Resolve interpolated CSS before claiming that its declarations satisfy the layout/token contract.'))
    for name, value, start, selector in css_declarations(clean):
        page_base = base or bool(selector and all(part.strip() in {'html', 'body', ':root'} for part in selector.split(',')))
        problem = declaration_problem(name, value, base=page_base, illustration=illustration)
        if problem:
            findings.append(Issue(path, _line(source, start) + offset, *problem))
    for match in re.finditer(r'@(?:apply|include)\b([^;]*);', clean):
        if match.group(0).startswith('@apply'):
            for rule, message in class_problems(match.group(1)):
                findings.append(Issue(path, _line(source, match.start()) + offset, rule, message))
        else:
            findings.append(Issue(path, _line(source, match.start()) + offset, 'unverified-style', 'Resolve this authored mixin and check its declarations; it is not statically verified.'))
    return findings


def _utility_base(value: str) -> str:
    depth, split = 0, 0
    for i, char in enumerate(value):
        if char in '[(':
            depth += 1
        elif char in '])':
            depth -= 1
        elif char == ':' and not depth:
            split = i + 1
    return value[split:].strip('!')


def class_problems(value: str, known_classes: frozenset[str] = frozenset()) -> list[tuple[str, str]]:
    problems = []
    exact = {'flex', 'inline-flex', 'grid', 'inline-grid', 'block', 'inline-block', 'inline', 'hidden', 'contents', 'flow-root', 'relative', 'absolute', 'fixed', 'sticky', 'static', 'container', 'isolate', 'isolation-auto', 'sr-only', 'not-sr-only', 'grow', 'shrink', 'truncate', 'clearfix', 'text-left', 'text-right', 'text-center', 'text-justify', 'text-start', 'text-end', 'text-wrap', 'text-nowrap', 'text-balance', 'text-pretty'}
    prefixes = ('flex-', 'grid-', 'col-', 'row-', 'auto-cols-', 'auto-rows-', 'items-', 'justify-', 'self-', 'place-', 'order-', 'w-', 'h-', 'min-w-', 'max-w-', 'min-h-', 'max-h-', 'size-', 'basis-', 'grow-', 'shrink-', 'aspect-', 'overflow-', 'overscroll-', 'inset-', 'top-', 'right-', 'bottom-', 'left-', 'start-', 'end-', 'z-', 'float-', 'clear-', 'object-', 'whitespace-', 'break-', 'text-ellipsis', 'text-clip', 'align-', 'columns-', 'pointer-events-', 'scroll-', 'snap-')
    for original in value.split():
        utility = _utility_base(original)
        if utility in known_classes:
            continue
        if utility.startswith('[') and utility.endswith(']') and ':' in utility:
            name, val = utility[1:-1].split(':', 1)
            problem = declaration_problem(name, val.replace('_', ' '))
            if problem:
                problems.append(problem)
            continue
        positive = utility.removeprefix('-')
        spacing = re.fullmatch(r'(?:(?:scroll-)?[mp][trblxyse]?|gap(?:-[xy])?|space-[xy])-(.+)', positive)
        if spacing:
            amount = spacing.group(1)
            if amount.startswith('[') and not ('--mosaik-layout-space' in amount and _token_value(amount)) and amount not in {'[0]', '[0px]'}:
                problems.append(('literal-spacing', f'{original!r} uses arbitrary spacing instead of the Mosaik layout preset.'))
            continue
        if positive in exact or positive.startswith(prefixes):
            continue
        if re.fullmatch(r'content-(?:normal|center|start|end|between|around|evenly|baseline|stretch)', positive):
            continue
        if positive.startswith(('bg-', 'text-', 'font-', 'leading-', 'tracking-', 'rounded', 'border', 'shadow', 'ring', 'outline', 'divide', 'fill-', 'stroke-', 'opacity-', 'decoration-', 'underline', 'italic', 'not-italic', 'antialiased', 'transition', 'duration-', 'ease-', 'animate-', 'cursor-', 'accent-', 'appearance-')):
            problems.append(('non-layout-utility', f'{original!r} styles UI beyond layout. Use the Mosaik component/theme and token typography.'))
        elif positive not in {'group', 'peer'}:
            problems.append(('unverified-class', f'Cannot verify class {original!r}; include its authored stylesheet or replace it with supported layout utilities.'))
    return problems


def _static_expression(value: str) -> str | None:
    stripped = value.strip()
    if len(stripped) >= 2 and stripped[0] in "\"'`" and _quoted_end(stripped, 0) == len(stripped):
        return None if '${' in stripped else stripped[1:-1]
    return None


def _style_object(value: str) -> list[tuple[str, str]] | None:
    value = value.strip()
    if not (value.startswith('{') and value.endswith('}')) or '...' in value:
        return None
    items, i = [], 1
    while i < len(value) - 1:
        if value[i].isspace() or value[i] == ',':
            i += 1
            continue
        if value[i] in "\"'":
            end = _quoted_end(value, i)
            name, i = value[i + 1:end - 1], end
        else:
            match = re.match(r'[\w-]+', value[i:])
            if not match:
                return None
            name = match.group(0)
            i += len(name)
        while i < len(value) and value[i].isspace():
            i += 1
        if i >= len(value) or value[i] != ':':
            return None
        i += 1
        start, depth = i, 0
        while i < len(value) - 1:
            if value[i] in "\"'`":
                i = _quoted_end(value, i)
                continue
            if value[i] in '([{':
                depth += 1
            elif value[i] in ')]}':
                depth -= 1
            elif value[i] == ',' and not depth:
                break
            i += 1
        raw = value[start:i].strip()
        literal = _static_expression(raw)
        if literal is None and not re.fullmatch(r'-?\d+(?:\.\d+)?', raw):
            # Dynamic geometry is still layout; visual values must be tokens.
            if not _layout_property(re.sub(r'([A-Z])', lambda m: '-' + m.group(1).lower(), name)):
                return None
        items.append((name, raw if literal is None else literal))
    return items


def _imports(source: str) -> dict[str, tuple[str, str]]:
    result = {}
    for match in IMPORT.finditer(_without_comments(source, javascript=True)):
        bindings, module = match.group(1).strip(), match.group(3)
        namespace = re.search(r'\*\s+as\s+(\w+)', bindings)
        if namespace:
            result[namespace.group(1)] = (module, '*')
        named = re.search(r'\{(.*?)\}', bindings, re.S)
        if named:
            for item in named.group(1).split(','):
                names = re.fullmatch(r'\s*(\w+)(?:\s+as\s+(\w+))?\s*', item)
                if names:
                    result[names.group(2) or names.group(1)] = (module, names.group(1))
        default = re.match(r'(\w+)(?:\s*,|\s*$)', bindings)
        if default:
            result[default.group(1)] = (module, 'default')
    return result


def _mosaik_selector(selector: str) -> bool:
    """Recognize one Mosaik host, never a descendant reached through that host."""
    match = re.fullmatch(r'(mosaik-[\w-]+)(?:[.#][\w-]+|\[[^\]]+\])*', selector.strip())
    return bool(match and verified_mosaik_tag(match.group(1)))


def _interaction_writes(source: str):
    clean = _without_comments(source, javascript=True)
    code = _without_strings(clean)
    known_hosts = set()
    binding = re.compile(r'\bconst\s+(\w+)\s*=\s*[\w.]+\.querySelector\(\s*([\'"])([^\'"\n]+)\2\s*\)')
    for match in binding.finditer(clean):
        if code[match.start():match.start() + 5] == 'const' and _mosaik_selector(match.group(3)):
            if len(re.findall(r'\b(?:const|let|var)\s+' + re.escape(match.group(1)) + r'\b', code)) == 1:
                known_hosts.add(match.group(1))
    events = r'on(?:click|dblclick|contextmenu|input|beforeinput|change|submit|reset|focus|blur|key\w*|pointer\w*|mouse\w*|touch\w*|drag\w*|drop|paste|cut|copy|wheel)'
    writes = re.compile(r'\.\s*(' + events + r')\s*=|\[\s*([\'"])(' + events + r')\2\s*\]\s*=')
    for match in writes.finditer(clean):
        # Dots/brackets inside ordinary source strings are not executable writes.
        if code[match.start():match.start() + 1] not in {'.', '['}:
            continue
        prefix = clean[:match.start()].rstrip()
        identifier = re.search(r'(?<![\w.])([A-Za-z_$][\w$]*)$', prefix)
        if identifier and identifier.group(1) in known_hosts | {'window', 'document', 'globalThis'}:
            continue
        direct = re.search(r'\b[\w.]+\.querySelector\(\s*([\'"])([^\'"\n]+)\1\s*\)$', prefix)
        if direct and _mosaik_selector(direct.group(2)):
            continue
        yield match.start()


def _fragments(source: str, path: Path):
    """Select actual template/style owners instead of all strings in a TS file."""
    if path.suffix in {'.html', '.vue', '.svelte'}:
        yield source, 0, False
    elif path.suffix in {'.tsx', '.jsx'}:
        yield source, 0, True
    else:
        clean = _without_comments(source, javascript=True)
        code = _without_strings(clean)
        for match in re.finditer(r'\btemplate\s*:|\bhtml(?:\s*<[^>]+>)?', code):
            start = match.end()
            while start < len(source) and source[start].isspace():
                start += 1
            if source[start:start + 1] not in {'\'', '"', '`'}:
                continue
            end = _quoted_end(source, start)
            yield source[start + 1:end - 1], start + 1, False


def _inline_styles(source: str):
    for match in re.finditer(r'<style\b[^>]*>(.*?)</style>', source, re.S | re.I):
        yield match.group(1), match.start(1)
    clean = _without_comments(source, javascript=True)
    code = _without_strings(clean)
    yielded = set()
    for match in re.finditer(r'\bstyles\s*[:=]', code):
        start = match.end()
        while start < len(source) and source[start].isspace():
            start += 1
        end = _balanced_end(source, start, '[', ']') if source[start:start + 1] == '[' else len(source)
        cursor = start
        while cursor < end:
            if source[cursor] in "\"'`":
                finish = _quoted_end(source, cursor)
                yielded.add(cursor)
                yield source[cursor + 1:finish - 1], cursor + 1
                cursor = finish
                if source[start:start + 1] != '[':
                    break
            elif source[cursor] == ';' and source[start:start + 1] != '[':
                break
            else:
                cursor += 1
    for match in re.finditer(r'\bcss\b', code):
        start = match.end()
        while start < len(source) and source[start].isspace():
            start += 1
        if source[start:start + 1] != '`':
            continue
        if start not in yielded:
            end = _quoted_end(source, start)
            yield source[start + 1:end - 1], start + 1


def _has_template_owner(source: str, path: Path) -> bool:
    if path.suffix in {'.html', '.vue', '.svelte'}:
        return True
    if re.search(r'\btemplateUrl\s*:', _without_comments(source, javascript=True)):
        return True
    return any(not element.closing for fragment, _, jsx in _fragments(source, path) for element in _elements(fragment, jsx=jsx))


def _local_renderers(source: str) -> set[str]:
    """Accept local JSX owners with inspectable bodies, not arbitrary aliases."""
    result = set()
    clean = _without_comments(source, javascript=True)
    pattern = re.compile(r'\b(?:function|class)\s+([A-Z]\w*)|\b(?:const|let)\s+([A-Z]\w*)\s*=')
    for match in pattern.finditer(clean):
        start = match.end()
        if match.group(1):
            brace = clean.find('{', start)
            if brace < 0:
                continue
            body = source[brace:_balanced_end(source, brace)]
        else:
            end, depth = start, 0
            while end < len(source):
                if source[end] in "\"'`":
                    end = _quoted_end(source, end)
                    continue
                if source[end] in '([{':
                    depth += 1
                elif source[end] in ')]}':
                    depth -= 1
                elif source[end] == ';' and not depth:
                    break
                end += 1
            body = source[start:end]
            if '=>' not in _without_strings(body):
                continue
        if any(not element.closing for element in _elements(body, jsx=True)):
            result.add(match.group(1) or match.group(2))
    return result


def _style_imports(source: str):
    clean = _without_comments(source)
    pattern = re.compile(r'@(?:import|use|forward)\s+(?:url\(\s*)?(?:([\'"])([^\'"\n]+)\1|([^\s;)]+))')
    for match in pattern.finditer(clean):
        yield match.group(2) or match.group(3), match.start()


class _Context:
    def __init__(self, paths: list[Path]):
        self.result = Inspection()
        self.seen: set[Path] = set()
        self.sources: dict[Path, str] = {}
        self.selectors: dict[str, Path] = {}
        self.known_classes: frozenset[str] = frozenset()
        for path in paths:
            self.load(path)
            for suffix in ('.css', '.scss'):
                sibling = path.with_suffix(suffix)
                if sibling.is_file():
                    self.load(sibling)
        self._index()

    def load(self, path: Path) -> str:
        path = path.resolve()
        if path not in self.sources:
            self.sources[path] = path.read_text(encoding='utf-8')
        return self.sources[path]

    def _index(self) -> None:
        # Resolve transitive local style imports before class evidence is used by
        # an earlier template; inspection order must not change the verdict.
        pending = list(self.sources)
        visited = set()
        while pending:
            path = pending.pop()
            if path in visited:
                continue
            visited.add(path)
            source = self.sources[path]
            names = [name for name, _ in _style_imports(source)] if path.suffix in {'.css', '.scss'} else []
            if path.suffix not in {'.css', '.scss'}:
                clean = _without_comments(source, javascript=True)
                for match in re.finditer(r'\b(?:templateUrl|styleUrl)\s*:\s*([\'"])([^\'"]+)\1|\bstyleUrls\s*:\s*\[([^\]]*)\]', clean):
                    names.extend([match.group(2)] if match.group(2) else re.findall(r'[\'"]([^\'"]+)[\'"]', match.group(3)))
                names.extend(match.group(2) for match in re.finditer(r'\bimport\s*([\'"])([^\'"]+\.(?:css|scss))\1', clean))
            for name in names:
                target = self.style_path(name, path)
                if target and target.is_file():
                    self.load(target)
                    pending.append(target.resolve())
                    for suffix in ('.css', '.scss'):
                        sibling = target.with_suffix(suffix)
                        if sibling.is_file():
                            self.load(sibling)
                            pending.append(sibling.resolve())
        classes = set()
        for path, source in list(self.sources.items()):
            styles = source if path.suffix in {'.css', '.scss'} else '\n'.join(value for value, _ in _inline_styles(source))
            classes.update(re.findall(r'\.([A-Za-z_][\w-]*)', _without_comments(styles)))
            for match in re.finditer(r'\bselector\s*:\s*[\'"]([^\'"]+)[\'"]|@customElement\(\s*[\'"]([^\'"]+)', _without_comments(source, javascript=True)):
                for selector in (match.group(1) or match.group(2)).split(','):
                    if re.fullmatch(r'[a-z][\w-]+', selector.strip()):
                        self.selectors[selector.strip()] = path
        self.known_classes = frozenset(classes)

    def report(self, path: Path, source: str, offset: int, rule: str, message: str) -> None:
        self.result.findings.append(Issue(path, _line(source, offset), rule, message))

    def style_import(self, name: str, path: Path, source: str, offset: int) -> None:
        if name.startswith(('@pixel-brewery/mosaik-themes', 'tailwindcss')) or name.startswith('https://fonts.googleapis.com/'):
            return
        if '://' in name or name.startswith('//'):
            self.report(path, source, offset, 'unverified-style-import', f'Cannot inspect stylesheet {name!r}; include its authored owner.')
            return
        target = self.style_path(name, path)
        if target and target.is_file():
            self.load(target)
            self._index()
            self.inspect(target)
        else:
            self.report(path, source, offset, 'missing-style-template', f'Cannot inspect stylesheet {name!r}; include its authored owner.')

    @staticmethod
    def style_path(name: str, path: Path) -> Path | None:
        if '://' in name or name.startswith(('@', '//')) or name == 'tailwindcss':
            return None
        target = path.parent / name
        if not target.suffix:
            target = next((candidate for candidate in (target.with_suffix('.scss'), target.with_suffix('.css'), target.with_name('_' + target.name + '.scss')) if candidate.is_file()), target)
        return target

    def inspect(self, path: Path) -> None:
        path = path.resolve()
        if path in self.seen:
            return
        self.seen.add(path)
        source = self.load(path)
        self.result.files.append(path)
        if path.suffix not in APP_SUFFIXES:
            self.report(path, source, 0, 'unsupported-source', 'This source type is not statically checked; inspect its actual template/style owner.')
            return
        clean = _without_comments(source, javascript=path.suffix in {'.ts', '.js', '.tsx', '.jsx', '.vue', '.svelte'})
        if 'mosaik-exception:' in source:
            for match in re.finditer(r'mosaik-exception:', source):
                if clean[match.start():match.end()] != match.group(0):
                    self.report(path, source, match.start(), 'legacy-exception', 'Line-level exceptions are not supported and cannot waive UI checks.')
        if path.suffix in {'.css', '.scss'}:
            self.result.findings.extend(inspect_css(source, path))
            for name, start in _style_imports(clean):
                self.style_import(name, path, source, start)
            return
        for match in re.finditer(r'\bimport\s*([\'"])([^\'"]+\.(?:css|scss))\1', clean):
            self.style_import(match.group(2), path, source, match.start())
        referenced = []
        for match in re.finditer(r'\b(?:templateUrl|styleUrl)\s*:\s*([\'"])([^\'"]+)\1|\bstyleUrls\s*:\s*\[([^\]]*)\]', clean):
            names = [match.group(2)] if match.group(2) else re.findall(r'[\'"]([^\'"]+)[\'"]', match.group(3))
            for name in names:
                target = path.parent / name
                if target.is_file():
                    self.load(target)
                    referenced.append(target)
                else:
                    self.report(path, source, match.start(), 'missing-style-template', f'Cannot inspect declared template/style {name!r}.')
        self._index()
        for target in referenced:
            self.inspect(target)
        imports = _imports(source)
        local_names = _local_renderers(source)
        code = _without_strings(clean)
        for match in re.finditer(r'\btemplate\s*:', code):
            start = match.end()
            while start < len(source) and source[start].isspace():
                start += 1
            if source[start:start + 1] not in {'\'', '"', '`'}:
                self.report(path, source, match.start(), 'unverified-template', 'Resolve this nonliteral template to its rendered source owner; a template identifier/expression cannot establish compliance.')
        for fragment, offset, jsx in _fragments(source, path):
            self.inspect_markup(fragment, path, source, offset, jsx, imports, local_names)
        injected = re.search(r'\bdangerouslySetInnerHTML\s*=|\.innerHTML\s*\+?=|\binsertAdjacentHTML\s*\(|\bv-html\s*=|\b(?:createElement|createElementNS|setHTMLUnsafe)\s*\(', _without_strings(clean))
        if injected:
            match = injected
            self.report(path, source, match.start(), 'dynamic-template', 'Rendered HTML injection needs its actual template owner checked; it cannot be certified from a string/API name.')
        code = _without_strings(clean)
        imperative_style = re.search(r'\.style(?:\.[\w]+)?\s*\+?=|\.style\.(?:setProperty|removeProperty)\s*\(|\badoptedStyleSheets\s*=|\bnew\s+CSSStyleSheet\s*\(', code)
        if imperative_style:
            self.report(path, source, imperative_style.start(), 'dynamic-style', 'Imperative style mutation is not statically verified; move consumer styling to the checked layout/theme owner.')
        imperative_class = re.search(r'\.className\s*=|\.classList\.(?:add|remove|toggle|replace)\s*\(', code)
        if imperative_class:
            self.report(path, source, imperative_class.start(), 'dynamic-class', 'Imperative class mutation is not statically verified; inspect every rendered class branch.')
        for position in _interaction_writes(source):
            self.report(path, source, position, 'dynamic-interaction', 'This imperative event-property write has no verified Mosaik control owner. Use the documented Mosaik control and inspect its actual binding owner.')
        for style, start in _inline_styles(source):
            self.result.findings.extend(inspect_css(style, path, _line(source, start) - 1))
        for suffix in ('.css', '.scss'):
            sibling = path.with_suffix(suffix)
            if sibling.is_file():
                self.inspect(sibling)

    def component(self, tag: str, path: Path, imports: dict[str, tuple[str, str]], local_names: set[str]) -> tuple[bool, str | None]:
        if tag.startswith('mosaik-'):
            return verified_mosaik_tag(tag), None if verified_mosaik_tag(tag) else 'The tag is absent from the bundled Mosaik catalog; verify/update the catalog against the installed package.'
        if tag.lower() in STRUCTURAL_TAGS or (tag[:1].islower() and tag.lower() in NATIVE_TAGS):
            return False, None
        if tag in self.selectors:
            self.inspect(self.selectors[tag])
            return False, None
        root, _, member = tag.partition('.')
        if root in imports:
            module, exported = imports[root]
            exported = member if exported == '*' else exported
            if MOSAIK_PACKAGE.fullmatch(module):
                valid = verified_mosaik_export(exported, module)
                return valid, None if valid else f'{exported!r} is not a verified component export of {module!r}.'
            if exported in FRAMEWORK_COMPONENTS.get(module, set()):
                return False, None
            if module.startswith('.'):
                base = path.parent / module
                candidates = [base, *(base.with_suffix(suffix) for suffix in ('.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte')), *(base / ('index' + suffix) for suffix in ('.tsx', '.jsx', '.ts', '.js'))]
                target = next((candidate for candidate in candidates if candidate.is_file()), None)
                if target:
                    self.load(target)
                    self._index()
                    self.inspect(target)
                    target_source = self.sources[target.resolve()]
                    for names, origin in re.findall(r'\bexport\s*\{([^}]+)\}\s*from\s*[\'"]([^\'"]+)[\'"]', _without_comments(target_source, javascript=True)):
                        for item in names.split(','):
                            parts = re.split(r'\s+as\s+', item.strip())
                            if parts[-1] == exported:
                                return False, f'Resolve re-export {exported!r} from {origin!r} to its actual Mosaik UI owner; unrelated renderers in this barrel are not evidence.'
                    if target.suffix in {'.tsx', '.jsx'} and exported != 'default' and exported not in _local_renderers(target_source):
                        return False, f'Cannot establish the renderer for {exported!r} in {module!r}; include its actual UI owner.'
                    if _has_template_owner(self.sources[target.resolve()], target):
                        return False, None
                    return False, f'Local component {tag!r} has no inspectable template in {module!r}; resolve re-exports/factories to the actual UI owner.'
                return False, f'Cannot inspect local component {tag!r} from {module!r}; include its source owner.'
            return False, f'{tag!r} comes from {module!r}. Use Mosaik or inspect a local composition of Mosaik components.'
        if tag in local_names:
            return False, None
        return False, f'Cannot verify component {tag!r}; include its implementation/import owner. A name or prefix alone is not component evidence.'

    def inspect_markup(self, fragment: str, path: Path, source: str, offset: int, jsx: bool, imports: dict[str, tuple[str, str]], local_names: set[str]) -> None:
        stack: list[tuple[str, bool]] = []
        clean = _without_comments(fragment, javascript=jsx)
        for match in re.finditer(r'mosaik-exception:', fragment):
            if clean[match.start():match.end()] != match.group(0):
                self.report(path, source, offset + match.start(), 'legacy-exception', 'Line-level exceptions are not supported and cannot waive UI checks.')
        for element in _elements(fragment, jsx=jsx):
            tag = element.tag.lower() if path.suffix == '.html' and element.tag.isupper() else element.tag
            native = tag[:1].islower() and tag.lower() in NATIVE_TAGS
            values = {item.name.lower(): item for item in element.attrs}
            position = offset + element.offset
            if element.closing:
                for index in range(len(stack) - 1, -1, -1):
                    if stack[index][0] == tag.lower():
                        del stack[index:]
                        break
                continue
            if tag.lower() == 'link' and values.get('rel', Attribute('', '')).value == 'stylesheet':
                href = values.get('href')
                if href:
                    self.style_import(href.value, path, source, position)
            if tag.lower() == 'style' and values.get('src'):
                self.style_import(values['src'].value, path, source, position)
            is_mosaik, error = self.component(tag, path, imports, local_names)
            if error:
                self.report(path, source, position, 'unverified-component' if not tag.startswith('mosaik-') else 'unknown-mosaik-component', error)
            if is_mosaik:
                self.result.components += 1
                if tag in {'mosaik-stack', 'Stack'}:
                    self.report(path, source, position, 'deprecated-stack', 'Stack is deprecated; use native flex/grid layout.')
            if 'data-mosaik-exception' in values:
                self.report(path, source, position, 'legacy-exception', 'data-mosaik-exception cannot waive a component requirement. Only a scoped static illustration may be declared.')
            illustration = values.get('data-mosaik-illustration')
            if illustration:
                if tag.lower() not in {'svg', 'canvas'} or not illustration.value.strip() or illustration.expression:
                    self.report(path, source, position, 'illustration-exception', 'Only a static SVG/canvas can declare data-mosaik-illustration with a concrete reason.')
                else:
                    self.result.exceptions.append(f'{path}:{_line(source, position)}: <{tag}> {illustration.value.strip()}')
            valid_illustration = bool(illustration and tag.lower() in {'svg', 'canvas'} and illustration.value.strip() and not illustration.expression)
            in_illustration = any(active for _, active in stack) or valid_illustration
            if not element.empty:
                stack.append((tag.lower(), valid_illustration))
            if tag.lower() in {'svg', 'canvas'} and not in_illustration:
                self.report(path, source, position, 'undeclared-illustration', 'Use Mosaik Icon/Image/Chart, or declare a scoped static illustration and its reason.')
            if native and tag.lower() in NATIVE_CONTROLS:
                self.report(path, source, position, 'native-control', f'Replace <{tag}> with the documented Mosaik component.')
            role = values.get('role')
            if native and role and role.value in CONTROL_ROLES:
                self.report(path, source, position, 'control-role', f'<{tag} role={role.value!r}> recreates an available Mosaik UI component.')
            for item in element.attrs:
                name = item.name.lower()
                if native and (re.match(r'^(?:on[-:]?[a-z]+|\([^)]*\)|@[\w.:-]+|on:[\w.:-]+|v-on(?::[\w.:-]+)?)$', name) or name in {'contenteditable', 'aria-pressed', 'aria-checked', 'aria-selected', 'aria-expanded'}):
                    self.report(path, source, position, 'plain-handler', f'<{tag}> supplies interaction ({item.name}); use the Mosaik control/behavior.')
                if name == 'spread':
                    self.report(path, source, position, 'unverified-props', 'Spread props can hide styles/interaction; inspect explicit props before claiming compliance.')
                if name in {'class', 'classname'}:
                    value = _static_expression(item.value) if item.expression else item.value
                    if value is None or '{{' in value or '${' in value:
                        self.report(path, source, position, 'dynamic-class', 'Resolve every rendered class branch; dynamic class expressions are not statically verified.')
                    else:
                        for rule, message in class_problems(value, self.known_classes):
                            self.report(path, source, position, rule, message)
                elif name.startswith(('[class.', 'class:')):
                    value = item.name[7:-1] if name.startswith('[class.') else item.name[6:]
                    for rule, message in class_problems(value, self.known_classes):
                        self.report(path, source, position, rule, message)
                elif name in {'[class]', ':class', 'v-bind:class', '[ngclass]'}:
                    value = _static_expression(item.value)
                    if value is None:
                        self.report(path, source, position, 'dynamic-class', 'Resolve every rendered class branch; dynamic class maps are not statically verified.')
                    else:
                        for rule, message in class_problems(value, self.known_classes):
                            self.report(path, source, position, rule, message)
                if name == 'style':
                    if item.expression:
                        declarations = _style_object(item.value)
                        if declarations is None:
                            self.report(path, source, position, 'dynamic-style', 'Resolve this style object; visual values must be verified Mosaik tokens and styles must remain layout.')
                        else:
                            for prop, value in declarations:
                                problem = declaration_problem(prop, value, base=tag.lower() in {'body', 'html'}, illustration=in_illustration and tag.lower() in SVG_TAGS)
                                if problem:
                                    self.report(path, source, position, *problem)
                    else:
                        for issue in inspect_css(item.value + ';', path, _line(source, position) - 1, base=tag.lower() in {'body', 'html'}, illustration=in_illustration and tag.lower() in SVG_TAGS):
                            self.result.findings.append(issue)
                elif name.startswith('[style.'):
                    prop = name[7:-1].split('.', 1)[0]
                    literal = _static_expression(item.value)
                    spacing = prop.startswith(('padding', 'margin', 'scroll-padding', 'scroll-margin')) or prop in {'gap', 'row-gap', 'column-gap'}
                    if literal is None and spacing:
                        self.report(path, source, position, 'literal-spacing', 'Bound spacing, including Angular unit bindings, must resolve to --mosaik-layout-space rather than an arbitrary number/expression.')
                    elif literal is None and not _layout_property(prop):
                        self.report(path, source, position, 'dynamic-style', 'Resolve this visual style binding against the Mosaik token/component API.')
                    elif literal is not None:
                        problem = declaration_problem(prop, literal)
                        if problem:
                            self.report(path, source, position, *problem)
                elif name.startswith('style:'):
                    prop = name[6:].split('|', 1)[0]
                    literal = _static_expression(item.value) if item.expression else item.value
                    if literal is None or not literal:
                        self.report(path, source, position, 'dynamic-style', 'Resolve this Svelte style directive against the layout/token contract.')
                    else:
                        problem = declaration_problem(prop, literal)
                        if problem:
                            self.report(path, source, position, *problem)
                elif name in {'[style]', ':style', 'v-bind:style', '[ngstyle]'}:
                    self.report(path, source, position, 'dynamic-style', 'Resolve this style binding; a dynamic object is not statically verified.')
                if native and tag.lower() in SVG_TAGS and name in {'fill', 'stroke'} and not in_illustration:
                    self.report(path, source, position, 'undeclared-illustration', 'SVG presentation belongs to a declared static illustration or a Mosaik component.')


def inspect_files(paths: list[Path]) -> Inspection:
    """Inspect authored files plus declared/sibling style and local UI owners once."""
    context = _Context([Path(path).resolve() for path in paths])
    for path in list(context.sources):
        context.inspect(path)
    context.result.findings = list(dict.fromkeys(context.result.findings))
    return context.result


def inspect_file(path: Path) -> Inspection:
    return inspect_files([path])


def inspect_source(source: str, path: Path) -> Inspection:
    """Inspect an in-memory template; external class/component owners stay unresolved."""
    path = Path(path).resolve()
    context = _Context([])
    context.sources[path] = source
    context._index()
    context.inspect(path)
    return context.result

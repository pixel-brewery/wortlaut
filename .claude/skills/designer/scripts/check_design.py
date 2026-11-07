#!/usr/bin/env python3
"""Report hand-built controls, literal values and known canvas traps in Mosaik design files."""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys

# A CLI-pinned skill is immutable, including when Python's cache lives beside sources.
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_application import (  # noqa: E402 - also supports runpy-based clients
    APP_SUFFIXES, CONTROL_ROLES as APP_CONTROL_ROLES,
    NATIVE_CONTROLS as APP_NATIVE_CONTROLS, NATIVE_TAGS, SVG_TAGS,
    class_problems, css_declarations, declaration_problem, inspect_files, verified_mosaik_export,
    verified_mosaik_tag,
)

ERROR = 'error'
WARNING = 'warning'
EXCEPTION_ATTR = 'data-mosaik-exception'
PROVIDER = 'Mosaik.MosaikThemeProvider'
CANVAS_SUFFIX = '.dc.html'
SKIPPED_FOLDERS = {'node_modules', 'dist', 'build', '.git', '.nx', '.angular', 'coverage'}

NATIVE_CONTROLS = APP_NATIVE_CONTROLS - {'a'}  # Canvas navigation has a documented anchor adapter.
CONTROL_ROLES = APP_CONTROL_ROLES
VOID_ELEMENTS = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}

# Items a container reads as direct children. The canvas hides imported ones behind a host.
IMPORTED_ITEMS = {
    'BreadcrumbItem', 'Choice', 'ComboItem', 'ListItem', 'MenuItem', 'SegmentItem',
    'SelectItem', 'StepperItem', 'TabItem', 'TabStripItem', 'TreeItem',
}
CARD_PARTS = {'CardActions', 'CardContent', 'CardFooter', 'CardHeader', 'CardSubTitle', 'CardTitle'}

COLOR_LITERAL = re.compile(r'(?<!url\()#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(')
FONT_DECLARATION = re.compile(r'(?:^|[;{\s])(font(?:-family)?)\s*:\s*([^;}]+)')
EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-⛿✀-➿]')
TRUTHY_ATTR = re.compile(r'^(?:is-[a-z-]+|disabled|readonly|required|has-[a-z-]+)$')
CANVAS_TAGS = {'x-dc', 'helmet', 'x-import', 'sc-for', 'sc-if', 'sc-else', 'sc-switch', 'sc-case'}


@dataclass(frozen=True)
class Finding:
    path: Path
    line: int
    severity: str
    rule: str
    message: str

    def render(self) -> str:
        return f'{self.path}:{self.line}: {self.severity} {self.rule}: {self.message}'


@dataclass
class Frame:
    tag: str
    component: str | None
    line: int
    has_element_child: bool = False
    has_text: bool = False
    illustration: bool = False


class CanvasParser(HTMLParser):
    """Walk one canvas board and collect findings, component counts and declared exceptions."""

    def __init__(self, path: Path) -> None:
        super().__init__(convert_charrefs=True)
        self.path = path
        self.findings: list[Finding] = []
        self.exceptions: list[str] = []
        self.stack: list[Frame] = []
        self.components = 0
        self.has_provider = False
        self.has_row_state_rule = False
        self.selectable_rows: list[int] = []
        self.style_depth = 0
        self.known_classes: frozenset[str] = frozenset()

    def report(self, severity: str, rule: str, message: str, line: int | None = None) -> None:
        self.findings.append(Finding(self.path, line or self.getpos()[0], severity, rule, message))

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.enter(tag, attrs)
        if tag in VOID_ELEMENTS:
            self.leave(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.enter(tag, attrs)
        self.leave(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag == 'style':
            self.style_depth = max(0, self.style_depth - 1)
        self.leave(tag)

    def handle_data(self, data: str) -> None:
        if self.style_depth:
            self.check_css(data)
            if 'mosaik-table-body-row' in data:
                self.has_row_state_rule = True
            return
        if self.stack and self.stack[-1].tag == 'script':
            return
        if data.strip() and self.stack:
            self.stack[-1].has_text = True
        if EMOJI.search(data):
            self.report(WARNING, 'emoji', 'Use Mosaik.Icon instead of an emoji.')

    def enter(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {name: value or '' for name, value in attrs}
        component = None
        if tag == 'x-import':
            scope = values.get('component-from-global-scope', '')
            component = scope.split('.', 1)[1] if scope.startswith('Mosaik.') else None
        parent = self.stack[-1] if self.stack else None
        if parent is not None:
            parent.has_element_child = True
        illustration = self.check_exception(tag, values, parent)
        self.check_element(tag, values, component, parent, illustration)
        if tag == 'x-import' and component and component != 'MosaikThemeProvider' and verified_mosaik_export(component):
            self.components += 1
        elif tag.startswith('mosaik-') and verified_mosaik_tag(tag):
            self.components += 1
        if values.get('component-from-global-scope') == PROVIDER:
            self.has_provider = True
        if component == 'TableBodyRow' and ('is-selected' in values or 'on-click' in values):
            self.selectable_rows.append(self.getpos()[0])
        if tag == 'style':
            self.style_depth += 1
        self.stack.append(Frame(tag, component, self.getpos()[0], illustration=illustration))

    def leave(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index].tag == tag:
                frame = self.stack[index]
                del self.stack[index:]
                if tag == 'a' and frame.has_text and not frame.has_element_child:
                    self.report(WARNING, 'plain-link', 'Use Mosaik.Anchor for a text link.', frame.line)
                return

    def check_exception(self, tag: str, values: dict[str, str], parent: Frame | None) -> bool:
        if EXCEPTION_ATTR in values:
            rule = 'legacy-exception' if values[EXCEPTION_ATTR].strip() else 'exception-reason'
            self.report(ERROR, rule, f'{EXCEPTION_ATTR} cannot waive an existing Mosaik component requirement.')
        inherited = bool(parent and parent.illustration and tag in SVG_TAGS)
        if 'data-mosaik-illustration' not in values:
            return inherited
        reason = values['data-mosaik-illustration'].strip()
        if tag not in {'svg', 'canvas'} or not reason or '{{' in reason:
            self.report(ERROR, 'illustration-exception', 'Only a static SVG/canvas may declare a specific illustration reason.')
            return inherited
        self.exceptions.append(f'{self.path}:{self.getpos()[0]}: <{tag}> {reason}')
        return True

    def check_element(self, tag: str, values: dict[str, str], component: str | None, parent: Frame | None, illustration: bool) -> None:
        is_plain = tag != 'x-import' and tag != 'dc-import' and not tag.startswith('mosaik-')
        if tag == 'x-import' and (not component or (component != 'MosaikThemeProvider' and not verified_mosaik_export(component))):
            self.report(ERROR, 'unverified-component', 'Import a documented Mosaik export; a scope/name alone does not verify a component.')
        elif tag.startswith('mosaik-') and not verified_mosaik_tag(tag):
            self.report(ERROR, 'unknown-mosaik-component', 'The tag is not in the verified Mosaik catalog. Verify the installed API before using it.')
        elif tag not in NATIVE_TAGS and tag not in CANVAS_TAGS and not tag.startswith('mosaik-'):
            self.report(ERROR, 'unverified-component', f'Inspect the rendered owner of <{tag}>; it is not a verified Mosaik component or canvas structure.')
        if tag in NATIVE_CONTROLS:
            self.report(ERROR, 'native-control', f'Replace <{tag}> with a Mosaik component.')
        role = values.get('role', '')
        if is_plain and role in CONTROL_ROLES:
            self.report(ERROR, 'control-role', f'<{tag} role="{role}"> is a hand-built control. Use a Mosaik component.')
        if is_plain and any(re.match(r'^(?:on[-:]?[a-z]+|\([^)]*\)|@[\w.:-]+)$', name) for name in values):
            self.report(ERROR, 'plain-handler', f'<{tag}> has an event handler. Clickable things are Mosaik components.')
        if is_plain and any(name in values for name in {'contenteditable', 'aria-pressed', 'aria-checked', 'aria-selected', 'aria-expanded'}):
            self.report(ERROR, 'control-state', 'Use the Mosaik component for interactive state on plain markup.')
        if tag in {'svg', 'canvas'} and not illustration:
            self.report(ERROR, 'undeclared-illustration', 'Use the documented Mosaik component or declare a scoped static illustration.')
        for rule, message in class_problems(values.get('class', ''), self.known_classes):
            self.report(ERROR, rule, message)
        style = values.get('style', '')
        if style:
            page_base = tag in {'html', 'body'} or bool(parent and parent.component == 'MosaikThemeProvider' and 'data-theme' in values)
            self.check_css(style, base=page_base, illustration=illustration)
            if tag == 'x-import' and '--' in style:
                self.report(ERROR, 'import-custom-property', 'Custom properties in the style of an x-import never reach the component.')
        if tag == 'mosaik-table':
            self.report(ERROR, 'raw-table', 'A raw mosaik-table stacks its cells. Import Mosaik.Table with columns.')
        if tag == 'mosaik-card' or tag == 'mosaik-stack':
            name = tag.split('-', 1)[1]
            self.report(ERROR, f'raw-{name}', f'Do not use <{tag}> on a canvas. See references/canvas.md.')
        if tag.startswith('mosaik-'):
            for name, value in values.items():
                if value == 'false' and TRUTHY_ATTR.match(name):
                    self.report(ERROR, 'raw-false', f'{name}="false" counts as true on a raw element. Pass true or undefined.')
        if component:
            self.check_component(component, values, parent)
        if parent is not None and parent.component == 'Card' and 'slot' not in values:
            self.report(ERROR, 'card-children', 'A child of Mosaik.Card without a slot attribute stays invisible on a canvas.')

    def check_component(self, component: str, values: dict[str, str], parent: Frame | None) -> None:
        if component in IMPORTED_ITEMS:
            self.report(ERROR, 'imported-item', f'Write Mosaik.{component} as its raw element inside the imported container.')
        if component in CARD_PARTS:
            self.report(ERROR, 'card-part', f'Mosaik.{component} renders empty on a canvas.')
        if component == 'Stack':
            self.report(ERROR, 'deprecated-stack', 'Stack is deprecated. Use native flexbox or grid.')
        if component == 'Table' and 'columns' not in values:
            self.report(ERROR, 'table-no-columns', 'Mosaik.Table needs columns.')
        if component == 'Button' and parent is not None and parent.tag == 'a':
            self.report(ERROR, 'button-in-link', 'A Button directly inside <a> swallows the click. Wrap it in a pointer-events:none element.')

    def check_css(self, css: str, *, base: bool = False, illustration: bool = False) -> None:
        if any(marker in css for marker in ('{{', '${', '#{')):
            self.report(ERROR, 'dynamic-style', 'Resolve the rendered style owner; interpolated styles are not statically verified.')
        if COLOR_LITERAL.search(css) and not illustration:
            self.report(ERROR, 'literal-color', 'Use a --mosaik-* token instead of a literal color.')
        for _, value in FONT_DECLARATION.findall(css):
            if 'var(' not in value and '{{' not in value and value.strip() not in {'inherit', 'unset', 'initial'}:
                self.report(WARNING, 'literal-font', 'Use a --mosaik-typography-* token instead of a literal font.')
        clean = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
        for name, value, _, selector in css_declarations(clean):
            # The 0.1.185 canvas adapter requires this documented table repair.
            if name in {'--table-body-cell-state-color', '--table-body-cell-state-opacity'} and 'mosaik-table-body-row' in selector and 'mosaik-table-body-cell' in selector:
                if (name.endswith('opacity') and value in {'0', '1'}) or (name.endswith('color') and 'var(--mosaik-' in value and not COLOR_LITERAL.search(value)):
                    continue
            page_base = base or bool(selector and all(part.strip() in {'html', 'body', ':root'} for part in selector.split(',')))
            problem = declaration_problem(name, value, base=page_base, illustration=illustration)
            warned_literal_font = problem and problem[0] == 'literal-typography' and name in {'font', 'font-family'} and 'var(' not in value
            if problem and not warned_literal_font:
                self.report(ERROR, *problem)
        for match in re.finditer(r'@apply\s+([^;]+);', clean):
            for rule, message in class_problems(match.group(1), self.known_classes):
                self.report(ERROR, rule, message)

    def finish(self) -> None:
        if self.components and not self.has_provider:
            self.report(ERROR, 'missing-provider', f'The board has components but no {PROVIDER}.', 1)
        if self.selectable_rows and not self.has_row_state_rule:
            self.report(
                WARNING, 'row-state-rule',
                'Add the table rule from references/canvas.md, otherwise row hover and selection do not paint.',
                self.selectable_rows[0],
            )


@dataclass
class Result:
    findings: list[Finding]
    exceptions: list[str]
    components: int
    files: int
    checked_files: list[Path] = field(default_factory=list)

    @property
    def errors(self) -> int:
        return sum(1 for finding in self.findings if finding.severity == ERROR)

    @property
    def warnings(self) -> int:
        return sum(1 for finding in self.findings if finding.severity == WARNING)


def check_canvas(path: Path) -> CanvasParser:
    parser = CanvasParser(path)
    source = path.read_text(encoding='utf-8')
    styles = '\n'.join(re.findall(r'<style\b[^>]*>(.*?)</style>', source, re.S | re.I))
    parser.known_classes = frozenset(re.findall(r'\.([A-Za-z_][\w-]*)', styles))
    if 'mosaik-exception:' in source:
        parser.report(ERROR, 'legacy-exception', 'A skip pragma cannot waive component or style requirements.', 1)
    parser.feed(source)
    parser.close()
    parser.finish()
    return parser


def is_canvas(path: Path) -> bool:
    return path.name.endswith(CANVAS_SUFFIX)


def collect(targets: list[Path], app: bool) -> list[Path]:
    files: list[Path] = []
    for target in targets:
        if target.is_dir():
            for path in sorted(target.rglob('*')):
                if SKIPPED_FOLDERS & set(path.parts) or not path.is_file():
                    continue
                if is_canvas(path) or (app and path.suffix in APP_SUFFIXES and not path.name.endswith('.d.ts')):
                    files.append(path)
        elif target.is_file():
            files.append(target)
        else:
            raise FileNotFoundError(f'Not found: {target}')
    return sorted(set(path.resolve() for path in files))


def check(targets: list[Path], app: bool = False) -> Result:
    result = Result([], [], 0, 0)
    paths = collect(targets, app)
    if not paths:
        result.findings.append(Finding(targets[0], 1, ERROR, 'empty-scope', 'No supported design files were inspected. Name the actual canvas or use --app for templates and styles.'))
    app_paths = []
    for path in paths:
        if is_canvas(path):
            result.checked_files.append(path)
            parser = check_canvas(path)
            result.findings.extend(parser.findings)
            result.exceptions.extend(parser.exceptions)
            result.components += parser.components
        else:
            if path.suffix in APP_SUFFIXES:
                app_paths.append(path)
            else:
                result.findings.append(Finding(path, 1, ERROR, 'unsupported-file', 'This source type is not inspected; provide supported UI templates and styles.'))
    if app_paths:
        inspected = inspect_files(app_paths)
        result.findings.extend(Finding(item.path, item.line, item.severity, item.rule, item.message) for item in inspected.findings)
        result.components += inspected.components
        result.exceptions.extend(inspected.exceptions)
        result.checked_files.extend(inspected.files)
    result.checked_files = sorted(set(result.checked_files))
    result.files = len(result.checked_files)
    return result


def run_hook(stream) -> int:
    """Claude Code PostToolUse contract: exit 2 shows stderr to the agent, exit 0 stays silent."""
    try:
        payload = json.load(stream)
    except ValueError:
        return 0
    file_path = (payload.get('tool_input') or {}).get('file_path') or ''
    path = Path(file_path)
    if not is_canvas(path) or not path.is_file():
        return 0
    result = check([path])
    if not result.errors and not result.warnings:
        return 0
    for finding in result.findings:
        print(finding.render(), file=sys.stderr)
    print('designer: fix these before continuing. Every control is a Mosaik component.', file=sys.stderr)
    return 2


def main(argv: list[str] | None = None) -> int:
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument('targets', nargs='*', type=Path, help='Files or folders. Folders are searched for .dc.html files.')
    arguments.add_argument('--app', action='store_true', help='Inspect framework templates, inline templates, component imports and authored CSS/SCSS as well as canvases.')
    arguments.add_argument('--json', action='store_true', help='Print the result as JSON.')
    arguments.add_argument('--hook', action='store_true', help='Read a Claude Code PostToolUse payload from stdin.')
    options = arguments.parse_args(argv)
    if options.hook:
        return run_hook(sys.stdin)
    if not options.targets:
        arguments.error('Name at least one file or folder.')
    try:
        result = check(options.targets, options.app)
    except (FileNotFoundError, OSError, UnicodeDecodeError) as error:
        print(error, file=sys.stderr)
        return 2
    if options.json:
        print(json.dumps({
            'files': result.files,
            'checked_files': [str(path) for path in result.checked_files],
            'components': result.components,
            'errors': result.errors,
            'warnings': result.warnings,
            'exceptions': result.exceptions,
            'status': 'failed' if result.errors else 'review-required' if result.warnings else 'passed-with-illustrations' if result.exceptions else 'passed',
            'findings': [
                {'path': str(item.path), 'line': item.line, 'severity': item.severity, 'rule': item.rule, 'message': item.message}
                for item in result.findings
            ],
        }, indent=2))
    else:
        for finding in result.findings:
            print(finding.render())
        for exception in result.exceptions:
            print(f'exception {exception}')
        print(
            f'{result.files} files, {result.components} Mosaik components, '
            f'{result.errors} errors, {result.warnings} warnings, {len(result.exceptions)} exceptions'
        )
    return 1 if result.errors or result.warnings else 0


if __name__ == '__main__':
    sys.exit(main())

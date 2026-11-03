#!/usr/bin/env python3
"""Report hand-built controls, literal values and known canvas traps in Mosaik design files."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys

ERROR = 'error'
WARNING = 'warning'
EXCEPTION_ATTR = 'data-mosaik-exception'
PROVIDER = 'Mosaik.MosaikThemeProvider'
CANVAS_SUFFIX = '.dc.html'
APP_SUFFIXES = {'.html', '.vue', '.svelte', '.tsx', '.jsx', '.ts'}
SKIPPED_FOLDERS = {'node_modules', 'dist', 'build', '.git', '.nx', '.angular', 'coverage'}

NATIVE_CONTROLS = {'button', 'input', 'select', 'textarea', 'table', 'dialog', 'progress', 'meter', 'details'}
CONTROL_ROLES = {
    'button', 'checkbox', 'combobox', 'dialog', 'listbox', 'menu', 'menuitem', 'progressbar',
    'radio', 'radiogroup', 'slider', 'switch', 'tab', 'tablist',
}
EVENT_ATTRS = {'onclick', 'on-click', 'onchange', 'on-change', 'oninput', 'on-input'}
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
APP_NATIVE_TAG = re.compile(r'<(' + '|'.join(sorted(NATIVE_CONTROLS)) + r')(?=[\s>/])')
TRUTHY_ATTR = re.compile(r'^(?:is-[a-z-]+|disabled|readonly|required|has-[a-z-]+)$')


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
        exempt = self.check_exception(tag, values)
        if not exempt:
            self.check_element(tag, values, component, parent)
        if tag == 'x-import' and component and component != 'MosaikThemeProvider':
            self.components += 1
        elif tag.startswith('mosaik-'):
            self.components += 1
        if values.get('component-from-global-scope') == PROVIDER:
            self.has_provider = True
        if component == 'TableBodyRow' and ('is-selected' in values or 'on-click' in values):
            self.selectable_rows.append(self.getpos()[0])
        if tag == 'style':
            self.style_depth += 1
        self.stack.append(Frame(tag, component, self.getpos()[0]))

    def leave(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index].tag == tag:
                frame = self.stack[index]
                del self.stack[index:]
                if tag == 'a' and frame.has_text and not frame.has_element_child:
                    self.report(WARNING, 'plain-link', 'Use Mosaik.Anchor for a text link.', frame.line)
                return

    def check_exception(self, tag: str, values: dict[str, str]) -> bool:
        if EXCEPTION_ATTR not in values:
            return False
        reason = values[EXCEPTION_ATTR].strip()
        if reason:
            self.exceptions.append(f'{self.path}:{self.getpos()[0]}: <{tag}> {reason}')
            return True
        self.report(ERROR, 'exception-reason', f'{EXCEPTION_ATTR} needs a reason.')
        return False

    def check_element(self, tag: str, values: dict[str, str], component: str | None, parent: Frame | None) -> None:
        is_plain = tag != 'x-import' and tag != 'dc-import' and not tag.startswith('mosaik-')
        if tag in NATIVE_CONTROLS:
            self.report(ERROR, 'native-control', f'Replace <{tag}> with a Mosaik component.')
        role = values.get('role', '')
        if is_plain and role in CONTROL_ROLES:
            self.report(ERROR, 'control-role', f'<{tag} role="{role}"> is a hand-built control. Use a Mosaik component.')
        if is_plain and EVENT_ATTRS & set(values):
            self.report(ERROR, 'plain-handler', f'<{tag}> has an event handler. Clickable things are Mosaik components.')
        style = values.get('style', '')
        if style:
            self.check_css(style)
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

    def check_css(self, css: str) -> None:
        if COLOR_LITERAL.search(css):
            self.report(ERROR, 'literal-color', 'Use a --mosaik-* token instead of a literal color.')
        for _, value in FONT_DECLARATION.findall(css):
            if 'var(' not in value and '{{' not in value and value.strip() not in {'inherit', 'unset', 'initial'}:
                self.report(WARNING, 'literal-font', 'Use a --mosaik-typography-* token instead of a literal font.')

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

    @property
    def errors(self) -> int:
        return sum(1 for finding in self.findings if finding.severity == ERROR)

    @property
    def warnings(self) -> int:
        return sum(1 for finding in self.findings if finding.severity == WARNING)


def check_canvas(path: Path) -> CanvasParser:
    parser = CanvasParser(path)
    parser.feed(path.read_text(encoding='utf-8'))
    parser.close()
    parser.finish()
    return parser


def check_app_file(path: Path) -> list[Finding]:
    findings = []
    for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), start=1):
        if 'mosaik-exception:' in line:
            continue
        for match in APP_NATIVE_TAG.finditer(line):
            findings.append(Finding(path, number, ERROR, 'native-control', f'Replace <{match.group(1)}> with a Mosaik component.'))
    return findings


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
    return files


def check(targets: list[Path], app: bool = False) -> Result:
    result = Result([], [], 0, 0)
    for path in collect(targets, app):
        result.files += 1
        if is_canvas(path):
            parser = check_canvas(path)
            result.findings.extend(parser.findings)
            result.exceptions.extend(parser.exceptions)
            result.components += parser.components
        else:
            result.findings.extend(check_app_file(path))
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
    if not result.errors:
        return 0
    for finding in result.findings:
        print(finding.render(), file=sys.stderr)
    print('mosaik-design: fix these before continuing. Every control is a Mosaik component.', file=sys.stderr)
    return 2


def main(argv: list[str] | None = None) -> int:
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument('targets', nargs='*', type=Path, help='Files or folders. Folders are searched for .dc.html files.')
    arguments.add_argument('--app', action='store_true', help='Also search folders for framework templates and check them for native controls.')
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
            'components': result.components,
            'errors': result.errors,
            'warnings': result.warnings,
            'exceptions': result.exceptions,
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
    return 1 if result.errors else 0


if __name__ == '__main__':
    sys.exit(main())

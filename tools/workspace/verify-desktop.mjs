// Exercises the real desktop app over the debugging port: the built one, or the packaged one with `--packaged`.
// It uses a temporary profile, a temporary project with invented strings and the memory store for secrets.

// #region Imports

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// #endregion

const root = fileURLToPath(new URL('../../', import.meta.url));
const packaged = process.argv.includes('--packaged');
const label = packaged ? 'packaged' : 'built';
const evidenceDirectory = join(root, `.codex-work/desktop-smoke-${label}`);
const temporary = mkdtempSync(join(tmpdir(), 'wortlaut-e2e-'));
const profile = join(temporary, 'profile');
const project = join(temporary, 'demo');
const environment = { ...process.env, WORTLAUT_HOME: profile, WORTLAUT_SECRET_STORE: 'memory' };
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const failures = [];
const evidence = { label, platform: process.platform, arch: process.arch, views: {}, problems: [] };

delete environment.ELECTRON_RUN_AS_NODE;

/**
 * The views of the app, and what each one has to show for the temporary project.
 */
const VIEWS = [
  ['workspaces', 'Workspaces', 'Your workspaces'],
  ['projects', 'Projects', 'demo'],
  ['overview', 'Overview', 'namespaces in'],
  ['translations', 'Translations', 'loc.hello'],
  ['detect', 'Detect', 'Find strings'],
  ['analyze', 'Analyze', 'Built-in rules'],
  ['generate', 'Generate', 'Translate the base locale'],
  ['transform', 'Transform and sort', 'Convert catalogs'],
  ['review', 'Review', 'Changes wait here'],
  ['rule-packs', 'Rule packs', 'Rules come in packs'],
  ['test-lab', 'Test lab', 'Try a translation'],
  ['runs', 'Runs', 'Every command'],
  ['mcp', 'MCP and plugins', 'Use Wortlaut from'],
  ['cli-nx', 'CLI and Nx', 'The app sits on top'],
  ['settings', 'Settings', 'Shown next to the name'],
];

function executable() {
  if (!packaged) {
    return { command: createRequire(import.meta.url)('electron'), args: ['.'], cwd: root };
  }

  const folder = join(
    root,
    process.env['WORTLAUT_OUTPUT_DIR'] ?? 'out',
    `Wortlaut-${process.platform}-${process.arch}`,
  );
  const paths = {
    darwin: 'Wortlaut.app/Contents/MacOS/Wortlaut',
    win32: 'Wortlaut.exe',
    linux: 'Wortlaut',
  };

  return { command: join(folder, paths[process.platform]), args: [], cwd: temporary };
}

function seed() {
  mkdirSync(join(project, 'i18n'), { recursive: true });
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'package.json'), '{"name":"demo","version":"1.0.0"}\n');
  writeFileSync(join(project, 'i18n/lang.en.json'), '{"loc":{"hello":"Hello","bye":"Bye {0}"}}\n');
  writeFileSync(join(project, 'i18n/lang.de.json'), '{"loc":{"hello":"Hallo"}}\n');
  writeFileSync(join(project, 'src/view.html'), '<button>Save now</button>\n');

  const script = `
        const { WortlautEngine } = require(${JSON.stringify(join(root, 'libs/backend/engine/dist/Index.js'))});
        const logger = { log() {}, warn() {}, error: console.error, info() {}, debug() {} };
        const engine = new WortlautEngine({ surface: 'desktop', logger, profileRoot: ${JSON.stringify(profile)}, home: ${JSON.stringify(temporary)}, tool: { name: 'e2e', version: '0' } });
        const { workspaceId } = engine.workspaces.create({ name: 'Demo', code: 'DM', color: 'blue', repository: ${JSON.stringify(project)} });
        const inspection = engine.inspector.inspect(${JSON.stringify(project)}, [], null);
        const { projectId } = engine.workspaces.register({ inspection, workspace: { kind: 'existing', id: workspaceId }, preset: null, baseLocale: 'en', targetLocales: ['de'] });
        for (let index = 1; index <= 3; index++) engine.workspaces.create({ name: 'Additional workspace ' + index, code: 'A' + index, color: 'violet', repository: ${JSON.stringify(project)} });
        console.log(JSON.stringify({ workspaceId, projectId }));
    `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: root,
    encoding: 'utf8',
    env: environment,
  });

  if (result.status !== 0) {
    throw new Error(`The project could not be seeded: ${result.stderr}`);
  }

  return JSON.parse(result.stdout.trim().split('\n').pop());
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();

      server.close(() => resolve(port));
    });
  });
}

let socket;
let lastId = 0;
const waiting = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++lastId;

    waiting.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }

  return result.result.value;
}

async function until(expression, milliseconds) {
  const deadline = Date.now() + milliseconds;

  while (Date.now() < deadline) {
    try {
      const value = await evaluate(expression);

      if (value) {
        return value;
      }
    } catch {
      // The page is between two documents.
    }

    await sleep(250);
  }

  return evaluate(expression);
}

async function connect(port) {
  let page;

  for (let attempt = 0; attempt < 240 && !page; attempt++) {
    await sleep(500);

    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();

      page = targets.find((target) => target.type === 'page' && target.url.includes('index.html'));
    } catch {
      // The window is not up yet.
    }
  }

  if (!page) {
    throw new Error('The window did not come up within two minutes.');
  }

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);

    if (message.id && waiting.has(message.id)) {
      const { resolve, reject } = waiting.get(message.id);

      waiting.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      evidence.problems.push(
        `exception: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`,
      );
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      evidence.problems.push(
        `console: ${message.params.args.map((argument) => argument.value ?? argument.description).join(' ')}`,
      );
    } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      evidence.problems.push(`log: ${message.params.entry.text} ${message.params.entry.url ?? ''}`);
    }
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
}

const readView = `(() => {
    const main = document.querySelector('main') ?? document.body;

    return {
        hash: location.hash,
        text: main.innerText.trim().replace(/\\s+/g, ' ').slice(0, 2000),
        unknown: [...new Set([...document.querySelectorAll('*')].filter((element) => element.tagName.startsWith('MOSAIK-') && !customElements.get(element.tagName.toLowerCase())).map((element) => element.tagName.toLowerCase()))]
    };
})()`;

/** Uses actual pointer input rather than invoking a control's handlers. */
async function controlPoint(expression) {
  const point = await evaluate(`(() => {
        const element = ${expression};
        if (!element) return null;
        element.scrollIntoView({ block: 'nearest' });
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
    })()`);

  if (!point) {
    throw new Error(`The expected control is not visible: ${expression}`);
  }

  return point;
}

async function clickControl(expression) {
  const point = await controlPoint(expression);

  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...point,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...point,
    button: 'left',
    clickCount: 1,
  });
}

/** Proves that wheel input over a card reaches its outer list and that slot dividers span it. */
async function exerciseWorkspaceScrolling(workspaceId) {
  await evaluate(`location.hash = '#/workspaces'; 0`);

  const cardSelector = `[test-id="workspace-card-${workspaceId}"] mosaik-card`;

  if (!(await until(`document.querySelector(${JSON.stringify(cardSelector)}) !== null`, 30_000))) {
    throw new Error('The workspace card is not mounted for the wheel-input check.');
  }

  const combinations = [];

  for (const [width, height] of [
    [1440, 900],
    [960, 640],
  ]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    for (const mode of ['light', 'dark']) {
      await send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: mode }],
      });

      if (
        !(await until(
          `document.documentElement.getAttribute('theme-mode') === ${JSON.stringify(mode)} && document.querySelector('.cards')?.scrollHeight > document.querySelector('.cards')?.clientHeight`,
          15_000,
        ))
      ) {
        throw new Error(`The ${width}×${height} ${mode} list is not ready for its scroll check.`);
      }

      const point = await controlPoint(
        `document.querySelector(${JSON.stringify(cardSelector)})?.querySelector('.workspace-card')`,
      );
      const before = await evaluate(
        `({ list: document.querySelector('.cards').scrollTop, body: document.documentElement.scrollTop, form: document.querySelector('.new-workspace mosaik-card').shadowRoot.querySelector('[part="content"]').scrollTop })`,
      );

      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        ...point,
        deltaX: 0,
        deltaY: 180,
      });

      if (!(await until(`document.querySelector('.cards').scrollTop > ${before.list}`, 15_000))) {
        throw new Error(
          `Wheel input over card content did not scroll its outer list at ${width}×${height} ${mode}.`,
        );
      }

      const geometry = await evaluate(`(() => {
                const card = document.querySelector(${JSON.stringify(cardSelector)});
                const footer = card.querySelector('.workspace-card-actions');
                const creation = document.querySelector('.create-footer');
                return { cardWidth: card.getBoundingClientRect().width, footerWidth: footer.getBoundingClientRect().width, creationWidth: creation.getBoundingClientRect().width, creationCardWidth: creation.closest('mosaik-card').getBoundingClientRect().width, body: document.documentElement.scrollTop, form: document.querySelector('.new-workspace mosaik-card').shadowRoot.querySelector('[part="content"]').scrollTop };
            })()`);

      if (geometry.body !== before.body || geometry.form !== before.form) {
        throw new Error(
          'Scrolling the workspace list also moved the page or the independent creation form.',
        );
      }

      if (
        geometry.footerWidth < geometry.cardWidth - 4 ||
        geometry.creationWidth < geometry.creationCardWidth - 4
      ) {
        throw new Error(
          `A workspace card divider ends at content width: ${JSON.stringify(geometry)}`,
        );
      }

      combinations.push({
        width,
        height,
        mode,
        outerListMoved: true,
        otherOwnersStable: true,
        dividersFullWidth: true,
      });
    }
  }

  await send('Emulation.clearDeviceMetricsOverride');
  evidence.workspaceScrolling = combinations;
}

/** A completed hold must still require a separate positive confirmation. */
async function exerciseWorkspaceRemoval(workspaceId) {
  await evaluate(`location.hash = '#/workspaces'; 0`);

  const selector = `[test-id="workspace-remove-${workspaceId}"]`;
  const trigger = `document.querySelector(${JSON.stringify(selector)})`;
  const modal = 'document.querySelector(\'[test-id="workspace-remove-confirmation"]\')';

  if (!(await until(`${trigger} !== null`, 30_000))) {
    throw new Error('The saved workspace has no hold-to-remove action.');
  }

  await clickControl(trigger);

  if (await evaluate(`${modal} !== null`)) {
    throw new Error('A short click opened removal confirmation without a completed hold.');
  }

  const catalogPath = join(project, 'i18n/lang.en.json');
  const originalCatalog = readFileSync(catalogPath, 'utf8');

  async function holdForConfirmation() {
    const point = await controlPoint(trigger);

    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...point,
      button: 'left',
      clickCount: 1,
    });

    try {
      if (!(await until(`${modal}?.isOpen === true`, 15_000))) {
        throw new Error('A complete hold did not open the removal confirmation.');
      }
    } finally {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        ...point,
        button: 'left',
        clickCount: 1,
      });
    }
  }

  await holdForConfirmation();

  if (
    !(await evaluate(
      `window.wortlaut.request('workspace.list', {}).then(items => items.some(item => item.id === ${JSON.stringify(workspaceId)}))`,
    ))
  ) {
    throw new Error('A completed hold removed the workspace before confirmation.');
  }

  await clickControl(`${modal}.shadowRoot.querySelector('[part~="cancel"]')`);

  if (!(await until(`${modal} === null && ${trigger}?.disabled === false`, 15_000))) {
    throw new Error('Cancelling removal did not return to the workspace.');
  }

  if (
    !(await evaluate(
      `window.wortlaut.request('workspace.list', {}).then(items => items.some(item => item.id === ${JSON.stringify(workspaceId)}))`,
    ))
  ) {
    throw new Error('Cancelling removal deleted the workspace.');
  }

  await holdForConfirmation();
  await clickControl(`${modal}.shadowRoot.querySelector('[part~="ok"]')`);

  if (!(await until(`${modal} === null && ${trigger} === null`, 15_000))) {
    throw new Error('Confirmed removal did not remove the workspace card.');
  }

  const state = await evaluate(`window.wortlaut.request('shell.state', {})`);
  const remaining = await evaluate(`window.wortlaut.request('workspace.list', {})`);

  if (
    remaining.some((item) => item.id === workspaceId) ||
    state.workspace !== null ||
    state.project !== null
  ) {
    throw new Error('Confirmed removal left a workspace or project selected.');
  }

  if (readFileSync(catalogPath, 'utf8') !== originalCatalog) {
    throw new Error('Removing a saved workspace changed repository data.');
  }

  evidence.workspaceRemoval = {
    shortClickSafe: true,
    holdRequiresConfirmation: true,
    cancelSafe: true,
    confirmed: true,
    repositoryUnchanged: true,
  };
}

async function exercise({ workspaceId, projectId }) {
  await until(`document.querySelector('main, mosaik-theme2') !== null`, 30_000);

  // The state elements draw a new value.
  const states = await evaluate(`(async () => {
        const result = {};

        for (const tag of ['mosaik-empty-state', 'mosaik-error-state']) {
            const element = document.createElement(tag);

            document.body.append(element);
            element.header = 'First';
            await element.updateComplete;
            element.header = 'Second';
            await element.updateComplete;
            result[tag] = element.shadowRoot.querySelector('[part=header]')?.text;
            element.remove();
        }

        return result;
    })()`);

  evidence.states = states;

  for (const [tag, text] of Object.entries(states)) {
    if (text !== 'Second') {
      failures.push(`${tag} did not draw its new header.`);
    }
  }

  await evaluate(
    `window.wortlaut.request('workspace.open', { workspaceId: ${JSON.stringify(workspaceId)} })`,
  );

  for (const [view, title, expected] of VIEWS) {
    if (view === 'overview') {
      // Projects and Workspaces leave the project, as they do for a user. Choosing one comes back to it.
      await evaluate(
        `window.wortlaut.request('shell.setProject', { projectId: ${JSON.stringify(projectId)} }).then(() => { location.hash = '#/overview'; location.reload(); }); 0`,
      );
      await until(
        `document.readyState === 'complete' && document.title.startsWith('Overview')`,
        30_000,
      );
    }

    await evaluate(`location.hash = '#/${view}'; 0`);

    const found = await until(
      `(() => { const main = document.querySelector('main') ?? document.body; return document.title.startsWith(${JSON.stringify(title)}) && main.innerText.includes(${JSON.stringify(expected)}); })()`,
      30_000,
    );
    const state = await evaluate(readView);

    evidence.views[view] = { hash: state.hash, text: state.text.slice(0, 90) };

    if (!found) {
      failures.push(
        `${view} did not show "${expected}": ${state.hash} ${state.text.slice(0, 200)}`,
      );
    }

    if (/could not be read|No project is open/u.test(state.text)) {
      failures.push(`${view} could not read the project: ${state.text.slice(0, 200)}`);
    }

    if (state.unknown.length > 0) {
      failures.push(`${view} has components that are not defined: ${state.unknown.join(', ')}`);
    }
  }

  // Both color modes reach the page. A window behind others renders no frames, so a navigation gives it the next one.
  for (const [mode, view] of [
    ['dark', 'overview'],
    ['light', 'runs'],
    ['dark', 'overview'],
  ]) {
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: mode }],
    });
    await evaluate(`location.hash = '#/${view}'; 0`);

    if (
      (await until(
        `document.documentElement.dataset.appearance === ${JSON.stringify(mode)} && document.documentElement.getAttribute('theme-mode') === ${JSON.stringify(mode)}`,
        30_000,
      )) !== true
    ) {
      failures.push(`The app did not follow the system to ${mode}.`);
    }
  }

  // A window that opened on the catalog shows its real values.
  await evaluate(`location.hash = '#/translations'; 0`);

  if (
    (await until(
      `(document.querySelector('main') ?? document.body).innerText.includes('Hallo')`,
      30_000,
    )) !== true
  ) {
    failures.push('Translations does not show the value of the catalog.');
  }

  await exerciseWorkspaceScrolling(workspaceId);
  await exerciseWorkspaceRemoval(workspaceId);
}

mkdirSync(evidenceDirectory, { recursive: true });

const { command, args, cwd } = executable();
const port = await freePort();
const seeded = seed();
const app = spawn(command, [...args, `--remote-debugging-port=${port}`], {
  cwd,
  env: environment,
  stdio: 'ignore',
});

app.once('error', (error) => failures.push(`The app did not start: ${error.message}`));

try {
  await connect(port);
  await exercise(seeded);
} catch (error) {
  failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
}

if (evidence.problems.length > 0) {
  failures.push(
    `The page reported ${evidence.problems.length} problem(s):\n${[...new Set(evidence.problems)].join('\n')}`,
  );
}

if (failures.length > 0 && socket?.readyState === WebSocket.OPEN) {
  try {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });

    writeFileSync(join(evidenceDirectory, 'failure.png'), Buffer.from(data, 'base64'));
  } catch {
    // The evidence below still says what failed.
  }
}

writeFileSync(
  join(evidenceDirectory, 'evidence.json'),
  `${JSON.stringify({ ...evidence, failures }, null, 2)}\n`,
);
socket?.close();
app.kill();
await sleep(1500);
rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(
  `The ${label} app showed ${VIEWS.length} views with real data in both color modes, without a problem on the page.`,
);
process.exit(0);

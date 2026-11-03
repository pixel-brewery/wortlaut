// Exercises the real desktop app over the debugging port: the built one, or the packaged one with `--packaged`.
// It uses a temporary profile, a temporary project with invented strings and the memory store for secrets.

// #region Imports

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
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
    ['workspaces', 'Workspaces', 'A workspace holds'],
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
    ['settings', 'Settings', 'Shown next to the name']
];

function executable() {
    if (!packaged) {
        return { command: createRequire(import.meta.url)('electron'), args: ['.'], cwd: root };
    }

    const folder = join(root, process.env['WORTLAUT_OUTPUT_DIR'] ?? 'out', `Wortlaut-${process.platform}-${process.arch}`);
    const paths = { darwin: 'Wortlaut.app/Contents/MacOS/Wortlaut', win32: 'Wortlaut.exe', linux: 'Wortlaut' };

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
        console.log(JSON.stringify({ workspaceId, projectId }));
    `;
    const result = spawnSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8', env: environment });

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
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });

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
            evidence.problems.push(`exception: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`);
        } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
            evidence.problems.push(`console: ${message.params.args.map((argument) => argument.value ?? argument.description).join(' ')}`);
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

    await evaluate(`window.wortlaut.request('workspace.open', { workspaceId: ${JSON.stringify(workspaceId)} })`);

    for (const [view, title, expected] of VIEWS) {
        if (view === 'overview') {
            // Projects and Workspaces leave the project, as they do for a user. Choosing one comes back to it.
            await evaluate(`window.wortlaut.request('shell.setProject', { projectId: ${JSON.stringify(projectId)} }).then(() => { location.hash = '#/overview'; location.reload(); }); 0`);
            await until(`document.readyState === 'complete' && document.title.startsWith('Overview')`, 30_000);
        }

        await evaluate(`location.hash = '#/${view}'; 0`);

        const found = await until(`(() => { const main = document.querySelector('main') ?? document.body; return document.title.startsWith(${JSON.stringify(title)}) && main.innerText.includes(${JSON.stringify(expected)}); })()`, 30_000);
        const state = await evaluate(readView);

        evidence.views[view] = { hash: state.hash, text: state.text.slice(0, 90) };

        if (!found) {
            failures.push(`${view} did not show "${expected}": ${state.hash} ${state.text.slice(0, 200)}`);
        }

        if (/could not be read|No project is open/u.test(state.text)) {
            failures.push(`${view} could not read the project: ${state.text.slice(0, 200)}`);
        }

        if (state.unknown.length > 0) {
            failures.push(`${view} has components that are not defined: ${state.unknown.join(', ')}`);
        }
    }

    // Both color modes reach the page. A window behind others renders no frames, so a navigation gives it the next one.
    for (const [mode, view] of [['dark', 'overview'], ['light', 'runs'], ['dark', 'overview']]) {
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] });
        await evaluate(`location.hash = '#/${view}'; 0`);

        if (await until(`document.documentElement.dataset.appearance === ${JSON.stringify(mode)} && document.documentElement.getAttribute('theme-mode') === ${JSON.stringify(mode)}`, 30_000) !== true) {
            failures.push(`The app did not follow the system to ${mode}.`);
        }
    }

    // A window that opened on the catalog shows its real values.
    await evaluate(`location.hash = '#/translations'; 0`);

    if (await until(`(document.querySelector('main') ?? document.body).innerText.includes('Hallo')`, 30_000) !== true) {
        failures.push('Translations does not show the value of the catalog.');
    }
}

mkdirSync(evidenceDirectory, { recursive: true });

const { command, args, cwd } = executable();
const port = await freePort();
const seeded = seed();
const app = spawn(command, [...args, `--remote-debugging-port=${port}`], { cwd, env: environment, stdio: 'ignore' });

app.once('error', (error) => failures.push(`The app did not start: ${error.message}`));

try {
    await connect(port);
    await exercise(seeded);
} catch (error) {
    failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
}

if (evidence.problems.length > 0) {
    failures.push(`The page reported ${evidence.problems.length} problem(s):\n${[...new Set(evidence.problems)].join('\n')}`);
}

if (failures.length > 0 && socket?.readyState === WebSocket.OPEN) {
    try {
        const { data } = await send('Page.captureScreenshot', { format: 'png' });

        writeFileSync(join(evidenceDirectory, 'failure.png'), Buffer.from(data, 'base64'));
    } catch {
        // The evidence below still says what failed.
    }
}

writeFileSync(join(evidenceDirectory, 'evidence.json'), `${JSON.stringify({ ...evidence, failures }, null, 2)}\n`);
socket?.close();
app.kill();
await sleep(1500);
rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });

if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
}

console.log(`The ${label} app showed ${VIEWS.length} views with real data in both color modes, without a problem on the page.`);
process.exit(0);

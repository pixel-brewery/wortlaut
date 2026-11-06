// #region Imports

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  safeStorage,
  session,
  shell,
  type WebContents,
  type WebFrameMain,
} from 'electron';
import {
  AiProviderHost,
  LocalAssistants,
  locateAssistant,
  type IAiProviderHost,
  type ISynapseModules,
} from '@pixel-brewery/wortlaut-ai';
import { FileSystem } from '@pixel-brewery/utilities';
import { IPC_CHANNELS, IpcEventSchema, type IpcEvent } from '@pixel-brewery/wortlaut-contracts';
import { DisplayPath, resolveProfileRoot, WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { McpLevelStore } from '@pixel-brewery/wortlaut-mcp';
import { AppSettingsStore } from './host/AppSettingsStore.js';
import { FolderGrants } from './host/FolderGrants.js';
import type { INativeHost } from './host/INativeHost.js';
import { findMcpCommand } from './host/McpConnection.js';
import { opensWithoutRunning } from './host/OpenableFile.js';
import { ProfileWatcher } from './host/ProfileWatcher.js';
import { RunHost } from './host/RunHost.js';
import { KeychainSecretStore, MemorySecretStore, type ISecretStore } from './host/SecretStore.js';
import { createDesktopRequests, describeFolderDrop, runHostingOf } from './ipc/DesktopRequests.js';
import { IpcRouter } from './ipc/IpcRouter.js';

// #endregion

/**
 * The window background before the renderer paints: the Soho page color, so a start in dark mode does not flash.
 */
const WINDOW_BACKGROUND = { light: '#ffffff', dark: '#0a0a0a' } as const;

/**
 * Where the policy allows the renderer to load from: only what is packaged with the app.
 */
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'";

const home = homedir();
const profile = resolveProfileRoot(process.env, process.platform, home);
const rendererIndex = join(__dirname, '../frontend/app/browser/index.html');
const rendererUrl = pathToFileURL(rendererIndex).href;
const grants = new FolderGrants(home);
const settings = new AppSettingsStore(join(profile, 'settings.json'));
let mainWindow: BrowserWindow | null = null;
let runHost: RunHost | null = null;
let stopAi: (() => Promise<void>) | null = null;
const profileWatcher = new ProfileWatcher();
let isQuitting = false;

app.setName('Wortlaut');

// Chromium's files stay apart from the runs and workspaces of the profile, and the instance lock follows the profile.
mkdirSync(join(profile, 'chromium'), { recursive: true, mode: 0o700 });
app.setPath('userData', join(profile, 'chromium'));

// The window starts in the mode Settings: application chose, and the page reads it like any change of the system.
nativeTheme.themeSource = settings.read().colorMode ?? 'system';
nativeTheme.on('updated', () => {
  mainWindow?.setBackgroundColor(
    nativeTheme.shouldUseDarkColors ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light,
  );
});

/**
 * @private
 */
function isTrustedSender(sender: WebContents, frame: WebFrameMain | null): boolean {
  return (
    mainWindow !== null &&
    sender === mainWindow.webContents &&
    frame === sender.mainFrame &&
    frame.url.split('#')[0] === rendererUrl
  );
}

/**
 * @private
 */
function publish(event: IpcEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.event, IpcEventSchema.parse(event));
  }
}

/**
 * @private
 */
function focusWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  }
}

/**
 * @private
 */
async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Wortlaut',
    backgroundColor: nativeTheme.shouldUseDarkColors
      ? WINDOW_BACKGROUND.dark
      : WINDOW_BACKGROUND.light,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 16, y: 15 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow = window;

  // External links open in the system browser; nothing else leaves the packaged content.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== rendererUrl) {
      event.preventDefault();
    }
  });
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`The window could not load the renderer: ${description} (${code})`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`The renderer stopped: ${details.reason}`);
  });
  window.once('ready-to-show', () => {
    window.show();
  });
  window.on('closed', () => {
    mainWindow = null;
  });

  await window.loadFile(rendererIndex);

  console.log(
    `Wortlaut ${app.getVersion()} is ready. Renderer: ${DisplayPath.of(rendererIndex, home)}`,
  );
}

/**
 * Says what built this app, for the keys of cached results. The bundle holds every rule, so a build that changes one changes this,
 * even between two builds of the same version.
 *
 * @private
 */
function toolFingerprint(): string {
  const hash = createHash('sha256').update(readFileSync(__filename)).digest('hex');

  return `${app.getVersion()}+${hash}`;
}

/**
 * Loads Synapse when an assistant is first asked for something. Only this surface and the command line compose it.
 *
 * @private
 */
async function loadSynapse(): Promise<ISynapseModules> {
  const [core, runtime, claude, codex, opencode] = await Promise.all([
    import('@pixel-brewery/synapse-core'),
    import('@pixel-brewery/synapse-runtime'),
    import('@pixel-brewery/synapse-provider-claude'),
    import('@pixel-brewery/synapse-provider-codex'),
    import('@pixel-brewery/synapse-provider-opencode'),
  ]);

  return {
    AiRuntime: runtime.AiRuntime,
    NodeProcessRunner: runtime.NodeProcessRunner,
    ClaudeDriver: claude.ClaudeDriver,
    CodexDriver: codex.CodexDriver,
    OpenCodeDriver: opencode.OpenCodeDriver,
    isCleanupIncomplete: core.isCleanupIncomplete,
  };
}

/**
 * Composes the AI providers of the app: the assistants of this computer with their own login, and keys from the keychain. A
 * run without a real keychain, such as an automated one, keeps its keys in memory.
 *
 * @private
 */
function composeAi(secrets: ISecretStore): IAiProviderHost {
  return new AiProviderHost({
    fileSystem: new FileSystem(),
    local: new LocalAssistants({
      synapse: loadSynapse,
      stateRoot: join(profile, 'assistants'),
      environment: process.env,
      home,
    }),
    keys: {
      get: (provider) => Promise.resolve(secrets.get(provider)),
      has: (provider) => Promise.resolve(secrets.has(provider)),
    },
    baseUrls: {
      openai: process.env.WORTLAUT_OPENAI_BASE_URL || undefined,
      google: process.env.WORTLAUT_GOOGLE_BASE_URL || undefined,
    },
  });
}

/**
 * @private
 */
function connectRequests(): void {
  const host: INativeHost = {
    chooseFolder: async () => {
      const options = { properties: ['openDirectory' as const] };
      const result = await (mainWindow
        ? dialog.showOpenDialog(mainWindow, options)
        : dialog.showOpenDialog(options));

      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    openPath: async (path) => {
      // A repository decides what its files hold, and some of them open by running, such as a `.js` file on Windows.
      if (!opensWithoutRunning(realpathSync(path))) {
        shell.showItemInFolder(path);

        return;
      }

      const failure = await shell.openPath(path);

      if (failure) {
        throw new Error(failure);
      }
    },
    saveTextFile: async ({ title, defaultName, text }) => {
      const options = {
        title,
        defaultPath: join(app.getPath('documents'), defaultName),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      };
      const result = await (mainWindow
        ? dialog.showSaveDialog(mainWindow, options)
        : dialog.showSaveDialog(options));

      if (result.canceled || !result.filePath) {
        return null;
      }

      writeFileSync(result.filePath, text, 'utf8');

      return result.filePath;
    },
    openTextFile: async ({ title, maxBytes }) => {
      const options = {
        title,
        properties: ['openFile' as const],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      };
      const result = await (mainWindow
        ? dialog.showOpenDialog(mainWindow, options)
        : dialog.showOpenDialog(options));
      const path = result.canceled ? undefined : result.filePaths[0];

      if (!path) {
        return null;
      }

      if (statSync(path).size > maxBytes) {
        throw new Error('This file is too large to be a workspace.');
      }

      return { name: basename(path), text: readFileSync(path, 'utf8') };
    },
    setColorMode: (mode) => {
      nativeTheme.themeSource = mode ?? 'system';
    },
    activeColorMode: () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'),
    writeClipboard: (text) => clipboard.writeText(text),
  };
  const secrets: ISecretStore =
    process.env.WORTLAUT_SECRET_STORE === 'memory'
      ? new MemorySecretStore()
      : new KeychainSecretStore(join(profile, 'keys.json'), safeStorage);
  const ai = composeAi(secrets);
  const engine = new WortlautEngine({
    surface: 'desktop',
    logger: console,
    profileRoot: profile,
    home,
    ai,
    tool: toolFingerprint(),
  });
  const runs = new RunHost({
    commands: engine.commands,
    publish,
    projectName: (projectId) => engine.workspaces.requireProject(projectId).project.name,
    hosting: () => runHostingOf(settings.read()),
    scrub: (text) => DisplayPath.scrub(text, home),
  });
  const mcp = {
    levels: new McpLevelStore(profile),
    command: () =>
      findMcpCommand(
        join(__dirname, '../../../apps/cli/dist/bin/wortlaut.js'),
        locateAssistant('node', process.env, home),
      ),
    isInstalled: (assistant: 'claude' | 'codex') =>
      locateAssistant(assistant, process.env, home) !== null,
  };
  const router = new IpcRouter(
    createDesktopRequests({
      engine,
      grants,
      host,
      name: app.getName(),
      version: app.getVersion(),
      publish,
      runs,
      secrets,
      mcp,
      settings,
      home,
    }),
    (text) => DisplayPath.scrub(text, home),
  );

  // Another process, such as the MCP server, shares the review list and the run history of this profile.
  profileWatcher.watch(join(profile, 'changes'), () => publish({ type: 'changes.updated' }));
  profileWatcher.watch(join(profile, 'runs'), () => publish({ type: 'runs.updated' }));

  runHost = runs;
  stopAi = async () => {
    profileWatcher.close();
    engine.translationLab.cancelAll();
    await engine.generation.flush();
    await ai.dispose();
  };
  ipcMain.handle(IPC_CHANNELS.request, (event, raw: unknown) =>
    router.handle(raw, isTrustedSender(event.sender, event.senderFrame)),
  );
  ipcMain.on(IPC_CHANNELS.folderDrop, (event, raw: unknown) => {
    if (isTrustedSender(event.sender, event.senderFrame)) {
      publish(describeFolderDrop(grants, raw));
    }
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusWindow);
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
  // A long run stops first, and what it finished waits in Review, so quitting never leaves a partial write behind.
  app.on('before-quit', (event) => {
    if (runHost && !isQuitting) {
      event.preventDefault();
      isQuitting = true;
      void runHost
        .shutdown()
        .then(() => stopAi?.())
        .catch((error: unknown) => console.error(error))
        .finally(() => app.quit());
    }
  });
  app.on('activate', () => {
    if (mainWindow) {
      focusWindow();
    } else if (app.isReady()) {
      void createWindow();
    }
  });

  void app
    .whenReady()
    .then(async () => {
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
          },
        });
      });
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
        callback(false);
      });
      session.defaultSession.setPermissionCheckHandler(() => false);
      connectRequests();

      await createWindow();
    })
    .catch((error: unknown) => {
      console.error(error);
      dialog.showErrorBox(
        'Wortlaut could not start',
        error instanceof Error ? error.message : String(error),
      );
      app.exit(1);
    });
}

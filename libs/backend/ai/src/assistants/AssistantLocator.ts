// #region Imports

import { execFileSync } from 'node:child_process';
import { accessSync, closeSync, constants, fstatSync, openSync, readSync, statSync } from 'node:fs';
import { isAbsolute, join, posix, relative, resolve, sep, win32 } from 'node:path';

// #endregion

/**
 * Where a desktop app looks for a command line tool beyond its `PATH`, which an app started from the dock barely has.
 */
const COMMON_FOLDERS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];

/**
 * The same below the home of the user.
 */
const HOME_FOLDERS = [
  '.local/bin',
  '.volta/bin',
  '.bun/bin',
  '.npm-global/bin',
  'Library/pnpm',
  '.opencode/bin',
  '.claude/local',
];

/**
 * The applications that bring the Codex command line tool along. It is often only there, and not on any `PATH`.
 */
const CODEX_APPLICATIONS = ['Codex.app', 'ChatGPT.app'];

/**
 * The bundle identifiers of those applications.
 */
const CODEX_BUNDLE_IDENTIFIERS = ['com.openai.codex', 'com.openai.chat'];

/**
 * The size above which the manifest of an application is not believed.
 */
const MAX_MANIFEST_BYTES = 16 * 1024;

/**
 * Where else to look, so a spec does not depend on what this computer has installed.
 *
 * @public
 */
export interface IAssistantLocatorSources {
  /**
   * The folders that hold applications, beside the one in the home of the user.
   */
  applicationFolders?: ReadonlyArray<string>;

  /**
   * Returns the applications macOS knows about, wherever they were moved to.
   */
  registeredApplications?: () => ReadonlyArray<string>;
}

/**
 * Finds the executable of a local assistant. It looks at files and asks macOS where a moved application is. It starts no
 * assistant and reads no account.
 *
 * @public
 * @param command The name of the command.
 * @param environment The environment.
 * @param home The home of the user.
 * @param platform The platform.
 * @param sources Where else to look.
 * @returns The absolute path, or `null` when it is not installed.
 */
export function locateAssistant(
  command: string,
  environment: Readonly<Record<string, string | undefined>>,
  home: string,
  platform: NodeJS.Platform = process.platform,
  sources: IAssistantLocatorSources = {},
): string | null {
  const windows = platform === 'win32';
  const paths = windows ? win32 : posix;
  const value = (name: string): string | undefined =>
    Object.entries(environment).find(([key]) => key.toUpperCase() === name)?.[1];
  const fromPath = (value('PATH') ?? '')
    .split(windows ? ';' : ':')
    .filter(Boolean)
    .slice(0, 256);
  const extensions = windows
    ? (value('PATHEXT') ?? '.COM;.EXE;.BAT;.CMD')
        .split(';')
        .filter((extension) => /^\.[A-Za-z0-9]+$/.test(extension))
    : [''];
  const codex = command === 'codex';
  const installers = [
    codex ? value('CODEX_INSTALL_DIR') : undefined,
    codex && windows && value('LOCALAPPDATA')
      ? paths.join(value('LOCALAPPDATA') ?? '', 'Programs', 'OpenAI', 'Codex', 'bin')
      : undefined,
  ].filter((folder): folder is string => Boolean(folder));
  const folders = [
    ...fromPath,
    ...(windows ? [] : COMMON_FOLDERS),
    ...HOME_FOLDERS.map((folder) => paths.join(home, folder)),
    ...installers,
  ].filter((folder) => paths.isAbsolute(folder));

  for (const folder of new Set(folders)) {
    for (const extension of extensions) {
      const candidate = paths.join(folder, `${command}${extension}`);

      if (isExecutable(candidate, windows)) {
        return candidate;
      }
    }
  }

  if (!codex || platform !== 'darwin') {
    return null;
  }

  const {
    applicationFolders = ['/Applications'],
    registeredApplications = registeredCodexApplications,
  } = sources;
  const known = [...applicationFolders, join(home, 'Applications')].flatMap((folder) =>
    CODEX_APPLICATIONS.map((name) => join(folder, name)),
  );

  // Asking macOS starts a process, so it comes last and only when the usual places hold nothing.
  return codexInApplications(known) ?? codexInApplications(registeredApplications());
}

/**
 * @private
 */
function codexInApplications(applications: ReadonlyArray<string>): string | null {
  for (const application of applications) {
    const resources = join(application, 'Contents', 'Resources');
    const cli = join(resources, 'codex-cli');
    const entrypoint = manifestEntrypoint(cli);
    const candidates = [
      ...(entrypoint ? [entrypoint] : []),
      join(cli, 'bin', 'codex'),
      join(cli, 'CodexCLI.app', 'Contents', 'MacOS', 'codex'),
      join(resources, 'codex'),
    ];
    const found = candidates.find((candidate) => isExecutable(candidate, false));

    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Reads where the manifest of an application says its command line tool is. The manifest is optional and never points outside
 * its folder.
 *
 * @private
 */
function manifestEntrypoint(cli: string): string | null {
  let descriptor: number | null = null;

  try {
    descriptor = openSync(
      join(cli, 'codex-package.json'),
      constants.O_RDONLY | constants.O_NONBLOCK,
    );

    const stats = fstatSync(descriptor);

    if (!stats.isFile() || stats.size > MAX_MANIFEST_BYTES) {
      return null;
    }

    const bytes = Buffer.alloc(MAX_MANIFEST_BYTES + 1);
    const length = readSync(descriptor, bytes, 0, bytes.length, 0);
    const manifest = JSON.parse(bytes.subarray(0, length).toString('utf8')) as {
      layoutVersion?: unknown;
      entrypoint?: unknown;
    };
    const { layoutVersion, entrypoint } = manifest;

    if (
      layoutVersion !== 1 ||
      typeof entrypoint !== 'string' ||
      !entrypoint ||
      isAbsolute(entrypoint) ||
      entrypoint.includes('\\') ||
      /\p{Cc}/u.test(entrypoint)
    ) {
      return null;
    }

    const candidate = resolve(cli, entrypoint);
    const inside = relative(cli, candidate);

    return !inside || inside === '..' || inside.startsWith(`..${sep}`) ? null : candidate;
  } catch {
    return null;
  } finally {
    if (descriptor !== null) {
      closeSync(descriptor);
    }
  }
}

let registered: ReadonlyArray<string> | null = null;

/**
 * Asks macOS where the OpenAI applications are, without starting them. The answer is kept, so a screen that asks for the state
 * of its providers does not start this process again and again.
 *
 * @private
 */
function registeredCodexApplications(): ReadonlyArray<string> {
  registered ??= readRegisteredApplications();

  return registered;
}

/**
 * @private
 */
function readRegisteredApplications(): ReadonlyArray<string> {
  const script = `ObjC.import('AppKit');
const roots = [];
for (const identifier of ${JSON.stringify(CODEX_BUNDLE_IDENTIFIERS)}) {
  const url = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier(identifier);
  if (!url.isNil()) roots.push(ObjC.unwrap(url.path));
}
JSON.stringify(roots);`;

  try {
    const output = execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], {
      encoding: 'utf8',
      timeout: 1_500,
      maxBuffer: MAX_MANIFEST_BYTES,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const roots: unknown = JSON.parse(output);

    return Array.isArray(roots)
      ? roots
          .filter(
            (root): root is string =>
              typeof root === 'string' &&
              isAbsolute(root) &&
              root.endsWith('.app') &&
              !/\p{Cc}/u.test(root),
          )
          .slice(0, CODEX_BUNDLE_IDENTIFIERS.length)
      : [];
  } catch {
    return [];
  }
}

/**
 * @private
 */
function isExecutable(path: string, windows: boolean): boolean {
  try {
    if (!statSync(path).isFile()) {
      return false;
    }

    accessSync(path, windows ? constants.F_OK : constants.X_OK);

    return true;
  } catch {
    return false;
  }
}

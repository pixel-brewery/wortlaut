// #region Imports

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import { AiProviderHost, LocalAssistants } from '@pixel-brewery/wortlaut-ai';
import { WortlautEngine } from '@pixel-brewery/wortlaut-engine';
import { McpLevelStore, McpToolHost } from '@pixel-brewery/wortlaut-mcp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderGrants } from '../host/FolderGrants';
import type { INativeHost } from '../host/INativeHost';
import { MemorySecretStore } from '../host/SecretStore';
import { createDesktopRequests, describeFolderDrop, runHostingOf } from './DesktopRequests';
import { IpcRouter, type IpcHandlers } from './IpcRouter';

import { AppSettingsStore, DEFAULT_APP_SETTINGS } from '../host/AppSettingsStore';

// #endregion

const LOGGER = {
  log: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as ILogger;

describe('createDesktopRequests', () => {
  describe('MCP and plugins', () => {
    let root: string;
    let repository: string;
    let profile: string;
    let engine: WortlautEngine;
    let handlers: IpcHandlers;
    let projectId: string;

    /**
     * Stands for the server, which is another process with an engine of its own on the same profile.
     */
    const server = (): McpToolHost =>
      new McpToolHost({
        assistants: new WortlautEngine({
          surface: 'mcp',
          logger: LOGGER,
          profileRoot: profile,
          home: root,
          env: {},
          restrictToKnownRoots: true,
        }).assistants,
        levels: new McpLevelStore(profile),
        cwd: repository,
        home: root,
        env: {},
      });

    beforeEach(() => {
      root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-mcp-screen-')));
      repository = join(root, 'shop');
      profile = join(root, 'profile');
      mkdirSync(join(repository, 'i18n'), { recursive: true });
      writeFileSync(
        join(repository, 'wortlaut.config.json'),
        JSON.stringify({
          actions: {
            detect: { resourceRoot: ['i18n'], type: 'json', resourceKey: { prefix: 'loc' } },
            analyze: { baseLocale: 'en' },
            generate: { locales: ['de'] },
          },
        }),
      );
      writeFileSync(
        join(repository, 'i18n', 'lang.en.json'),
        JSON.stringify({ loc: { a: 'A', b: 'B' } }),
      );
      engine = new WortlautEngine({
        surface: 'desktop',
        logger: LOGGER,
        profileRoot: profile,
        home: root,
        env: {},
      });
      ({ projectId } = engine.workspaces.register({
        inspection: engine.inspector.inspect(repository),
        workspace: { kind: 'new', name: 'Shop', code: 'S', color: 'teal' },
        preset: null,
        baseLocale: 'en',
        targetLocales: ['de'],
      }));
      handlers = createDesktopRequests({
        engine,
        grants: new FolderGrants(root),
        host: nativeHost({ chooseFolder: () => Promise.resolve(null) }),
        name: 'Wortlaut',
        version: '0.0.0',
        mcp: {
          levels: new McpLevelStore(profile),
          command: () => ({
            command: ['node', '/some where/wortlaut.js', 'mcp'],
            isPublished: false,
            ready: true,
            problem: null,
          }),
          isInstalled: (assistant) => assistant === 'codex',
        },
      });
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it('stores the level where the server reads it, read only until one is chosen', async () => {
      // arrange
      const before = await handlers['mcp.status']({});
      const host = server();

      // act
      const after = await handlers['mcp.setLevel']({ level: 'propose' });

      // assert
      expect(before).toMatchObject({ level: 'read', ready: true });
      expect(after).toMatchObject({ level: 'propose' });
      expect(host.activeLevel()).toBe('propose');
    });

    it('quotes the command of the status for a shell', async () => {
      // act
      const { command } = await handlers['mcp.status']({});

      // assert
      expect(command).toBe("node '/some where/wortlaut.js' mcp");
    });

    it('lists the twelve tools with what each one needs', async () => {
      // act
      const tools = await handlers['mcp.tools']({});

      // assert
      expect(tools).toHaveLength(12);
      expect(tools.filter((tool) => tool.level === 'read')).toHaveLength(7);
      expect(tools.filter((tool) => tool.level === 'propose')).toHaveLength(2);
      expect(tools.filter((tool) => tool.level === 'write')).toHaveLength(3);
    });

    it('shows what the server did: tool, client and result, and a client on record counts as connected', async () => {
      // arrange
      await handlers['mcp.setLevel']({ level: 'propose' });

      const before = await handlers['mcp.clients']({});

      await server().callTool('next_translations', { locale: 'de' }, 'codex-mcp-client');

      // act
      const activity = await handlers['mcp.activity']({ limit: 5 });
      const after = await handlers['mcp.clients']({});

      // assert
      expect(activity).toEqual([
        expect.objectContaining({
          tool: 'next_translations',
          client: 'Codex',
          result: '2 keys for German',
          state: 'succeeded',
        }),
      ]);
      expect(before.map((client) => client.state)).toEqual([
        'Not installed',
        'Installed',
        'Standard MCP',
      ]);
      expect(after.map((client) => client.state)).toEqual([
        'Not installed',
        'Connected',
        'Standard MCP',
      ]);
    });

    it('lists a proposal of the server in Review, and Approve writes it once Dry run is off', async () => {
      // arrange
      await handlers['mcp.setLevel']({ level: 'propose' });

      const workspaceId = engine.workspaces.all()[0].id;
      const proposal = await server().callTool(
        'propose_translations',
        { locale: 'de', rows: [{ key: 'loc.a', value: 'Ä' }] },
        'codex-mcp-client',
      );
      const { changeSetId } = JSON.parse(proposal.text) as { changeSetId: string };

      // act
      const listed = await handlers['changes.list']({ workspaceId });
      const blocked = handlers['changes.apply']({ id: changeSetId });

      await expect(blocked).rejects.toThrow(/Dry run is on/);
      await handlers['app.setDryRun']({ dryRun: false });

      const applied = await handlers['changes.apply']({ id: changeSetId });

      // assert
      expect(listed.map((item) => item.id)).toEqual([changeSetId]);
      expect(listed[0]).toMatchObject({
        command: 'translations.propose',
        surface: 'mcp',
        detail: 'Codex: translations for de',
      });
      expect(applied.state).toBe('applied');
      expect(JSON.parse(readFileSync(join(repository, 'i18n', 'lang.de.json'), 'utf8'))).toEqual({
        loc: { a: 'Ä' },
      });
    });

    it('lists the runs of every project when none is named, and names the assistant', async () => {
      // arrange
      await server().callTool('get_config', {}, 'claude-code');

      // act
      const all = await handlers['run.list']({ projectId: null, limit: null });
      const own = await handlers['run.list']({ projectId, limit: null });

      // assert
      expect(all).toEqual([
        expect.objectContaining({
          title: 'get_config',
          surface: 'mcp',
          client: 'Claude Code',
          dryRun: false,
        }),
      ]);
      expect(own.map((run) => run.id)).toEqual(all.map((run) => run.id));
    });
  });

  describe('writes', () => {
    let root: string;
    let repository: string;
    let handlers: IpcHandlers;
    let events: Array<unknown>;
    let chosen: string | null;

    const setUpProject = async (): Promise<string> => {
      chosen = repository;

      const { folder } = await handlers['dialog.chooseFolder']({ insideToken: null });
      const { projectId } = await handlers['project.register']({
        folderToken: folder?.token as string,
        catalogFolderTokens: [],
        workspace: { kind: 'new', name: 'Shop', code: 'S', color: 'teal' },
        preset: 'angular',
        baseLocale: 'en',
        targetLocales: ['de'],
      });

      return projectId;
    };

    beforeEach(() => {
      root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-writes-')));
      repository = join(root, 'shop');
      mkdirSync(join(repository, 'i18n'), { recursive: true });
      writeFileSync(
        join(repository, 'i18n', 'lang.en.json'),
        JSON.stringify({ loc: { b: 'B', a: 'A' } }),
      );
      writeFileSync(
        join(repository, 'i18n', 'lang.de.json'),
        JSON.stringify({ loc: { b: 'B', a: 'Ä' } }),
      );
      events = [];
      chosen = null;
      handlers = createDesktopRequests({
        engine: new WortlautEngine({
          surface: 'desktop',
          logger: LOGGER,
          profileRoot: join(root, 'profile'),
          home: root,
          env: {},
        }),
        grants: new FolderGrants(root),
        host: nativeHost({ chooseFolder: () => Promise.resolve(chosen) }),
        name: 'Wortlaut',
        version: '0.0.0',
        publish: (event) => events.push(event),
      });
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    describe('rule packs', () => {
      const definition = `${JSON.stringify({ schemaVersion: 1, id: 'our-pack', name: 'Our pack', description: 'Ours.', version: '1.0.0', rules: [{ id: 'no-todo', description: 'No TODO.', severity: 'error', message: 'Remove TODO.', pattern: { regex: 'TODO' } }] }, null, 2)}\n`;

      const setUpPack = async (): Promise<string> => {
        mkdirSync(join(repository, 'rules', 'our-pack'), { recursive: true });
        writeFileSync(join(repository, 'rules', 'our-pack', 'wortlaut-pack.json'), definition);
        chosen = join(repository, 'rules', 'our-pack');

        const { folder } = await handlers['dialog.chooseFolder']({ insideToken: null });

        return folder?.token as string;
      };

      it('names a folder only by the token of a native dialog, and hands back no path', async () => {
        // arrange
        await setUpProject();

        const token = await setUpPack();

        // act
        const check = await handlers['rulePack.check']({
          source: { kind: 'folder', folderToken: token },
        });

        // assert
        expect(check.pack?.name).toBe('Our pack');
        expect(check.sameAs).toBe('npx wortlaut rules add ./rules/our-pack');
        expect(JSON.stringify(check)).not.toContain(root);
        await expect(
          handlers['rulePack.check']({
            source: { kind: 'folder', folderToken: '6a4a3d60-3cd1-4a46-9f3c-2c1f7d0c3b11' },
          }),
        ).rejects.toThrow(/no longer available/);
      });

      it('cannot be made to read a path through the text of a source', async () => {
        // arrange
        await setUpProject();
        await setUpPack();

        // act
        const check = await handlers['rulePack.check']({
          source: { kind: 'npm', value: join(repository, 'rules', 'our-pack') },
        });
        const relative = await handlers['rulePack.check']({
          source: { kind: 'github', value: '../../rules/our-pack' },
        });

        // assert
        expect(check).toMatchObject({ checkId: null, pack: null, problem: { kind: 'not-found' } });
        expect(relative).toMatchObject({
          checkId: null,
          pack: null,
          problem: { kind: 'not-found' },
        });
      });

      it('leaves Install and pin in Review while Dry run is on, and nothing is written', async () => {
        // arrange
        const projectId = await setUpProject();
        const token = await setUpPack();
        const { checkId } = await handlers['rulePack.check']({
          source: { kind: 'folder', folderToken: token },
        });

        events.length = 0;

        // act
        const write = await handlers['rulePack.install']({
          checkId: checkId as string,
          target: { kind: 'project', projectId },
        });

        // assert
        expect(write.results[0].outcome?.state).toBe('pending');
        expect(write.results[0].outcome?.files).toContain('wortlaut.lock.json');
        expect(existsSync(join(repository, 'wortlaut.lock.json'))).toBe(false);
        expect(events).toEqual([{ type: 'changes.updated' }]);
      });

      it('writes with Dry run off, and the rules appear in Analyze', async () => {
        // arrange
        const projectId = await setUpProject();
        const token = await setUpPack();
        const { checkId } = await handlers['rulePack.check']({
          source: { kind: 'folder', folderToken: token },
        });

        await handlers['app.setDryRun']({ dryRun: false });

        // act
        const write = await handlers['rulePack.install']({
          checkId: checkId as string,
          target: { kind: 'project', projectId },
        });
        const overview = await handlers['analyze.overview']({ projectId });

        // assert
        expect(write.results[0].outcome?.state).toBe('applied');
        expect(existsSync(join(repository, 'wortlaut.lock.json'))).toBe(true);
        expect(overview.rules.find((rule) => rule.id === 'no-todo')).toMatchObject({
          group: 'Pack: Our pack',
          severity: 'error',
          enabled: true,
        });
      });

      it('refuses a change that would write outside of the folders the user chose', async () => {
        // arrange
        await setUpProject();
        await handlers['app.setDryRun']({ dryRun: false });

        const entry = {
          name: 'Message checks',
          source: 'wortlaut:message-checks',
          version: '1.0.0',
          commit: null,
          hash: `sha256:${'a'.repeat(64)}`,
          rules: {},
        };
        const above = JSON.stringify({ schemaVersion: 1, packs: { 'message-checks': entry } });

        // The nearest lock file lies above the folder the user chose, so the pack is listed and cannot be written to.
        writeFileSync(join(root, 'wortlaut.lock.json'), above);

        const { workspace } = await handlers['shell.state']({});
        const workspaceId = workspace?.id as string;
        const update = await handlers['rulePack.checkUpdate']({
          workspaceId,
          packId: 'message-checks',
        });

        // act
        const write = await handlers['rulePack.update']({
          workspaceId,
          updateId: update.updateId as string,
        });

        // assert
        expect(write.results[0]).toMatchObject({
          outcome: null,
          failure: expect.stringContaining('outside of the folders you chose'),
        });
        expect(readFileSync(join(root, 'wortlaut.lock.json'), 'utf8')).toBe(above);
      });

      it('counts the packs of a workspace for Settings: workspace', async () => {
        // arrange
        await setUpProject();
        await handlers['app.setDryRun']({ dryRun: false });

        const { workspace } = await handlers['shell.state']({});
        const check = await handlers['rulePack.check']({
          source: { kind: 'shipped', value: 'wortlaut:message-checks' },
        });

        // act
        await handlers['rulePack.install']({
          checkId: check.checkId as string,
          target: { kind: 'workspace', workspaceId: workspace?.id as string },
        });

        // assert
        expect(
          (await handlers['workspace.get']({ workspaceId: workspace?.id as string })).rulePackCount,
        ).toBe(1);
        expect(
          existsSync(join(repository, '.wortlaut/rule-packs/message-checks/wortlaut-pack.json')),
        ).toBe(true);
      });
    });

    it('starts with Dry run on, and setup leaves the configuration file in Review', async () => {
      // act
      const projectId = await setUpProject();
      const state = await handlers['shell.state']({});

      // assert
      expect(state).toMatchObject({ dryRun: true, pendingChanges: 1 });
      expect(existsSync(join(repository, 'wortlaut.config.json'))).toBe(false);
      expect(projectId).toBeTruthy();
      expect(events).toEqual([{ type: 'changes.updated' }]);
    });

    it('refuses to apply a change set while Dry run is on, and applies it after the switch', async () => {
      // arrange
      const projectId = await setUpProject();
      const { workspace } = await handlers['shell.state']({});
      const [item] = await handlers['changes.list']({ workspaceId: workspace?.id as string });

      // act & assert
      await expect(handlers['changes.apply']({ id: item.id })).rejects.toThrow('Dry run is on');
      expect(existsSync(join(repository, 'wortlaut.config.json'))).toBe(false);

      // act
      await handlers['app.setDryRun']({ dryRun: false });

      const outcome = await handlers['changes.apply']({ id: item.id });

      // assert
      expect(outcome).toMatchObject({
        state: 'applied',
        files: ['wortlaut.config.json', '.gitignore'],
      });
      expect(existsSync(join(repository, 'wortlaut.config.json'))).toBe(true);
      expect(await handlers['project.settings']({ projectId })).toMatchObject({
        baseLocale: 'en',
        preset: 'angular',
      });
      expect(await handlers['changes.list']({ workspaceId: workspace?.id as string })).toEqual([]);
    });

    it('writes a project without a configuration straight away when Dry run is off', async () => {
      // arrange
      await handlers['app.setDryRun']({ dryRun: false });

      // act
      await setUpProject();

      // assert
      expect(existsSync(join(repository, 'wortlaut.config.json'))).toBe(true);
    });

    it('refuses a folder outside of the project', async () => {
      // arrange
      const projectId = await setUpProject();

      chosen = root;

      // act & assert
      await expect(
        handlers['dialog.chooseFolder']({ insideToken: null, insideProjectId: projectId }),
      ).rejects.toThrow('Choose a folder inside the project.');
    });

    it('refuses to write a change set outside of the folders the user chose', async () => {
      // arrange
      const elsewhere = join(root, 'elsewhere');

      mkdirSync(elsewhere);
      writeFileSync(join(elsewhere, 'lang.en.json'), JSON.stringify({ b: 'B', a: 'A' }));
      await setUpProject();

      const cli = new WortlautEngine({
        surface: 'cli',
        logger: LOGGER,
        profileRoot: join(root, 'profile'),
        home: root,
        env: {},
      });
      const outcome = await cli.sort({
        cwd: elsewhere,
        options: { resourceRoot: [elsewhere], type: 'json', order: 'asc' },
        writeMode: 'review',
      });

      await handlers['app.setDryRun']({ dryRun: false });

      // act & assert
      await expect(
        handlers['changes.apply']({ id: outcome.changeSet?.id as string }),
      ).rejects.toThrow('outside of the folders you chose');
      expect(JSON.parse(readFileSync(join(elsewhere, 'lang.en.json'), 'utf8'))).toEqual({
        b: 'B',
        a: 'A',
      });
    });

    it('keeps a run going in main and hands out its result', async () => {
      // arrange
      const projectId = await setUpProject();

      // act
      const run = await handlers['run.start']({
        command: 'analyze',
        projectId,
        input: { rules: ['empty-values'] },
      });

      await vi.waitFor(async () => {
        expect(await handlers['run.result']({ runId: run.id })).not.toBeNull();
      });

      // assert
      expect(await handlers['run.result']({ runId: run.id })).toMatchObject({
        state: 'succeeded',
        dryRun: true,
        output: { command: 'analyze' },
      });
      expect(await handlers['run.latest']({ projectId, command: 'analyze' })).toMatchObject({
        runId: run.id,
      });
      expect(
        (await handlers['run.list']({ projectId, limit: null })).find(
          (candidate) => candidate.id === run.id,
        ),
      ).toMatchObject({ dryRun: true, canRepeat: true });
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'run.finished', runId: run.id, state: 'succeeded' }),
      );
    });

    it('removes a workspace and closes it, and leaves the files where they are', async () => {
      // arrange
      await setUpProject();

      const { workspace } = await handlers['shell.state']({});

      // act
      await handlers['workspace.remove']({ workspaceId: workspace?.id as string });

      // assert
      expect((await handlers['shell.state']({})).workspace).toBeNull();
      expect(existsSync(join(repository, 'i18n', 'lang.en.json'))).toBe(true);
    });
  });

  let root: string;
  let repository: string;
  let grants: FolderGrants;
  let host: INativeHost & { chosen: string | null };
  let handlers: IpcHandlers;

  const chooseRepository = async (): Promise<string> => {
    host.chosen = repository;

    const { folder } = await handlers['dialog.chooseFolder']({ insideToken: null });

    return folder?.token ?? '';
  };

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-requests-')));
    repository = join(root, 'shop');
    mkdirSync(join(repository, 'i18n'), { recursive: true });
    writeFileSync(
      join(repository, 'i18n', 'lang.en.json'),
      JSON.stringify({ loc: { a: 'A', b: 'B' } }),
    );
    writeFileSync(
      join(repository, 'i18n', 'lang.de.json'),
      JSON.stringify({ loc: { a: 'Ä', b: 'B' } }),
    );
    grants = new FolderGrants(root);
    host = {
      chosen: null,
      chooseFolder() {
        return Promise.resolve(this.chosen);
      },
      ...nativeHost({}),
    };
    host.chooseFolder = function chooseFolder(this: { chosen: string | null }) {
      return Promise.resolve(this.chosen);
    };
    handlers = createDesktopRequests({
      engine: new WortlautEngine({
        surface: 'desktop',
        logger: LOGGER,
        profileRoot: join(root, 'profile'),
        home: root,
        env: {},
      }),
      grants,
      host,
      name: 'Wortlaut',
      version: '0.2.0',
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('starts with nothing open', () => {
    expect(handlers['shell.state']({})).toEqual({
      workspace: null,
      project: null,
      provider: null,
      dryRun: true,
      pendingChanges: 0,
    });
  });

  it('holds no folder after a cancelled dialog', async () => {
    await expect(handlers['dialog.chooseFolder']({ insideToken: null })).resolves.toEqual({
      folder: null,
    });
  });

  it('goes from a chosen folder to a registered project that is open', async () => {
    const folderToken = await chooseRepository();
    const inspection = await handlers['project.inspectFolder']({
      folderToken,
      catalogFolderTokens: [],
      preset: null,
    });

    expect(inspection.locales).toEqual([
      { code: 'de', keys: 2 },
      { code: 'en', keys: 2 },
    ]);

    const registered = await handlers['project.register']({
      folderToken,
      catalogFolderTokens: [],
      workspace: { kind: 'new', name: 'Shop', code: 'SH', color: 'violet' },
      preset: null,
      baseLocale: 'en',
      targetLocales: ['de'],
    });
    const state = await handlers['shell.state']({});

    expect(state.workspace).toMatchObject({
      id: registered.workspaceId,
      name: 'Shop',
      code: 'SH',
      color: 'violet',
    });
    expect(state.project).toEqual({ id: registered.projectId, name: 'shop' });
    expect(await handlers['project.summary']({ projectId: registered.projectId })).toMatchObject({
      keyCount: 2,
      translatedShare: 0.5,
    });
  });

  it('uses the same selected source folder during inspection and registration', async () => {
    const folderToken = await chooseRepository();
    const chosen = join(repository, 'frontend');

    mkdirSync(chosen);
    writeFileSync(join(chosen, 'Feature.ts'), 'export const title = "Frontend";');
    host.chosen = chosen;
    const { folder } = await handlers['dialog.chooseFolder']({ insideToken: folderToken });
    const selection = {
      folderToken,
      catalogFolderTokens: [],
      preset: 'angular' as const,
      sourceRootToken: folder?.token,
    };

    const inspection = await handlers['project.inspectFolder'](selection);

    expect(inspection.sourceRoot).toEqual({
      value: 'frontend',
      fileCount: 1,
      evidence: '1 matching file, chosen by you',
    });
    const registered = await handlers['project.register']({
      ...selection,
      workspace: { kind: 'new', name: 'Shop', code: 'SH', color: 'teal' },
      baseLocale: 'en',
      targetLocales: ['de'],
    });

    const settings = await handlers['project.settings']({ projectId: registered.projectId });

    expect(settings.sourceRoot).toBe('frontend');
    expect(registered.configFile).toBe('pending');
    expect(existsSync(join(repository, 'wortlaut.config.json'))).toBe(false);
  });

  it('rejects unknown or outside source folder tokens before inspecting or registering', async () => {
    const folderToken = await chooseRepository();
    const outside = grants.grant(root);
    const unknown = '2aa07749-06f9-4f7b-a76b-286da12c3def';

    for (const sourceRootToken of [outside.token, unknown]) {
      const selection = {
        folderToken,
        catalogFolderTokens: [],
        preset: 'angular' as const,
        sourceRootToken,
      };

      await expect(
        Promise.resolve().then(() => handlers['project.inspectFolder'](selection)),
      ).rejects.toThrow();
      await expect(
        handlers['project.register']({
          ...selection,
          workspace: { kind: 'new', name: 'Shop', code: 'SH', color: 'teal' },
          baseLocale: 'en',
          targetLocales: [],
        }),
      ).rejects.toThrow();
    }

    expect(handlers['workspace.list']({})).toEqual([]);
    expect(existsSync(join(repository, 'wortlaut.config.json'))).toBe(false);
  });

  it('opens the only project of a workspace and leaves several to the list', async () => {
    const folderToken = await chooseRepository();
    const { workspaceId } = await handlers['workspace.create']({
      name: 'Shop',
      code: 'SH',
      color: 'teal',
      folderToken,
    });

    expect(
      await handlers['workspace.create']({ name: 'Other', code: 'OT', color: 'teal', folderToken }),
    ).toMatchObject({ next: 'setup' });
    expect(handlers['workspace.open']({ workspaceId })).toEqual({ next: 'projects' });

    await handlers['project.register']({
      folderToken,
      catalogFolderTokens: [],
      workspace: { kind: 'existing', id: workspaceId },
      preset: null,
      baseLocale: 'en',
      targetLocales: [],
    });

    expect(handlers['workspace.open']({ workspaceId })).toEqual({ next: 'overview' });
  });

  it('closes and opens a project', async () => {
    const folderToken = await chooseRepository();
    const { projectId } = await handlers['project.register']({
      folderToken,
      catalogFolderTokens: [],
      workspace: { kind: 'new', name: 'Shop', code: 'SH', color: 'teal' },
      preset: null,
      baseLocale: 'en',
      targetLocales: [],
    });

    expect((await handlers['shell.setProject']({ projectId: null })).project).toBeNull();
    expect((await handlers['shell.setProject']({ projectId })).project?.id).toBe(projectId);
  });

  it('refuses a folder inside the project when it lies outside', async () => {
    const folderToken = await chooseRepository();

    host.chosen = root;

    await expect(handlers['dialog.chooseFolder']({ insideToken: folderToken })).rejects.toThrow(
      'Choose a folder inside the project.',
    );
  });

  it('refuses a token it did not hand out, and registers nothing for it', async () => {
    const unknown = '6f1b1c1e-0d3a-4f5e-9a2b-1c2d3e4f5a6b';

    await expect(
      Promise.resolve().then(() =>
        handlers['project.inspectFolder']({
          folderToken: unknown,
          catalogFolderTokens: [],
          preset: null,
        }),
      ),
    ).rejects.toThrow('no longer available');
    await expect(
      Promise.resolve().then(() =>
        handlers['workspace.create']({ name: 'X', code: 'X', color: 'teal', folderToken: unknown }),
      ),
    ).rejects.toThrow('no longer available');
    expect(handlers['workspace.list']({})).toEqual([]);
  });

  it('opens only a settings file the engine resolved', async () => {
    const folderToken = await chooseRepository();
    const { projectId } = await handlers['project.register']({
      folderToken,
      catalogFolderTokens: [],
      workspace: { kind: 'new', name: 'Shop', code: 'SH', color: 'teal' },
      preset: null,
      baseLocale: 'en',
      targetLocales: [],
    });

    await expect(
      Promise.resolve().then(() => handlers['config.openSourceFile']({ projectId })),
    ).rejects.toThrow('no settings file');
    expect(host.openPath).not.toHaveBeenCalled();

    writeFileSync(
      join(repository, 'wortlaut.config.json'),
      JSON.stringify({ actions: { detect: { resourceRoot: 'i18n' } } }),
    );

    await handlers['config.openSourceFile']({ projectId });

    expect(host.openPath).toHaveBeenCalledWith(join(repository, 'wortlaut.config.json'));
  });

  it('says when a run is gone', async () => {
    await expect(
      Promise.resolve().then(() => handlers['run.get']({ runId: 'gone' })),
    ).rejects.toThrow('no longer stored');
  });

  it('answers the renderer with display paths only', async () => {
    const folderToken = await chooseRepository();
    const router = new IpcRouter(handlers, (text) => text);
    const id = '6f1b1c1e-0d3a-4f5e-9a2b-1c2d3e4f5a6b';
    const registered = await handlers['project.register']({
      folderToken,
      catalogFolderTokens: [],
      workspace: { kind: 'new', name: 'Shop', code: 'SH', color: 'teal' },
      preset: null,
      baseLocale: 'en',
      targetLocales: ['de'],
    });
    const responses = await Promise.all([
      router.handle(
        {
          correlationId: id,
          method: 'project.summary',
          payload: { projectId: registered.projectId },
        },
        true,
      ),
      router.handle(
        {
          correlationId: id,
          method: 'project.settings',
          payload: { projectId: registered.projectId },
        },
        true,
      ),
      router.handle(
        {
          correlationId: id,
          method: 'project.list',
          payload: { workspaceId: registered.workspaceId },
        },
        true,
      ),
      router.handle({ correlationId: id, method: 'workspace.list', payload: {} }, true),
      router.handle(
        {
          correlationId: id,
          method: 'workspace.get',
          payload: { workspaceId: registered.workspaceId },
        },
        true,
      ),
      router.handle(
        {
          correlationId: id,
          method: 'config.getEffective',
          payload: { projectId: registered.projectId },
        },
        true,
      ),
      router.handle(
        { correlationId: id, method: 'nx.targets', payload: { projectId: registered.projectId } },
        true,
      ),
      router.handle(
        { correlationId: id, method: 'cli.commands', payload: { projectId: registered.projectId } },
        true,
      ),
    ]);

    for (const response of responses) {
      expect(response.ok).toBe(true);
      expect(JSON.stringify(response)).not.toContain(root);
    }
  });

  it('answers app information', () => {
    expect(handlers['app.getInfo']({})).toMatchObject({ name: 'Wortlaut', version: '0.2.0' });
  });
});

describe('describeFolderDrop', () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-drop-')));
    writeFileSync(join(root, 'file.txt'), '');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('answers a folder with a token', () => {
    const event = describeFolderDrop(new FolderGrants(root), root);

    expect(event).toMatchObject({ type: 'folder.dropped', folder: { displayPath: '~' } });
    expect(JSON.stringify(event)).not.toContain(root);
  });

  it('answers a file, a missing folder and nonsense with a message', () => {
    const grants = new FolderGrants(root);

    expect(describeFolderDrop(grants, join(root, 'file.txt'))).toEqual({
      type: 'folder.dropFailed',
      message: 'That is a file. Choose a folder.',
    });
    expect(describeFolderDrop(grants, join(root, 'nope'))).toEqual({
      type: 'folder.dropFailed',
      message: 'This folder cannot be read.',
    });
    expect(describeFolderDrop(grants, 42)).toEqual({
      type: 'folder.dropFailed',
      message: 'That is no folder. Drop a folder.',
    });
  });
});

describe('the AI requests', () => {
  const KEY = 'test-key-not-real';
  let root: string;
  let repository: string;
  let handlers: IpcHandlers;
  let router: IpcRouter;
  let events: Array<unknown>;
  let secrets: MemorySecretStore;
  let projectId: string;

  beforeEach(async () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-ai-requests-')));
    repository = join(root, 'shop');
    mkdirSync(join(repository, 'i18n'), { recursive: true });
    writeFileSync(join(repository, 'i18n', 'lang.en.json'), JSON.stringify({ loc: { a: 'A' } }));
    events = [];
    secrets = new MemorySecretStore();

    const fileSystem = new FileSystem();
    const local = new LocalAssistants({
      synapse: () => Promise.reject(new Error('Not in a spec.')),
      stateRoot: join(root, 'state'),
      environment: {},
      home: root,
      locate: () => null,
    });
    const ai = new AiProviderHost({
      fileSystem,
      local,
      keys: {
        get: (provider) => Promise.resolve(secrets.get(provider)),
        has: (provider) => Promise.resolve(secrets.has(provider)),
      },
      fetch: (_url, init) =>
        Promise.resolve({
          ok: init.headers.Authorization === `Bearer ${KEY}`,
          status: 401,
          json: () => Promise.resolve({ data: [{ id: 'gpt-4o-mini' }] }),
        }),
    });
    const engine = new WortlautEngine({
      surface: 'desktop',
      logger: LOGGER,
      profileRoot: join(root, 'profile'),
      home: root,
      env: {},
      ai,
    });
    const grants = new FolderGrants(root);

    handlers = createDesktopRequests({
      engine,
      grants,
      host: nativeHost({ chooseFolder: () => Promise.resolve(repository) }),
      name: 'Wortlaut',
      version: '0.0.0',
      publish: (event) => events.push(event),
      secrets,
    });
    router = new IpcRouter(handlers, (text) => text);

    const { folder } = await handlers['dialog.chooseFolder']({ insideToken: null });

    ({ projectId } = await handlers['project.register']({
      folderToken: folder?.token as string,
      catalogFolderTokens: [],
      workspace: { kind: 'new', name: 'Shop', code: 'S', color: 'teal' },
      preset: 'angular',
      baseLocale: 'en',
      targetLocales: ['de'],
    }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * Sends a request the way the renderer does, through validation.
   */
  function send(
    method: string,
    payload: unknown,
  ): Promise<{ ok: boolean; data?: unknown; error?: { message: string } }> {
    return router.handle(
      { correlationId: '6f1f0b4e-3a59-4c8a-9a3b-0f9d7c1a2b3c', method, payload },
      true,
    ) as Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>;
  }

  it('takes a key, and the renderer learns only whether one exists', async () => {
    // act
    const set = await send('ai.setKey', { providerId: 'openai', key: KEY });
    const providers = await send('ai.providers', {});

    // assert
    expect(secrets.get('openai')).toBe(KEY);
    expect(set).toMatchObject({ ok: true, data: { id: 'openai', state: 'ready' } });
    expect(JSON.stringify([set, providers, events])).not.toContain(KEY);
  });

  it('offers no request that reads a key back', () => {
    // assert
    expect(
      Object.keys(handlers)
        .filter((method) => /^ai\..*Key$/.test(method))
        .sort(),
    ).toEqual(['ai.clearKey', 'ai.setKey', 'ai.testKey']);
  });

  it('tests and clears a key', async () => {
    // arrange
    await send('ai.setKey', { providerId: 'openai', key: KEY });

    // act
    const test = await send('ai.testKey', { providerId: 'openai' });
    const cleared = await send('ai.clearKey', { providerId: 'openai' });

    // assert
    expect(test).toMatchObject({ ok: true, data: { ok: true } });
    expect(cleared).toMatchObject({ ok: true, data: { state: 'no-key' } });
    expect(secrets.has('openai')).toBe(false);
  });

  it('shows the true state: without an assistant or a key, no provider is set up', async () => {
    // act
    const { data } = await send('ai.providers', {});

    // assert
    expect(
      (data as Array<{ id: string; state: string }>).map(({ id, state }) => [id, state]),
    ).toEqual([
      ['claude-code', 'not-installed'],
      ['codex', 'not-installed'],
      ['opencode', 'not-installed'],
      ['openai', 'no-key'],
      ['google', 'no-key'],
    ]);
  });

  it('says in the title bar what is set up', async () => {
    // arrange
    await send('ai.setKey', { providerId: 'openai', key: KEY });

    // act
    const none = await handlers['ai.setDefaultProvider']({ providerId: 'codex' });
    const chosen = await handlers['ai.setDefaultProvider']({ providerId: 'openai' });

    // assert
    expect(none.provider).toBe('Codex · not set up');
    expect(chosen.provider).toBe('OpenAI · API key');
    expect(events).toContainEqual({ type: 'ai.providersChanged' });
  });

  it('shows how to install and installs nothing', async () => {
    // act
    const hint = await handlers['ai.installHint']({ providerId: 'codex' });

    // assert
    expect(hint.text).toContain('Wortlaut installs nothing');
  });

  it('refuses a run with a provider that is not set up, and writes nothing', async () => {
    // arrange
    const run = await handlers['run.start']({
      command: 'generate',
      projectId,
      input: {
        locales: ['de'],
        scope: 'all',
        namespace: null,
        keys: null,
        limit: null,
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.3,
        chunkSize: 10,
        instructions: '',
        reviewBeforeWriting: true,
        protectPlaceholders: true,
      },
    });

    // act
    await vi.waitFor(() => expect(handlers['run.result']({ runId: run.id })).not.toBeNull());

    // assert
    expect(handlers['run.result']({ runId: run.id })).toMatchObject({ state: 'failed' });
    expect(existsSync(join(repository, 'i18n', 'lang.de.json'))).toBe(false);
  });

  it('refuses a write of a run while Dry run is on, and saves defaults as a pending change set', async () => {
    // act
    const outcome = await handlers['ai.saveDefaults']({
      projectId,
      changes: {
        model: 'gpt-4o',
        temperature: 0.2,
        chunkSize: 20,
        limit: null,
        instructions: 'Short.',
        localeInstructions: {},
        safety: {
          reviewBeforeWriting: true,
          protectPlaceholders: true,
          keepPartialResults: true,
          keepRawOutput: false,
        },
      },
    });

    // assert
    expect(outcome.state).toBe('pending');
    expect(existsSync(join(repository, 'wortlaut.config.json'))).toBe(false);
  });

  it('cancels a proposal on its way', async () => {
    // arrange
    const requestId = '11111111-2222-4333-8444-555555555555';

    // act & assert
    await expect(handlers['ai.cancel']({ requestId })).toEqual({});
    await expect(
      handlers['ai.suggestValue']({
        requestId,
        projectId,
        key: 'loc.a',
        locale: 'de',
        comment: '',
      }),
    ).rejects.toThrow(/No AI provider is set up/);
  });
});

describe('moving a workspace and the settings of the app', () => {
  const SECRET = 'sk-this-must-never-leave-0123456789';
  let root: string;
  let repository: string;
  let saved: Array<{ title: string; defaultName: string; text: string }>;
  let opened: { name: string; text: string } | null;
  let chosen: string | null;
  let colorMode: string | null;
  let handlers: IpcHandlers;
  let openPath: ReturnType<typeof vi.fn>;
  let settings: AppSettingsStore;

  const compose = (env: NodeJS.ProcessEnv = {}): IpcHandlers =>
    createDesktopRequests({
      engine: new WortlautEngine({
        surface: 'desktop',
        logger: LOGGER,
        profileRoot: join(root, 'profile'),
        home: root,
        env,
        tool: 'test',
      }),
      grants: new FolderGrants(root),
      host: nativeHost({
        chooseFolder: () => Promise.resolve(chosen),
        openPath,
        saveTextFile: (options) => {
          saved.push(options);

          return Promise.resolve(join(root, 'exports', options.defaultName));
        },
        openTextFile: () => Promise.resolve(opened),
        setColorMode: (mode) => {
          colorMode = mode;
        },
        activeColorMode: () => (colorMode === 'dark' ? 'dark' : 'light'),
      }),
      name: 'Wortlaut',
      version: '0.2.0',
      settings,
      home: root,
    });
  const workspaceOf = async (): Promise<string> => {
    chosen = repository;

    const { folder } = await handlers['dialog.chooseFolder']({ insideToken: null });
    const { workspaceId } = await handlers['workspace.create']({
      name: 'Acme',
      code: 'AC',
      color: 'blue',
      folderToken: (folder as { token: string }).token,
    });

    await handlers['workspace.open']({ workspaceId });

    return workspaceId;
  };

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-moving-')));
    repository = join(root, 'shop');
    mkdirSync(join(repository, 'i18n'), { recursive: true });
    writeFileSync(join(repository, 'i18n', 'lang.en.json'), JSON.stringify({ 'a.title': 'Title' }));
    writeFileSync(
      join(repository, 'wortlaut.config.json'),
      JSON.stringify({
        actions: {
          detect: { resourceRoot: 'i18n' },
          generate: { baseLocale: 'en', apiKey: SECRET },
        },
      }),
    );
    saved = [];
    opened = null;
    chosen = null;
    colorMode = null;
    openPath = vi.fn(() => Promise.resolve());
    settings = new AppSettingsStore(join(root, 'profile', 'settings.json'));
    handlers = compose();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('exports', () => {
    it('holds settings and repository names, and no key, no login and no path', async () => {
      // arrange
      const workspaceId = await workspaceOf();

      // act
      const { file } = await handlers['workspace.export']({ workspaceId });

      // assert
      const [{ text, defaultName }] = saved;

      expect(file).toBe('~/exports/Acme.wortlaut-workspace.json');
      expect(defaultName).toBe('Acme.wortlaut-workspace.json');
      expect(JSON.parse(text)).toMatchObject({
        format: 'wortlaut-workspace',
        schemaVersion: 1,
        workspace: {
          name: 'Acme',
          code: 'AC',
          color: 'blue',
          repositories: [{ name: 'shop' }],
          packs: [],
        },
      });
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(root);
      expect(text).not.toMatch(/apiKey|token|password|secret/iu);
    });

    it('leaves the run configuration without a secret, and with paths as display values', async () => {
      // arrange
      const workspaceId = await workspaceOf();

      // act
      await handlers['config.exportRun']({ workspaceId, projectId: null });

      // assert
      const [{ text, defaultName }] = saved;
      const file = JSON.parse(text) as {
        format: string;
        projects: Array<{ name: string; settings: Array<{ setting: string }> }>;
      };

      expect(defaultName).toBe('wortlaut-run-configuration.json');
      expect(file.format).toBe('wortlaut-run-configuration');
      expect(file.projects[0].settings.length).toBeGreaterThan(0);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(root);
      expect(file.projects[0].settings.map((setting) => setting.setting)).not.toContain(
        'actions.generate.apiKey',
      );
    });

    it('leaves out the value of a secret variable of the environment, whatever option holds it', async () => {
      // arrange
      writeFileSync(
        join(repository, 'wortlaut.config.json'),
        JSON.stringify({
          actions: {
            detect: { resourceRoot: 'i18n' },
            generate: { baseLocale: 'en', instructions: SECRET },
          },
        }),
      );
      handlers = compose({ WORTLAUT_TEST_API_KEY: SECRET });

      const workspaceId = await workspaceOf();

      // act
      await handlers['config.exportRun']({ workspaceId, projectId: null });

      // assert
      expect(saved[0].text).not.toContain(SECRET);
    });

    it('says so when the dialog was cancelled', async () => {
      // arrange
      const workspaceId = await workspaceOf();
      const cancelled = createDesktopRequests({
        engine: new WortlautEngine({
          surface: 'desktop',
          logger: LOGGER,
          profileRoot: join(root, 'profile'),
          home: root,
          env: {},
        }),
        grants: new FolderGrants(root),
        host: nativeHost({ saveTextFile: () => Promise.resolve(null) }),
        name: 'Wortlaut',
        version: '0.2.0',
      });

      // act & assert
      expect(await cancelled['workspace.export']({ workspaceId })).toEqual({ file: null });
    });
  });

  describe('imports', () => {
    const FILE = {
      format: 'wortlaut-workspace',
      schemaVersion: 1,
      workspace: {
        name: 'From elsewhere',
        code: 'FE',
        color: 'green',
        scanForProjects: true,
        defaults: { baseLocale: 'en', targetLocales: ['de'], preset: 'angular' },
        repositories: [{ name: 'shop' }],
        packs: [
          {
            id: 'message-checks',
            name: 'Message checks',
            source: 'wortlaut:message-checks',
            version: '1.0.0',
            commit: null,
            hash: `sha256:${'a'.repeat(64)}`,
          },
        ],
      },
    };
    const choose = (content: unknown): void => {
      opened = {
        name: 'moved.json',
        text: typeof content === 'string' ? content : JSON.stringify(content),
      };
    };

    it('changes nothing for a cancelled dialog', async () => {
      // act
      const { preview } = await handlers['workspace.chooseImport']({});

      // assert
      expect(preview).toBeNull();
      expect(handlers['workspace.list']({})).toEqual([]);
    });

    it('shows what a file adds, and changes nothing before it is confirmed', async () => {
      // arrange
      await workspaceOf();
      choose(FILE);

      // act
      const { preview } = await handlers['workspace.chooseImport']({});

      // assert
      expect(preview).toMatchObject({
        fileName: 'moved.json',
        name: 'From elsewhere',
        code: 'FE',
        repositories: [{ name: 'shop' }],
        packs: [{ id: 'message-checks', kind: 'shipped' }],
        nameTaken: false,
      });
      expect(handlers['workspace.list']({})).toHaveLength(1);
    });

    it.each([
      ['no JSON', 'not json', 'not valid JSON'],
      ['another format', { ...FILE, format: 'something-else' }, 'not a workspace'],
      ['a later version', { ...FILE, schemaVersion: 2 }, 'not a workspace'],
      ['a key', { ...FILE, workspace: { ...FILE.workspace, apiKey: 'sk-1' } }, 'not a workspace'],
      ['a field too many', { ...FILE, extra: true }, 'not a workspace'],
      [
        'a path',
        {
          ...FILE,
          workspace: { ...FILE.workspace, repositories: [{ name: 'shop', path: '/etc' }] },
        },
        'not a workspace',
      ],
      [
        'control characters',
        { ...FILE, workspace: { ...FILE.workspace, name: 'Bad\u001b[2Jname' } },
        'not a workspace',
      ],
      [
        'a bad code',
        { ...FILE, workspace: { ...FILE.workspace, code: 'much too long' } },
        'not a workspace',
      ],
      [
        'a pack without a pin',
        {
          ...FILE,
          workspace: {
            ...FILE.workspace,
            packs: [
              {
                id: 'x',
                name: 'x',
                source: 'github:a/b',
                version: null,
                commit: null,
                hash: 'none',
              },
            ],
          },
        },
        'not a workspace',
      ],
    ])('refuses a file with %s, and repeats nothing of it', async (_name, content, message) => {
      // arrange
      choose(content);

      // act & assert
      await expect(handlers['workspace.chooseImport']({})).rejects.toThrow(message);
      expect(handlers['workspace.list']({})).toEqual([]);
    });

    it('does not repeat what a bad file holds in its message', async () => {
      // arrange
      choose({ ...FILE, workspace: { ...FILE.workspace, name: `${SECRET}\u0007` } });

      // act
      const error = await handlers['workspace.chooseImport']({}).catch(
        (caught: unknown) => caught as Error,
      );

      // assert
      expect((error as Error).message).not.toContain(SECRET);
    });

    it('refuses a file that is too large to be a workspace', async () => {
      // arrange
      choose(`${JSON.stringify(FILE)}${' '.repeat(2 * 1024 * 1024)}`);

      // act & assert
      await expect(handlers['workspace.chooseImport']({})).rejects.toThrow('too large');
    });

    it('adds a new workspace with the chosen folders, and gains no folder from the file', async () => {
      // arrange
      choose(FILE);

      const { preview } = await handlers['workspace.chooseImport']({});

      chosen = repository;

      const { folder } = await handlers['dialog.chooseFolder']({ insideToken: null });

      // act
      const result = await handlers['workspace.import']({
        importId: (preview as { importId: string }).importId,
        folderTokens: [(folder as { token: string }).token],
      });

      // assert
      expect(result.discovered).toBe(1);
      expect(handlers['workspace.get']({ workspaceId: result.workspaceId })).toMatchObject({
        name: 'From elsewhere',
        code: 'FE',
        color: 'green',
        repositories: [{ displayPath: '~/shop', missing: false }],
        defaults: { baseLocale: 'en', targetLocales: ['de'], preset: 'angular' },
      });
    });

    it('refuses a pack whose source does not give what the file pinned, and adds the rest', async () => {
      // arrange
      choose(FILE);

      const { preview } = await handlers['workspace.chooseImport']({});

      chosen = repository;

      const { folder } = await handlers['dialog.chooseFolder']({ insideToken: null });

      // act
      const result = await handlers['workspace.import']({
        importId: (preview as { importId: string }).importId,
        folderTokens: [(folder as { token: string }).token],
      });

      // assert
      expect(result.packs).toEqual([
        {
          name: 'Message checks',
          state: 'refused',
          detail: 'Its source no longer gives what this file pinned, so nothing was added.',
        },
      ]);
      expect(existsSync(join(repository, 'wortlaut.lock.json'))).toBe(false);
    });

    it('takes a file back that it wrote, under Dry run: a pack waits in Review and nothing reaches the repository', async () => {
      // arrange
      const workspaceId = await workspaceOf();
      const pack = await handlers['rulePack.check']({
        source: { kind: 'shipped', value: 'message-checks' },
      });

      await handlers['app.setDryRun']({ dryRun: false });
      await handlers['rulePack.install']({
        checkId: pack.checkId as string,
        target: { kind: 'workspace', workspaceId },
      });
      await handlers['workspace.export']({ workspaceId });

      const elsewhere = join(root, 'elsewhere');

      mkdirSync(join(elsewhere, 'i18n'), { recursive: true });
      writeFileSync(join(elsewhere, 'i18n', 'lang.en.json'), '{}');
      writeFileSync(
        join(elsewhere, 'wortlaut.config.json'),
        JSON.stringify({ actions: { detect: { resourceRoot: 'i18n' } } }),
      );
      await handlers['app.setDryRun']({ dryRun: true });
      choose(saved[0].text);

      const { preview } = await handlers['workspace.chooseImport']({});

      chosen = elsewhere;

      const { folder } = await handlers['dialog.chooseFolder']({ insideToken: null });

      // act
      const result = await handlers['workspace.import']({
        importId: (preview as { importId: string }).importId,
        folderTokens: [(folder as { token: string }).token],
      });

      // assert
      expect(result.packs).toEqual([{ name: expect.any(String), state: 'pending', detail: null }]);
      expect(existsSync(join(elsewhere, 'wortlaut.lock.json'))).toBe(false);
      expect(
        (handlers['changes.list']({ workspaceId: result.workspaceId }) as Array<unknown>).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('search', () => {
    it('finds keys and files, and opens a file by id only inside the chosen folders', async () => {
      // arrange
      const workspaceId = await workspaceOf();

      // act
      const results = handlers['search.query']({ text: 'lang.en', workspaceId, projectId: null });
      const byKey = handlers['search.query']({ text: 'a.title', workspaceId, projectId: null });

      // assert
      expect(byKey.keys).toMatchObject([{ key: 'a.title', value: 'Title' }]);
      expect(results.files).toMatchObject([{ file: 'i18n/lang.en.json', kind: 'catalog' }]);
      expect(JSON.stringify(results)).not.toContain(root);

      // act
      await handlers['search.openFile']({ id: results.files[0].id });

      // assert
      expect(openPath).toHaveBeenCalledWith(join(repository, 'i18n', 'lang.en.json'));
      await expect(handlers['search.openFile']({ id: 'never-handed-out' })).rejects.toThrow(
        'no longer available',
      );
    });
  });

  describe('settings', () => {
    it('starts in dry run by default, and from what the user saved after that', () => {
      // assert
      expect(handlers['shell.state']({}).dryRun).toBe(true);

      // act
      handlers['app.saveSettings']({
        startInDryRun: false,
        verboseLog: false,
        cacheResults: true,
        colorMode: null,
      });

      // assert
      expect(handlers['shell.state']({}).dryRun).toBe(true);
      expect(compose()['shell.state']({}).dryRun).toBe(false);
    });

    it('saves in the profile, survives a restart and sets the color mode at once', () => {
      // act
      const saved_ = handlers['app.saveSettings']({
        startInDryRun: true,
        verboseLog: true,
        cacheResults: false,
        colorMode: 'dark',
      });

      // assert
      expect(colorMode).toBe('dark');
      expect(saved_).toEqual({
        startInDryRun: true,
        verboseLog: true,
        cacheResults: false,
        colorMode: 'dark',
        cacheFolder: '.wortlaut/cache',
        activeColorMode: 'dark',
      });
      expect(JSON.parse(readFileSync(join(root, 'profile', 'settings.json'), 'utf8'))).toEqual({
        startInDryRun: true,
        verboseLog: true,
        cacheResults: false,
        colorMode: 'dark',
      });
      expect(new AppSettingsStore(join(root, 'profile', 'settings.json')).read().verboseLog).toBe(
        true,
      );
    });

    it('falls back to the defaults for a file that cannot be read', () => {
      // arrange
      mkdirSync(join(root, 'profile'), { recursive: true });
      writeFileSync(join(root, 'profile', 'settings.json'), '{ nope');

      // assert
      expect(new AppSettingsStore(join(root, 'profile', 'settings.json')).read()).toEqual(
        DEFAULT_APP_SETTINGS,
      );
    });

    it('turns the settings into what a run gets', () => {
      // assert
      expect(
        runHostingOf({
          startInDryRun: true,
          verboseLog: true,
          cacheResults: true,
          colorMode: null,
        }),
      ).toEqual({ cache: { folder: '.wortlaut/cache' }, verbose: true });
      expect(
        runHostingOf({
          startInDryRun: true,
          verboseLog: false,
          cacheResults: false,
          colorMode: null,
        }),
      ).toEqual({ verbose: false });
    });
  });
});

/**
 * @private
 */
function nativeHost(overrides: Partial<INativeHost>): INativeHost {
  return {
    chooseFolder: () => Promise.resolve(null),
    openPath: vi.fn(() => Promise.resolve()),
    saveTextFile: () => Promise.resolve(null),
    openTextFile: () => Promise.resolve(null),
    setColorMode: () => undefined,
    activeColorMode: () => 'light',
    writeClipboard: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

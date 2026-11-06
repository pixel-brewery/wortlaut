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
import { dirname, join } from 'node:path';
import { FileSystem, type ILogger } from '@pixel-brewery/utilities';
import type { RuleLock } from '@pixel-brewery/wortlaut-contracts';
import type { INpmPackage, IPackFetcher, IPackFile } from '@pixel-brewery/wortlaut-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG } from '../arguments/configurations/IAnalyzeCommandArgsConfig';
import {
  DEFAULT_RULES_COMMAND_ARGS_CONFIG,
  type IRulesCommandArgsConfig,
} from '../arguments/configurations/IRulesCommandArgsConfig';
import { AnalyzeCommand } from './AnalyzeCommand';
import { RulesCommand } from './RulesCommand';

// #endregion

const COMMIT = 'a'.repeat(40);
const PACK = {
  schemaVersion: 1,
  id: 'our-pack',
  name: 'Our pack',
  description: 'Our own rules.',
  version: '1.0.0',
  rules: [
    {
      id: 'no-todo',
      description: 'No TODO in a value.',
      severity: 'error',
      message: 'Remove TODO.',
      pattern: { regex: 'TODO' },
    },
    {
      id: 'short-values',
      description: 'Values stay short.',
      severity: 'warning',
      message: 'Too long.',
      limit: { maxLength: 8 },
    },
  ],
};

/**
 * A source of packs in memory.
 */
class FakeFetcher implements IPackFetcher {
  public commit = COMMIT;
  public text = `${JSON.stringify(PACK, null, 2)}\n`;

  public resolveCommit(): Promise<string> {
    return Promise.resolve(this.commit);
  }

  public downloadCommit(): Promise<Array<IPackFile>> {
    return Promise.resolve([{ path: 'wortlaut-pack.json', bytes: Buffer.from(this.text) }]);
  }

  public resolvePackage(): Promise<INpmPackage> {
    return Promise.resolve({
      version: '1.0.0',
      tarball: 'https://registry.npmjs.org/x.tgz',
      integrity: null,
      shasum: null,
    });
  }

  public downloadPackage(): Promise<Array<IPackFile>> {
    return this.downloadCommit();
  }
}

describe('RulesCommand', () => {
  let root: string;
  let fetcher: FakeFetcher;

  const write = (path: string, content: string): void => {
    const file = join(root, path);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  const read = (path: string): string => readFileSync(join(root, path), 'utf8');
  const createLogger = (): ILogger =>
    ({
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }) as unknown as ILogger;
  const rules = (config: Partial<IRulesCommandArgsConfig>, logger = createLogger()): RulesCommand =>
    new RulesCommand(
      { ...DEFAULT_RULES_COMMAND_ARGS_CONFIG, cwd: root, ...config },
      logger,
      new FileSystem(),
      { packFetcher: fetcher },
    );
  const printed = (logger: ILogger): string => vi.mocked(logger.log).mock.calls.flat().join('\n');
  const analyze = async (): Promise<{
    exitCode: typeof process.exitCode;
    findings: Array<{ rule: string; severity: string }>;
  }> => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    process.exitCode = 0;

    const command = new AnalyzeCommand(
      { ...DEFAULT_ANALYZE_COMMAND_ARGS_CONFIG, cwd: root, json: true },
      createLogger(),
      new FileSystem(),
    );

    await command.execute();

    const exitCode = process.exitCode;
    const report = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      findings: Array<{ rule: string; severity: string }>;
    };

    process.exitCode = 0;
    stdout.mockRestore();
    stderr.mockRestore();

    return { exitCode, findings: report.findings };
  };

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wortlaut-rules-command-')));
    fetcher = new FakeFetcher();
    write('.git/HEAD', 'ref');
    write(
      'wortlaut.config.json',
      JSON.stringify({
        actions: { detect: { resourceRoot: 'i18n', type: 'json' }, analyze: { baseLocale: 'en' } },
      }),
    );
    write('i18n/lang.en.json', JSON.stringify({ loc: { a: 'Good' } }));
    write('i18n/lang.de.json', JSON.stringify({ loc: { a: 'TODO Gut' } }));
    write('rules/our-pack/wortlaut-pack.json', fetcher.text);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
    rmSync(root, { recursive: true, force: true });
  });

  it('adds a pack from a folder through a change set, pinned in the lock file', async () => {
    // act
    await rules({ action: 'add', subject: './rules/our-pack' }).execute();

    // assert
    expect((JSON.parse(read('wortlaut.lock.json')) as RuleLock).packs['our-pack']).toMatchObject({
      source: 'folder:rules/our-pack',
      commit: null,
    });
  });

  it('adds a pack from GitHub, pinned by commit and hash', async () => {
    // act
    await rules({ action: 'add', subject: 'github:owner/rules' }).execute();

    // assert
    expect((JSON.parse(read('wortlaut.lock.json')) as RuleLock).packs['our-pack']).toMatchObject({
      source: 'github:owner/rules',
      commit: COMMIT,
    });
    expect(read('.wortlaut/rule-packs/our-pack/wortlaut-pack.json')).toBe(fetcher.text);
  });

  it('gives the same findings for a pack from a folder and from GitHub', async () => {
    // arrange
    await rules({ action: 'add', subject: './rules/our-pack' }).execute();

    const fromFolder = await analyze();

    rmSync(join(root, 'wortlaut.lock.json'));
    await rules({ action: 'add', subject: 'github:owner/rules' }).execute();

    // act
    const fromGitHub = await analyze();

    // assert
    expect(fromGitHub.findings).toEqual(fromFolder.findings);
    expect(fromGitHub.findings.map((finding) => finding.rule)).toContain('no-todo');
  });

  it('writes nothing with --dry-run, and leaves a change set with --review', async () => {
    // act
    await rules({ action: 'add', subject: 'github:owner/rules', dryRun: true }).execute();

    // assert
    expect(existsSync(join(root, 'wortlaut.lock.json'))).toBe(false);

    // act
    const logger = createLogger();

    await rules({ action: 'add', subject: 'github:owner/rules', review: true }, logger).execute();

    // assert
    expect(existsSync(join(root, 'wortlaut.lock.json'))).toBe(false);
    expect(printed(logger)).toMatch(/waits for review/);
  });

  it('checks a source without writing anything, and says what it may do', async () => {
    // arrange
    const logger = createLogger();

    // act
    await rules({ action: 'check', subject: 'github:owner/rules' }, logger).execute();

    // assert
    expect(printed(logger)).toMatch(/Our pack/);
    expect(printed(logger)).toMatch(/no network access/);
    expect(existsSync(join(root, 'wortlaut.lock.json'))).toBe(false);
  });

  it('fails a check with its reason for what is no pack, or holds code', async () => {
    // arrange
    write('empty/README.md', 'Hi');
    write('code/wortlaut-pack.json', fetcher.text);
    write('code/hook.js', 'process.exit(1)');

    // act & assert
    await expect(rules({ action: 'check', subject: './empty' }).execute()).rejects.toThrow(
      /no rule pack/,
    );
    await expect(rules({ action: 'check', subject: './code' }).execute()).rejects.toThrow(
      /holds code/,
    );
    await expect(rules({ action: 'add', subject: './code' }).execute()).rejects.toThrow(/hook\.js/);
    expect(existsSync(join(root, 'wortlaut.lock.json'))).toBe(false);
  });

  it('lists the packs, and a refused one says why, in text and as JSON', async () => {
    // arrange
    await rules({ action: 'add', subject: './rules/our-pack' }).execute();
    write('rules/our-pack/wortlaut-pack.json', `${fetcher.text} `);

    const logger = createLogger();
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    // act
    await rules({ action: 'list' }, logger).execute();
    await rules({ action: 'list', json: true }).execute();

    // assert
    expect(printed(logger)).toMatch(/Our pack.*refused/);
    expect(printed(logger)).toMatch(/does not match its pin/);

    const report = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      ok: boolean;
      data: Array<{ id: string; state: string; reason: string | null }>;
    };

    expect(report.ok).toBe(true);
    expect(report.data.find((pack) => pack.id === 'our-pack')).toMatchObject({
      state: 'refused',
      reason: expect.stringContaining('does not match'),
    });
  });

  it('fails rules check for a refused pack, and passes it otherwise', async () => {
    // arrange
    await rules({ action: 'add', subject: './rules/our-pack' }).execute();

    // act & assert
    await expect(rules({ action: 'check' }).execute()).resolves.toMatchObject({ canceled: false });

    write('rules/our-pack/wortlaut-pack.json', `${fetcher.text} `);

    await expect(rules({ action: 'check' }).execute()).rejects.toThrow(/was refused/);
  });

  it('updates a changed pack only when asked, with --dry-run writing nothing', async () => {
    // arrange
    await rules({ action: 'add', subject: 'github:owner/rules' }).execute();

    const pinned = read('wortlaut.lock.json');
    const next = {
      ...PACK,
      version: '1.1.0',
      rules: [
        ...PACK.rules,
        { id: 'new-rule', description: 'New.', message: 'x', limit: { maxLength: 99 } },
      ],
    };

    fetcher.commit = 'b'.repeat(40);
    fetcher.text = `${JSON.stringify(next, null, 2)}\n`;

    // act
    await analyze();
    await rules({ action: 'update', dryRun: true }).execute();

    // assert
    expect(read('wortlaut.lock.json')).toBe(pinned);

    // act
    const logger = createLogger();

    await rules({ action: 'update', subject: 'our-pack' }, logger).execute();

    // assert
    expect(printed(logger)).toMatch(/1 new rule, commit bbbbbbb/);
    expect((JSON.parse(read('wortlaut.lock.json')) as RuleLock).packs['our-pack']).toMatchObject({
      commit: fetcher.commit,
      version: '1.1.0',
    });
    expect(read('.wortlaut/rule-packs/our-pack/wortlaut-pack.json')).toBe(fetcher.text);
  });

  it('says when nothing has changed', async () => {
    // arrange
    await rules({ action: 'add', subject: 'github:owner/rules' }).execute();

    const logger = createLogger();

    // act
    await rules({ action: 'update' }, logger).execute();

    // assert
    expect(printed(logger)).toMatch(/up to date/);
  });

  it('turns a pack off and on, and sets a severity, in the configuration', async () => {
    // arrange
    await rules({ action: 'add', subject: './rules/our-pack' }).execute();

    // act & assert
    await rules({ action: 'disable', subject: 'our-pack' }).execute();
    expect((await analyze()).findings.map((finding) => finding.rule)).not.toContain('no-todo');

    await rules({ action: 'enable', subject: 'our-pack' }).execute();
    expect((await analyze()).findings.map((finding) => finding.rule)).toContain('no-todo');

    await rules({ action: 'severity', subject: 'no-todo', value: 'warning' }).execute();
    expect((await analyze()).findings.find((finding) => finding.rule === 'no-todo')?.severity).toBe(
      'warning',
    );
    expect(read('wortlaut.config.json')).toContain('"no-todo": "warning"');
  });

  it('asks for what its actions need, and refuses what it does not know', async () => {
    // act & assert
    await expect(rules({ action: 'add' }).execute()).rejects.toThrow(/Name the source/);
    await expect(rules({ action: 'enable' }).execute()).rejects.toThrow(/Name the pack/);
    await expect(
      rules({ action: 'severity', subject: 'no-todo', value: 'loud' }).execute(),
    ).rejects.toThrow(/error\|warning\|off/);
    await expect(rules({ action: 'explode' }).execute()).rejects.toThrow(/Unknown action/);
  });

  describe('the exit code of analyze', () => {
    it('stays 0 without severities and a lock file, whatever the rules find', async () => {
      // arrange
      write('i18n/lang.de.json', JSON.stringify({ loc: { a: '' } }));

      // act
      const { exitCode, findings } = await analyze();

      // assert
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.every((finding) => finding.severity === 'error')).toBe(true);
      expect(exitCode).toBe(0);
    });

    it('follows the severity once a repository uses packs', async () => {
      // arrange
      await rules({ action: 'add', subject: './rules/our-pack' }).execute();

      // act & assert
      expect((await analyze()).exitCode).toBe(1);

      await rules({ action: 'severity', subject: 'no-todo', value: 'warning' }).execute();
      await rules({ action: 'severity', subject: 'key-consistency', value: 'warning' }).execute();

      expect((await analyze()).exitCode).toBe(0);
    });

    it('fails for a pack that was refused, however harmless its rules are', async () => {
      // arrange
      write(
        'rules/our-pack/wortlaut-pack.json',
        `${JSON.stringify({ ...PACK, rules: [PACK.rules[1]] }, null, 2)}\n`,
      );
      await rules({ action: 'add', subject: './rules/our-pack' }).execute();

      expect((await analyze()).exitCode).toBe(0);

      write(
        'rules/our-pack/wortlaut-pack.json',
        `${JSON.stringify({ ...PACK, rules: [PACK.rules[1]] })}\n`,
      );

      // act
      const { exitCode, findings } = await analyze();

      // assert
      expect(exitCode).toBe(1);
      expect(findings.map((finding) => finding.rule)).toContain('rule-pack-verification');
    });
  });
});

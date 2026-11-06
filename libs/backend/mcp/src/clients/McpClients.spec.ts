// #region Imports

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeMcpClients, shellLine } from './McpClients';

// #endregion

const NOTHING = {
  'claude-code': { isInstalled: false, hasConnected: false },
  codex: { isInstalled: false, hasConnected: false },
};
const LOCAL = { command: ['node', '/some where/wortlaut.js', 'mcp'], isPublished: false };
const PUBLISHED = {
  command: ['npx', '-y', '@pixel-brewery/wortlaut-app', 'mcp'],
  isPublished: true,
};
const PLUGINS = join(__dirname, '../../plugins');

/**
 * Reads a JSON file of the repository.
 */
function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('describeMcpClients', () => {
  it('writes steps that start the server of this computer, quoted for a shell', () => {
    // act
    const [claude, codex, other] = describeMcpClients(LOCAL, NOTHING);

    // assert
    expect(claude.steps[0]).toEqual({
      title: 'Add the MCP server',
      code: "claude mcp add wortlaut -- node '/some where/wortlaut.js' mcp",
    });
    expect(codex.steps[0].code).toBe(
      "codex mcp add wortlaut -- node '/some where/wortlaut.js' mcp",
    );
    expect(codex.steps[1].code).toBe(
      '[mcp_servers.wortlaut]\ncommand = "node"\nargs = ["/some where/wortlaut.js", "mcp"]',
    );
    expect(JSON.parse(other.steps[0].code)).toEqual({
      mcpServers: { wortlaut: { command: 'node', args: ['/some where/wortlaut.js', 'mcp'] } },
    });
  });

  it('says that a plugin needs the published package, because it travels without the paths of this computer', () => {
    // act
    const [local] = describeMcpClients(LOCAL, NOTHING);
    const [published] = describeMcpClients(PUBLISHED, NOTHING);

    // assert
    expect(local.steps[1].title).toBe('Or install the plugin, once the package is published');
    expect(published.steps[0].title).toBe('Install the plugin');
    expect(published.steps[1].code).toBe(
      'claude mcp add wortlaut -- npx -y @pixel-brewery/wortlaut-app mcp',
    );
  });

  it('only claims a connection a run proves, and otherwise says whether the tool is there', () => {
    // act
    const [claude, codex] = describeMcpClients(LOCAL, {
      'claude-code': { isInstalled: true, hasConnected: true },
      codex: { isInstalled: true, hasConnected: false },
    });
    const [missing] = describeMcpClients(LOCAL, NOTHING);

    // assert
    expect(claude).toMatchObject({ state: 'Connected', variant: 'success' });
    expect(codex).toMatchObject({ state: 'Installed', variant: 'neutral' });
    expect(missing).toMatchObject({ state: 'Not installed', variant: 'neutral' });
  });

  it('names what the marketplaces and the plugins of this repository declare', () => {
    // arrange
    const [claude, codex] = describeMcpClients(PUBLISHED, NOTHING);
    const claudeMarket = readJson(
      join(__dirname, '../../../../../.claude-plugin/marketplace.json'),
    ) as { name: string; plugins: Array<{ name: string; source: string }> };
    const codexMarket = readJson(
      join(__dirname, '../../../../../.agents/plugins/marketplace.json'),
    ) as { name: string; plugins: Array<{ name: string; source: { path: string } }> };

    // assert
    expect(claude.steps[0].code).toContain(`${claudeMarket.plugins[0].name}@${claudeMarket.name}`);
    expect(codex.steps[0].code).toContain(`${codexMarket.plugins[0].name}@${codexMarket.name}`);
    expect(
      readJson(
        join(
          __dirname,
          '../../../../..',
          claudeMarket.plugins[0].source,
          '.claude-plugin/plugin.json',
        ),
      ).name,
    ).toBe('wortlaut');
    expect(
      readJson(join(__dirname, '../../../../..', codexMarket.plugins[0].source.path, 'plugin.json'))
        .name,
    ).toBe('wortlaut');
  });
});

describe('the plugins', () => {
  const SERVER = { command: PUBLISHED.command[0], args: PUBLISHED.command.slice(1) };

  it('carry the server and a skill, and nothing else that could hold logic', () => {
    // arrange
    const claudeServers = readJson(join(PLUGINS, 'claude/.mcp.json')) as {
      mcpServers: Record<string, unknown>;
    };
    const codexServers = readJson(join(PLUGINS, 'codex/mcp.json')) as {
      mcpServers: Record<string, unknown>;
    };
    const claudeManifest = readJson(join(PLUGINS, 'claude/.claude-plugin/plugin.json'));
    const codexManifest = readJson(join(PLUGINS, 'codex/plugin.json'));

    // assert
    expect(claudeServers.mcpServers).toEqual({ wortlaut: SERVER });
    expect(codexServers.mcpServers).toEqual({ wortlaut: { type: 'stdio', ...SERVER } });

    for (const manifest of [claudeManifest, codexManifest]) {
      expect(manifest).not.toHaveProperty('hooks');
      expect(manifest).not.toHaveProperty('commands');
      expect(manifest).not.toHaveProperty('agents');
    }
  });

  it('have the same skill, whose tools are the tools of the server', () => {
    // arrange
    const claude = readFileSync(join(PLUGINS, 'claude/skills/wortlaut/SKILL.md'), 'utf8');
    const codex = readFileSync(join(PLUGINS, 'codex/skills/wortlaut/SKILL.md'), 'utf8');

    // assert
    expect(claude).toBe(codex);
    expect(claude).toMatch(/^---\nname: wortlaut\ndescription: /);

    for (const tool of [
      'list_projects',
      'next_translations',
      'propose_translations',
      'apply_changes',
    ]) {
      expect(claude).toContain(tool);
    }
  });
});

describe('shellLine', () => {
  it('quotes only what a shell would read differently', () => {
    // act
    const line = shellLine(['node', "it's here/cli.js", 'mcp']);

    // assert
    expect(line).toBe("node 'it'\\''s here/cli.js' mcp");
  });
});

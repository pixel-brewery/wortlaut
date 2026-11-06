// #region Imports

import type { McpClient, McpStep } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * How the server starts on this computer.
 *
 * @public
 */
export interface IMcpConnection {
  /**
   * The words of the command.
   */
  command: ReadonlyArray<string>;

  /**
   * Whether it is the published package. A plugin can only start that one, because it travels without this computer's paths.
   */
  isPublished: boolean;
}

/**
 * What is known about an assistant, found without reading its setup or its account.
 *
 * @public
 */
export interface IMcpClientFacts {
  /**
   * Its command line was found on this computer.
   */
  isInstalled: boolean;

  /**
   * A run of it through MCP is on record, the only real proof of a connection.
   */
  hasConnected: boolean;
}

/**
 * Text that a shell reads as it is.
 */
const PLAIN_SHELL_WORD = /^[A-Za-z0-9_\-./:@%+=,~]+$/;

/**
 * Where the plugins of this repository are found.
 */
const PLUGIN_REPOSITORY = 'pixel-brewery/wortlaut';

/**
 * Writes the words of a command as a line a shell reads as those words.
 *
 * @public
 * @param words The words.
 * @returns The line.
 */
export function shellLine(words: ReadonlyArray<string>): string {
  return words
    .map((word) => (PLAIN_SHELL_WORD.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`))
    .join(' ');
}

/**
 * @private
 */
function stateOf(facts: IMcpClientFacts): Pick<McpClient, 'state' | 'variant'> {
  if (facts.hasConnected) {
    return { state: 'Connected', variant: 'success' };
  }

  return { state: facts.isInstalled ? 'Installed' : 'Not installed', variant: 'neutral' };
}

/**
 * Writes what it takes to connect each assistant to the server of this computer. A plugin starts the published package, so
 * until that exists its step says so and comes second.
 *
 * @public
 * @param connection How the server starts.
 * @param facts What is known about Claude Code and Codex.
 * @returns The clients with their steps.
 */
export function describeMcpClients(
  connection: IMcpConnection,
  facts: Readonly<Record<'claude-code' | 'codex', IMcpClientFacts>>,
): Array<McpClient> {
  const line = shellLine(connection.command);
  const [command, ...args] = connection.command;
  const pluginTitle = connection.isPublished
    ? 'Install the plugin'
    : 'Or install the plugin, once the package is published';
  const claudePlugin: McpStep = {
    title: pluginTitle,
    code: `claude plugin marketplace add ${PLUGIN_REPOSITORY}\nclaude plugin install wortlaut@pixel-brewery`,
  };
  const claudeServer: McpStep = {
    title: connection.isPublished ? 'Or add only the MCP server' : 'Add the MCP server',
    code: `claude mcp add wortlaut -- ${line}`,
  };
  const codexPlugin: McpStep = {
    title: pluginTitle,
    code: `codex plugin marketplace add ${PLUGIN_REPOSITORY}\ncodex plugin add wortlaut@pixel-brewery`,
  };
  const codexServer: McpStep = {
    title: connection.isPublished ? 'Or add only the MCP server' : 'Add the MCP server',
    code: `codex mcp add wortlaut -- ${line}`,
  };
  const codexFile: McpStep = {
    title: 'Or add it to ~/.codex/config.toml',
    code: `[mcp_servers.wortlaut]\ncommand = ${JSON.stringify(command)}\nargs = [${args.map((arg) => JSON.stringify(arg)).join(', ')}]`,
  };

  return [
    {
      id: 'claude-code',
      label: 'Claude Code',
      ...stateOf(facts['claude-code']),
      about: 'The plugin adds the MCP server and a skill that explains the workflow.',
      steps: connection.isPublished ? [claudePlugin, claudeServer] : [claudeServer, claudePlugin],
    },
    {
      id: 'codex',
      label: 'Codex',
      ...stateOf(facts.codex),
      about: 'The same server and skill, packaged for Codex.',
      steps: connection.isPublished
        ? [codexPlugin, codexServer, codexFile]
        : [codexServer, codexFile, codexPlugin],
    },
    {
      id: 'other',
      label: 'Other MCP clients',
      state: 'Standard MCP',
      variant: 'neutral',
      about: 'Works with every client that starts a local MCP server.',
      steps: [
        {
          title: 'Add it to .mcp.json',
          code: JSON.stringify({ mcpServers: { wortlaut: { command, args } } }, null, 2),
        },
      ],
    },
  ];
}

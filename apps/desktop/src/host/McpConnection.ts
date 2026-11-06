// #region Imports

import { existsSync } from 'node:fs';
import type { IMcpConnection } from '@pixel-brewery/wortlaut-mcp';

// #endregion

/**
 * How the published package starts.
 */
const PUBLISHED_COMMAND = ['npx', '-y', '@pixel-brewery/wortlaut-app', 'mcp'];

/**
 * How the MCP server starts on this computer, and whether it can. No process runs for this: the server starts when an
 * assistant connects.
 *
 * @public
 */
export interface IMcpCommand extends IMcpConnection {
  ready: boolean;

  /**
   * Why it cannot start.
   */
  problem: string | null;
}

/**
 * Finds how the MCP server starts: the command line next to this app when there is one, because that is what really runs here,
 * and otherwise the published package, which this computer may not be able to fetch.
 *
 * @public
 * @param cliPath Where the command line would be, next to this app.
 * @param nodePath Where Node.js was found on this computer.
 * @returns The command.
 */
export function findMcpCommand(cliPath: string, nodePath: string | null): IMcpCommand {
  if (!existsSync(cliPath)) {
    return {
      command: PUBLISHED_COMMAND,
      isPublished: true,
      ready: false,
      problem:
        'The command line of Wortlaut is not next to this app, and the published package needs a registry this computer can reach.',
    };
  }

  return {
    command: ['node', cliPath, 'mcp'],
    isPublished: false,
    ready: nodePath !== null,
    problem: nodePath ? null : 'Node.js was not found on this computer, and the server needs it.',
  };
}

// #region Imports

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { McpLevelSchema, type McpLevel } from '@pixel-brewery/wortlaut-contracts';
import { writePrivateFileAtomically } from '@pixel-brewery/wortlaut-engine';
import { z } from 'zod';

// #endregion

/**
 * The file in the user's profile that holds what assistants may do.
 *
 * @public
 */
export const MCP_LEVEL_FILE_NAME = 'mcp.json';

/**
 * The content of that file.
 */
const LevelFileSchema = z.strictObject({ level: McpLevelSchema });

/**
 * What assistants may do, in the user's profile: only the user sets it, in the app, and no argument of the server or of a tool
 * reaches it. It is read again for every call, so a change in the app holds at once, and anything that cannot be read counts
 * as no level.
 *
 * @public
 */
export class McpLevelStore {

    // #region Fields

    private readonly _path: string;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `McpLevelStore` class.
     *
     * @public
     * @param profile The directory of the user's profile.
     */
    public constructor(profile: string) {
        this._path = join(profile, MCP_LEVEL_FILE_NAME);
    }

    // #endregion

    // #region Methods

    /**
     * Returns the level the user chose.
     *
     * @public
     * @returns The level, or `null` when none was chosen.
     */
    public read(): McpLevel | null {
        try {
            return LevelFileSchema.parse(JSON.parse(readFileSync(this._path, 'utf8'))).level;
        } catch {
            return null;
        }
    }

    /**
     * Stores the level.
     *
     * @public
     * @param level The level.
     */
    public write(level: McpLevel): void {
        writePrivateFileAtomically(this._path, `${JSON.stringify({ level })}\n`);
    }

    // #endregion

}

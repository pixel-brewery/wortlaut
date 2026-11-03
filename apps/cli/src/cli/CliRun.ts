// #region Imports

import { ConsoleLogger } from '@pixel-brewery/utilities';
import { EngineError } from '@pixel-brewery/wortlaut-engine';
import { stripVTControlCharacters } from 'node:util';
import { Cli } from './Cli';
import { CommandLine } from './CommandLine';
import { asksForMcpServer, startMcpServer } from './commands/McpCommand';

// #endregion

const logger = new ConsoleLogger();

process.argv = Cli.normalizeArguments(process.argv);

/**
 * The static run method to kick ass the cli.
 *
 * @internal
 */
(async() => {
    if (asksForMcpServer(process.argv)) {
        await startMcpServer(process.argv);

        return;
    }

    const catchAction = (error: Error): void => {
        // Arguments fail before a command exists, and a script that asked for JSON gets its document all the same.
        if (CommandLine.asksForJson(process.argv)) {
            process.stdout.write(`${JSON.stringify({
                ok: false,
                command: process.argv[2] ?? '',
                error: { code: 'invalid-arguments', message: stripVTControlCharacters(error.message), files: [], changeSetId: null, runId: null }
            })}\n`);
        }

        logger.error(String(error));
        process.exitCode = 1;
    };

    let cli: Cli | null = null;
    try {
        cli = new Cli();
    } catch (error) {
        catchAction(error as Error);
        return;
    }

    try {
        await cli.init();
    } catch (error) {
        catchAction(error);
        return;
    }

    await cli.run();
})().catch((error: unknown) => {
    // A failure the engine knows says what the user has to know; everything else needs its stack.
    logger.error(error instanceof EngineError ? error.message : error);
    process.exit(1);
});

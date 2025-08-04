import {Command} from "commander";

import {getLogger} from "../utils/logger.js";

// Version from package.json - hardcoded for now to avoid module resolution issues
// TODO: Consider using a build-time script to inject this automatically
const version = "0.1.0";

/**
 * Create and configure the CLI program
 */
export function createProgram(): Command {
    const program = new Command();

    program
        .name("wtt")
        .description("Git worktree management tool optimized for AI development workflows")
        .version(version)
        .option("-v, --verbose", "enable verbose output")
        .option("-q, --quiet", "suppress output except errors")
        .hook("preAction", (thisCommand) => {
            // Initialize logger with global options before any command runs
            const options = thisCommand.opts();
            getLogger(options);
        });

    return program;
}

/**
 * Main program instance
 */
export const program = createProgram();

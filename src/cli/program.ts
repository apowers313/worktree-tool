import {Command} from "commander";
import {readFileSync} from "fs";
import {join} from "path";

import {GlobalOptions} from "../core/types";
import {getLogger} from "../utils/logger";

// Read package.json to get version
const packageJsonPath = join(__dirname, "../../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

/**
 * Create and configure the CLI program
 */
export function createProgram(): Command {
    const program = new Command();

    program
        .name("wtt")
        .description("Git worktree management tool optimized for AI development workflows")
        .version(packageJson.version)
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

import {execFile} from "child_process";
import {promisify} from "util";

import {getErrorMessage} from "../utils/error-handler.js";
import {PlatformError} from "../utils/errors.js";

const execFileAsync = promisify(execFile);

/**
 * Execute a tmux command and return the output
 * @param args The tmux command arguments
 * @param errorMessage The error message to use if the command fails
 * @returns The stdout output from the command
 */
export async function executeTmuxCommand(args: string[], errorMessage: string): Promise<string> {
    try {
        const result = await execFileAsync("tmux", args);
        return result.stdout;
    } catch(error) {
        throw new PlatformError(`${errorMessage}: ${getErrorMessage(error)}`);
    }
}

/**
 * Execute a tmux command silently (no error thrown)
 * @param args The tmux command arguments
 * @returns True if successful, false otherwise
 */
export async function executeTmuxCommandSilent(args: string[]): Promise<boolean> {
    try {
        await execFileAsync("tmux", args);
        return true;
    } catch {
        return false;
    }
}

/**
 * Execute a tmux command without capturing output
 * @param args The tmux command arguments
 * @param errorMessage The error message to use if the command fails
 */
export async function executeTmuxCommandVoid(args: string[], errorMessage: string): Promise<void> {
    try {
        await execFileAsync("tmux", args);
    } catch(error) {
        throw new PlatformError(`${errorMessage}: ${getErrorMessage(error)}`);
    }
}

/**
 * Check if a tmux object exists (session, window, pane)
 * @param checkArgs The tmux arguments to check existence
 * @returns True if exists, false otherwise
 */
export async function tmuxObjectExists(checkArgs: string[]): Promise<boolean> {
    return executeTmuxCommandSilent(checkArgs);
}

import {execFile} from "child_process";
import {promisify} from "util";

import {ENV_VARS} from "../core/constants.js";
import {getErrorMessage} from "../utils/error-handler.js";
import {PlatformError} from "../utils/errors.js";

const execFileAsync = promisify(execFile);

/**
 * Sanitize name for tmux compatibility
 * Replace spaces with hyphens and remove special characters
 */
export function sanitizeTmuxName(name: string): string {
    return name
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .replace(/[^a-zA-Z0-9\-_]/g, "") // Remove special characters except hyphens and underscores
        .toLowerCase(); // Convert to lowercase for consistency
}

/**
 * Sanitize a window name for tmux - allows spaces and colons
 */
export function sanitizeTmuxWindowName(name: string): string {
    return name
        .replace(/['"]/g, "") // Remove quotes that could break shell commands
        .trim(); // Remove leading/trailing whitespace
}

/**
 * Check if we're currently inside a tmux session
 */
export function isInsideTmux(): boolean {
    return process.env.TMUX !== undefined;
}

/**
 * Check if we're in a proper terminal that can attach to tmux
 */
export function canAttachToTmux(): boolean {
    // Check if stdout is a TTY (terminal)
    return !!process.stdout.isTTY;
}

/**
 * Check if tmux is available on the system
 */
export async function isTmuxAvailable(): Promise<boolean> {
    // Check for test environment variable to disable tmux
    if (process.env[ENV_VARS.DISABLE_TMUX] === "true") {
        return false;
    }

    try {
        await execFileAsync("tmux", ["-V"]);
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if a tmux session exists
 */
export async function tmuxSessionExists(sessionName: string): Promise<boolean> {
    try {
        await execFileAsync("tmux", ["has-session", "-t", sessionName]);
        return true;
    } catch {
        return false;
    }
}

/**
 * Create a tmux session
 */
export async function createTmuxSession(sessionName: string, startDirectory?: string): Promise<void> {
    try {
        const sanitizedName = sanitizeTmuxName(sessionName);
        const args = ["new-session", "-d", "-s", sanitizedName];

        // If a start directory is provided, use it
        if (startDirectory) {
            args.push("-c", startDirectory);
        }

        await execFileAsync("tmux", args);
    } catch(error) {
        throw new PlatformError(`Failed to create tmux session: ${getErrorMessage(error)}`);
    }
}

/**
 * Get the number of windows in a tmux session
 */
export async function getTmuxWindowCount(sessionName: string): Promise<number> {
    try {
        const sanitizedSession = sanitizeTmuxName(sessionName);
        const result = await execFileAsync("tmux", [
            "list-windows",
            "-t",
            sanitizedSession,
            "-F",
            "#{window_id}",
        ]);
        return result.stdout.trim().split("\n").filter((line) => line).length;
    } catch {
        return 0;
    }
}

/**
 * Rename a tmux window
 */
export async function renameTmuxWindow(
    sessionName: string,
    windowIndex: number,
    newName: string,
): Promise<void> {
    try {
        const sanitizedSession = sanitizeTmuxName(sessionName);
        const sanitizedName = sanitizeTmuxName(newName);

        await execFileAsync("tmux", [
            "rename-window",
            "-t",
            `${sanitizedSession}:${String(windowIndex)}`,
            sanitizedName,
        ]);
    } catch(error) {
        throw new PlatformError(`Failed to rename tmux window: ${getErrorMessage(error)}`);
    }
}

/**
 * Send keys to change directory in a tmux window
 */
export async function tmuxSendKeys(
    sessionName: string,
    windowIndex: number,
    command: string,
): Promise<void> {
    try {
        const sanitizedSession = sanitizeTmuxName(sessionName);

        await execFileAsync("tmux", [
            "send-keys",
            "-t",
            `${sanitizedSession}:${String(windowIndex)}`,
            command,
            "Enter",
        ]);
    } catch(error) {
        throw new PlatformError(`Failed to send keys to tmux: ${getErrorMessage(error)}`);
    }
}

/**
 * Create a tmux window in an existing session
 */
export async function createTmuxWindow(
    sessionName: string,
    windowName: string,
    directory: string,
): Promise<void> {
    try {
        const sanitizedSession = sanitizeTmuxName(sessionName);
        const sanitizedWindow = sanitizeTmuxWindowName(windowName);

        await execFileAsync("tmux", [
            "new-window",
            "-t",
            sanitizedSession,
            "-n",
            sanitizedWindow,
            "-c",
            directory,
        ]);
    } catch(error) {
        throw new PlatformError(`Failed to create tmux window: ${getErrorMessage(error)}`);
    }
}

/**
 * Create a tmux window with a command that runs immediately
 */
export async function createTmuxWindowWithCommand(
    sessionName: string,
    windowName: string,
    directory: string,
    command: string,
): Promise<void> {
    try {
        const sanitizedSession = sanitizeTmuxName(sessionName);
        const sanitizedWindow = sanitizeTmuxWindowName(windowName);

        // Create window and run command directly
        await execFileAsync("tmux", [
            "new-window",
            "-t",
            sanitizedSession,
            "-n",
            sanitizedWindow,
            "-c",
            directory,
            command,
        ]);
    } catch(error) {
        throw new PlatformError(`Failed to create tmux window with command: ${getErrorMessage(error)}`);
    }
}

/**
 * Create a tmux session with an initial window running a command
 */
export async function createTmuxSessionWithWindow(
    sessionName: string,
    windowName: string,
    windowDirectory: string,
    command: string,
): Promise<void> {
    try {
        const sanitizedSession = sanitizeTmuxName(sessionName);
        const sanitizedWindow = sanitizeTmuxWindowName(windowName);

        const args = [
            "new-session",
            "-d",
            "-s",
            sanitizedSession,
            "-n",
            sanitizedWindow,
            "-c",
            windowDirectory,
            command,
        ];

        await execFileAsync("tmux", args);
    } catch(error) {
        throw new PlatformError(`Failed to create tmux session with window: ${getErrorMessage(error)}`);
    }
}

/**
 * Switch to a tmux window
 */
export async function switchToTmuxWindow(sessionName: string, windowName: string): Promise<void> {
    try {
        const sanitizedSession = sanitizeTmuxName(sessionName);
        const sanitizedWindow = sanitizeTmuxWindowName(windowName);

        // First try to attach to the session if not already attached
        try {
            await execFileAsync("tmux", ["select-window", "-t", `${sanitizedSession}:${sanitizedWindow}`]);
        } catch {
            // If that fails, try attaching to the session first
            await execFileAsync("tmux", ["attach-session", "-t", sanitizedSession]);
        }
    } catch(error) {
        throw new PlatformError(`Failed to switch to tmux window: ${getErrorMessage(error)}`);
    }
}

/**
 * Attach to a tmux session, optionally switching to a specific window
 */
export async function attachToTmuxSession(sessionName: string, windowName?: string): Promise<void> {
    try {
        const sanitizedSession = sanitizeTmuxName(sessionName);

        if (!canAttachToTmux()) {
            throw new PlatformError("Cannot attach to tmux session: not running in a terminal");
        }

        const args = ["attach-session", "-t"];

        if (windowName) {
            const sanitizedWindow = sanitizeTmuxWindowName(windowName);
            args.push(`${sanitizedSession}:${sanitizedWindow}`);
        } else {
            args.push(sanitizedSession);
        }

        // Use spawn instead of execFile for interactive attachment
        const {spawn} = await import("child_process");
        const tmux = spawn("tmux", args, {
            stdio: "inherit",
            shell: false,
        });

        await new Promise<void>((resolve, reject) => {
            tmux.on("exit", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new PlatformError(`tmux exited with code ${String(code)}`));
                }
            });

            tmux.on("error", (error) => {
                reject(new PlatformError(`Failed to attach to tmux session: ${error.message}`));
            });
        });
    } catch(error) {
        if (error instanceof PlatformError) {
            throw error;
        }

        throw new PlatformError(`Failed to attach to tmux session: ${getErrorMessage(error)}`);
    }
}

/**
 * List all tmux sessions
 */
export async function listTmuxSessions(): Promise<string[]> {
    try {
        const result = await execFileAsync("tmux", ["list-sessions", "-F", "#{session_name}"]);
        return result.stdout.trim().split("\n").filter((name) => name.length > 0);
    } catch {
    // No sessions exist or tmux not available
        return [];
    }
}

/**
 * Kill a tmux session
 */
export async function killTmuxSession(sessionName: string): Promise<void> {
    try {
        const sanitizedName = sanitizeTmuxName(sessionName);
        await execFileAsync("tmux", ["kill-session", "-t", sanitizedName]);
    } catch(error) {
        throw new PlatformError(`Failed to kill tmux session: ${getErrorMessage(error)}`);
    }
}

/**
 * TmuxManager class for managing tmux operations
 */
export class TmuxManager {
    /**
     * Create a new tmux window
     */
    async createWindow(name: string, directory: string): Promise<void> {
        // For exec command, we'll create a new window without a specific session
        // This will create it in the current session if inside tmux, or a new session if not
        try {
            await execFileAsync("tmux", [
                "new-window",
                "-n",
                name,
                "-c",
                directory,
            ]);
        } catch(error) {
            throw new PlatformError(`Failed to create tmux window: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Send keys to a tmux window
     */
    async sendKeys(windowName: string, command: string, enter = false): Promise<void> {
        try {
            const args = ["send-keys", "-t", windowName, command];
            if (enter) {
                args.push("Enter");
            }

            await execFileAsync("tmux", args);
        } catch(error) {
            throw new PlatformError(`Failed to send keys to tmux: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Execute a command (placeholder for compatibility)
     */
    async execute(args: string[]): Promise<void> {
        try {
            await execFileAsync("tmux", args);
        } catch(error) {
            throw new PlatformError(`Failed to execute tmux command: ${getErrorMessage(error)}`);
        }
    }
}

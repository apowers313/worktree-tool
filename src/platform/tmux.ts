import {execFile} from "child_process";
import {promisify} from "util";

import {ENV_VARS} from "../core/constants.js";
import {getErrorMessage} from "../utils/error-handler.js";
import {PlatformError} from "../utils/errors.js";
import {sanitizeTmuxSession, sanitizeTmuxWindow} from "../utils/sanitize.js";
import {
    executeTmuxCommand,
    executeTmuxCommandSilent,
    executeTmuxCommandVoid,
    tmuxObjectExists,
} from "./tmux-wrapper.js";

const execFileAsync = promisify(execFile);

/**
 * Sanitize name for tmux compatibility
 * Replace spaces with hyphens and remove special characters
 */
export const sanitizeTmuxName = sanitizeTmuxSession;

/**
 * Sanitize a window name for tmux - allows spaces and colons
 */
export const sanitizeTmuxWindowName = sanitizeTmuxWindow;

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
 * Get the current tmux session name if inside tmux
 */
export async function getCurrentTmuxSession(): Promise<string | null> {
    if (!isInsideTmux()) {
        return null;
    }

    try {
        const result = await execFileAsync("tmux", ["display-message", "-p", "#{session_name}"]);
        return result.stdout.trim();
    } catch {
        return null;
    }
}

/**
 * Check if tmux is available on the system
 */
export async function isTmuxAvailable(): Promise<boolean> {
    // Check for test environment variable to disable tmux
    if (process.env[ENV_VARS.DISABLE_TMUX] === "true") {
        return false;
    }

    return executeTmuxCommandSilent(["-V"]);
}

/**
 * Check if a tmux session exists
 */
export async function tmuxSessionExists(sessionName: string): Promise<boolean> {
    return tmuxObjectExists(["has-session", "-t", sessionName]);
}

/**
 * Create a tmux session
 */
export async function createTmuxSession(sessionName: string, startDirectory?: string): Promise<void> {
    const sanitizedName = sanitizeTmuxName(sessionName);
    const args = ["new-session", "-d", "-s", sanitizedName];

    // If a start directory is provided, use it
    if (startDirectory) {
        args.push("-c", startDirectory);
    }

    await executeTmuxCommandVoid(args, "Failed to create tmux session");
}

/**
 * Get the number of windows in a tmux session
 */
export async function getTmuxWindowCount(sessionName: string): Promise<number> {
    try {
        const sanitizedSession = sanitizeTmuxName(sessionName);
        const result = await executeTmuxCommand(
            [
                "list-windows",
                "-t",
                sanitizedSession,
                "-F",
                "#{window_id}",
            ],
            "Failed to list tmux windows",
        );
        return result.trim().split("\n").filter((line) => line).length;
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
    const sanitizedSession = sanitizeTmuxName(sessionName);
    const sanitizedName = sanitizeTmuxName(newName);

    await executeTmuxCommandVoid(
        [
            "rename-window",
            "-t",
            `${sanitizedSession}:${String(windowIndex)}`,
            sanitizedName,
        ],
        "Failed to rename tmux window",
    );
}

/**
 * Send keys to change directory in a tmux window
 */
export async function tmuxSendKeys(
    sessionName: string,
    windowIndex: number,
    command: string,
): Promise<void> {
    const sanitizedSession = sanitizeTmuxName(sessionName);

    await executeTmuxCommandVoid(
        [
            "send-keys",
            "-t",
            `${sanitizedSession}:${String(windowIndex)}`,
            command,
            "Enter",
        ],
        "Failed to send keys to tmux",
    );
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

        // Check if we're inside tmux and get current session
        const currentSession = await getCurrentTmuxSession();

        if (currentSession && currentSession === sanitizedSession) {
            // We're in the same session, just switch windows
            await execFileAsync("tmux", ["select-window", "-t", `${sanitizedSession}:${sanitizedWindow}`]);
        } else if (currentSession) {
            // We're in a different tmux session, use switch-client
            await execFileAsync("tmux", ["switch-client", "-t", `${sanitizedSession}:${sanitizedWindow}`]);
        } else {
            // Not inside tmux, try to attach
            await execFileAsync("tmux", ["attach-session", "-t", `${sanitizedSession}:${sanitizedWindow}`]);
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
        const result = await executeTmuxCommand(["list-sessions", "-F", "#{session_name}"], "Failed to list tmux sessions");
        return result.trim().split("\n").filter((name) => name.length > 0);
    } catch {
    // No sessions exist or tmux not available
        return [];
    }
}

/**
 * Kill a tmux session
 */
export async function killTmuxSession(sessionName: string): Promise<void> {
    const sanitizedName = sanitizeTmuxName(sessionName);
    await executeTmuxCommandVoid(["kill-session", "-t", sanitizedName], "Failed to kill tmux session");
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

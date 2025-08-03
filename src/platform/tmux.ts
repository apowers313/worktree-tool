import {execFile} from "child_process";
import {promisify} from "util";

import {PlatformError} from "../utils/errors";

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
    if (process.env.WTT_DISABLE_TMUX === "true") {
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
        throw new PlatformError(`Failed to create tmux session: ${error instanceof Error ? error.message : String(error)}`);
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
        throw new PlatformError(`Failed to rename tmux window: ${error instanceof Error ? error.message : String(error)}`);
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
        throw new PlatformError(`Failed to send keys to tmux: ${error instanceof Error ? error.message : String(error)}`);
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
        const sanitizedWindow = sanitizeTmuxName(windowName);

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
        throw new PlatformError(`Failed to create tmux window: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Switch to a tmux window
 */
export async function switchToTmuxWindow(sessionName: string, windowName: string): Promise<void> {
    try {
        const sanitizedSession = sanitizeTmuxName(sessionName);
        const sanitizedWindow = sanitizeTmuxName(windowName);

        // First try to attach to the session if not already attached
        try {
            await execFileAsync("tmux", ["select-window", "-t", `${sanitizedSession}:${sanitizedWindow}`]);
        } catch {
            // If that fails, try attaching to the session first
            await execFileAsync("tmux", ["attach-session", "-t", sanitizedSession]);
        }
    } catch(error) {
        throw new PlatformError(`Failed to switch to tmux window: ${error instanceof Error ? error.message : String(error)}`);
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
        throw new PlatformError(`Failed to kill tmux session: ${error instanceof Error ? error.message : String(error)}`);
    }
}

import {execFile} from "child_process";
import {promisify} from "util";

import {sanitizeTmuxName} from "./tmux.js";

const execFileAsync = promisify(execFile);

/**
 * Get list of tmux windows for a worktree
 */
export async function getTmuxWindowsForWorktree(
    sessionName: string,
    worktreeName: string,
): Promise<string[]> {
    try {
        const sanitizedSession = sanitizeTmuxName(sessionName);
        const sanitizedWorktree = sanitizeTmuxName(worktreeName);

        // List all windows in the session
        const {stdout} = await execFileAsync("tmux", [
            "list-windows",
            "-t",
            sanitizedSession,
            "-F",
            "#{window_name}:#{window_id}",
        ]);

        const windows = stdout.trim().split("\n")
            .filter((line) => {
                const [name] = line.split(":");
                return name === sanitizedWorktree;
            })
            .map((line) => line.split(":")[1] ?? "")
            .filter((id) => id.length > 0);

        return windows;
    } catch {
        // Session might not exist
        return [];
    }
}

/**
 * Find and close tmux windows associated with a worktree
 */
export async function closeTmuxWindowsForWorktree(
    projectName: string,
    worktreeName: string,
): Promise<void> {
    try {
        const windows = await getTmuxWindowsForWorktree(projectName, worktreeName);

        for (const windowId of windows) {
            try {
                // Kill the window
                await execFileAsync("tmux", [
                    "kill-window",
                    "-t",
                    windowId,
                ]);
            } catch {
                // Window might have already been closed
            }
        }
    } catch(error) {
        // Log but don't fail the removal
        console.warn(`Failed to close tmux windows: ${String(error)}`);
    }
}

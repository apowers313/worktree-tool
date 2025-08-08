import {exec} from "child_process";
import path from "path";
import {promisify} from "util";

const execAsync = promisify(exec);

/**
 * Get list of shell processes with working directory in the worktree
 */
export async function getShellProcessesInDirectory(
    directory: string,
): Promise<number[]> {
    try {
        // Use lsof to find processes with cwd in the directory
        const {stdout} = await execAsync(
            `lsof -a -d cwd -c bash -c zsh -c sh +D "${directory}" 2>/dev/null | tail -n +2 | awk '{print $2}' | sort -u`,
        );

        return stdout.trim()
            .split("\n")
            .filter((pid) => pid.length > 0)
            .map((pid) => parseInt(pid, 10))
            .filter((pid) => !isNaN(pid));
    } catch {
        // lsof might not be available or fail
        return [];
    }
}

/**
 * Find and terminate shell processes in a worktree directory
 */
export async function terminateShellProcessesInDirectory(
    directory: string,
): Promise<void> {
    try {
        const pids = await getShellProcessesInDirectory(directory);

        for (const pid of pids) {
            try {
                // Skip current process
                if (pid === process.pid) {
                    continue;
                }

                // Send SIGTERM for graceful shutdown
                process.kill(pid, "SIGTERM");

                // Give it a moment to terminate
                await new Promise((resolve) => setTimeout(resolve, 100));

                // Check if still running and force kill if needed
                try {
                    process.kill(pid, 0); // Check if process exists
                    process.kill(pid, "SIGKILL"); // Force kill
                } catch {
                    // Process already terminated
                }
            } catch {
                // Process might have already terminated
            }
        }
    } catch(error) {
        // Log but don't fail the removal
        console.warn(`Failed to terminate shell processes: ${String(error)}`);
    }
}

/**
 * Check if current process is in a worktree directory
 */
export function isCurrentProcessInWorktree(
    worktreePath: string,
): boolean {
    const normalizedWorktree = path.resolve(worktreePath);
    const normalizedCwd = path.resolve(process.cwd());

    return normalizedCwd.startsWith(normalizedWorktree);
}

/**
 * Change current directory to main worktree
 */
export function changeToMainWorktree(
    mainWorktreePath: string,
): void {
    try {
        process.chdir(mainWorktreePath);
    } catch(error) {
        console.warn(`Failed to change directory: ${String(error)}`);
    }
}

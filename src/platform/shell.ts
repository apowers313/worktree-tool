import {spawn} from "child_process";
import {promises as fs} from "fs";
import * as os from "os";
import * as path from "path";

import {ShellType} from "../core/types";
import {PlatformError} from "../utils/errors";

/**
 * Get the shell command for the given shell type
 */
export function getShellCommand(shellType: ShellType): string {
    switch (shellType) {
        case "bash":
            return "bash";
        case "zsh":
            return "zsh";
        case "powershell":
            return "powershell";
        case "cmd":
            return "cmd";
        default:
            throw new PlatformError(`Unsupported shell type: ${shellType}`);
    }
}

/**
 * Get the shell arguments for the given shell type
 */
export function getShellArgs(shellType: ShellType): string[] {
    switch (shellType) {
        case "bash":
        case "zsh":
            return ["-i"]; // Interactive mode
        case "powershell":
            return ["-NoExit"]; // Don't exit after running commands
        case "cmd":
            return ["/K"]; // Keep window open after running commands
        default:
            throw new PlatformError(`Unsupported shell type: ${shellType}`);
    }
}

/**
 * Set the shell prompt for the given shell type and worktree name
 * Simple format: [worktreeName] >
 */
export function setShellPrompt(shellType: ShellType, worktreeName: string): string[] {
    const promptPrefix = `[${worktreeName}] > `;

    switch (shellType) {
        case "bash":
            return [`export PS1="${promptPrefix}"`];
        case "zsh":
            return [`export PROMPT="${promptPrefix}"`];
        case "powershell":
            return [`function prompt { "${promptPrefix}" }`];
        case "cmd":
            return [`prompt ${promptPrefix}`];
        default:
            throw new PlatformError(`Unsupported shell type: ${shellType}`);
    }
}

/**
 * Spawn a shell in the specified directory with a custom prompt
 * Uses shell-specific approaches to ensure prompt is properly set
 */
export async function spawnShell(
    directory: string,
    shellType: ShellType,
    worktreeName: string,
): Promise<void> {
    return new Promise(async(resolve, reject) => {
        try {
            const command = getShellCommand(shellType);
            const promptPrefix = `[${worktreeName}] > `;

            let args: string[];
            const env = {... process.env};
            const tempFiles: string[] = [];

            switch (shellType) {
                case "bash":
                    // Create temporary bashrc file with custom prompt
                    const bashrc = `
# Load original bashrc if it exists
if [ -f ~/.bashrc ]; then
  . ~/.bashrc
fi

# Set custom prompt
export PS1="${promptPrefix}"
`;
                    const tmpBashrc = path.join(os.tmpdir(), `wtt-bashrc-${Date.now()}`);
                    await fs.writeFile(tmpBashrc, bashrc);
                    tempFiles.push(tmpBashrc);
                    args = ["--rcfile", tmpBashrc];
                    break;

                case "zsh":
                    // Set PROMPT environment variable for zsh
                    env.PROMPT = promptPrefix;
                    args = ["-i"]; // Interactive mode
                    break;

                case "powershell":
                    // Set prompt function and stay open
                    args = ["-NoExit", "-Command", `function prompt { "${promptPrefix}" }`];
                    break;

                case "cmd":
                    // Set prompt and stay open
                    args = ["/K", `prompt ${promptPrefix}`];
                    break;

                default:
                    throw new PlatformError(`Unsupported shell type: ${shellType}`);
            }

            const child = spawn(command, args, {
                stdio: "inherit",
                cwd: directory,
                env: env,
                detached: false,
            });

            child.on("error", (error) => {
                reject(new PlatformError(`Failed to spawn shell: ${error.message}`));
            });

            child.on("exit", async(code) => {
                // Clean up temporary files
                for (const tempFile of tempFiles) {
                    try {
                        await fs.unlink(tempFile);
                    } catch {
                        // Ignore cleanup errors
                    }
                }

                if (code === 0 || code === null) {
                    resolve();
                } else {
                    reject(new PlatformError(`Shell exited with code ${code}`));
                }
            });
        } catch(error) {
            reject(new PlatformError(`Failed to spawn shell: ${error instanceof Error ? error.message : String(error)}`));
        }
    });
}

/**
 * Check if a shell command is available on the system
 */
export async function isShellAvailable(shellType: ShellType): Promise<boolean> {
    return new Promise((resolve) => {
        try {
            const command = getShellCommand(shellType);
            const child = spawn(command, ["--version"], {
                stdio: "ignore",
            });

            child.on("error", () => {
                resolve(false);
            });

            child.on("exit", (code) => {
                resolve(code === 0);
            });
        } catch {
            resolve(false);
        }
    });
}

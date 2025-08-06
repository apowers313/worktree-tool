import {exec, spawn} from "child_process";
import {promises as fs} from "fs";
import * as os from "os";
import * as path from "path";
import {promisify} from "util";

import {ShellType} from "../core/types.js";
import {PlatformError} from "../utils/errors.js";

const execAsync = promisify(exec);

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
        default:
            throw new PlatformError(`Unsupported shell type: ${shellType as string}`);
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
        default:
            throw new PlatformError(`Unsupported shell type: ${shellType as string}`);
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
        default:
            throw new PlatformError(`Unsupported shell type: ${shellType as string}`);
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
    return new Promise((resolve, reject) => {
        void (async() => {
            try {
                const command = getShellCommand(shellType);
                const promptPrefix = `[${worktreeName}] > `;

                let args: string[];
                const env = {... process.env};
                const tempFiles: string[] = [];

                switch (shellType) {
                    case "bash": {
                    // Create temporary bashrc file with custom prompt
                        const bashrc = `
# Load original bashrc if it exists
if [ -f ~/.bashrc ]; then
  . ~/.bashrc
fi

# Set custom prompt
export PS1="${promptPrefix}"
`;
                        const tmpBashrc = path.join(os.tmpdir(), `wtt-bashrc-${Date.now().toString()}`);
                        await fs.writeFile(tmpBashrc, bashrc);
                        tempFiles.push(tmpBashrc);
                        args = ["--rcfile", tmpBashrc];
                        break;
                    }

                    case "zsh":
                    // Set PROMPT environment variable for zsh
                        env.PROMPT = promptPrefix;
                        args = ["-i"]; // Interactive mode
                        break;

                    case "powershell":
                    // Set prompt function and stay open
                        args = ["-NoExit", "-Command", `function prompt { "${promptPrefix}" }`];
                        break;

                    default:
                        throw new PlatformError(`Unsupported shell type: ${shellType as string}`);
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

                child.on("exit", (code) => {
                // Clean up temporary files
                    void (async() => {
                        for (const tempFile of tempFiles) {
                            try {
                                await fs.unlink(tempFile);
                            } catch {
                            // Ignore cleanup errors
                            }
                        }
                    })();

                    if (code === 0 || code === null) {
                        resolve();
                    } else {
                        reject(new PlatformError(`Shell exited with code ${String(code)}`));
                    }
                });
            } catch(error) {
                reject(new PlatformError(`Failed to spawn shell: ${error instanceof Error ? error.message : String(error)}`));
            }
        })();
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

/**
 * ShellManager class for managing shell operations
 */
export class ShellManager {
    constructor(private shellType: ShellType) {}

    /**
     * Execute a command in a new window
     */
    async executeInNewWindow(command: string, cwd: string, windowTitle: string): Promise<void> {
        let psCommand: string;
        switch (this.shellType) {
            case "bash":
            case "zsh":
                // On macOS, use Terminal.app
                if (process.platform === "darwin") {
                    const script = `
                        tell application "Terminal"
                            do script "cd ${this.escapeAppleScript(cwd)} && ${this.escapeAppleScript(command)}"
                            set custom title of front window to "${this.escapeAppleScript(windowTitle)}"
                        end tell
                    `;
                    await execAsync(`osascript -e '${script}'`);
                } else {
                    // On Linux, try common terminal emulators
                    const terminals = ["gnome-terminal", "konsole", "xterm", "xfce4-terminal", "terminator"];
                    for (const term of terminals) {
                        try {
                            if (term === "gnome-terminal") {
                                await execAsync(`${term} --title="${this.escapeShell(windowTitle)}" -- bash -c "cd ${this.escapeShell(cwd)} && ${this.escapeShell(command)}; exec bash"`);
                                return;
                            }

                            if (term === "konsole") {
                                await execAsync(`${term} --title "${this.escapeShell(windowTitle)}" -e bash -c "cd ${this.escapeShell(cwd)} && ${this.escapeShell(command)}; exec bash"`);
                                return;
                            }

                            if (term === "xfce4-terminal") {
                                await execAsync(`${term} --title="${this.escapeShell(windowTitle)}" -e "bash -c 'cd ${this.escapeShell(cwd)} && ${this.escapeShell(command)}; exec bash'"`);
                                return;
                            }

                            // xterm, terminator and others
                            await execAsync(`${term} -T "${this.escapeShell(windowTitle)}" -e bash -c "cd ${this.escapeShell(cwd)} && ${this.escapeShell(command)}; exec bash"`);
                            return;
                        } catch {
                            // Try next terminal
                        }
                    }

                    // If no terminal emulator found, provide helpful error
                    throw new PlatformError(
                        "No terminal emulator found. Consider enabling tmux (wtt init --enable-tmux) or install a terminal emulator (gnome-terminal, konsole, xterm, etc.)",
                    );
                }

                break;

            case "powershell":
                // On Windows, use Windows Terminal or PowerShell
                psCommand = `Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '${this.escapePowerShell(cwd)}'; ${this.escapePowerShell(command)}"`;
                await execAsync(`powershell -Command "${psCommand}"`);
                break;

            default:
                throw new PlatformError(`Unsupported shell type: ${this.shellType as string}`);
        }
    }

    /**
     * Escape string for shell execution
     */
    private escapeShell(str: string): string {
        return str.replace(/"/g, "\\\"").replace(/\$/g, "\\$").replace(/`/g, "\\`");
    }

    /**
     * Escape string for AppleScript
     */
    private escapeAppleScript(str: string): string {
        return str.replace(/"/g, "\\\"").replace(/\\/g, "\\\\\\\\");
    }

    /**
     * Escape string for PowerShell
     */
    private escapePowerShell(str: string): string {
        return str.replace(/'/g, "''");
    }
}

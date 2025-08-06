import {execFile} from "child_process";
import {promisify} from "util";

import {PlatformError} from "../utils/errors.js";

const execAsync = promisify(execFile);

/**
 * Interface for terminal opening strategies
 */
export interface TerminalStrategy {
    canHandle(): Promise<boolean>;
    openWindow(command: string, cwd: string, title: string): Promise<void>;
}

/**
 * GNOME Terminal strategy for Linux
 */
export class GnomeTerminalStrategy implements TerminalStrategy {
    async canHandle(): Promise<boolean> {
        if (process.platform !== "linux") {
            return false;
        }

        try {
            await execAsync("which", ["gnome-terminal"]);
            return true;
        } catch {
            return false;
        }
    }

    async openWindow(command: string, cwd: string, title: string): Promise<void> {
        await execAsync("gnome-terminal", [
            `--title=${title}`,
            "--",
            "bash",
            "-c",
            `cd ${cwd} && ${command}; exec bash`,
        ]);
    }
}

/**
 * Konsole strategy for KDE on Linux
 */
export class KonsoleStrategy implements TerminalStrategy {
    async canHandle(): Promise<boolean> {
        if (process.platform !== "linux") {
            return false;
        }

        try {
            await execAsync("which", ["konsole"]);
            return true;
        } catch {
            return false;
        }
    }

    async openWindow(command: string, cwd: string, title: string): Promise<void> {
        await execAsync("konsole", [
            "--new-tab",
            `--title=${title}`,
            "-e",
            "bash",
            "-c",
            `cd ${cwd} && ${command}; exec bash`,
        ]);
    }
}

/**
 * xterm strategy for Linux
 */
export class XtermStrategy implements TerminalStrategy {
    async canHandle(): Promise<boolean> {
        if (process.platform !== "linux") {
            return false;
        }

        try {
            await execAsync("which", ["xterm"]);
            return true;
        } catch {
            return false;
        }
    }

    async openWindow(command: string, cwd: string, title: string): Promise<void> {
        await execAsync("xterm", [
            "-title",
            title,
            "-e",
            "bash",
            "-c",
            `cd ${cwd} && ${command}; exec bash`,
        ]);
    }
}

/**
 * macOS Terminal.app strategy
 */
export class MacTerminalStrategy implements TerminalStrategy {
    canHandle(): Promise<boolean> {
        return Promise.resolve(process.platform === "darwin");
    }

    async openWindow(command: string, cwd: string, title: string): Promise<void> {
        const script = `
            tell application "Terminal"
                activate
                do script "cd ${cwd} && ${command}"
                set custom title of front window to "${title}"
            end tell
        `;
        await execAsync("osascript", ["-e", script]);
    }
}

/**
 * macOS iTerm2 strategy
 */
export class ITermStrategy implements TerminalStrategy {
    async canHandle(): Promise<boolean> {
        if (process.platform !== "darwin") {
            return false;
        }

        try {
            await execAsync("osascript", [
                "-e",
                "tell application \"System Events\" to exists application process \"iTerm2\"",
            ]);
            return true;
        } catch {
            return false;
        }
    }

    async openWindow(command: string, cwd: string, title: string): Promise<void> {
        const script = `
            tell application "iTerm2"
                activate
                tell current window
                    create tab with default profile
                    tell current session
                        write text "cd ${cwd} && ${command}"
                        set name to "${title}"
                    end tell
                end tell
            end tell
        `;
        await execAsync("osascript", ["-e", script]);
    }
}

/**
 * Windows Terminal strategy
 */
export class WindowsTerminalStrategy implements TerminalStrategy {
    canHandle(): Promise<boolean> {
        return Promise.resolve(process.platform === "win32");
    }

    async openWindow(command: string, cwd: string, title: string): Promise<void> {
        // Try Windows Terminal first
        try {
            await execAsync("wt", [
                "-w",
                "0",
                "new-tab",
                "--title",
                title,
                "-d",
                cwd,
                "cmd",
                "/k",
                command,
            ]);
        } catch {
            // Fall back to cmd.exe
            await execAsync("cmd", [
                "/c",
                "start",
                title,
                "/d",
                cwd,
                "cmd",
                "/k",
                command,
            ]);
        }
    }
}

/**
 * Terminal manager that uses strategy pattern
 */
export class TerminalManager {
    private strategies: TerminalStrategy[] = [
        // Order matters - prefer more feature-rich terminals
        new ITermStrategy(),
        new MacTerminalStrategy(),
        new GnomeTerminalStrategy(),
        new KonsoleStrategy(),
        new XtermStrategy(),
        new WindowsTerminalStrategy(),
    ];

    /**
     * Open a new terminal window with the given command
     */
    async openWindow(command: string, cwd: string, title: string): Promise<void> {
        for (const strategy of this.strategies) {
            if (await strategy.canHandle()) {
                try {
                    await strategy.openWindow(command, cwd, title);
                    return;
                } catch {
                    // Try next strategy
                    continue;
                }
            }
        }

        throw new PlatformError(
            "No terminal emulator found. Consider installing a supported terminal or enabling tmux.",
        );
    }

    /**
     * Add a custom strategy
     */
    addStrategy(strategy: TerminalStrategy): void {
        this.strategies.unshift(strategy);
    }
}

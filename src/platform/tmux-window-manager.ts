import {executeTmuxCommand, executeTmuxCommandVoid} from "./tmux-wrapper.js";

export interface TmuxWindow {
    index: number;
    name: string;
    active: boolean;
}

export class TmuxWindowManager {
    async getWindowList(sessionName: string): Promise<TmuxWindow[]> {
        try {
            const result = await executeTmuxCommand(
                ["list-windows", "-t", sessionName, "-F", "#{window_index}:#{window_name}:#{window_active}"],
                "Failed to list tmux windows",
            );

            if (!result.trim()) {
                return [];
            }

            return result.trim().split("\n").map((line) => {
                const [indexStr, name, activeStr] = line.split(":");
                const index = parseInt(indexStr ?? "0");
                return {
                    index: isNaN(index) ? 0 : index,
                    name: name ?? "",
                    active: activeStr === "1",
                };
            });
        } catch {
            return [];
        }
    }

    async sortWindowsAlphabetically(sessionName: string): Promise<void> {
        const windows = await this.getWindowList(sessionName);
        const sorted = [... windows].sort((a, b) => a.name.localeCompare(b.name));

        // Skip if already sorted
        if (windows.every((w, i) => w.name === sorted[i]?.name)) {
            return;
        }

        // Move windows to correct positions
        // We need to move windows in a way that avoids conflicts
        // First, move all windows to temporary high indices
        const tempStartIndex = 1000;
        for (let i = 0; i < windows.length; i++) {
            const window = windows[i];
            if (window) {
                await executeTmuxCommandVoid(
                    ["move-window", "-s", `${sessionName}:${String(window.index)}`, "-t", `${sessionName}:${String(tempStartIndex + i)}`],
                    `Failed to move window ${window.name} to temporary position`,
                );
            }
        }

        // Then move them to their final sorted positions
        for (let i = 0; i < sorted.length; i++) {
            const window = sorted[i];
            if (window) {
                const currentIndex = windows.indexOf(window);
                await executeTmuxCommandVoid(
                    ["move-window", "-s", `${sessionName}:${String(tempStartIndex + currentIndex)}`, "-t", `${sessionName}:${String(i)}`],
                    `Failed to move window ${window.name} to position ${String(i)}`,
                );
            }
        }
    }

    async isCommandRunning(sessionName: string, windowName: string): Promise<boolean> {
        const windows = await this.getWindowList(sessionName);
        return windows.some((w) => w.name === windowName);
    }
}

export const tmuxWindowManager = new TmuxWindowManager();

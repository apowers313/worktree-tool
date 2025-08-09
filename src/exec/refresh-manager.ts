import path from "path";

import {WorktreeConfig, WorktreeInfo} from "../core/types.js";
import {sanitizeTmuxName} from "../platform/tmux.js";
import {tmuxWindowManager} from "../platform/tmux-window-manager.js";
import {getErrorMessage} from "../utils/error-handler.js";
import {Logger} from "../utils/logger.js";
import {AutoRunManager} from "./autorun-manager.js";

export class RefreshManager {
    constructor(
        private config: WorktreeConfig,
        private logger: Logger,
    ) {}

    async refreshWorktrees(worktrees: WorktreeInfo[]): Promise<void> {
        const sessionName = sanitizeTmuxName(this.config.projectName);

        for (const worktree of worktrees) {
            await this.refreshWorktree(worktree, sessionName);
        }

        // Sort windows if enabled
        if (this.config.autoSort && this.config.tmux) {
            try {
                this.logger.verbose(`Sorting windows for session: ${sessionName}`);
                await tmuxWindowManager.sortWindowsAlphabetically(sessionName);
                this.logger.verbose("Window sorting completed");
            } catch(error) {
                this.logger.warn(`Failed to sort windows: ${getErrorMessage(error)}`);
            }
        } else {
            this.logger.verbose(`Window sorting skipped - autoSort: ${String(this.config.autoSort)}, tmux: ${String(this.config.tmux)}`);
        }
    }

    private async refreshWorktree(worktree: WorktreeInfo, sessionName: string): Promise<void> {
        const worktreeName = path.basename(worktree.path);

        if (!this.config.commands) {
            return;
        }

        for (const [cmdName, cmdConfig] of Object.entries(this.config.commands)) {
            if (typeof cmdConfig === "object" && cmdConfig.autoRun) {
                const windowName = `${worktreeName}::${cmdName}`;

                const isRunning = await tmuxWindowManager.isCommandRunning(sessionName, windowName);
                if (!isRunning) {
                    this.logger.info(`Starting missing autoRun command: ${cmdName} for ${worktreeName}`);
                    const autoRunManager = new AutoRunManager(this.config, this.logger);
                    await autoRunManager.runCommand(cmdName, cmdConfig, worktreeName, worktree.path);
                }
            }
        }
    }
}

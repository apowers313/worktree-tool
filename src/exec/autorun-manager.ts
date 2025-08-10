import path from "path";

import {CommandConfig, WorktreeConfig, WorktreeInfo} from "../core/types.js";
import {isCI} from "../platform/detector.js";
import {getErrorMessage} from "../utils/error-handler.js";
import {Logger} from "../utils/logger.js";
import {portManager} from "../utils/port-manager.js";
import {ExecutionContext} from "./modes/base.js";
import {createExecutionMode} from "./modes/factory.js";

export class AutoRunManager {
    constructor(
        private config: WorktreeConfig,
        private logger: Logger,
    ) {}

    async runAutoCommands(worktree: WorktreeInfo): Promise<void> {
        const worktreeName = path.basename(worktree.path);

        if (!this.config.commands) {
            return;
        }

        for (const [cmdName, cmdConfig] of Object.entries(this.config.commands)) {
            if (typeof cmdConfig === "object" && cmdConfig.autoRun) {
                await this.runCommand(cmdName, cmdConfig, worktreeName, worktree.path);
            }
        }
    }

    async runCommand(
        cmdName: string,
        cmdConfig: Exclude<CommandConfig, string>,
        worktreeName: string,
        worktreePath: string,
    ): Promise<void> {
        const context: ExecutionContext = {
            worktreeName,
            worktreePath,
            command: cmdConfig.command,
            args: [],
            env: {},
        };

        // Allocate ports if needed
        if (this.config.availablePorts && cmdConfig.numPorts && cmdConfig.numPorts > 0) {
            try {
                const portRange = portManager.parseRange(this.config.availablePorts);
                const ports = await portManager.findAvailablePorts(
                    portRange.start,
                    portRange.end,
                    cmdConfig.numPorts,
                );

                ports.forEach((port, index) => {
                    context.env[`WTT_PORT${String(index + 1)}`] = port.toString();
                });
            } catch(error) {
                this.logger.warn(`Port allocation failed for ${cmdName}: ${getErrorMessage(error)}`);
            }
        }

        const defaultMode = isCI() ? "exit" : "window";
        const mode = cmdConfig.mode ?? defaultMode;
        const executionMode = createExecutionMode(mode, this.config, this.logger);
        await executionMode.execute([context]);
    }
}

import {execSync} from "child_process";

import {WorktreeConfig} from "../../core/types.js";
import {
    createTmuxSessionWithWindow,
    createTmuxWindowWithCommand,
    isTmuxAvailable,
    sanitizeTmuxName,
    sanitizeTmuxWindowName,
    tmuxSessionExists,
} from "../../platform/tmux.js";
import {getErrorMessage} from "../../utils/error-handler.js";
import {getLogger} from "../../utils/logger.js";
import {ExecutionContext, ExecutionMode} from "./base.js";

export class ExitMode extends ExecutionMode {
    constructor(
        private config: WorktreeConfig,
        private logger: ReturnType<typeof getLogger>,
    ) {
        super();
    }

    async execute(contexts: ExecutionContext[]): Promise<void> {
        this.logger.info(`Executing command in ${String(contexts.length)} worktree(s) (exit mode)...`);

        const hasTmux = await isTmuxAvailable();
        const sessionName = sanitizeTmuxName(this.config.projectName);
        const sessionExists = this.config.tmux && hasTmux ? await tmuxSessionExists(sessionName) : false;

        let failureCount = 0;
        for (let i = 0; i < contexts.length; i++) {
            const context = contexts[i];
            if (!context) {
                continue;
            }

            const windowName = sanitizeTmuxWindowName(`${context.worktreeName}::tmp`);

            try {
                if (this.config.tmux && hasTmux) {
                    await this.executeTmux(
                        context,
                        windowName,
                        sessionName,
                        i === 0 && !sessionExists,
                    );
                } else {
                    this.executeSync(context);
                }

                this.logger.success(`Completed in ${context.worktreeName}: ${context.command}`);
            } catch(error) {
                this.logger.error(`Failed in ${context.worktreeName}: ${getErrorMessage(error)}`);
                failureCount++;
            }
        }

        if (failureCount > 0) {
            throw new Error(`${String(failureCount)} command(s) failed`);
        }
    }

    private async executeTmux(
        context: ExecutionContext,
        windowName: string,
        sessionName: string,
        isFirstWindow: boolean,
    ): Promise<void> {
        const fullCommand = this.buildFullCommand(context);

        if (isFirstWindow) {
            await createTmuxSessionWithWindow(
                sessionName,
                windowName,
                context.worktreePath,
                fullCommand,
            );
        } else {
            await createTmuxWindowWithCommand(
                sessionName,
                windowName,
                context.worktreePath,
                fullCommand,
            );
        }
    }

    private executeSync(context: ExecutionContext): void {
        const command = this.buildCommand(context);

        try {
            // For exit mode without tmux, we run synchronously in the current terminal
            execSync(command, {
                cwd: context.worktreePath,
                env: this.getEnvironment(context),
                stdio: "inherit",
            });
        } catch {
            // execSync throws on non-zero exit codes
            throw new Error("Command failed with exit code");
        }
    }

    private buildCommand(context: ExecutionContext): string {
        const args = context.args.map((arg) => {
            // Quote args that contain spaces
            if (arg.includes(" ")) {
                return `"${arg}"`;
            }

            return arg;
        });
        return [context.command, ... args].join(" ");
    }

    private buildFullCommand(context: ExecutionContext): string {
        // Build environment variable exports
        const env = this.getEnvironment(context);
        const envCommands = Object.entries(env)
            .filter(([key]) => key.startsWith("WTT_"))
            .map(([key, value]) => `export ${key}="${value}"`)
            .join("; ");

        const command = this.buildCommand(context);

        // Create the full command to run in the shell
        // For exit mode, we add 'exit' at the end to close the window after completion
        return `${envCommands}; clear; echo "Running: ${command}"; echo; ${command}; echo; echo "Command completed. Window will close..."; sleep 2; exit`;
    }
}

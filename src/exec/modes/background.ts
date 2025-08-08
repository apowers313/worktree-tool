import {spawn} from "child_process";

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

export class BackgroundMode extends ExecutionMode {
    constructor(
        private config: WorktreeConfig,
        private logger: ReturnType<typeof getLogger>,
    ) {
        super();
    }

    async execute(contexts: ExecutionContext[]): Promise<void> {
        this.logger.info(`Starting ${String(contexts.length)} background process(es)...`);

        const hasTmux = await isTmuxAvailable();
        const sessionName = sanitizeTmuxName(this.config.projectName);
        const sessionExists = this.config.tmux && hasTmux ? await tmuxSessionExists(sessionName) : false;

        let failureCount = 0;
        for (let i = 0; i < contexts.length; i++) {
            const context = contexts[i];
            if (!context) {
                continue;
            }

            const windowName = sanitizeTmuxWindowName(`${context.worktreeName}::bg`);

            try {
                if (this.config.tmux && hasTmux) {
                    await this.executeTmux(
                        context,
                        windowName,
                        sessionName,
                        i === 0 && !sessionExists,
                    );
                } else {
                    this.executeBackground(context);
                }

                this.logger.success(`Started background process in ${context.worktreeName}: ${context.command}`);
            } catch(error) {
                this.logger.error(`Failed to start background process in ${context.worktreeName}: ${getErrorMessage(error)}`);
                failureCount++;
            }
        }

        if (failureCount > 0) {
            throw new Error(`${String(failureCount)} background process(es) failed to start`);
        }

        this.logger.info("All background processes started. They will continue running in the background.");
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

        // Note: We don't switch to the window in background mode
    }

    private executeBackground(context: ExecutionContext): void {
        const command = this.buildCommand(context);

        // Spawn process in background
        const proc = spawn(command, [], {
            cwd: context.worktreePath,
            env: this.getEnvironment(context),
            detached: true,
            stdio: "ignore",
            shell: true,
        });

        // Unref the process so Node.js can exit
        proc.unref();
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
        // For background mode, we don't add 'exec bash' at the end
        return `${envCommands}; clear; echo "Running in background: ${command}"; echo; ${command}`;
    }
}

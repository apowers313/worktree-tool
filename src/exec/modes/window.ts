import {WorktreeConfig} from "../../core/types.js";
import {ShellManager} from "../../platform/shell.js";
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

export class WindowMode extends ExecutionMode {
    constructor(
        private config: WorktreeConfig,
        private logger: ReturnType<typeof getLogger>,
    ) {
        super();
    }

    async execute(contexts: ExecutionContext[]): Promise<void> {
        const hasTmux = await isTmuxAvailable();
        const sessionName = sanitizeTmuxName(this.config.projectName);
        const sessionExists = this.config.tmux && hasTmux ? await tmuxSessionExists(sessionName) : false;

        let failureCount = 0;
        for (let i = 0; i < contexts.length; i++) {
            const context = contexts[i];
            if (!context) {
                continue;
            }

            const windowName = sanitizeTmuxWindowName(`${context.worktreeName}::exec`);

            try {
                if (this.config.tmux && hasTmux) {
                    await this.executeTmux(
                        context,
                        windowName,
                        sessionName,
                        i === 0 && !sessionExists,
                    );
                } else {
                    await this.executeShell(context, windowName);
                }

                this.logger.success(`Started in ${context.worktreeName}: ${context.command}`);
            } catch(error) {
                this.logger.error(`Failed to start in ${context.worktreeName}: ${getErrorMessage(error)}`);
                failureCount++;
            }
        }

        if (failureCount > 0) {
            throw new Error(`${String(failureCount)} command(s) failed to start`);
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

    private async executeShell(
        context: ExecutionContext,
        windowName: string,
    ): Promise<void> {
        const shell = new ShellManager();
        const command = this.buildCommand(context);

        // Set environment variables in current process for the shell
        const env = this.getEnvironment(context);
        for (const [key, value] of Object.entries(env)) {
            if (key.startsWith("WTT_")) {
                process.env[key] = value;
            }
        }

        await shell.executeInNewWindow(command, context.worktreePath, windowName);
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
        // Add `exec bash` at the end to keep the window open after the command finishes
        return `${envCommands}; clear; echo "Running: ${command}"; echo; ${command}; exec bash`;
    }
}

import {spawn} from "child_process";

import {getLogger} from "../../utils/logger.js";
import {ExecutionContext, ExecutionMode} from "./base.js";

export class InlineMode extends ExecutionMode {
    constructor(private logger: ReturnType<typeof getLogger>) {
        super();
    }

    async execute(contexts: ExecutionContext[]): Promise<void> {
        this.logger.info(`Executing command in ${String(contexts.length)} worktree(s) (inline mode)...`);

        // Execute all commands in parallel
        const executions = contexts.map((context) => this.executeOne(context));
        const results = await Promise.allSettled(executions);

        // Check for failures
        const failures = results.filter((r) => r.status === "rejected");
        if (failures.length > 0) {
            throw new Error(`${String(failures.length)} command(s) failed`);
        }
    }

    private async executeOne(context: ExecutionContext): Promise<void> {
        return new Promise((resolve, reject) => {
            const output: string[] = [];
            const errors: string[] = [];

            const proc = spawn(context.command, context.args, {
                cwd: context.worktreePath,
                env: this.getEnvironment(context),
                shell: true,
            });

            proc.stdout.on("data", (data: Buffer) => {
                output.push(data.toString());
            });

            proc.stderr.on("data", (data: Buffer) => {
                errors.push(data.toString());
            });

            proc.on("error", (error) => {
                this.logger.error(`[${context.worktreeName}] Failed to start command: ${error.message}`);
                reject(error);
            });

            proc.on("close", (code) => {
                // Print buffered output with worktree label
                if (output.length > 0) {
                    this.logger.info(`\n[${context.worktreeName}] Output:`);
                    this.logger.info(output.join(""));
                }

                if (errors.length > 0) {
                    this.logger.error(`[${context.worktreeName}] Errors:`);
                    this.logger.error(errors.join(""));
                }

                if (code !== 0) {
                    reject(new Error(`Command failed in ${context.worktreeName} with code ${String(code)}`));
                } else {
                    resolve();
                }
            });
        });
    }
}

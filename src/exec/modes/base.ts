import {ENV_VARS} from "../../core/constants.js";

export interface ExecutionContext {
    worktreeName: string;
    worktreePath: string;
    command: string;
    args: string[];
    env: Record<string, string>;
}

export abstract class ExecutionMode {
    abstract execute(contexts: ExecutionContext[]): Promise<void>;

    protected getEnvironment(context: ExecutionContext): Record<string, string> {
        return {
            ... process.env,
            [ENV_VARS.WORKTREE_NAME]: context.worktreeName,
            [ENV_VARS.WORKTREE_PATH]: context.worktreePath,
            [ENV_VARS.IS_MAIN]: context.worktreeName === "main" ? "true" : "false",
            ... context.env,
        };
    }
}

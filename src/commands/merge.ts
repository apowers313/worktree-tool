import {Command} from "commander";
import path from "path";

import {GlobalOptions, WorktreeInfo} from "../core/types.js";
import {validateWorktreeName} from "../utils/validation.js";
import {BaseCommand, CommandContext} from "./base.js";

export interface MergeOptions extends GlobalOptions {
    /** Update mode: merge main into worktree instead */
    update?: boolean;
    /** Skip fetch before merge */
    noFetch?: boolean;
    /** Force merge even with uncommitted changes */
    force?: boolean;
    /** Target worktree name (optional, defaults to current) */
    worktree?: string;
}

export class MergeCommand extends BaseCommand<MergeOptions> {
    protected override requiresConfig(): boolean {
        return true;
    }

    protected override requiresGitRepo(): boolean {
        return true;
    }

    protected override validateOptions(options: MergeOptions): void {
        // Validate worktree name if provided
        if (options.worktree) {
            validateWorktreeName(options.worktree);
        }
    }

    protected override async executeCommand(
        options: MergeOptions,
        context: CommandContext,
    ): Promise<void> {
        const {logger} = context;

        logger.verbose("Executing merge command");
        logger.verbose(`Update mode: ${options.update ? "true" : "false"}`);
        logger.verbose(`Target worktree: ${options.worktree ?? "current"}`);

        // Implement merge logic in future steps
        logger.info("Merge command not yet implemented");

        await Promise.resolve();
    }

    // @ts-expect-error - Method will be used in next implementation steps
    private async getTargetWorktree(
        options: MergeOptions,
        context: CommandContext,
    ): Promise<{name: string, info: WorktreeInfo}> {
        const {git} = context;

        if (options.worktree) {
            // User specified a worktree
            const info = await git.getWorktreeByName(options.worktree);
            if (!info) {
                throw new Error(`Worktree '${options.worktree}' not found`);
            }

            return {name: options.worktree, info};
        }

        // Get current worktree
        const currentPath = process.cwd();
        const worktrees = await git.listWorktrees();

        // Find which worktree we're in
        for (const wt of worktrees) {
            if (currentPath.startsWith(wt.path)) {
                if (wt.isMain) {
                    throw new Error("Not in a worktree. Run from within a worktree or specify worktree name.");
                }

                const name = path.basename(wt.path);
                return {name, info: wt};
            }
        }

        throw new Error("Not in a worktree. Run from within a worktree or specify worktree name.");
    }
}

export const mergeCommand = new Command("merge")
    .description("Merge worktree changes back to main branch or update worktree from main")
    .argument("[worktree]", "name of worktree to merge (default: current worktree)")
    .option("-u, --update", "update worktree from main instead of merging to main")
    .option("--no-fetch", "skip fetching latest changes before merge")
    .option("-f, --force", "force merge even with uncommitted changes")
    .action(async(worktree: string | undefined, options: Record<string, unknown>) => {
        const mergeOptions: MergeOptions = {
            worktree,
            update: options.update as boolean,
            noFetch: options.fetch === false,
            force: options.force as boolean,
            verbose: options.verbose as boolean,
            quiet: options.quiet as boolean,
        };
        const command = new MergeCommand();
        await command.execute(mergeOptions);
    });

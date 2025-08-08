import {Command} from "commander";
import path from "path";

import {WorktreeInfo} from "../core/types.js";
import {
    changeToMainWorktree,
    isCurrentProcessInWorktree,
    terminateShellProcessesInDirectory,
} from "../platform/process-cleanup.js";
import {closeTmuxWindowsForWorktree} from "../platform/tmux-cleanup.js";
import {validateWorktreeName} from "../utils/validation.js";
import {BaseCommand, CommandContext, CommandOptions} from "./base.js";

export interface RemoveOptions extends CommandOptions {
    worktrees: string[];
    force?: boolean;
    prune?: boolean;
}

export class RemoveCommand extends BaseCommand<RemoveOptions> {
    protected override requiresConfig(): boolean {
        return true;
    }

    protected override requiresGitRepo(): boolean {
        return true;
    }

    protected override validateOptions(options: RemoveOptions): void {
        // Check for conflicting options
        if (options.prune && options.worktrees.length > 0) {
            throw new Error("Cannot specify worktrees with --prune option");
        }

        // Check that we have something to do
        if (!options.prune && options.worktrees.length === 0) {
            throw new Error("No worktrees specified. Use --prune or specify worktree names");
        }

        // Validate worktree names
        for (const name of options.worktrees) {
            validateWorktreeName(name);
        }
    }

    protected override async executeCommand(
        options: RemoveOptions,
        context: CommandContext,
    ): Promise<void> {
        if (options.prune) {
            await this.executePrune(context);
            return;
        }

        // Process each worktree
        for (const worktreeName of options.worktrees) {
            await this.removeWorktree(worktreeName, options.force ?? false, context);
        }
    }

    private async removeWorktree(
        worktreeName: string,
        force: boolean,
        context: CommandContext,
    ): Promise<void> {
        const {logger, git} = context;

        // Find the worktree
        const worktree = await git.getWorktreeByName(worktreeName);
        if (!worktree) {
            logger.error(`Worktree '${worktreeName}' not found`);
            return;
        }

        // Check if it's the main worktree
        if (worktree.isMain) {
            logger.error("Cannot remove main worktree");
            return;
        }

        // Perform safety checks unless forced
        if (!force) {
            const errors = await this.performSafetyChecks(worktree, context);
            if (errors.length > 0) {
                for (const error of errors) {
                    logger.error(error);
                }
                return;
            }
        }

        // Close tmux windows and terminate shell processes
        await this.performCleanup(worktree, worktreeName, context);

        // Remove the worktree
        try {
            await git.removeWorktree(worktree.path, force);
            logger.info(`Removed worktree '${worktreeName}'`);
        } catch(error) {
            logger.error(`Failed to remove worktree '${worktreeName}': ${String(error)}`);
        }
    }

    private async performSafetyChecks(
        worktree: {path: string, branch: string},
        context: CommandContext,
    ): Promise<string[]> {
        const {git} = context;
        const errors: string[] = [];

        // Check for untracked files
        if (await git.hasUntrackedFiles(worktree.path)) {
            errors.push("Has untracked files");
        }

        // Check for uncommitted changes
        if (await git.hasUncommittedChanges(worktree.path)) {
            errors.push("Has uncommitted changes");
        }

        // Check for staged changes
        if (await git.hasStagedChanges(worktree.path)) {
            errors.push("Has staged changes");
        }

        // Check for unmerged commits
        const mainBranch = await git.getMainBranch();
        const branchName = worktree.branch.replace(/^refs\/heads\//, "");
        if (await git.hasUnmergedCommits(branchName, mainBranch)) {
            errors.push("Has unmerged commits");
        }

        // Check for stashed changes
        if (await git.hasStashedChanges(branchName)) {
            errors.push("Has stashed changes");
        }

        // Check for submodule modifications
        if (await git.hasSubmoduleModifications(worktree.path)) {
            errors.push("Has submodule modifications");
        }

        return errors;
    }

    private async performCleanup(
        worktree: WorktreeInfo,
        worktreeName: string,
        context: CommandContext,
    ): Promise<void> {
        const {logger, git, config} = context;

        // Check if we're removing the current directory
        if (isCurrentProcessInWorktree(worktree.path)) {
            const mainWorktree = await git.getMainWorktree();
            changeToMainWorktree(mainWorktree.path);
            logger.verbose("Changed to main worktree before removal");
        }

        // Close tmux windows
        if (config?.tmux && config.projectName) {
            await closeTmuxWindowsForWorktree(
                config.projectName,
                worktreeName,
            );
            logger.verbose("Closed tmux windows");
        }

        // Terminate shell processes
        await terminateShellProcessesInDirectory(worktree.path);
        logger.verbose("Terminated shell processes");
    }

    private async executePrune(context: CommandContext): Promise<void> {
        const {logger, git} = context;

        logger.verbose("Finding fully merged worktrees...");

        const worktrees = await git.listWorktrees();
        const mainBranch = await git.getMainBranch();
        const mainWorktree = worktrees.find((w) => w.isMain);

        if (!mainWorktree) {
            throw new Error("Could not find main worktree");
        }

        const pruneCandidates: WorktreeInfo[] = [];

        // Check each non-main worktree
        for (const worktree of worktrees) {
            if (worktree.isMain || worktree.isLocked) {
                continue;
            }

            // Check if fully merged
            const branchName = worktree.branch.replace(/^refs\/heads\//, "");
            const hasUnmerged = await git.hasUnmergedCommits(
                branchName,
                mainBranch,
            );

            if (!hasUnmerged) {
                pruneCandidates.push(worktree);
            }
        }

        if (pruneCandidates.length === 0) {
            logger.info("No fully merged worktrees to prune");
            return;
        }

        logger.verbose(`Found ${String(pruneCandidates.length)} worktrees to prune`);

        // Remove each candidate
        const removed: string[] = [];
        for (const worktree of pruneCandidates) {
            const errors = await this.performSafetyChecks(worktree, context);

            if (errors.length === 0) {
                // Extract worktree name for display
                const worktreeName = path.basename(worktree.path);

                // Run cleanup and removal
                await this.performCleanup(worktree, worktreeName, context);

                try {
                    await git.removeWorktree(worktree.path, false);
                    removed.push(worktreeName);
                    logger.verbose(`Pruned worktree '${worktreeName}'`);
                } catch(error) {
                    logger.verbose(
                        `Failed to prune '${String(worktreeName)}': ${String(error)}`,
                    );
                }
            } else {
                const worktreeName = path.basename(worktree.path);
                logger.verbose(
                    `Skipping ${worktreeName}: ${errors.join(", ")}`,
                );
            }
        }

        // Report results
        if (removed.length === 0) {
            logger.info("No worktrees pruned (all had pending changes)");
        } else if (removed.length === 1) {
            logger.success(`Pruned worktree: ${removed[0] ?? ""}`);
        } else {
            logger.success(`Pruned ${String(removed.length)} worktrees: ${removed.join(", ")}`);
        }
    }
}

export const removeCommand = new Command("remove")
    .description("Remove git worktrees with safety checks")
    .argument("[worktrees...]", "names of worktrees to remove")
    .option("-f, --force", "force removal, bypassing all safety checks")
    .option("--prune", "remove all fully merged worktrees")
    .action(async(worktrees: string[], options: Record<string, unknown>) => {
        const removeOptions: RemoveOptions = {
            worktrees,
            force: options.force as boolean | undefined,
            prune: options.prune as boolean | undefined,
            verbose: options.verbose as boolean | undefined,
            quiet: options.quiet as boolean | undefined,
        };
        const command = new RemoveCommand();
        await command.execute(removeOptions);
    });

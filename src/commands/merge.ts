import {Command} from "commander";
import path from "path";
import readline from "readline/promises";

import {createGit} from "../core/git.js";
import {GlobalOptions, WorktreeInfo} from "../core/types.js";
import {getErrorMessage} from "../utils/error-handler.js";
import {GitError} from "../utils/errors.js";
import {Logger} from "../utils/logger.js";
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
        const {logger, git} = context;

        // Step 1: Determine target worktree
        const targetWorktree = await this.getTargetWorktree(options, context);
        logger.verbose(`Target worktree: ${targetWorktree.name}`);

        // Step 2: Validate clean working tree
        if (!options.force) {
            // If we specified a worktree, check that worktree for changes
            // Otherwise check the current directory
            const checkPath = options.worktree ? targetWorktree.info.path : process.cwd();
            const localGit = createGit(checkPath);
            const hasChanges = await localGit.hasUncommittedChanges();
            if (hasChanges) {
                throw new GitError(
                    "Working tree has uncommitted changes. Use --force to override.",
                );
            }
        }

        // Step 3: Fetch latest changes
        if (!options.noFetch) {
            logger.info("Fetching latest changes...");
            await git.fetch();
        }

        // Step 4: Perform merge
        if (options.update) {
            // Merge main into worktree
            await this.mergeMainIntoWorktree(targetWorktree.name, context);
        } else {
            // Merge worktree into main
            await this.mergeWorktreeIntoMain(targetWorktree.name, context);
        }
    }

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
        const currentPath = path.resolve(process.cwd());

        // Create a git instance from current directory to get accurate worktree info
        const localGit = createGit(currentPath);

        try {
            // Check if we're in a git worktree by getting the current branch
            const currentBranch = await localGit.getCurrentBranch();
            // Get worktree list from the main git instance
            const worktrees = await git.listWorktrees();

            // Find worktree by branch name
            const currentWorktree = worktrees.find((wt) => {
                const branchName = wt.branch ? wt.branch.replace(/^refs\/heads\//, "") : "";
                return branchName === currentBranch;
            });

            if (currentWorktree) {
                if (currentWorktree.isMain) {
                    throw new Error("Not in a worktree. Run from within a worktree or specify worktree name.");
                }

                return {name: currentBranch, info: currentWorktree};
            }

            // Fallback: try path-based detection
            const repoRoot = await git.getRepoRoot();
            for (const wt of worktrees) {
                const worktreePath = path.isAbsolute(wt.path) ?
                    path.resolve(wt.path) :
                    path.resolve(repoRoot, wt.path);

                if (currentPath === worktreePath || currentPath.startsWith(worktreePath + path.sep)) {
                    if (wt.isMain) {
                        throw new Error("Not in a worktree. Run from within a worktree or specify worktree name.");
                    }

                    const name = wt.branch ? wt.branch.replace(/^refs\/heads\//, "") : path.basename(wt.path);
                    return {name, info: wt};
                }
            }
        } catch {
            // Failed to detect worktree by branch, will try path-based detection
        }

        throw new Error("Not in a worktree. Run from within a worktree or specify worktree name.");
    }

    private async mergeWorktreeIntoMain(
        worktreeName: string,
        context: CommandContext,
    ): Promise<void> {
        const {logger, git, config} = context;
        const mainBranch = config?.mainBranch ?? "main";
        const currentBranch = await git.getCurrentBranch();

        logger.info(`Merging ${worktreeName} into ${mainBranch}...`);

        try {
            // Get confirmation
            const confirmed = await this.confirmMerge(worktreeName, mainBranch, logger);
            if (!confirmed) {
                logger.info("Merge cancelled.");
                return;
            }

            // Switch to main branch
            await git.raw(["checkout", mainBranch]);

            // Merge worktree branch
            const mergeResult = await git.merge(worktreeName, `Merge branch '${worktreeName}'`);

            if (!mergeResult.success && mergeResult.conflicts) {
                const conflictedFiles = await git.getConflictedFiles();
                logger.warn(`Merge conflicts detected in ${String(conflictedFiles.length)} file(s):`);
                conflictedFiles.forEach((file) => {
                    logger.warn(`  - ${file}`);
                });
                throw new GitError("Merge conflicts must be resolved manually");
            }

            logger.success(`Successfully merged ${worktreeName} into ${mainBranch}`);

            // Return to original branch
            await git.raw(["checkout", currentBranch]);
        } catch(error) {
            // Try to return to original branch on error
            try {
                await git.raw(["checkout", currentBranch]);
            } catch {
                // Ignore checkout error
            }

            if (error instanceof GitError) {
                throw error;
            }

            throw new GitError(`Failed to merge: ${getErrorMessage(error)}`);
        }
    }

    private async mergeMainIntoWorktree(
        worktreeName: string,
        context: CommandContext,
    ): Promise<void> {
        const {logger, config} = context;
        const mainBranch = config?.mainBranch ?? "main";

        logger.info(`Merging ${mainBranch} into ${worktreeName}...`);

        try {
            // Get confirmation
            const confirmed = await this.confirmMerge(mainBranch, worktreeName, logger);
            if (!confirmed) {
                logger.info("Merge cancelled.");
                return;
            }

            // We're already in the worktree, no need to checkout
            // Create a git instance for the current directory (worktree)
            const worktreeGit = createGit(process.cwd());

            // Merge main branch using the worktree git instance
            const mergeResult = await worktreeGit.merge(mainBranch, `Merge branch '${mainBranch}' into ${worktreeName}`);

            if (!mergeResult.success && mergeResult.conflicts) {
                const conflictedFiles = await worktreeGit.getConflictedFiles();
                logger.warn(`Merge conflicts detected in ${String(conflictedFiles.length)} file(s):`);
                conflictedFiles.forEach((file) => {
                    logger.warn(`  - ${file}`);
                });
                throw new GitError("Merge conflicts must be resolved manually");
            }

            logger.success(`Successfully merged ${mainBranch} into ${worktreeName}`);
        } catch(error) {
            if (error instanceof GitError) {
                throw error;
            }

            throw new GitError(`Failed to merge: ${getErrorMessage(error)}`);
        }
    }

    private async confirmMerge(
        source: string,
        target: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _logger: Logger,
    ): Promise<boolean> {
        if (process.env.WTT_NO_CONFIRM === "true") {
            return true;
        }

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        try {
            const answer = await rl.question(
                `Merge ${source} into ${target}? (y/N): `,
            );
            return answer.toLowerCase() === "y";
        } finally {
            rl.close();
        }
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

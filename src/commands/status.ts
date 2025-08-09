import chalk from "chalk";
import {Command} from "commander";
import {basename} from "path";

import {StatusOptions, WorktreeStatus} from "../core/types.js";
import {countStatuses, displayLegend, displayVerboseFiles, formatWorktreeStatus} from "../utils/status-formatter.js";
import {BaseCommand, CommandContext} from "./base.js";

/**
 * Status command - shows git status across all worktrees
 */
export class StatusCommand extends BaseCommand<StatusOptions> {
    protected override requiresConfig(): boolean {
        return true;
    }

    protected override requiresGitRepo(): boolean {
        return true;
    }

    protected override showVerboseStatus(): boolean {
        return false;
    }

    protected override validateOptions(
        /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
        _options: StatusOptions,
    ): void {
        // Validation can be added here if needed
        // For now, the -w option accepts any string value
    }

    protected override async executeCommand(options: StatusOptions, context: CommandContext): Promise<void> {
        const {git, config} = context;

        // Get all worktrees
        const worktrees = await git.listWorktrees();

        // Find the main worktree
        const mainWorktree = worktrees.find((w) => w.isMain);
        const mainBranch = mainWorktree?.branch ?? config?.mainBranch ?? "main";

        // Add name property derived from path and filter out main worktree
        const worktreesWithNames = worktrees
            .filter((w) => !w.isMain)
            .map((w) => ({
                ... w,
                name: basename(w.path),
            }));

        // Filter by -w option if provided
        let filteredWorktrees = worktreesWithNames;
        if (options.worktrees) {
            const filter = options.worktrees.split(",").map((w) => w.trim());
            filteredWorktrees = worktreesWithNames.filter((w) => filter.includes(w.name));
        }

        // Collect status for each worktree with raw status lines if verbose
        interface VerboseWorktreeStatus extends WorktreeStatus {
            statusLines?: string[];
            potentialConflictFiles?: string[];
        }

        const statusPromises = filteredWorktrees.map(async(worktree): Promise<VerboseWorktreeStatus> => {
            const [statusLines, mainComparison, hasConflicts] = await Promise.all([
                git.getWorktreeStatus(worktree.path),
                git.getAheadBehindBranch(worktree.path, mainBranch),
                git.hasConflicts(worktree.path, mainBranch),
            ]);

            const counts = countStatuses(statusLines);

            // If there are no active conflicts but hasConflicts is true, get the files that would conflict
            let potentialConflictFiles: string[] = [];
            if (hasConflicts && counts.conflicts === 0) {
                // Simple approach: get files changed in this branch vs main
                try {
                    const result = await git.raw(["-C", worktree.path, "diff", "--name-only", mainBranch]);
                    potentialConflictFiles = result.split("\n").filter((f) => f.trim());
                } catch {
                    // Ignore errors
                }
            }

            return {
                name: worktree.name,
                path: worktree.path,
                counts,
                ahead: mainComparison.ahead,
                behind: mainComparison.behind,
                hasConflicts,
                potentialConflictCount: potentialConflictFiles.length,
                statusLines: options.verbose ? statusLines : undefined,
                potentialConflictFiles,
            };
        });

        const statuses = await Promise.all(statusPromises);

        // Display legend if verbose
        if (options.verbose) {
            displayLegend();
        }

        // Calculate max name length for alignment
        const maxNameLength = Math.max(... statuses.map((s) => s.name.length));

        // Output formatted status for each worktree
        for (const status of statuses) {
            const formatted = formatWorktreeStatus(status, maxNameLength);
            // eslint-disable-next-line no-console
            console.log(formatted);

            // Display file listing if verbose
            if (options.verbose) {
                // First display potential conflict files if any
                if (status.potentialConflictFiles && status.potentialConflictFiles.length > 0) {
                    const orangeColor = chalk.hex("#FFA500");
                    for (const file of status.potentialConflictFiles) {
                        // eslint-disable-next-line no-console
                        console.log(`${orangeColor("(!)")} ${file}`);
                    }
                }

                // Then display regular status files
                if (status.statusLines && status.statusLines.length > 0) {
                    displayVerboseFiles(status.statusLines);
                }

                // eslint-disable-next-line no-console
                console.log(); // Empty line between worktrees
            }
        }
    }
}

/**
 * Create the status command
 */
export const statusCommand = new Command("status")
    .description("Show git status across all worktrees")
    .option("-w, --worktrees <names>", "filter worktrees (comma-separated)")
    .option("-v, --verbose", "show detailed file listing")
    .action(async function(this: Command, options: StatusOptions) {
        const command = new StatusCommand();
        const parentOpts = this.parent?.opts() ?? {};
        const mergedOptions = {... parentOpts, ... options};
        await command.execute(mergedOptions);
    });

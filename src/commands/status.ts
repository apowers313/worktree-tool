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

    protected override validateOptions(
        /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
        _options: StatusOptions,
    ): void {
        // Validation can be added here if needed
        // For now, the -w option accepts any string value
    }

    protected override async executeCommand(options: StatusOptions, context: CommandContext): Promise<void> {
        const {logger, git, config} = context;

        logger.verbose("Executing status command");
        logger.verbose(`Verbose mode: ${String(options.verbose)}`);

        // Get all worktrees
        const worktrees = await git.listWorktrees();
        logger.verbose(`Found ${String(worktrees.length)} worktrees`);

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
            logger.verbose(`Filtered to ${String(filteredWorktrees.length)} worktrees: ${filter.join(", ")}`);
        }

        // Collect status for each worktree with raw status lines if verbose
        interface VerboseWorktreeStatus extends WorktreeStatus {
            statusLines?: string[];
        }

        const statusPromises = filteredWorktrees.map(async(worktree): Promise<VerboseWorktreeStatus> => {
            const [statusLines, mainComparison, hasConflicts] = await Promise.all([
                git.getWorktreeStatus(worktree.path),
                git.getAheadBehindBranch(worktree.path, mainBranch),
                git.hasConflicts(worktree.path, mainBranch),
            ]);

            const counts = countStatuses(statusLines);

            return {
                name: worktree.name,
                path: worktree.path,
                counts,
                ahead: mainComparison.ahead,
                behind: mainComparison.behind,
                hasConflicts,
                statusLines: options.verbose ? statusLines : undefined,
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
            if (options.verbose && status.statusLines && status.statusLines.length > 0) {
                displayVerboseFiles(status.statusLines);
                // eslint-disable-next-line no-console
                console.log(); // Empty line between worktrees
            } else if (options.verbose) {
                // eslint-disable-next-line no-console
                console.log(); // Empty line even if no files
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

import simpleGit from "simple-git";

import {ConflictInfo} from "../../core/types.js";

export async function detectPotentialConflictsLegacy(
    worktreePath: string,
    targetBranch = "main",
): Promise<ConflictInfo | null> {
    try {
        const git = simpleGit(worktreePath);

        // Get current branch
        const branchSummary = await git.branch();
        const currentBranch = branchSummary.current;

        if (currentBranch === targetBranch) {
            return null;
        }

        // Check for uncommitted changes
        const status = await git.status();
        const hasUncommittedChanges = !status.isClean();
        let stashed = false;

        if (hasUncommittedChanges) {
            // Stash changes
            await git.stash(["push", "-m", "wtt-conflict-check"]);
            stashed = true;
        }

        try {
            // Attempt dry-run merge
            try {
                await git.merge([targetBranch, "--no-commit", "--no-ff"]);

                // If merge succeeds, no conflicts - abort it
                await git.raw(["merge", "--abort"]);
                return null;
            } catch {
                // Merge failed, likely due to conflicts
                // Get conflict files
                const conflictStatus = await git.status();
                const files = conflictStatus.conflicted;

                // Abort merge
                try {
                    await git.raw(["merge", "--abort"]);
                } catch {
                    // Sometimes merge --abort fails if the merge was already aborted
                }

                if (files.length > 0) {
                    return {
                        type: "potential",
                        files,
                        count: files.length,
                    };
                }

                return null;
            }
        } finally {
            // Restore stashed changes
            if (stashed) {
                try {
                    await git.stash(["pop"]);
                } catch {
                    // If stash pop fails, the stash is still there
                    // User can manually recover it
                }
            }
        }
    } catch {
        return null;
    }
}

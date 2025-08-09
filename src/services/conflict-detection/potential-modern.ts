import simpleGit from "simple-git";

import {ConflictInfo} from "../../types/conflicts.js";

interface GitError extends Error {
    exitCode?: number;
    stdOut?: string;
}

export async function detectPotentialConflictsModern(
    worktreePath: string,
    targetBranch = "main",
): Promise<ConflictInfo | null> {
    try {
        const git = simpleGit(worktreePath);

        // Get current branch
        const branchSummary = await git.branch();
        const currentBranch = branchSummary.current;

        // Skip if we're on the target branch
        if (currentBranch === targetBranch) {
            return null;
        }

        // Get merge base
        const mergeBase = await git.raw(["merge-base", currentBranch, targetBranch]);
        const mergeBaseHash = mergeBase.trim();

        // Run merge-tree
        try {
            await git.raw([
                "merge-tree",
                "--write-tree",
                "--no-messages",
                mergeBaseHash,
                currentBranch,
                targetBranch,
            ]);

            // If we get here without error, there are no conflicts
            return null;
        } catch(err) {
            const error = err as GitError;

            // Exit code 1 indicates conflicts
            if (error.exitCode === 1) {
                // Parse conflict information from stdout
                const output = error.stdOut ?? "";
                const lines = output.split("\n");
                const conflictFiles = new Set<string>();

                for (const line of lines) {
                    // Look for conflict markers in the output
                    if (line.includes("<<<<<<<") || line.includes("=======") || line.includes(">>>>>>>")) {
                        // Extract filename from the line if possible
                        const match = /^([^:]+):/.exec(line);
                        if (match?.[1]) {
                            conflictFiles.add(match[1]);
                        }
                    }

                    // Also look for file paths in conflict info
                    const fileMatch = /^\+\+\+ (.+)/.exec(line);
                    if (fileMatch?.[1]) {
                        conflictFiles.add(fileMatch[1]);
                    }
                }

                if (conflictFiles.size === 0) {
                    // Conflicts detected but couldn't parse files
                    return {
                        type: "potential",
                        files: [],
                        count: 1, // At least one conflict exists
                    };
                }

                return {
                    type: "potential",
                    files: Array.from(conflictFiles),
                    count: conflictFiles.size,
                };
            }

            // Other errors, return null
            return null;
        }
    } catch {
        return null;
    }
}

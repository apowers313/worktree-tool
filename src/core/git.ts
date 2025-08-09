import path from "path";
import simpleGit, {SimpleGit} from "simple-git";

import {getErrorMessage} from "../utils/error-handler.js";
import {GitError} from "../utils/errors.js";
import {WorktreeInfo} from "./types.js";

/**
 * Git operations wrapper for wtt
 */
export class Git {
    private git: SimpleGit;

    constructor(baseDir?: string) {
        this.git = simpleGit(baseDir);
    }

    /**
   * Check if the current directory is a git repository
   */
    async isGitRepository(): Promise<boolean> {
        try {
            const result = await this.git.checkIsRepo();
            return result;
        } catch {
            return false;
        }
    }

    /**
   * Get the main branch name by checking common names
   * Works even in a newly initialized repo with no commits
   */
    async getMainBranch(): Promise<string> {
        try {
            // Get all branches
            const branches = await this.git.branch();
            const branchNames = branches.all;

            // If no branches exist (no commits), try to get the default branch
            if (branchNames.length === 0) {
                try {
                    // Get the current HEAD reference (works even without commits)
                    const headRef = await this.git.raw(["symbolic-ref", "HEAD"]);
                    const match = /^refs\/heads\/(.+)/.exec(headRef);
                    if (match?.[1]) {
                        return match[1].trim();
                    }
                } catch {
                    // If symbolic-ref fails, try to get default from config
                    try {
                        const defaultBranch = await this.git.raw(["config", "--get", "init.defaultBranch"]);
                        if (defaultBranch.trim()) {
                            return defaultBranch.trim();
                        }
                    } catch {
                        // No config, use 'main' as fallback
                    }
                    // Default to 'main' if nothing else works
                    return "main";
                }
            }

            // Check for common main branch names in order of preference
            const commonMainBranches = ["main", "master", "trunk", "development"];

            for (const branchName of commonMainBranches) {
                if (branchNames.includes(branchName)) {
                    return branchName;
                }
            }

            // If no common names found, try to get the default branch from git config
            try {
                const defaultBranch = await this.git.raw(["config", "--get", "init.defaultBranch"]);
                if (defaultBranch.trim()) {
                    return defaultBranch.trim();
                }
            } catch {
                // Config not set, continue
            }

            // If still nothing, return 'main' as default
            return "main";
        } catch(error) {
            throw new GitError(`Failed to detect main branch: ${getErrorMessage(error)}`);
        }
    }

    /**
   * Check if the repository has any commits
   */
    async hasCommits(): Promise<boolean> {
        try {
            await this.git.raw(["rev-parse", "HEAD"]);
            return true;
        } catch {
            return false;
        }
    }

    /**
   * Create a new worktree
   */
    async createWorktree(path: string, branch: string): Promise<void> {
        try {
            // Check if branch exists
            const branches = await this.git.branch();
            const branchExists = branches.all.includes(branch);

            if (branchExists) {
                // If branch exists, create worktree with existing branch
                await this.git.raw(["worktree", "add", path, branch]);
            } else {
                // If branch doesn't exist, create new branch with worktree
                await this.git.raw(["worktree", "add", "-b", branch, path]);
            }
        } catch(error) {
            throw new GitError(`Failed to create worktree: ${getErrorMessage(error)}`, {path, branch});
        }
    }

    /**
   * List all worktrees
   */
    async listWorktrees(): Promise<WorktreeInfo[]> {
        try {
            // Use git worktree list --porcelain for machine-readable output
            const result = await this.git.raw(["worktree", "list", "--porcelain"]);

            if (!result.trim()) {
                return [];
            }

            const worktrees: WorktreeInfo[] = [];
            const lines = result.trim().split("\n");

            let currentWorktree: Partial<WorktreeInfo> = {};

            for (const line of lines) {
                if (line.startsWith("worktree ")) {
                    if (currentWorktree.path) {
                        // Save previous worktree
                        worktrees.push(currentWorktree as WorktreeInfo);
                    }

                    currentWorktree = {
                        path: line.substring("worktree ".length),
                        isMain: false,
                        isLocked: false,
                        branch: "",
                        commit: "",
                    };
                } else if (line === "bare") {
                    currentWorktree.isMain = true;
                } else if (line.startsWith("HEAD ")) {
                    currentWorktree.commit = line.substring("HEAD ".length);
                } else if (line.startsWith("branch ")) {
                    currentWorktree.branch = line.substring("branch ".length);
                } else if (line === "locked") {
                    currentWorktree.isLocked = true;
                } else if (line === "") {
                    // Empty line indicates end of current worktree info
                    if (currentWorktree.path) {
                        worktrees.push(currentWorktree as WorktreeInfo);
                        currentWorktree = {};
                    }
                }
            }

            // Don't forget the last worktree
            if (currentWorktree.path) {
                worktrees.push(currentWorktree as WorktreeInfo);
            }

            // Mark the first worktree as main if none are marked
            if (worktrees.length > 0 && !worktrees.some((w) => w.isMain)) {
                const firstWorktree = worktrees[0];
                if (firstWorktree) {
                    firstWorktree.isMain = true;
                }
            }

            return worktrees;
        } catch(error) {
            throw new GitError(`Failed to list worktrees: ${getErrorMessage(error)}`);
        }
    }

    /**
   * Get the root directory of the git repository
   */
    async getRepoRoot(): Promise<string> {
        try {
            const root = await this.git.revparse(["--show-toplevel"]);
            return root.trim();
        } catch(error) {
            throw new GitError(`Failed to get repository root: ${getErrorMessage(error)}`);
        }
    }

    /**
   * Check if a branch exists
   */
    async branchExists(branchName: string): Promise<boolean> {
        try {
            const branches = await this.git.branch();
            return branches.all.includes(branchName);
        } catch(error) {
            throw new GitError(`Failed to check branch existence: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Get the status of files in a worktree using porcelain format
     */
    async getWorktreeStatus(worktreePath: string): Promise<string[]> {
        try {
            const result = await this.git.raw(["-C", worktreePath, "status", "--porcelain=v1"]);
            return result.split("\n").filter((line) => line.trim());
        } catch(error) {
            throw new GitError(`Failed to get worktree status: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Get the number of commits ahead and behind the upstream branch
     */
    async getAheadBehind(worktreePath: string): Promise<{ahead: number, behind: number}> {
        try {
            const [aheadResult, behindResult] = await Promise.all([
                this.git.raw(["-C", worktreePath, "rev-list", "--count", "@{upstream}..HEAD"]).catch(() => "0"),
                this.git.raw(["-C", worktreePath, "rev-list", "--count", "HEAD..@{upstream}"]).catch(() => "0"),
            ]);

            return {
                ahead: parseInt(aheadResult.trim(), 10) || 0,
                behind: parseInt(behindResult.trim(), 10) || 0,
            };
        } catch {
            // No upstream branch or other error - return zeros
            return {ahead: 0, behind: 0};
        }
    }

    /**
     * Get the number of commits ahead and behind compared to another branch
     */
    async getAheadBehindBranch(worktreePath: string, targetBranch: string): Promise<{ahead: number, behind: number}> {
        try {
            const [aheadResult, behindResult] = await Promise.all([
                this.git.raw(["-C", worktreePath, "rev-list", "--count", `${targetBranch}..HEAD`]).catch(() => "0"),
                this.git.raw(["-C", worktreePath, "rev-list", "--count", `HEAD..${targetBranch}`]).catch(() => "0"),
            ]);

            return {
                ahead: parseInt(aheadResult.trim(), 10) || 0,
                behind: parseInt(behindResult.trim(), 10) || 0,
            };
        } catch {
            // Error - return zeros
            return {ahead: 0, behind: 0};
        }
    }

    /**
     * Check if there would be conflicts merging with target branch
     */
    async hasConflicts(worktreePath: string, targetBranch: string): Promise<boolean> {
        try {
            // Find merge base
            const mergeBase = await this.git.raw(["-C", worktreePath, "merge-base", "HEAD", targetBranch]).catch(() => null);
            if (!mergeBase) {
                return false;
            }

            // Try a merge-tree to check for conflicts without actually merging
            const mergeResult = await this.git.raw(["-C", worktreePath, "merge-tree", mergeBase.trim(), "HEAD", targetBranch]);

            // If merge-tree output contains conflict markers, there are conflicts
            return mergeResult.includes("<<<<<<<");
        } catch {
            return false;
        }
    }

    /**
   * Get worktree information by name
   */
    async getWorktreeByName(name: string): Promise<WorktreeInfo | null> {
        try {
            const worktrees = await this.listWorktrees();

            // First try exact match on branch name (without refs/heads/ prefix)
            let worktree = worktrees.find((w) => {
                const branchName = w.branch.replace(/^refs\/heads\//, "");
                return branchName === name;
            });
            if (worktree) {
                return worktree;
            }

            // Also try with refs/heads/ prefix
            worktree = worktrees.find((w) => w.branch === name);
            if (worktree) {
                return worktree;
            }

            // Then try matching the last part of the path
            worktree = worktrees.find((w) => {
                const pathParts = w.path.split(path.sep);
                return pathParts[pathParts.length - 1] === name;
            });

            return worktree ?? null;
        } catch(error) {
            throw new GitError(`Failed to find worktree: ${getErrorMessage(error)}`);
        }
    }

    /**
   * Get the main worktree
   */
    async getMainWorktree(): Promise<WorktreeInfo> {
        const worktrees = await this.listWorktrees();
        const mainWorktree = worktrees.find((w) => w.isMain);

        if (!mainWorktree) {
            throw new GitError("Could not find main worktree");
        }

        return mainWorktree;
    }

    /**
   * Check if a worktree has untracked files
   */
    async hasUntrackedFiles(worktreePath: string): Promise<boolean> {
        try {
            const gitInWorktree = new Git(worktreePath);
            const status = await gitInWorktree.git.raw(["status", "--porcelain"]);

            // Look for lines starting with "??"
            return status.split("\n").some((line) => line.startsWith("??"));
        } catch(error) {
            throw new GitError(`Failed to check untracked files: ${getErrorMessage(error)}`);
        }
    }

    /**
   * Check if a worktree has uncommitted changes
   */
    async hasUncommittedChanges(worktreePath: string): Promise<boolean> {
        try {
            const gitInWorktree = new Git(worktreePath);
            const status = await gitInWorktree.git.raw(["status", "--porcelain"]);

            // Look for modified or deleted files (second character is M or D)
            return status.split("\n").some((line) => {
                if (line.length < 2) {
                    return false;
                }

                const secondChar = line[1];
                return secondChar === "M" || secondChar === "D";
            });
        } catch(error) {
            throw new GitError(`Failed to check uncommitted changes: ${getErrorMessage(error)}`);
        }
    }

    /**
   * Check if a worktree has staged changes
   */
    async hasStagedChanges(worktreePath: string): Promise<boolean> {
        try {
            const gitInWorktree = new Git(worktreePath);
            const status = await gitInWorktree.git.raw(["status", "--porcelain"]);

            // Look for staged files (first character is not space or ?)
            return status.split("\n").some((line) => {
                if (line.length === 0) {
                    return false;
                }

                const firstChar = line[0];
                return firstChar !== " " && firstChar !== "?";
            });
        } catch(error) {
            throw new GitError(`Failed to check staged changes: ${getErrorMessage(error)}`);
        }
    }

    /**
   * Check if a branch has unmerged commits relative to main
   */
    async hasUnmergedCommits(branch: string, mainBranch: string): Promise<boolean> {
        try {
            // Use rev-list to find commits in branch but not in main
            const result = await this.git.raw([
                "rev-list",
                `${mainBranch}..${branch}`,
                "--count",
            ]);

            const count = parseInt(result.trim(), 10);
            return count > 0;
        } catch {
            // If branches don't exist, consider it as having unmerged commits
            return true;
        }
    }

    /**
   * Check if a branch has stashed changes
   */
    async hasStashedChanges(branch: string): Promise<boolean> {
        try {
            const stashList = await this.git.stashList();

            // Check if any stash message references this branch
            return stashList.all.some((stash) => {
                const message = stash.message || "";
                // Match patterns like "WIP on branch:" or "On branch:"
                return message.includes(`on ${branch}:`) ||
                       message.includes(`On ${branch}:`);
            });
        } catch {
            // If we can't check stashes, assume there are none
            return false;
        }
    }

    /**
   * Check if a worktree has submodule modifications
   */
    async hasSubmoduleModifications(worktreePath: string): Promise<boolean> {
        try {
            const gitInWorktree = new Git(worktreePath);

            // Use git submodule status to check for modifications
            // Modified submodules start with + or -
            const result = await gitInWorktree.git.raw(["submodule", "status"]);

            if (!result.trim()) {
                // No submodules
                return false;
            }

            // Check if any line starts with + (ahead) or - (behind)
            return result.split("\n").some((line) => {
                if (line.length === 0) {
                    return false;
                }

                const firstChar = line[0];
                return firstChar === "+" || firstChar === "-";
            });
        } catch {
            // If submodule command fails, assume no modifications
            return false;
        }
    }

    /**
   * Remove a worktree
   */
    async removeWorktree(worktreePath: string, force = false): Promise<void> {
        try {
            const args = ["worktree", "remove"];

            if (force) {
                args.push("--force");
            }

            args.push(worktreePath);

            await this.git.raw(args);
        } catch(error) {
            throw new GitError(`Failed to remove worktree: ${getErrorMessage(error)}`, {worktreePath});
        }
    }

    /**
     * Get current branch name
     */
    async getCurrentBranch(): Promise<string> {
        const result = await this.git.raw(["rev-parse", "--abbrev-ref", "HEAD"]);
        return result.trim();
    }

    /**
     * Check if a merge resulted in conflicts
     */
    async hasMergeConflicts(): Promise<boolean> {
        try {
            const result = await this.git.raw(["diff", "--name-only", "--diff-filter=U"]);
            return result.trim().length > 0;
        } catch {
            return false;
        }
    }

    /**
     * Get list of conflicted files
     */
    async getConflictedFiles(): Promise<string[]> {
        const result = await this.git.raw(["diff", "--name-only", "--diff-filter=U"]);
        return result.trim().split("\n").filter(Boolean);
    }

    /**
     * Perform a merge
     */
    async merge(branch: string, message?: string): Promise<{success: boolean, conflicts: boolean}> {
        try {
            const args = ["merge", "--no-ff"];
            if (message) {
                args.push("-m", message);
            }

            args.push(branch);

            await this.git.raw(args);
            return {success: true, conflicts: false};
        } catch(error) {
            // Check if it's a merge conflict
            const hasConflicts = await this.hasMergeConflicts();
            if (hasConflicts) {
                return {success: false, conflicts: true};
            }

            throw error;
        }
    }

    /**
     * Fetch latest changes
     */
    async fetch(): Promise<void> {
        await this.git.raw(["fetch", "--all"]);
    }
}

/**
 * Create a Git instance for the current directory
 */
export function createGit(baseDir?: string): Git {
    return new Git(baseDir);
}

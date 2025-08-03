import simpleGit, {SimpleGit} from "simple-git";

import {GitError} from "../utils/errors";
import {WorktreeInfo} from "./types";

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
            throw new GitError(`Failed to detect main branch: ${error instanceof Error ? error.message : String(error)}`);
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
            const message = error instanceof Error ? error.message : String(error);
            throw new GitError(`Failed to create worktree: ${message}`, {path, branch});
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
            const message = error instanceof Error ? error.message : String(error);
            throw new GitError(`Failed to list worktrees: ${message}`);
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
            throw new GitError(`Failed to get repository root: ${error instanceof Error ? error.message : String(error)}`);
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
            throw new GitError(`Failed to check branch existence: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

/**
 * Create a Git instance for the current directory
 */
export function createGit(baseDir?: string): Git {
    return new Git(baseDir);
}

# Remove Command Implementation Plan

## Overview

This implementation plan breaks down the development of the `wtt remove` command into small, testable steps. Each step includes test creation to ensure the implementation works correctly before moving to the next step.

## Phase 1: Basic Command Setup (Steps 1-3)

### Step 1: Create Basic Remove Command Structure

**Goal**: Set up the basic command that can be called with `wtt remove`

**Implementation**:

1. Create `src/commands/remove.ts`:
```typescript
import { Command } from "commander";
import { BaseCommand, CommandContext, CommandOptions } from "./base.js";
import { getLogger } from "../utils/logger.js";

export interface RemoveOptions extends CommandOptions {
    worktrees: string[];
    force?: boolean;
    prune?: boolean;
}

export class RemoveCommand extends BaseCommand<RemoveOptions> {
    protected requiresConfig(): boolean {
        return true;
    }

    protected requiresGitRepo(): boolean {
        return true;
    }

    protected validateOptions(options: RemoveOptions): void {
        // Step 2 will implement validation
    }

    protected async executeCommand(
        options: RemoveOptions,
        context: CommandContext
    ): Promise<void> {
        const { logger } = context;
        logger.info("Remove command called");
        logger.verbose(`Worktrees: ${options.worktrees.join(", ")}`);
        logger.verbose(`Force: ${options.force || false}`);
        logger.verbose(`Prune: ${options.prune || false}`);
    }
}

export const removeCommand = new Command("remove")
    .description("Remove git worktrees with safety checks")
    .argument("[worktrees...]", "names of worktrees to remove")
    .option("-f, --force", "force removal, bypassing all safety checks")
    .option("--prune", "remove all fully merged worktrees")
    .action(async (worktrees: string[], options) => {
        const removeOptions: RemoveOptions = {
            worktrees,
            force: options.force,
            prune: options.prune,
            verbose: options.verbose,
            quiet: options.quiet,
        };
        const command = new RemoveCommand();
        await command.execute(removeOptions);
    });
```

2. Update `src/index.ts` to include the remove command:
```typescript
import { removeCommand } from "./commands/remove.js";
// ... existing imports

// ... existing code
program.addCommand(removeCommand);
```

**Tests** (`test/unit/commands/remove.test.ts`):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RemoveCommand, RemoveOptions } from "../../../src/commands/remove.js";
import { CommandContext } from "../../../src/commands/base.js";
import { createMockContext } from "../../helpers/mocks.js";

describe("RemoveCommand", () => {
    let command: RemoveCommand;
    let mockContext: CommandContext;

    beforeEach(() => {
        command = new RemoveCommand();
        mockContext = createMockContext();
    });

    it("should require config", () => {
        expect(command["requiresConfig"]()).toBe(true);
    });

    it("should require git repo", () => {
        expect(command["requiresGitRepo"]()).toBe(true);
    });

    it("should execute with basic options", async () => {
        const options: RemoveOptions = {
            worktrees: ["feature-1"],
            force: false,
            prune: false,
        };

        await command["executeCommand"](options, mockContext);

        expect(mockContext.logger.info).toHaveBeenCalledWith("Remove command called");
        expect(mockContext.logger.verbose).toHaveBeenCalledWith("Worktrees: feature-1");
        expect(mockContext.logger.verbose).toHaveBeenCalledWith("Force: false");
        expect(mockContext.logger.verbose).toHaveBeenCalledWith("Prune: false");
    });
});
```

**Verification**: Run `npm test` and `wtt remove feature-1` should output basic logging

### Step 2: Implement Command Validation

**Goal**: Validate command arguments and options

**Implementation** - Update `validateOptions` in `RemoveCommand`:
```typescript
protected validateOptions(options: RemoveOptions): void {
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
```

**Tests** - Add to `remove.test.ts`:
```typescript
describe("validateOptions", () => {
    it("should throw if no worktrees and no prune", () => {
        const options: RemoveOptions = {
            worktrees: [],
            force: false,
            prune: false,
        };

        expect(() => command["validateOptions"](options))
            .toThrow("No worktrees specified");
    });

    it("should throw if worktrees specified with prune", () => {
        const options: RemoveOptions = {
            worktrees: ["feature-1"],
            force: false,
            prune: true,
        };

        expect(() => command["validateOptions"](options))
            .toThrow("Cannot specify worktrees with --prune option");
    });

    it("should validate worktree names", () => {
        const options: RemoveOptions = {
            worktrees: ["invalid/name"],
            force: false,
            prune: false,
        };

        expect(() => command["validateOptions"](options))
            .toThrow("Invalid worktree name");
    });
});
```

### Step 3: Add Git Class Methods for Worktree Information

**Goal**: Extend Git class with methods to find worktrees by name

**Implementation** - Add to `src/core/git.ts`:
```typescript
/**
 * Get worktree information by name
 */
async getWorktreeByName(name: string): Promise<WorktreeInfo | null> {
    try {
        const worktrees = await this.listWorktrees();
        
        // First try exact match on branch name
        let worktree = worktrees.find(w => w.branch === name);
        if (worktree) return worktree;
        
        // Then try matching the last part of the path
        worktree = worktrees.find(w => {
            const pathParts = w.path.split(path.sep);
            return pathParts[pathParts.length - 1] === name;
        });
        
        return worktree || null;
    } catch (error) {
        throw new GitError(`Failed to find worktree: ${getErrorMessage(error)}`);
    }
}

/**
 * Get the main worktree
 */
async getMainWorktree(): Promise<WorktreeInfo> {
    const worktrees = await this.listWorktrees();
    const mainWorktree = worktrees.find(w => w.isMain);
    
    if (!mainWorktree) {
        throw new GitError("Could not find main worktree");
    }
    
    return mainWorktree;
}
```

**Tests** - Add to `test/unit/core/git.test.ts`:
```typescript
describe("getWorktreeByName", () => {
    it("should find worktree by exact branch name", async () => {
        const mockWorktrees = [
            { path: "/repo", branch: "main", isMain: true, isLocked: false, commit: "abc" },
            { path: "/repo/.worktrees/feature-1", branch: "feature-1", isMain: false, isLocked: false, commit: "def" }
        ];
        vi.mocked(git.listWorktrees).mockResolvedValue(mockWorktrees);

        const result = await git.getWorktreeByName("feature-1");
        
        expect(result).toEqual(mockWorktrees[1]);
    });

    it("should find worktree by directory name", async () => {
        const mockWorktrees = [
            { path: "/repo", branch: "main", isMain: true, isLocked: false, commit: "abc" },
            { path: "/repo/.worktrees/my-feature", branch: "feature/xyz", isMain: false, isLocked: false, commit: "def" }
        ];
        vi.mocked(git.listWorktrees).mockResolvedValue(mockWorktrees);

        const result = await git.getWorktreeByName("my-feature");
        
        expect(result).toEqual(mockWorktrees[1]);
    });

    it("should return null if worktree not found", async () => {
        vi.mocked(git.listWorktrees).mockResolvedValue([]);

        const result = await git.getWorktreeByName("nonexistent");
        
        expect(result).toBeNull();
    });
});
```

## Phase 2: Safety Checks Implementation (Steps 4-9)

### Step 4: Implement Basic Git Status Checks

**Goal**: Add methods to check for untracked, modified, and staged files

**Implementation** - Add to `src/core/git.ts`:
```typescript
/**
 * Check if a worktree has untracked files
 */
async hasUntrackedFiles(worktreePath: string): Promise<boolean> {
    try {
        const gitInWorktree = new Git(worktreePath);
        const status = await gitInWorktree.git.status(["--porcelain"]);
        
        // Look for lines starting with "??"
        return status.split("\n").some(line => line.startsWith("??"));
    } catch (error) {
        throw new GitError(`Failed to check untracked files: ${getErrorMessage(error)}`);
    }
}

/**
 * Check if a worktree has uncommitted changes
 */
async hasUncommittedChanges(worktreePath: string): Promise<boolean> {
    try {
        const gitInWorktree = new Git(worktreePath);
        const status = await gitInWorktree.git.status(["--porcelain"]);
        
        // Look for modified or deleted files (second character is M or D)
        return status.split("\n").some(line => {
            if (line.length < 2) return false;
            const secondChar = line[1];
            return secondChar === "M" || secondChar === "D";
        });
    } catch (error) {
        throw new GitError(`Failed to check uncommitted changes: ${getErrorMessage(error)}`);
    }
}

/**
 * Check if a worktree has staged changes
 */
async hasStagedChanges(worktreePath: string): Promise<boolean> {
    try {
        const gitInWorktree = new Git(worktreePath);
        const status = await gitInWorktree.git.status(["--porcelain"]);
        
        // Look for staged files (first character is not space or ?)
        return status.split("\n").some(line => {
            if (line.length === 0) return false;
            const firstChar = line[0];
            return firstChar !== " " && firstChar !== "?";
        });
    } catch (error) {
        throw new GitError(`Failed to check staged changes: ${getErrorMessage(error)}`);
    }
}
```

**Tests** - Create `test/unit/core/git-status.test.ts`:
```typescript
describe("Git Status Checks", () => {
    describe("hasUntrackedFiles", () => {
        it("should return true when untracked files exist", async () => {
            const mockStatus = "?? untracked.txt\n";
            vi.mocked(simpleGit().status).mockResolvedValue({ files: [], current: "main" });
            vi.mocked(simpleGit().raw).mockResolvedValue(mockStatus);

            const result = await git.hasUntrackedFiles("/path/to/worktree");
            
            expect(result).toBe(true);
        });

        it("should return false when no untracked files", async () => {
            const mockStatus = " M modified.txt\n";
            vi.mocked(simpleGit().raw).mockResolvedValue(mockStatus);

            const result = await git.hasUntrackedFiles("/path/to/worktree");
            
            expect(result).toBe(false);
        });
    });

    describe("hasUncommittedChanges", () => {
        it("should return true for modified files", async () => {
            const mockStatus = " M modified.txt\n";
            vi.mocked(simpleGit().raw).mockResolvedValue(mockStatus);

            const result = await git.hasUncommittedChanges("/path/to/worktree");
            
            expect(result).toBe(true);
        });

        it("should return true for deleted files", async () => {
            const mockStatus = " D deleted.txt\n";
            vi.mocked(simpleGit().raw).mockResolvedValue(mockStatus);

            const result = await git.hasUncommittedChanges("/path/to/worktree");
            
            expect(result).toBe(true);
        });
    });

    describe("hasStagedChanges", () => {
        it("should return true for staged additions", async () => {
            const mockStatus = "A  new-file.txt\n";
            vi.mocked(simpleGit().raw).mockResolvedValue(mockStatus);

            const result = await git.hasStagedChanges("/path/to/worktree");
            
            expect(result).toBe(true);
        });

        it("should return false when no staged changes", async () => {
            const mockStatus = "?? untracked.txt\n M modified.txt\n";
            vi.mocked(simpleGit().raw).mockResolvedValue(mockStatus);

            const result = await git.hasStagedChanges("/path/to/worktree");
            
            expect(result).toBe(false);
        });
    });
});
```

### Step 5: Implement Unmerged Commits Check

**Goal**: Check if branch has commits not merged into main

**Implementation** - Add to `src/core/git.ts`:
```typescript
/**
 * Check if a branch has unmerged commits relative to main
 */
async hasUnmergedCommits(branch: string, mainBranch: string): Promise<boolean> {
    try {
        // Use rev-list to find commits in branch but not in main
        const result = await this.git.raw([
            "rev-list",
            `${mainBranch}..${branch}`,
            "--count"
        ]);
        
        const count = parseInt(result.trim(), 10);
        return count > 0;
    } catch (error) {
        // If branches don't exist, consider it as having unmerged commits
        return true;
    }
}
```

**Tests** - Add to git tests:
```typescript
describe("hasUnmergedCommits", () => {
    it("should return true when branch has unmerged commits", async () => {
        vi.mocked(simpleGit().raw).mockResolvedValue("3\n");

        const result = await git.hasUnmergedCommits("feature", "main");
        
        expect(result).toBe(true);
    });

    it("should return false when branch is fully merged", async () => {
        vi.mocked(simpleGit().raw).mockResolvedValue("0\n");

        const result = await git.hasUnmergedCommits("feature", "main");
        
        expect(result).toBe(false);
    });

    it("should return true on error", async () => {
        vi.mocked(simpleGit().raw).mockRejectedValue(new Error("Branch not found"));

        const result = await git.hasUnmergedCommits("nonexistent", "main");
        
        expect(result).toBe(true);
    });
});
```

### Step 6: Implement Stashed Changes Check

**Goal**: Check if branch has stashed changes

**Implementation** - Add to `src/core/git.ts`:
```typescript
/**
 * Check if a branch has stashed changes
 */
async hasStashedChanges(branch: string): Promise<boolean> {
    try {
        const stashList = await this.git.stashList();
        
        // Check if any stash message references this branch
        return stashList.all.some(stash => {
            const message = stash.message || "";
            // Match patterns like "WIP on branch:" or "On branch:"
            return message.includes(`on ${branch}:`) || 
                   message.includes(`On ${branch}:`);
        });
    } catch (error) {
        // If we can't check stashes, assume there are none
        return false;
    }
}
```

**Tests**:
```typescript
describe("hasStashedChanges", () => {
    it("should return true when branch has stashes", async () => {
        const mockStashList = {
            all: [
                { message: "WIP on feature-1: implementing feature" },
                { message: "On main: quick fix" }
            ]
        };
        vi.mocked(simpleGit().stashList).mockResolvedValue(mockStashList);

        const result = await git.hasStashedChanges("feature-1");
        
        expect(result).toBe(true);
    });

    it("should return false when branch has no stashes", async () => {
        const mockStashList = {
            all: [
                { message: "WIP on other-branch: something" }
            ]
        };
        vi.mocked(simpleGit().stashList).mockResolvedValue(mockStashList);

        const result = await git.hasStashedChanges("feature-1");
        
        expect(result).toBe(false);
    });
});
```

### Step 7: Implement Submodule Modifications Check

**Goal**: Check if worktree has submodule modifications

**Implementation** - Add to `src/core/git.ts`:
```typescript
/**
 * Check if a worktree has submodule modifications
 */
async hasSubmoduleModifications(worktreePath: string): Promise<boolean> {
    try {
        const gitInWorktree = new Git(worktreePath);
        
        // First check if there are any submodules
        const submodules = await gitInWorktree.git.raw(["submodule", "status"]);
        if (!submodules.trim()) {
            return false; // No submodules
        }
        
        // Check for modified (+) or uninitialized (-) submodules
        const hasModifications = submodules.split("\n").some(line => {
            if (!line.trim()) return false;
            const firstChar = line[0];
            return firstChar === "+" || firstChar === "-";
        });
        
        if (hasModifications) return true;
        
        // Also check within each submodule for uncommitted changes
        const submoduleStatus = await gitInWorktree.git.raw([
            "submodule", "foreach", "--quiet",
            "git status --porcelain"
        ]);
        
        return submoduleStatus.trim().length > 0;
    } catch (error) {
        // If submodule commands fail, assume no modifications
        return false;
    }
}
```

**Tests**:
```typescript
describe("hasSubmoduleModifications", () => {
    it("should return true for modified submodules", async () => {
        const mockSubmoduleStatus = "+abc123 submodule1 (modified content)\n";
        vi.mocked(simpleGit().raw)
            .mockResolvedValueOnce(mockSubmoduleStatus)
            .mockResolvedValueOnce("");

        const result = await git.hasSubmoduleModifications("/path");
        
        expect(result).toBe(true);
    });

    it("should return true for uncommitted changes in submodules", async () => {
        const mockSubmoduleStatus = " abc123 submodule1\n";
        const mockForeachStatus = " M file.txt\n";
        vi.mocked(simpleGit().raw)
            .mockResolvedValueOnce(mockSubmoduleStatus)
            .mockResolvedValueOnce(mockForeachStatus);

        const result = await git.hasSubmoduleModifications("/path");
        
        expect(result).toBe(true);
    });

    it("should return false when no submodules", async () => {
        vi.mocked(simpleGit().raw).mockResolvedValueOnce("");

        const result = await git.hasSubmoduleModifications("/path");
        
        expect(result).toBe(false);
    });
});
```

### Step 8: Implement Remove Worktree Method

**Goal**: Add method to remove worktrees using git

**Implementation** - Add to `src/core/git.ts`:
```typescript
/**
 * Remove a worktree
 */
async removeWorktree(path: string, force: boolean = false): Promise<void> {
    try {
        const args = ["worktree", "remove"];
        if (force) {
            args.push("--force");
        }
        args.push(path);
        
        await this.git.raw(args);
    } catch (error) {
        throw new GitError(`Failed to remove worktree: ${getErrorMessage(error)}`);
    }
}
```

**Tests**:
```typescript
describe("removeWorktree", () => {
    it("should remove worktree normally", async () => {
        await git.removeWorktree("/path/to/worktree");
        
        expect(simpleGit().raw).toHaveBeenCalledWith([
            "worktree", "remove", "/path/to/worktree"
        ]);
    });

    it("should force remove when requested", async () => {
        await git.removeWorktree("/path/to/worktree", true);
        
        expect(simpleGit().raw).toHaveBeenCalledWith([
            "worktree", "remove", "--force", "/path/to/worktree"
        ]);
    });
});
```

### Step 9: Integrate Safety Checks into Remove Command

**Goal**: Update RemoveCommand to use all safety checks

**Implementation** - Update `executeCommand` in `RemoveCommand`:
```typescript
protected async executeCommand(
    options: RemoveOptions,
    context: CommandContext
): Promise<void> {
    const { logger, git, config } = context;
    
    if (options.prune) {
        await this.executePrune(context);
        return;
    }
    
    const removedWorktrees: string[] = [];
    const failedWorktrees: Array<{ name: string; reason: string }> = [];
    
    for (const worktreeName of options.worktrees) {
        try {
            const worktree = await git.getWorktreeByName(worktreeName);
            
            if (!worktree) {
                failedWorktrees.push({
                    name: worktreeName,
                    reason: "worktree not found"
                });
                continue;
            }
            
            if (worktree.isMain) {
                failedWorktrees.push({
                    name: worktreeName,
                    reason: "cannot remove main worktree"
                });
                continue;
            }
            
            if (worktree.isLocked) {
                failedWorktrees.push({
                    name: worktreeName,
                    reason: "worktree is locked"
                });
                continue;
            }
            
            // Run safety checks unless force mode
            if (!options.force) {
                const checkResult = await this.runSafetyChecks(worktree, git);
                if (!checkResult.passed) {
                    failedWorktrees.push({
                        name: worktreeName,
                        reason: checkResult.reason!
                    });
                    continue;
                }
            }
            
            // Remove the worktree
            await git.removeWorktree(worktree.path, options.force);
            removedWorktrees.push(worktreeName);
            
        } catch (error) {
            failedWorktrees.push({
                name: worktreeName,
                reason: getErrorMessage(error)
            });
        }
    }
    
    // Report results
    this.reportResults(removedWorktrees, failedWorktrees, logger);
}

private async runSafetyChecks(
    worktree: WorktreeInfo,
    git: Git
): Promise<{ passed: boolean; reason?: string }> {
    // Check for untracked files
    if (await git.hasUntrackedFiles(worktree.path)) {
        return { passed: false, reason: "worktree has untracked files" };
    }
    
    // Check for uncommitted changes
    if (await git.hasUncommittedChanges(worktree.path)) {
        return { passed: false, reason: "worktree has uncommitted changes" };
    }
    
    // Check for staged changes
    if (await git.hasStagedChanges(worktree.path)) {
        return { passed: false, reason: "worktree has staged changes" };
    }
    
    // Check for unmerged commits
    const mainBranch = await git.getMainBranch();
    if (await git.hasUnmergedCommits(worktree.branch, mainBranch)) {
        return { passed: false, reason: "branch has unmerged commits" };
    }
    
    // Check for stashed changes
    if (await git.hasStashedChanges(worktree.branch)) {
        return { passed: false, reason: "branch has stashed changes" };
    }
    
    // Check for submodule modifications
    if (await git.hasSubmoduleModifications(worktree.path)) {
        return { passed: false, reason: "worktree has submodule modifications" };
    }
    
    return { passed: true };
}

private reportResults(
    removed: string[],
    failed: Array<{ name: string; reason: string }>,
    logger: Logger
): void {
    // Report failures
    for (const failure of failed) {
        logger.error(`Cannot remove '${failure.name}': ${failure.reason}`);
    }
    
    // Report successes
    if (removed.length === 0) {
        return;
    }
    
    if (removed.length === 1) {
        logger.success(`Removed worktree: ${removed[0]}`);
    } else {
        logger.success(`Removed ${removed.length} worktrees: ${removed.join(", ")}`);
    }
}
```

**Integration Tests** - Create `test/integration/commands/remove.test.ts`:
```typescript
describe("Remove Command Integration", () => {
    it("should remove clean worktree", async () => {
        // Setup test repo with clean worktree
        const { repo, worktreePath } = await createTestWorktree("feature-1");
        
        // Run remove command
        await runCommand(["remove", "feature-1"]);
        
        // Verify worktree was removed
        expect(fs.existsSync(worktreePath)).toBe(false);
    });
    
    it("should fail with untracked files", async () => {
        // Setup test repo with untracked files
        const { repo, worktreePath } = await createTestWorktree("feature-1");
        fs.writeFileSync(path.join(worktreePath, "untracked.txt"), "content");
        
        // Run remove command
        const result = await runCommand(["remove", "feature-1"]);
        
        // Verify worktree was not removed
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("worktree has untracked files");
        expect(fs.existsSync(worktreePath)).toBe(true);
    });
    
    it("should force remove with --force", async () => {
        // Setup test repo with modifications
        const { repo, worktreePath } = await createTestWorktree("feature-1");
        fs.writeFileSync(path.join(worktreePath, "untracked.txt"), "content");
        
        // Run remove command with force
        await runCommand(["remove", "--force", "feature-1"]);
        
        // Verify worktree was removed
        expect(fs.existsSync(worktreePath)).toBe(false);
    });
});
```

## Phase 3: Tmux and Process Management (Steps 10-12)

### Step 10: Implement Tmux Window Cleanup

**Goal**: Add functions to detect and close tmux windows

**Implementation** - Create `src/platform/tmux-cleanup.ts`:
```typescript
import { execFile } from "child_process";
import { promisify } from "util";
import { sanitizeTmuxName } from "./tmux.js";

const execFileAsync = promisify(execFile);

/**
 * Get list of tmux windows for a worktree
 */
export async function getTmuxWindowsForWorktree(
    sessionName: string,
    worktreeName: string
): Promise<string[]> {
    try {
        const sanitizedSession = sanitizeTmuxName(sessionName);
        const sanitizedWorktree = sanitizeTmuxName(worktreeName);
        
        // List all windows in the session
        const { stdout } = await execFileAsync("tmux", [
            "list-windows",
            "-t", sanitizedSession,
            "-F", "#{window_name}:#{window_id}"
        ]);
        
        const windows = stdout.trim().split("\n")
            .filter(line => {
                const [name] = line.split(":");
                return name === sanitizedWorktree;
            })
            .map(line => line.split(":")[1]);
        
        return windows;
    } catch {
        // Session might not exist
        return [];
    }
}

/**
 * Find and close tmux windows associated with a worktree
 */
export async function closeTmuxWindowsForWorktree(
    projectName: string,
    worktreeName: string
): Promise<void> {
    try {
        const windows = await getTmuxWindowsForWorktree(projectName, worktreeName);
        
        for (const windowId of windows) {
            try {
                // Kill the window
                await execFileAsync("tmux", [
                    "kill-window",
                    "-t", windowId
                ]);
            } catch {
                // Window might have already been closed
            }
        }
    } catch (error) {
        // Log but don't fail the removal
        console.warn(`Failed to close tmux windows: ${error}`);
    }
}
```

**Tests**:
```typescript
describe("Tmux Cleanup", () => {
    describe("getTmuxWindowsForWorktree", () => {
        it("should find matching windows", async () => {
            const mockOutput = "feature-1:@0\nmain:@1\nfeature-1:@2\n";
            vi.mocked(execFile).mockImplementation((cmd, args, cb) => {
                cb(null, { stdout: mockOutput, stderr: "" });
            });
            
            const windows = await getTmuxWindowsForWorktree("project", "feature-1");
            
            expect(windows).toEqual(["@0", "@2"]);
        });
    });
    
    describe("closeTmuxWindowsForWorktree", () => {
        it("should close all matching windows", async () => {
            const mockWindows = ["@0", "@2"];
            vi.mocked(getTmuxWindowsForWorktree).mockResolvedValue(mockWindows);
            
            await closeTmuxWindowsForWorktree("project", "feature-1");
            
            expect(execFile).toHaveBeenCalledWith("tmux", ["kill-window", "-t", "@0"]);
            expect(execFile).toHaveBeenCalledWith("tmux", ["kill-window", "-t", "@2"]);
        });
    });
});
```

### Step 11: Implement Shell Process Cleanup

**Goal**: Add functions to detect and terminate shell processes

**Implementation** - Create `src/platform/process-cleanup.ts`:
```typescript
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

/**
 * Get list of shell processes with working directory in the worktree
 */
export async function getShellProcessesInDirectory(
    directory: string
): Promise<number[]> {
    try {
        // Use lsof to find processes with cwd in the directory
        const { stdout } = await execAsync(
            `lsof -a -d cwd -c bash -c zsh -c sh +D "${directory}" 2>/dev/null | tail -n +2 | awk '{print $2}' | sort -u`
        );
        
        return stdout.trim()
            .split("\n")
            .filter(pid => pid.length > 0)
            .map(pid => parseInt(pid, 10))
            .filter(pid => !isNaN(pid));
    } catch {
        // lsof might not be available or fail
        return [];
    }
}

/**
 * Find and terminate shell processes in a worktree directory
 */
export async function terminateShellProcessesInDirectory(
    directory: string
): Promise<void> {
    try {
        const pids = await getShellProcessesInDirectory(directory);
        
        for (const pid of pids) {
            try {
                // Skip current process
                if (pid === process.pid) continue;
                
                // Send SIGTERM for graceful shutdown
                process.kill(pid, "SIGTERM");
                
                // Give it a moment to terminate
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Check if still running and force kill if needed
                try {
                    process.kill(pid, 0); // Check if process exists
                    process.kill(pid, "SIGKILL"); // Force kill
                } catch {
                    // Process already terminated
                }
            } catch {
                // Process might have already terminated
            }
        }
    } catch (error) {
        // Log but don't fail the removal
        console.warn(`Failed to terminate shell processes: ${error}`);
    }
}

/**
 * Check if current process is in a worktree directory
 */
export function isCurrentProcessInWorktree(
    worktreePath: string
): boolean {
    const normalizedWorktree = path.resolve(worktreePath);
    const normalizedCwd = path.resolve(process.cwd());
    
    return normalizedCwd.startsWith(normalizedWorktree);
}

/**
 * Change current directory to main worktree
 */
export async function changeToMainWorktree(
    mainWorktreePath: string
): Promise<void> {
    try {
        process.chdir(mainWorktreePath);
    } catch (error) {
        console.warn(`Failed to change directory: ${error}`);
    }
}
```

**Tests**:
```typescript
describe("Process Cleanup", () => {
    describe("getShellProcessesInDirectory", () => {
        it("should parse lsof output correctly", async () => {
            const mockOutput = "bash    1234  user  cwd    DIR  /path\nzsh    5678  user  cwd    DIR  /path\n";
            vi.mocked(exec).mockImplementation((cmd, cb) => {
                cb(null, { stdout: "1234\n5678\n", stderr: "" });
            });
            
            const pids = await getShellProcessesInDirectory("/path");
            
            expect(pids).toEqual([1234, 5678]);
        });
    });
    
    describe("isCurrentProcessInWorktree", () => {
        it("should return true when cwd is in worktree", () => {
            const originalCwd = process.cwd();
            process.chdir("/repo/.worktrees/feature");
            
            const result = isCurrentProcessInWorktree("/repo/.worktrees/feature");
            
            expect(result).toBe(true);
            process.chdir(originalCwd);
        });
        
        it("should return false when cwd is outside worktree", () => {
            const result = isCurrentProcessInWorktree("/repo/.worktrees/feature");
            
            expect(result).toBe(false);
        });
    });
});
```

### Step 12: Integrate Cleanup into Remove Command

**Goal**: Update remove command to use tmux and process cleanup

**Implementation** - Update `executeCommand` to include cleanup:
```typescript
// Add imports
import { closeTmuxWindowsForWorktree } from "../platform/tmux-cleanup.js";
import { 
    terminateShellProcessesInDirectory,
    isCurrentProcessInWorktree,
    changeToMainWorktree
} from "../platform/process-cleanup.js";

// Update executeCommand - add before git.removeWorktree:
// Check if we're removing the current directory
if (isCurrentProcessInWorktree(worktree.path)) {
    const mainWorktree = await git.getMainWorktree();
    await changeToMainWorktree(mainWorktree.path);
    logger.verbose("Changed to main worktree before removal");
}

// Close tmux windows
if (config?.tmux && config?.projectName) {
    await closeTmuxWindowsForWorktree(
        config.projectName,
        worktreeName
    );
    logger.verbose("Closed tmux windows");
}

// Terminate shell processes
await terminateShellProcessesInDirectory(worktree.path);
logger.verbose("Terminated shell processes");

// Now remove the worktree
await git.removeWorktree(worktree.path, options.force);
```

## Phase 4: Prune Mode Implementation (Steps 13-14)

### Step 13: Implement Prune Mode

**Goal**: Add logic to find and remove fully merged worktrees

**Implementation** - Add to `RemoveCommand`:
```typescript
private async executePrune(context: CommandContext): Promise<void> {
    const { logger, git } = context;
    
    logger.verbose("Finding fully merged worktrees...");
    
    const worktrees = await git.listWorktrees();
    const mainBranch = await git.getMainBranch();
    const mainWorktree = worktrees.find(w => w.isMain);
    
    if (!mainWorktree) {
        throw new Error("Could not find main worktree");
    }
    
    const pruneCandidates: WorktreeInfo[] = [];
    
    // Check each non-main worktree
    for (const worktree of worktrees) {
        if (worktree.isMain || worktree.isLocked) continue;
        
        // Check if fully merged
        const hasUnmerged = await git.hasUnmergedCommits(
            worktree.branch,
            mainBranch
        );
        
        if (!hasUnmerged) {
            pruneCandidates.push(worktree);
        }
    }
    
    if (pruneCandidates.length === 0) {
        logger.info("No fully merged worktrees to prune");
        return;
    }
    
    logger.verbose(`Found ${pruneCandidates.length} worktrees to prune`);
    
    // Remove each candidate
    const removed: string[] = [];
    for (const worktree of pruneCandidates) {
        const checkResult = await this.runSafetyChecks(worktree, git);
        
        if (checkResult.passed) {
            // Run cleanup and removal
            await this.cleanupAndRemove(worktree, context);
            removed.push(worktree.branch);
        } else {
            logger.verbose(
                `Skipping ${worktree.branch}: ${checkResult.reason}`
            );
        }
    }
    
    // Report results
    if (removed.length === 0) {
        logger.info("No worktrees pruned (all had pending changes)");
    } else {
        logger.success(`Pruned ${removed.length} merged worktrees`);
    }
}

private async cleanupAndRemove(
    worktree: WorktreeInfo,
    context: CommandContext
): Promise<void> {
    const { logger, git, config } = context;
    
    // Directory change if needed
    if (isCurrentProcessInWorktree(worktree.path)) {
        const mainWorktree = await git.getMainWorktree();
        await changeToMainWorktree(mainWorktree.path);
    }
    
    // Tmux cleanup
    if (config?.tmux && config?.projectName) {
        await closeTmuxWindowsForWorktree(
            config.projectName,
            worktree.branch
        );
    }
    
    // Process cleanup
    await terminateShellProcessesInDirectory(worktree.path);
    
    // Remove worktree
    await git.removeWorktree(worktree.path);
}
```

### Step 14: End-to-End Testing

**Goal**: Create comprehensive E2E tests

**Implementation** - Create `test/e2e/remove-command.test.ts`:
```typescript
describe("Remove Command E2E", () => {
    it("should handle full workflow", async () => {
        // Create test repository with multiple worktrees
        const repo = await createTestRepository();
        await createWorktree(repo, "feature-1");
        await createWorktree(repo, "feature-2");
        await createWorktree(repo, "feature-3");
        
        // Make feature-1 have untracked files
        fs.writeFileSync(
            path.join(repo.path, ".worktrees/feature-1/untracked.txt"),
            "content"
        );
        
        // Merge feature-2 into main
        await mergeIntoMain(repo, "feature-2");
        
        // Test normal removal fails for feature-1
        let result = await runWtt(repo, ["remove", "feature-1"]);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("untracked files");
        
        // Test force removal works
        result = await runWtt(repo, ["remove", "--force", "feature-1"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Removed worktree: feature-1");
        
        // Test prune mode
        result = await runWtt(repo, ["remove", "--prune"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Pruned 1 merged worktrees");
        
        // Verify only feature-3 remains
        const remainingWorktrees = await getWorktrees(repo);
        expect(remainingWorktrees).toHaveLength(2); // main + feature-3
    });
});
```

## Testing and Verification Plan

### After Each Step:
1. Run unit tests: `npm test -- <test-file>`
2. Run integration tests: `npm run test:integration`
3. Manual verification: Test the command manually

### Manual Test Commands:
```bash
# Step 1: Basic command
wtt remove feature-1

# Step 4-9: Safety checks
wtt remove clean-worktree
wtt remove dirty-worktree  # Should fail
wtt remove --force dirty-worktree  # Should succeed

# Step 10-12: Cleanup
# Create worktree with tmux window open
wtt create test-cleanup
wtt remove test-cleanup  # Should close tmux window

# Step 13: Prune
wtt remove --prune  # Remove all merged worktrees
```

## Success Criteria

Each step is complete when:
1. All unit tests pass
2. Integration tests (if any) pass
3. Manual testing confirms expected behavior
4. Code follows existing patterns and conventions
5. Error messages match design specification

## Implementation Order Summary

1. **Phase 1**: Basic command structure and validation
2. **Phase 2**: Git safety checks implementation
3. **Phase 3**: Tmux and process cleanup
4. **Phase 4**: Prune mode and final integration

This incremental approach ensures each component is tested before moving to the next, reducing the risk of bugs and making debugging easier.
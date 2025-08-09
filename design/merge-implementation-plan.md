# Merge Command Implementation Plan

## Overview

This document provides a step-by-step implementation plan for the `wtt merge` command based on the design in `merge-command.md`. Each step includes specific code changes, tests, and verification steps.

## Implementation Steps

### Step 1: Add autoRemove Property to WorktreeConfig

**Files to modify:**
- `src/core/types.ts`
- `src/core/config.ts`

**Implementation:**

1. Update the WorktreeConfig interface:
```typescript
// src/core/types.ts
export interface WorktreeConfig {
    version: string;
    projectName: string;
    mainBranch: string;
    baseDir: string;
    tmux: boolean;
    commands?: Record<string, CommandConfig>;
    autoRemove?: boolean;  // Add this line
}
```

2. Update config validation and defaults:
```typescript
// src/core/config.ts
// In validateConfig function, no changes needed as autoRemove is optional

// In any config creation/initialization, ensure autoRemove defaults to false
const defaultConfig: Partial<WorktreeConfig> = {
    autoRemove: false,
    // ... other defaults
};
```

**Tests:**
```typescript
// test/unit/core/config.test.ts
it("should accept autoRemove property", () => {
    const config: WorktreeConfig = {
        version: "1.0",
        projectName: "test",
        mainBranch: "main",
        baseDir: "/path",
        tmux: false,
        autoRemove: true,
    };
    expect(() => validateConfig(config)).not.toThrow();
});

it("should default autoRemove to false if not specified", () => {
    const config = loadConfig(); // or similar
    expect(config.autoRemove).toBe(false);
});
```

**Verification:**
```bash
npm run lint
npm test -- config.test.ts
```

### Step 2: Create MergeOptions Interface

**Files to create/modify:**
- `src/commands/merge.ts`

**Implementation:**

```typescript
// src/commands/merge.ts
import {GlobalOptions} from "../core/types.js";

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
```

**Tests:**
```typescript
// test/unit/commands/merge.test.ts
import {MergeOptions} from "../../../src/commands/merge.js";

describe("MergeOptions", () => {
    it("should define correct option types", () => {
        const options: MergeOptions = {
            update: true,
            noFetch: false,
            force: false,
            worktree: "feature1",
            verbose: true,
            quiet: false,
        };
        expect(options).toBeDefined();
    });
});
```

### Step 3: Create Basic MergeCommand Class

**Files to modify:**
- `src/commands/merge.ts`

**Implementation:**

```typescript
// src/commands/merge.ts
import {Command} from "commander";
import {BaseCommand, CommandContext} from "./base.js";
import {GlobalOptions} from "../core/types.js";
import {validateWorktreeName} from "../utils/validation.js";

export interface MergeOptions extends GlobalOptions {
    update?: boolean;
    noFetch?: boolean;
    force?: boolean;
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
        
        // TODO: Implement merge logic
        logger.info("Merge command not yet implemented");
    }
}
```

**Tests:**
```typescript
// test/unit/commands/merge.test.ts
import {vi} from "vitest";
import {MergeCommand} from "../../../src/commands/merge.js";

describe("MergeCommand", () => {
    it("should require config", () => {
        const command = new MergeCommand();
        expect(command["requiresConfig"]()).toBe(true);
    });

    it("should require git repo", () => {
        const command = new MergeCommand();
        expect(command["requiresGitRepo"]()).toBe(true);
    });

    it("should validate worktree name", () => {
        const command = new MergeCommand();
        expect(() => {
            command["validateOptions"]({worktree: "invalid/name"});
        }).toThrow();
    });
});
```

### Step 4: Add Git Helper Methods

**Files to modify:**
- `src/core/git.ts`

**Implementation:**

```typescript
// src/core/git.ts
// Add these methods to the Git class

/**
 * Get current branch name
 */
async getCurrentBranch(): Promise<string> {
    const result = await this.exec(["rev-parse", "--abbrev-ref", "HEAD"]);
    return result.trim();
}

/**
 * Check if a merge resulted in conflicts
 */
async hasMergeConflicts(): Promise<boolean> {
    try {
        const result = await this.exec(["diff", "--name-only", "--diff-filter=U"]);
        return result.trim().length > 0;
    } catch {
        return false;
    }
}

/**
 * Get list of conflicted files
 */
async getConflictedFiles(): Promise<string[]> {
    const result = await this.exec(["diff", "--name-only", "--diff-filter=U"]);
    return result.trim().split("\n").filter(Boolean);
}

/**
 * Perform a merge
 */
async merge(branch: string, message?: string): Promise<{success: boolean; conflicts: boolean}> {
    try {
        const args = ["merge", "--no-ff"];
        if (message) {
            args.push("-m", message);
        }
        args.push(branch);
        
        await this.exec(args);
        return {success: true, conflicts: false};
    } catch (error) {
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
    await this.exec(["fetch", "--all"]);
}
```

**Tests:**
```typescript
// test/unit/core/git.test.ts
describe("Git merge methods", () => {
    it("should get current branch", async () => {
        const git = new Git("/path");
        vi.mocked(git["exec"]).mockResolvedValue("feature1\n");
        
        const branch = await git.getCurrentBranch();
        expect(branch).toBe("feature1");
    });

    it("should detect merge conflicts", async () => {
        const git = new Git("/path");
        vi.mocked(git["exec"]).mockResolvedValue("file1.txt\nfile2.txt\n");
        
        const hasConflicts = await git.hasMergeConflicts();
        expect(hasConflicts).toBe(true);
    });

    it("should perform successful merge", async () => {
        const git = new Git("/path");
        vi.mocked(git["exec"]).mockResolvedValue("");
        
        const result = await git.merge("feature1");
        expect(result).toEqual({success: true, conflicts: false});
    });
});
```

### Step 5: Implement Worktree Detection

**Files to modify:**
- `src/commands/merge.ts`

**Implementation:**

```typescript
// Add to MergeCommand class

private async getTargetWorktree(
    options: MergeOptions,
    context: CommandContext,
): Promise<{name: string; info: WorktreeInfo}> {
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
```

**Tests:**
```typescript
// test/unit/commands/merge.test.ts
it("should detect current worktree", async () => {
    const command = new MergeCommand();
    const mockGit = {
        listWorktrees: vi.fn().mockResolvedValue([
            {path: "/main", isMain: true},
            {path: "/worktrees/feature1", isMain: false, branch: "feature1"},
        ]),
    };
    
    // Mock process.cwd
    vi.spyOn(process, "cwd").mockReturnValue("/worktrees/feature1");
    
    const result = await command["getTargetWorktree"]({}, {git: mockGit});
    expect(result.name).toBe("feature1");
});

it("should throw if in main worktree", async () => {
    const command = new MergeCommand();
    const mockGit = {
        listWorktrees: vi.fn().mockResolvedValue([
            {path: "/main", isMain: true},
        ]),
    };
    
    vi.spyOn(process, "cwd").mockReturnValue("/main");
    
    await expect(command["getTargetWorktree"]({}, {git: mockGit}))
        .rejects.toThrow("Not in a worktree");
});
```

### Step 6: Implement Standard Merge (worktree → main)

**Files to modify:**
- `src/commands/merge.ts`

**Implementation:**

```typescript
// Add to MergeCommand class

private async performStandardMerge(
    worktreeName: string,
    worktreeInfo: WorktreeInfo,
    options: MergeOptions,
    context: CommandContext,
): Promise<void> {
    const {logger, git, config} = context;
    
    // Get main worktree info
    const mainWorktree = await git.getMainWorktree();
    if (!mainWorktree) {
        throw new Error("Could not find main worktree");
    }
    
    // Change to main worktree
    process.chdir(mainWorktree.path);
    logger.verbose("Changed to main worktree");
    
    // Check for uncommitted changes
    if (!options.force && await git.hasUncommittedChanges(mainWorktree.path)) {
        throw new Error("Uncommitted changes in main worktree. Commit or stash changes first.");
    }
    
    // Fetch if not disabled
    if (!options.noFetch) {
        logger.verbose("Fetching latest changes");
        await git.fetch();
    }
    
    // Extract branch name
    const branchName = worktreeInfo.branch.replace(/^refs\/heads\//, "");
    
    // Perform merge
    logger.verbose(`Merging ${branchName} into ${config.mainBranch}`);
    const mergeResult = await git.merge(
        branchName,
        `Merge worktree '${worktreeName}'`,
    );
    
    if (mergeResult.success) {
        logger.success(`✓ Merged '${worktreeName}' into ${config.mainBranch}`);
        
        // Check autoRemove
        if (config.autoRemove) {
            await this.autoRemoveWorktree(worktreeName, context);
        }
    } else if (mergeResult.conflicts) {
        // Get first conflicted file
        const conflicts = await git.getConflictedFiles();
        if (conflicts.length > 0) {
            logger.error(`Merge conflict in: ${conflicts[0]}`);
        } else {
            logger.error("Merge resulted in conflicts");
        }
    }
}

private async autoRemoveWorktree(
    worktreeName: string,
    context: CommandContext,
): Promise<void> {
    const {logger} = context;
    
    try {
        // Use RemoveCommand
        const RemoveCommand = (await import("./remove.js")).RemoveCommand;
        const removeCommand = new RemoveCommand();
        
        await removeCommand.execute({
            worktrees: [worktreeName],
            force: false,
        });
        
        logger.success(`✓ Removed worktree '${worktreeName}'`);
    } catch (error) {
        logger.warn(`Warning: Could not remove worktree automatically. Run 'wtt remove ${worktreeName}' manually.`);
        logger.verbose(`Auto-remove error: ${String(error)}`);
    }
}
```

**Tests:**
```typescript
it("should perform successful standard merge", async () => {
    const command = new MergeCommand();
    const mockContext = createMockContext();
    
    mockContext.git.getMainWorktree.mockResolvedValue({path: "/main"});
    mockContext.git.hasUncommittedChanges.mockResolvedValue(false);
    mockContext.git.merge.mockResolvedValue({success: true, conflicts: false});
    
    await command["performStandardMerge"](
        "feature1",
        {branch: "refs/heads/feature1"},
        {},
        mockContext,
    );
    
    expect(mockContext.logger.success).toHaveBeenCalledWith(
        "✓ Merged 'feature1' into main"
    );
});

it("should handle merge conflicts", async () => {
    const command = new MergeCommand();
    const mockContext = createMockContext();
    
    mockContext.git.merge.mockResolvedValue({success: false, conflicts: true});
    mockContext.git.getConflictedFiles.mockResolvedValue(["src/file.ts"]);
    
    await command["performStandardMerge"]("feature1", {}, {}, mockContext);
    
    expect(mockContext.logger.error).toHaveBeenCalledWith(
        "Merge conflict in: src/file.ts"
    );
});
```

### Step 7: Implement Update Merge (main → worktree)

**Files to modify:**
- `src/commands/merge.ts`

**Implementation:**

```typescript
// Add to MergeCommand class

private async performUpdateMerge(
    worktreeName: string,
    worktreeInfo: WorktreeInfo,
    options: MergeOptions,
    context: CommandContext,
): Promise<void> {
    const {logger, git, config} = context;
    
    // Change to target worktree
    process.chdir(worktreeInfo.path);
    logger.verbose(`Changed to worktree '${worktreeName}'`);
    
    // Check for uncommitted changes
    if (!options.force && await git.hasUncommittedChanges(worktreeInfo.path)) {
        throw new Error(`Uncommitted changes in worktree '${worktreeName}'. Commit or stash changes first.`);
    }
    
    // Fetch if not disabled
    if (!options.noFetch) {
        logger.verbose("Fetching latest changes");
        await git.fetch();
    }
    
    // Perform merge from main
    logger.verbose(`Merging ${config.mainBranch} into ${worktreeName}`);
    const mergeResult = await git.merge(
        config.mainBranch,
        `Update from ${config.mainBranch}`,
    );
    
    if (mergeResult.success) {
        logger.success(`✓ Updated '${worktreeName}' with latest from ${config.mainBranch}`);
    } else if (mergeResult.conflicts) {
        // Get first conflicted file
        const conflicts = await git.getConflictedFiles();
        if (conflicts.length > 0) {
            logger.error(`Merge conflict in: ${conflicts[0]}`);
        } else {
            logger.error("Merge resulted in conflicts");
        }
    }
}
```

**Tests:**
```typescript
it("should perform successful update merge", async () => {
    const command = new MergeCommand();
    const mockContext = createMockContext();
    
    mockContext.git.hasUncommittedChanges.mockResolvedValue(false);
    mockContext.git.merge.mockResolvedValue({success: true, conflicts: false});
    mockContext.config.mainBranch = "main";
    
    await command["performUpdateMerge"](
        "feature1",
        {path: "/worktrees/feature1"},
        {},
        mockContext,
    );
    
    expect(mockContext.logger.success).toHaveBeenCalledWith(
        "✓ Updated 'feature1' with latest from main"
    );
});
```

### Step 8: Complete executeCommand Implementation

**Files to modify:**
- `src/commands/merge.ts`

**Implementation:**

```typescript
// Update executeCommand method

protected override async executeCommand(
    options: MergeOptions,
    context: CommandContext,
): Promise<void> {
    const {logger} = context;
    
    logger.verbose("Executing merge command");
    logger.verbose(`Update mode: ${options.update ? "true" : "false"}`);
    
    // Get target worktree
    const {name, info} = await this.getTargetWorktree(options, context);
    logger.verbose(`Target worktree: ${name}`);
    
    // Store current directory to restore later
    const originalDir = process.cwd();
    
    try {
        if (options.update) {
            // Update mode: merge main into worktree
            await this.performUpdateMerge(name, info, options, context);
        } else {
            // Standard mode: merge worktree into main
            await this.performStandardMerge(name, info, options, context);
        }
    } finally {
        // Restore original directory
        process.chdir(originalDir);
    }
}
```

### Step 9: Add Command to CLI

**Files to modify:**
- `src/commands/merge.ts`
- `src/cli/program.ts`

**Implementation:**

```typescript
// Add to end of src/commands/merge.ts

export const mergeCommand = new Command("merge")
    .description("Merge worktree changes back to main branch or update worktree from main")
    .argument("[worktree]", "name of worktree to merge (default: current worktree)")
    .option("-u, --update", "update worktree from main instead of merging to main")
    .option("--no-fetch", "skip fetching latest changes before merge")
    .option("-f, --force", "force merge even with uncommitted changes")
    .action(async (worktree: string | undefined, options: Record<string, unknown>) => {
        const mergeOptions: MergeOptions = {
            worktree,
            update: options.update as boolean,
            noFetch: options.noFetch === false,
            force: options.force as boolean,
            verbose: options.verbose as boolean,
            quiet: options.quiet as boolean,
        };
        const command = new MergeCommand();
        await command.execute(mergeOptions);
    });
```

```typescript
// src/cli/program.ts
// Add import
import {mergeCommand} from "../commands/merge.js";

// Add command
program.addCommand(mergeCommand);
```

### Step 10: Integration Tests

**Files to create:**
- `test/integration/commands/merge.test.ts`

**Implementation:**

```typescript
// test/integration/commands/merge.test.ts
import {beforeEach, describe, expect, it} from "vitest";
import {MergeCommand} from "../../../src/commands/merge.js";
import {setupTestRepo, createWorktree, commitFile} from "../../helpers/git.js";

describe("MergeCommand Integration", () => {
    let testDir: string;
    let command: MergeCommand;
    
    beforeEach(async () => {
        testDir = await setupTestRepo();
        command = new MergeCommand();
    });
    
    it("should merge worktree to main", async () => {
        // Create worktree
        await createWorktree(testDir, "feature1");
        
        // Make changes in worktree
        await commitFile(`${testDir}/.worktrees/feature1`, "test.txt", "content");
        
        // Run merge from worktree
        process.chdir(`${testDir}/.worktrees/feature1`);
        await command.execute({});
        
        // Verify merge in main
        process.chdir(testDir);
        const log = await git.exec(["log", "--oneline", "-1"]);
        expect(log).toContain("Merge worktree 'feature1'");
    });
    
    it("should update worktree from main", async () => {
        // Create worktree
        await createWorktree(testDir, "feature1");
        
        // Make changes in main
        await commitFile(testDir, "main.txt", "main content");
        
        // Run update from worktree
        process.chdir(`${testDir}/.worktrees/feature1`);
        await command.execute({update: true});
        
        // Verify file exists in worktree
        expect(fs.existsSync("main.txt")).toBe(true);
    });
    
    it("should handle merge conflicts", async () => {
        // Create conflicting changes
        await createWorktree(testDir, "feature1");
        
        // Same file, different content in main and worktree
        await commitFile(testDir, "conflict.txt", "main version");
        await commitFile(`${testDir}/.worktrees/feature1`, "conflict.txt", "feature version");
        
        // Try to merge
        process.chdir(`${testDir}/.worktrees/feature1`);
        await command.execute({});
        
        // Should report conflict
        // Check that merge was not completed
        const status = await git.exec(["status", "--porcelain"]);
        expect(status).toContain("UU conflict.txt");
    });
});
```

### Step 11: E2E Tests

**Files to create:**
- `test/e2e/merge-flow.test.ts`

**Implementation:**

```typescript
// test/e2e/merge-flow.test.ts
import {test, expect} from "vitest";
import {runCLI} from "../helpers/cli.js";

test("merge command full flow", async () => {
    const {execCommand, testDir} = await setupE2ETest();
    
    // Initialize and create worktree
    await execCommand("init");
    await execCommand("create feature1");
    
    // Make changes in worktree
    await fs.writeFile(`${testDir}/.worktrees/feature1/newfile.txt`, "content");
    await execCommand("exec feature1 -- git add .");
    await execCommand("exec feature1 -- git commit -m 'Add file'");
    
    // Merge worktree
    const result = await execCommand("merge feature1");
    expect(result.stdout).toContain("✓ Merged 'feature1' into main");
    
    // Verify file exists in main
    expect(fs.existsSync(`${testDir}/newfile.txt`)).toBe(true);
});

test("merge with auto-remove", async () => {
    const {execCommand, testDir} = await setupE2ETest();
    
    // Initialize with autoRemove
    await execCommand("init");
    
    // Update config
    const config = JSON.parse(await fs.readFile(".worktree-config.json", "utf8"));
    config.autoRemove = true;
    await fs.writeFile(".worktree-config.json", JSON.stringify(config, null, 2));
    
    // Create and merge worktree
    await execCommand("create feature1");
    await fs.writeFile(`${testDir}/.worktrees/feature1/file.txt`, "content");
    await execCommand("exec feature1 -- git add .");
    await execCommand("exec feature1 -- git commit -m 'Add file'");
    
    const result = await execCommand("merge feature1");
    expect(result.stdout).toContain("✓ Merged 'feature1' into main");
    expect(result.stdout).toContain("✓ Removed worktree 'feature1'");
    
    // Verify worktree is gone
    expect(fs.existsSync(`${testDir}/.worktrees/feature1`)).toBe(false);
});
```

## Verification Steps

After each implementation step:

1. **Run linting:**
   ```bash
   npm run lint
   ```

2. **Run unit tests for the specific module:**
   ```bash
   npm test -- <test-file-name>
   ```

3. **Run all tests after major steps:**
   ```bash
   npm test
   ```

4. **Manual testing commands:**
   ```bash
   # Test basic merge
   wtt create test-merge
   cd .worktrees/test-merge
   echo "test" > file.txt
   git add . && git commit -m "test"
   wtt merge
   
   # Test update mode
   wtt merge --update
   
   # Test with conflicts
   # Create conflicting changes and test
   ```

## Error Handling Checklist

- [ ] Validate worktree names
- [ ] Check for uncommitted changes
- [ ] Handle merge conflicts gracefully
- [ ] Restore original directory on error
- [ ] Clear error messages for all failure cases
- [ ] Handle missing worktrees
- [ ] Handle network errors during fetch

## Performance Considerations

1. **Minimize directory changes**: Store and restore cwd
2. **Batch git operations**: Combine checks where possible
3. **Skip fetch with --no-fetch**: For offline/fast operations
4. **Lazy import RemoveCommand**: Only load when needed for auto-remove

## Next Steps After Implementation

1. Update README.md with merge command documentation
2. Add merge command to help text
3. Create user documentation
4. Add to CI/CD workflows
5. Consider adding `--dry-run` option for preview
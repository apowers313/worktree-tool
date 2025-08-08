# Remove Command Design

## Overview

The `wtt remove` command provides a safe way to remove git worktrees. It enforces strict safety checks by default to prevent accidental loss of uncommitted work, but also provides a `--force` option for users who need to override these checks. Before removing a worktree, the command will automatically close any associated tmux windows and terminate any shell processes running in the worktree directory to ensure a clean removal.

## Command Interface

### Basic Usage
```bash
wtt remove <worktree1> [worktree2] [worktree3] ...
```

### Options
- `--force, -f`: Force removal of worktrees, bypassing all safety checks
- `--prune`: Remove all worktrees whose branches are fully merged into the main branch

### Examples
```bash
# Remove a single worktree (with safety checks)
wtt remove feature-branch

# Remove multiple worktrees
wtt remove feature-1 feature-2 bugfix-123

# Force remove a worktree (bypasses all safety checks)
wtt remove --force experimental-feature

# Force remove multiple worktrees
wtt remove -f old-feature broken-branch

# Remove all fully merged worktrees
wtt remove --prune
```

## Safety Checks

The command will refuse to remove a worktree unless it meets ALL of the following conditions:

1. **No untracked files**: The worktree must not contain any untracked files
2. **No modified files**: The worktree must not have any uncommitted changes
3. **No staged commits**: The worktree must not have any staged but uncommitted changes
4. **All commits merged**: All commits in the worktree's branch must be merged into the main branch
5. **No stashed changes**: The worktree's branch must not have any stashed changes
6. **No submodule modifications**: The worktree must not have any submodules with uncommitted changes

### Check Implementation Details

1. **Untracked files check**
   - Use `git status --porcelain` in the worktree directory
   - Look for lines starting with `??`

2. **Modified files check**
   - Use `git status --porcelain` in the worktree directory
   - Look for lines starting with ` M` or `M ` (modified) or ` D` or `D ` (deleted)

3. **Staged commits check**
   - Use `git status --porcelain` in the worktree directory
   - Look for lines starting with `A `, `M `, `D `, etc. (first character non-space)

4. **Unmerged commits check**
   - Get the worktree's current branch
   - Use `git rev-list <branch>...<main-branch>` to find commits not in main
   - If any commits exist, the branch has unmerged work

5. **Stashed changes check**
   - Use `git stash list` to get all stashes
   - Filter stashes that reference the worktree's branch using regex
   - Look for patterns like `stash@{n}: WIP on <branch>:` or `stash@{n}: On <branch>:`

6. **Submodule modifications check**
   - Use `git submodule status` in the worktree directory
   - Look for lines starting with `+` (modified) or `-` (uninitialized)
   - Additionally run `git submodule foreach 'git status --porcelain'` to check for uncommitted changes within submodules

## Error Messages

Error messages should be concise (single line) and clearly indicate why the worktree cannot be removed:

- `Cannot remove '<name>': worktree has untracked files`
- `Cannot remove '<name>': worktree has uncommitted changes`
- `Cannot remove '<name>': worktree has staged changes`
- `Cannot remove '<name>': branch has unmerged commits`
- `Cannot remove '<name>': branch has stashed changes`
- `Cannot remove '<name>': worktree has submodule modifications`
- `Cannot remove '<name>': worktree not found`
- `Cannot remove '<name>': worktree is locked`

## Command Flow

### Normal Mode (without --force)

1. Validate command arguments
   - Ensure at least one worktree name is provided
   - Validate worktree names

2. For each worktree specified:
   a. Check if worktree exists
   b. Check if worktree is locked (git worktree list)
   c. Change to worktree directory
   d. Run all safety checks:
      - Check for untracked files
      - Check for modified files
      - Check for staged changes
      - Check for unmerged commits
      - Check for stashed changes
      - Check for submodule modifications
   e. If all checks pass:
      - If current shell/tmux window is in the worktree being removed, change directory to main worktree
      - Close any tmux windows associated with the worktree
      - Terminate any shell processes in the worktree directory
      - Remove the worktree using `git worktree remove`
   f. If any check fails, display error and skip this worktree

3. Display success message for removed worktrees

### Force Mode (with --force)

1. Validate command arguments
   - Ensure at least one worktree name is provided
   - Validate worktree names

2. For each worktree specified:
   a. Check if worktree exists
   b. If current shell/tmux window is in the worktree being removed, change directory to main worktree
   c. Close any tmux windows associated with the worktree
   d. Terminate any shell processes in the worktree directory
   e. Force remove the worktree using `git worktree remove --force`
   f. Display success message

### Prune Mode (with --prune)

1. Get list of all worktrees (excluding main)

2. For each worktree:
   a. Check if worktree exists
   b. Check if worktree is locked
   c. Check if all commits are merged into main branch
   d. If fully merged and not locked:
      - Run all safety checks (same as normal mode)
      - If all checks pass:
        - If current shell/tmux window is in the worktree being removed, change directory to main worktree
        - Close any tmux windows associated with the worktree
        - Terminate any shell processes in the worktree directory
        - Remove the worktree using `git worktree remove`
   e. If not fully merged or any check fails, skip this worktree

3. Display summary of pruned worktrees

## Implementation Architecture

### Command Class Structure

Create `RemoveCommand` class extending `BaseCommand`:

```typescript
export class RemoveCommand extends BaseCommand<RemoveOptions> {
    protected requiresConfig(): boolean {
        return true;
    }

    protected requiresGitRepo(): boolean {
        return true;
    }

    protected validateOptions(options: RemoveOptions): void {
        // Validate at least one worktree name provided
        // Validate worktree names
    }

    protected async executeCommand(
        options: RemoveOptions,
        context: CommandContext
    ): Promise<void> {
        // Implementation
    }
}
```

### Type Definitions

```typescript
export interface RemoveOptions extends CommandOptions {
    worktrees: string[];
    force?: boolean;
    prune?: boolean;
}
```

### Git Class Extensions

Add the following methods to the `Git` class:

```typescript
/**
 * Get worktree information by name or path
 */
async getWorktreeByName(name: string): Promise<WorktreeInfo | null>

/**
 * Check if a worktree has untracked files
 */
async hasUntrackedFiles(worktreePath: string): Promise<boolean>

/**
 * Check if a worktree has uncommitted changes
 */
async hasUncommittedChanges(worktreePath: string): Promise<boolean>

/**
 * Check if a worktree has staged changes
 */
async hasStagedChanges(worktreePath: string): Promise<boolean>

/**
 * Check if a branch has unmerged commits relative to main
 */
async hasUnmergedCommits(branch: string, mainBranch: string): Promise<boolean>

/**
 * Check if a branch has stashed changes
 */
async hasStashedChanges(branch: string): Promise<boolean>

/**
 * Check if a worktree has submodule modifications
 */
async hasSubmoduleModifications(worktreePath: string): Promise<boolean>

/**
 * Remove a worktree
 */
async removeWorktree(path: string, force: boolean = false): Promise<void>
```

### Tmux Integration

Add the following functions for tmux cleanup:

```typescript
/**
 * Find and close tmux windows associated with a worktree
 */
async closeTmuxWindowsForWorktree(
    projectName: string,
    worktreeName: string
): Promise<void>

/**
 * Get list of tmux windows for a worktree
 */
async getTmuxWindowsForWorktree(
    sessionName: string,
    worktreeName: string
): Promise<string[]>
```

### Process Management

Add the following functions for shell process cleanup:

```typescript
/**
 * Find and terminate shell processes in a worktree directory
 */
async terminateShellProcessesInDirectory(
    directory: string
): Promise<void>

/**
 * Get list of shell processes with working directory in the worktree
 */
async getShellProcessesInDirectory(
    directory: string
): Promise<number[]>

/**
 * Check if current process is in a worktree directory
 */
function isCurrentProcessInWorktree(
    worktreePath: string
): boolean

/**
 * Change current directory to main worktree
 */
async changeToMainWorktree(
    mainWorktreePath: string
): Promise<void>
```

### Integration with CLI

Add the remove command to the main program:

```typescript
program.addCommand(removeCommand);
```

## Success Output

Success messages should be concise:

- Single worktree: `Removed worktree: feature-branch`
- Multiple worktrees: `Removed 3 worktrees: feature-1, feature-2, bugfix-123`
- Partial success: `Removed 2 of 4 worktrees` (when some fail safety checks)
- Prune mode: `Pruned 5 merged worktrees`
- Prune mode (nothing to prune): `No fully merged worktrees to prune`

## Testing Strategy

### Unit Tests

1. Test safety check functions individually
2. Test command validation
3. Test error message formatting
4. Test force mode behavior
5. Test tmux window detection and cleanup
6. Test shell process detection
7. Test stashed changes detection
8. Test submodule modifications detection
9. Test current directory detection

### Integration Tests

1. Test removing clean worktree
2. Test safety check failures:
   - Worktree with untracked files
   - Worktree with modified files
   - Worktree with staged changes
   - Worktree with unmerged commits
   - Worktree with stashed changes
   - Worktree with submodule modifications
3. Test force removal bypassing checks
4. Test removing multiple worktrees
5. Test removing non-existent worktree
6. Test removing locked worktree
7. Test tmux cleanup:
   - Remove worktree with active tmux window
   - Remove worktree with multiple tmux windows
   - Verify tmux windows are closed before git removal
8. Test shell process cleanup:
   - Remove worktree with active shell process
   - Verify processes are terminated before git removal
9. Test prune mode:
   - Prune fully merged worktrees
   - Skip unmerged worktrees
   - Handle mixed scenarios
10. Test current directory handling:
    - Remove worktree while inside it
    - Verify directory changes to main worktree

### Edge Cases

1. Removing the main worktree (should fail)
2. Removing currently active worktree
3. Worktree with symbolic links
4. Worktree on different filesystem
5. Permission issues
6. Tmux session doesn't exist
7. Failed to close tmux window (continue with removal)
8. Failed to terminate shell process (continue with removal)
9. Stashes on deleted branches
10. Submodules in various states (uninitialized, modified, nested)

## Future Enhancements

1. **Interactive mode**: Add `-i` flag to interactively select worktrees to remove
2. **Dry run**: Add `--dry-run` flag to show what would be removed
3. **Backup option**: Add `--backup` flag to create a patch file before removal
4. **Pattern matching**: Support glob patterns for worktree names
5. **Recovery info**: Show how to recover if removal was accidental
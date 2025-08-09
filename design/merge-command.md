# WTT Merge Command Design

## Overview

The `wtt merge` command provides a convenient way to merge worktree branches back to the main branch or update worktrees with changes from the main branch. It includes automatic worktree removal after successful merges and helpful conflict resolution guidance.

## Command Syntax

### Basic Merge (worktree → main)
```bash
# From within a worktree, merge current worktree to main
wtt merge

# From anywhere, merge specific worktree to main
wtt merge feature1
```

### Update Mode (main → worktree)
```bash
# From within a worktree, merge main into current worktree
wtt merge --update

# From anywhere, merge main into specific worktree
wtt merge --update feature1
```

## Core Features

### 1. Automatic Worktree Detection
- When run without arguments, detects the current worktree
- Validates that the current directory is within a worktree (not the main worktree)
- For named worktrees, validates that the worktree exists

### 2. Merge Operations

#### Standard Merge (worktree → main)
1. Switch to the main worktree
2. Ensure main worktree is clean (no uncommitted changes)
3. Fetch latest changes (optional, based on config)
4. Perform `git merge <worktree-branch>`
5. Handle merge result:
   - Success: Check autoRemove config
   - Conflict: Report conflicting files

#### Update Merge (main → worktree)
1. Switch to the target worktree
2. Ensure worktree is clean (no uncommitted changes)
3. Fetch latest changes (optional, based on config)
4. Perform `git merge <main-branch>`
5. Handle merge result:
   - Success: Report success
   - Conflict: Report conflicting files

### 3. Auto-Remove Feature
- New config property: `autoRemove: boolean`
- After successful merge to main:
  1. Check if `autoRemove` is true
  2. Execute `wtt remove <worktree-name>` command
  3. The remove command handles:
     - Switching to main worktree if needed
     - Closing tmux windows
     - Terminating shell processes
     - Removing the worktree safely

### 4. Conflict Handling
- Detect merge conflicts via git exit code
- Parse conflict markers in files
- Display first conflicting file that needs resolution
- Format: `Merge conflict in: src/components/Header.tsx`
- Continue showing next unresolved file on subsequent runs

## Configuration

### Updated WorktreeConfig Interface
```typescript
export interface WorktreeConfig {
    version: string;
    projectName: string;
    mainBranch: string;
    baseDir: string;
    tmux: boolean;
    commands?: Record<string, string>;
    autoRemove?: boolean;  // New property
}
```

### Default Values
- `autoRemove`: false (opt-in behavior)

## Implementation Details

### Command Class Structure
The merge command will follow the existing command pattern by extending `BaseCommand` and implementing a `MergeCommand` class that:
- Validates options and context
- Leverages existing Git utilities from `core/git.ts`
- Integrates with the `RemoveCommand` for auto-removal
- Uses the standard logger for output

### Command Options
```typescript
export interface MergeOptions extends GlobalOptions {
    /** Update mode: merge main into worktree instead */
    update?: boolean;
    /** Skip fetch before merge */
    noFetch?: boolean;
    /** Force merge even with uncommitted changes */
    force?: boolean;
}
```

### Git Operations

#### Check for Clean Working Directory
```bash
git status --porcelain
```

#### Perform Merge
```bash
# Standard merge
git merge --no-ff <branch-name>

# With message
git merge --no-ff -m "Merge worktree '<name>'" <branch-name>
```

#### Check for Conflicts
```bash
# Exit code 1 indicates merge conflict
git merge ... || echo "CONFLICT"

# Find conflicting files
git diff --name-only --diff-filter=U
```

#### Remove Worktree
```typescript
// Use existing RemoveCommand
const removeCommand = new RemoveCommand();
await removeCommand.execute({
    worktrees: [worktreeName],
    force: false,  // Let remove command do safety checks
});
```

### Error Handling

1. **Not in a worktree**: "Error: Not in a worktree. Run from within a worktree or specify worktree name."
2. **Worktree not found**: "Error: Worktree 'feature1' not found."
3. **Uncommitted changes**: "Error: Uncommitted changes in main worktree. Commit or stash changes first."
4. **Merge conflicts**: "Merge conflict in: <file-path>"
5. **Auto-remove failure**: "Warning: Could not remove worktree automatically. Run 'wtt remove <name>' manually."

### Output Format

#### Successful Merge
```
✓ Merged 'feature1' into main
```

#### Successful Merge with Auto-Remove
```
✓ Merged 'feature1' into main
✓ Removed worktree 'feature1'
```

#### Successful Update
```
✓ Updated 'feature1' with latest from main
```

#### Merge Conflict
```
Merge conflict in: src/components/Header.tsx
```

## Security Considerations

1. **Clean Working Directory**: Always check for uncommitted changes before merge
2. **Safe Removal**: The `wtt remove` command performs comprehensive safety checks before removal
3. **Path Validation**: Worktree names are validated to prevent path traversal
4. **Process Cleanup**: Remove command handles tmux windows and shell processes safely

## Testing Strategy

### Unit Tests
1. Parse conflict detection
2. Option validation
3. Git command building
4. Error message formatting

### Integration Tests
1. Successful merge flow
2. Merge with conflicts
3. Auto-remove functionality
4. Update mode
5. Various error conditions

### E2E Tests
1. Full merge workflow with real git repos
2. Conflict resolution flow
3. Auto-remove with branch cleanup

## Future Enhancements

1. **Interactive Conflict Resolution**: Open editor for conflict files
2. **Merge Strategy Options**: Support `--squash`, `--rebase`
3. **PR Integration**: Create pull request instead of direct merge
4. **Backup Before Remove**: Archive worktree before auto-removal
5. **Batch Operations**: Merge multiple worktrees at once
6. **Merge Preview**: Show what would be merged with `--dry-run`

## Command Help Text

```
Usage: wtt merge [options] [worktree]

Merge worktree changes back to main branch or update worktree from main

Arguments:
  worktree                    Name of worktree to merge (default: current worktree)

Options:
  -u, --update               Update worktree from main instead of merging to main
  --no-fetch                 Skip fetching latest changes before merge
  -f, --force                Force merge even with uncommitted changes
  -h, --help                 Display help for command

Examples:
  $ wtt merge                # Merge current worktree to main
  $ wtt merge feature1       # Merge feature1 worktree to main
  $ wtt merge --update       # Update current worktree from main
  $ wtt merge --update fix1  # Update fix1 worktree from main
```

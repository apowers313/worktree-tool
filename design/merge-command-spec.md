# Merge Command Specification

## Overview

The `wtt merge` command facilitates merging changes between worktrees and the main branch. It supports two modes:
1. **Default mode**: Merge worktree changes into the main branch
2. **Update mode** (`--update`): Merge main branch changes into the worktree

## Command Syntax

```bash
# Merge current worktree into main
wtt merge

# Merge specific worktree into main
wtt merge feature-branch

# Update current worktree from main
wtt merge --update

# Update specific worktree from main
wtt merge feature-branch --update
```

## Options

- `[worktree]` - Optional worktree name. Defaults to current worktree
- `-u, --update` - Reverse merge direction: merge main into worktree
- `--no-fetch` - Skip fetching latest changes before merge
- `-f, --force` - Force merge even with uncommitted changes
- `-v, --verbose` - Show detailed output

## Behavior

### Default Mode (Merge to Main)

1. Validate the current worktree or specified worktree exists
2. Check for uncommitted changes (unless `--force`)
3. Fetch latest changes (unless `--no-fetch`)
4. Switch to main branch
5. Merge worktree branch into main
6. Handle any merge conflicts
7. Return to original worktree

### Update Mode (Merge from Main)

1. Validate the current worktree or specified worktree exists
2. Check for uncommitted changes (unless `--force`)
3. Fetch latest changes (unless `--no-fetch`)
4. Switch to worktree branch
5. Merge main branch into worktree
6. Handle any merge conflicts

## Safety Features

- Confirmation prompt for destructive operations
- Pre-merge validation of working tree state
- Clear error messages for merge conflicts
- Ability to bypass with environment variable `WTT_NO_CONFIRM=true`

## Error Handling

- Not in a worktree: Clear message to run from worktree or specify name
- Uncommitted changes: Suggest using `--force` or committing changes
- Merge conflicts: Provide instructions for resolution
- Main branch operations: Prevent merging main into itself

## Examples

```bash
# Basic merge of current worktree
cd .worktrees/feature-branch
wtt merge

# Merge specific worktree from main directory
wtt merge feature-branch

# Update worktree with latest from main
wtt merge --update

# Force merge with uncommitted changes
wtt merge --force

# Skip fetch for offline work
wtt merge --no-fetch
```
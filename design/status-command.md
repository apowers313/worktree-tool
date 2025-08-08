# Status Command Design

## Overview

The `wtt status` command provides a concise, one-line-per-worktree view of git status across all worktrees (excluding the main worktree). This design is inspired by git-radar but with more readable hints rather than single-letter codes.

## Command Syntax

```bash
wtt status [-w feature1,feature2]
```

- `-w` flag: Optional filter to show only specific worktrees (comma-separated list)

## Status Format

Each line follows this pattern:
```
[worktree-name] status-items...
```

Where status-items are comma-separated and only show non-zero values.

## Status Items

### File Changes
- `➕ N` - N files added (staged)
- `✏️ N` - N files modified 
- `➖ N` - N files deleted
- `🔄 N` - N files renamed
- `📋 N` - N files copied
- `❓ N` - N untracked files

### Commit Status
- `↑N` - Local ahead by N commits (ready to push)
- `↓N` - Remote ahead by N commits (need to pull)
- `↑N↓M` - Diverged (local ahead by N, remote ahead by M)

### Conflict Status
- `⚠️ N` - N files with merge conflicts

## Visual Design

### Colors
- **Green**: Staged changes (add, mod, del, ren, copy when staged)
- **Red**: Unstaged changes
- **Yellow**: Conflicts and warnings
- **Blue**: Worktree name
- **Cyan**: Commit status (↑↓)
- **Gray**: Separators and punctuation
- **Magenta**: Untracked files

### Spacing
- Worktree names are padded to align status items
- Status items are separated by "  " (double space)
- Each emoji is followed directly by its count

### Example Output

```
[feature-auth]  ➕3  ✏️1  ↑1
[bugfix-123]    ✏️2  ➖1  ↓3
[experiment]    ➕1  ⚠️ 2  ↑2↓1
[hotfix]        ❓2
```

## Implementation Details

### Git Commands Used

1. **File Status**: `git status --porcelain=v1`
   - Parse output to count file states
   - First character = staged status
   - Second character = unstaged status

2. **Commit Differences**: 
   - Local ahead: `git rev-list --count @{upstream}..HEAD`
   - Remote ahead: `git rev-list --count HEAD..@{upstream}`

3. **Conflict Detection**: 
   - Look for "UU", "AA", "DD" patterns in `git status --porcelain`
   - These indicate both-modified conflicts

### Status Code Mapping

From `git status --porcelain`:
- `A` = Added
- `M` = Modified
- `D` = Deleted
- `R` = Renamed
- `C` = Copied
- `U` = Updated but unmerged (conflict)
- `?` = Untracked files

### Performance Considerations

- Run git commands in parallel for each worktree
- Cache results for rapid subsequent calls (with TTL)
- Use `--porcelain` for stable parsing

## Future Enhancements

1. **Additional Indicators**:
   - Stash count: `💼 N`
   - Untracked files: `? N`
   - Branch protection status

2. **Interactive Mode**:
   - Press enter to select a worktree and switch to it
   - Arrow keys to navigate

3. **Configuration**:
   - Custom emoji/text preferences
   - Color themes
   - Status item toggles

## Alternative Emoji Considerations

We chose minimal emoji usage for professional appearance:
- `⚠️` for conflicts (universally understood warning)
- `↑↓` for commit status (clear directional meaning)

We selected emoji that are:
- Immediately recognizable (➕ for add, ➖ for delete)
- Render consistently across terminals
- Visually distinct from each other
- Professional enough for work environments
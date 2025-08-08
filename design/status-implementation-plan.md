# Status Command Implementation Plan

## Overview
Implement the `wtt status` command to display git status across all worktrees in a concise, colorful format.

## Implementation Steps

### 1. Create Status Command Class
**File**: `src/commands/status.ts`
- Extend `BaseCommand` class
- Implement required methods: `validateOptions`, `executeCommand`
- Define `StatusOptions` interface with `-w` filter option

### 2. Add Git Status Methods
**File**: `src/core/git.ts`

```typescript
// Add to Git class
async getWorktreeStatus(worktreePath: string): Promise<string[]> {
    const result = await this.exec(['status', '--porcelain=v1'], worktreePath);
    return result.split('\n').filter(line => line.trim());
}

async getAheadBehind(worktreePath: string): Promise<{ahead: number, behind: number}> {
    try {
        const ahead = await this.exec(['rev-list', '--count', '@{upstream}..HEAD'], worktreePath);
        const behind = await this.exec(['rev-list', '--count', 'HEAD..@{upstream}'], worktreePath);
        return {
            ahead: parseInt(ahead.trim()) || 0,
            behind: parseInt(behind.trim()) || 0
        };
    } catch (error) {
        // No upstream branch
        return { ahead: 0, behind: 0 };
    }
}
```

### 3. Create Status Formatter
**File**: `src/utils/status-formatter.ts`

```typescript
import chalk from 'chalk';
import { WorktreeStatus, StatusCounts } from '../core/types.js';

const STATUS_EMOJI = {
    add: '➕',
    mod: '📝',
    del: '➖',
    ren: '🔄',
    copy: '📋',
    conflict: '⚠️'
};

export function formatWorktreeStatus(status: WorktreeStatus, maxNameLength: number): string {
    const paddedName = status.name.padEnd(maxNameLength);
    const coloredName = chalk.blue(`[${paddedName}]`);
    
    const statusParts: string[] = [];
    
    // File changes
    if (status.counts.staged.add > 0) statusParts.push(chalk.green(`${STATUS_EMOJI.add}${status.counts.staged.add}`));
    if (status.counts.staged.mod > 0) statusParts.push(chalk.green(`${STATUS_EMOJI.mod}${status.counts.staged.mod}`));
    if (status.counts.staged.del > 0) statusParts.push(chalk.green(`${STATUS_EMOJI.del}${status.counts.staged.del}`));
    if (status.counts.staged.ren > 0) statusParts.push(chalk.green(`${STATUS_EMOJI.ren}${status.counts.staged.ren}`));
    if (status.counts.staged.copy > 0) statusParts.push(chalk.green(`${STATUS_EMOJI.copy}${status.counts.staged.copy}`));
    
    // Unstaged changes (same emoji, red color)
    if (status.counts.unstaged.add > 0) statusParts.push(chalk.red(`${STATUS_EMOJI.add}${status.counts.unstaged.add}`));
    if (status.counts.unstaged.mod > 0) statusParts.push(chalk.red(`${STATUS_EMOJI.mod}${status.counts.unstaged.mod}`));
    if (status.counts.unstaged.del > 0) statusParts.push(chalk.red(`${STATUS_EMOJI.del}${status.counts.unstaged.del}`));
    
    // Conflicts
    if (status.counts.conflicts > 0) statusParts.push(chalk.yellow(`${STATUS_EMOJI.conflict} ${status.counts.conflicts}`));
    
    // Commit status
    if (status.ahead > 0 && status.behind > 0) {
        statusParts.push(chalk.cyan(`↑${status.ahead}↓${status.behind}`));
    } else if (status.ahead > 0) {
        statusParts.push(chalk.cyan(`↑${status.ahead}`));
    } else if (status.behind > 0) {
        statusParts.push(chalk.cyan(`↓${status.behind}`));
    }
    
    return `${coloredName}  ${statusParts.join('  ')}`;
}
```

### 4. Implement Status Collection Logic
**File**: `src/commands/status.ts`

```typescript
import { BaseCommand, CommandContext } from './base.js';
import { StatusOptions, WorktreeStatus } from '../core/types.js';
import { formatWorktreeStatus } from '../utils/status-formatter.js';

export class StatusCommand extends BaseCommand<StatusOptions> {
    protected requiresConfig(): boolean {
        return true;
    }
    
    protected validateOptions(options: StatusOptions): void {
        // Validation if needed
    }
    
    protected async executeCommand(options: StatusOptions, context: CommandContext): Promise<void> {
        const { logger, config, git } = context;
        
        // Get worktrees to check
        let worktrees = await git.listWorktrees();
        
        // Filter by -w option if provided
        if (options.worktrees) {
            const filter = options.worktrees.split(',').map(w => w.trim());
            worktrees = worktrees.filter(w => filter.includes(w.name));
        }
        
        // Collect status for each worktree in parallel
        const statusPromises = worktrees.map(async (worktree) => {
            const [statusLines, aheadBehind] = await Promise.all([
                git.getWorktreeStatus(worktree.path),
                git.getAheadBehind(worktree.path)
            ]);
            
            const counts = countStatuses(statusLines);
            
            return {
                name: worktree.name,
                path: worktree.path,
                counts,
                ahead: aheadBehind.ahead,
                behind: aheadBehind.behind
            } as WorktreeStatus;
        });
        
        const statuses = await Promise.all(statusPromises);
        
        // Calculate max name length for alignment
        const maxNameLength = Math.max(...statuses.map(s => s.name.length));
        
        // Output formatted status for each worktree
        for (const status of statuses) {
            const formatted = formatWorktreeStatus(status, maxNameLength);
            console.log(formatted);
        }
    }
}
```

### 5. Register Command with CLI
**File**: `src/cli/program.ts`

```typescript
// Add import
import { StatusCommand } from '../commands/status.js';

// In createProgram() function, add:
program
    .command('status')
    .description('Show git status across all worktrees')
    .option('-w, --worktrees <names>', 'filter worktrees (comma-separated)')
    .action(async (options) => {
        const command = new StatusCommand();
        await command.execute({ ...program.opts(), ...options });
    });
```

### 6. Add Types
**File**: `src/core/types.ts`

```typescript
export interface StatusCounts {
    add: number;
    mod: number;
    del: number;
    ren: number;
    copy: number;
}

export interface WorktreeStatus {
    name: string;
    path: string;
    counts: {
        staged: StatusCounts;
        unstaged: StatusCounts;
        conflicts: number;
    };
    ahead: number;
    behind: number;
}

export interface StatusOptions extends CommandOptions {
    worktrees?: string;  // -w option
}
```

### 7. Write Tests
**Files**: 
- `test/unit/commands/status.test.ts`
- `test/unit/utils/status-formatter.test.ts`
- `test/integration/commands/status.test.ts`

Test cases:
- Clean worktree (no changes) - should show only worktree name
- Various file states (add, mod, del, ren, copy)
- Mixed staged/unstaged changes
- Ahead/behind/diverged states
- Conflict detection (UU, AA, DD patterns)
- Filter functionality with -w flag
- Multiple worktrees with alignment
- No upstream branch handling
- Empty repository handling

Example test:
```typescript
it('should format status with emoji correctly', () => {
    const status: WorktreeStatus = {
        name: 'feature',
        path: '/path/to/feature',
        counts: {
            staged: { add: 3, mod: 1, del: 0, ren: 0, copy: 0 },
            unstaged: { add: 0, mod: 0, del: 0, ren: 0, copy: 0 },
            conflicts: 0
        },
        ahead: 1,
        behind: 0
    };
    
    const result = formatWorktreeStatus(status, 10);
    expect(result).toContain('➕3');
    expect(result).toContain('📝1');
    expect(result).toContain('↑1');
});
```

### 8. Update Documentation
- Add status command to README.md
- Include example output
- Document color meanings

## Technical Details

### Git Commands
```bash
# Get file status
git -C <worktree-path> status --porcelain=v1

# Get ahead/behind counts
git -C <worktree-path> rev-list --count @{upstream}..HEAD
git -C <worktree-path> rev-list --count HEAD..@{upstream}
```

### Output Format Details
- Status items separated by double spaces ("  ")
- Only non-zero counts are shown
- Worktree names are padded for alignment
- Emoji followed directly by count (no space)

### Example Outputs
```
[main]          ↑2
[feature-auth]  ➕3  📝1  ↑1
[bugfix-123]    📝2  ➖1  ↓3
[experiment]    ➕1  ⚠️ 2  ↑2↓1
```

### Status Code Mapping
```typescript
// Parse git status --porcelain output
function parseStatusLine(line: string): {staged: string | null, unstaged: string | null, path: string} {
    const stagedStatus = line[0] !== ' ' ? line[0] : null;
    const unstagedStatus = line[1] !== ' ' ? line[1] : null;
    const path = line.substring(3);
    return { stagedStatus, unstagedStatus, path };
}

// Map status codes to our categories
function categorizeStatus(statusCode: string): keyof StatusCounts | 'conflict' | null {
    switch (statusCode) {
        case 'A': return 'add';
        case 'M': return 'mod';
        case 'D': return 'del';
        case 'R': return 'ren';
        case 'C': return 'copy';
        case 'U': return 'conflict';
        case '?': return null; // Untracked - we don't show these
        default: return null;
    }
}

// Count statuses from porcelain output
function countStatuses(lines: string[]): WorktreeStatus['counts'] {
    const counts = {
        staged: { add: 0, mod: 0, del: 0, ren: 0, copy: 0 },
        unstaged: { add: 0, mod: 0, del: 0, ren: 0, copy: 0 },
        conflicts: 0
    };
    
    for (const line of lines) {
        const { stagedStatus, unstagedStatus } = parseStatusLine(line);
        
        // Check for conflicts (UU, AA, DD)
        if (stagedStatus === 'U' || (stagedStatus === 'A' && unstagedStatus === 'A') || 
            (stagedStatus === 'D' && unstagedStatus === 'D')) {
            counts.conflicts++;
            continue;
        }
        
        // Count staged changes
        if (stagedStatus) {
            const category = categorizeStatus(stagedStatus);
            if (category && category !== 'conflict') {
                counts.staged[category]++;
            }
        }
        
        // Count unstaged changes
        if (unstagedStatus) {
            const category = categorizeStatus(unstagedStatus);
            if (category && category !== 'conflict') {
                counts.unstaged[category]++;
            }
        }
    }
    
    return counts;
}
```

**Test after this step:**
```bash
# Test parsing logic with sample porcelain output
echo -e "AM file1.txt\nUU conflict.txt\n D deleted.txt" > test-status.txt
node -e "console.log('Sample status lines for testing:')" && cat test-status.txt
```

### Color Scheme & Emoji

Colors match the design document:
- **Blue**: Worktree names
- **Green**: Staged changes
- **Red**: Unstaged changes 
- **Yellow**: Conflicts (⚠️)
- **Cyan**: Commit status (↑↓)

Emoji used:
- `➕` (\u2795): Added files
- `📝` (\ud83d\udcdd): Modified files
- `➖` (\u2796): Deleted files
- `🔄` (\ud83d\udd04): Renamed files
- `📋` (\ud83d\udccb): Copied files
- `⚠️` (\u26a0\ufe0f): Conflicts
- `↑` (\u2191): Ahead commits
- `↓` (\u2193): Behind commits

## Dependencies
- No new npm packages needed (chalk already available)
- Ensure git commands work across platforms

## Estimated Effort
- Core implementation: 2-3 hours
- Tests: 1-2 hours
- Polish & edge cases: 1 hour

Total: ~4-6 hours
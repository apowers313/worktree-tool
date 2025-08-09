# Merge Conflict Detection Implementation Plan

## Overview

This document outlines the implementation plan for detecting merge conflicts in the `wtt status` command. We will implement detection for two scenarios:

1. **Active merge conflicts** - Conflicts that exist during an ongoing merge
2. **Potential merge conflicts** - Committed changes that would conflict if merged

## Scenario 1: Active Merge Conflicts

### Detection Method

Use `git status --porcelain=v1` to detect files with merge conflict status codes.

### Conflict Status Codes

```
UU - both modified (unmerged)
AA - both added
DD - both deleted
AU - added by us
UA - added by them
DU - deleted by us
UD - deleted by them
```

### Implementation

```typescript
interface ConflictInfo {
  type: 'active' | 'potential';
  files: string[];
  count: number;
  details?: {
    bothModified: number;
    bothAdded: number;
    bothDeleted: number;
    addedByUs: number;
    addedByThem: number;
    deletedByUs: number;
    deletedByThem: number;
  };
}

async function detectActiveConflicts(worktreePath: string): Promise<ConflictInfo | null> {
  try {
    const { stdout } = await execa('git', ['status', '--porcelain=v1'], {
      cwd: worktreePath,
    });

    const conflictPatterns = {
      bothModified: /^UU /gm,
      bothAdded: /^AA /gm,
      bothDeleted: /^DD /gm,
      addedByUs: /^AU /gm,
      addedByThem: /^UA /gm,
      deletedByUs: /^DU /gm,
      deletedByThem: /^UD /gm,
    };

    const files: string[] = [];
    const details = {
      bothModified: 0,
      bothAdded: 0,
      bothDeleted: 0,
      addedByUs: 0,
      addedByThem: 0,
      deletedByUs: 0,
      deletedByThem: 0,
    };

    // Parse each line
    const lines = stdout.split('\n').filter(line => line.trim());
    for (const line of lines) {
      const statusCode = line.substring(0, 2);
      const filename = line.substring(3);

      switch (statusCode) {
        case 'UU':
          files.push(filename);
          details.bothModified++;
          break;
        case 'AA':
          files.push(filename);
          details.bothAdded++;
          break;
        case 'DD':
          files.push(filename);
          details.bothDeleted++;
          break;
        case 'AU':
          files.push(filename);
          details.addedByUs++;
          break;
        case 'UA':
          files.push(filename);
          details.addedByThem++;
          break;
        case 'DU':
          files.push(filename);
          details.deletedByUs++;
          break;
        case 'UD':
          files.push(filename);
          details.deletedByThem++;
          break;
      }
    }

    if (files.length === 0) {
      return null;
    }

    return {
      type: 'active',
      files,
      count: files.length,
      details,
    };
  } catch (error) {
    // Handle error
    return null;
  }
}
```

## Scenario 2: Potential Merge Conflicts

### Detection Method

Use `git merge-tree` (Git 2.38+) or fallback to dry-run merge for older versions.

### Git Version Detection

```typescript
async function getGitVersion(): Promise<{ major: number; minor: number; patch: number }> {
  const { stdout } = await execa('git', ['--version']);
  const match = stdout.match(/git version (\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error('Unable to parse git version');
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

function supportsModernMergeTree(version: { major: number; minor: number }): boolean {
  return version.major > 2 || (version.major === 2 && version.minor >= 38);
}
```

### Modern Implementation (Git 2.38+)

```typescript
async function detectPotentialConflictsModern(
  worktreePath: string,
  targetBranch: string = 'main'
): Promise<ConflictInfo | null> {
  try {
    // Get current branch
    const { stdout: currentBranch } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: worktreePath,
    });

    // Skip if we're on the target branch
    if (currentBranch === targetBranch) {
      return null;
    }

    // Get merge base
    const { stdout: mergeBase } = await execa(
      'git',
      ['merge-base', currentBranch, targetBranch],
      { cwd: worktreePath }
    );

    // Run merge-tree
    try {
      const { stdout, exitCode } = await execa(
        'git',
        ['merge-tree', '--write-tree', '--no-messages', mergeBase, currentBranch, targetBranch],
        { 
          cwd: worktreePath,
          reject: false,
        }
      );

      // Exit code 1 indicates conflicts
      if (exitCode === 1) {
        // Parse conflict information from stdout
        const files = stdout
          .split('\n')
          .filter(line => line.includes('<<<<<<< '))
          .map(line => line.split('\t')[1])
          .filter(Boolean);

        return {
          type: 'potential',
          files: [...new Set(files)], // Remove duplicates
          count: files.length,
        };
      }
    } catch (error) {
      // Conflicts detected
      return {
        type: 'potential',
        files: [],
        count: -1, // Unknown count
      };
    }

    return null;
  } catch (error) {
    return null;
  }
}
```

### Legacy Implementation (Git < 2.38)

```typescript
async function detectPotentialConflictsLegacy(
  worktreePath: string,
  targetBranch: string = 'main'
): Promise<ConflictInfo | null> {
  try {
    // Get current branch
    const { stdout: currentBranch } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: worktreePath,
    });

    if (currentBranch === targetBranch) {
      return null;
    }

    // Ensure clean working directory
    const { stdout: statusCheck } = await execa('git', ['status', '--porcelain'], {
      cwd: worktreePath,
    });
    
    const hasUncommittedChanges = statusCheck.trim().length > 0;
    let stashed = false;

    if (hasUncommittedChanges) {
      // Stash changes
      await execa('git', ['stash', 'push', '-m', 'wtt-conflict-check'], {
        cwd: worktreePath,
      });
      stashed = true;
    }

    try {
      // Attempt dry-run merge
      const { exitCode } = await execa(
        'git',
        ['merge', '--no-commit', '--no-ff', targetBranch],
        {
          cwd: worktreePath,
          reject: false,
        }
      );

      if (exitCode !== 0) {
        // Conflicts detected, get conflict files
        const { stdout } = await execa('git', ['diff', '--name-only', '--diff-filter=U'], {
          cwd: worktreePath,
        });

        const files = stdout.split('\n').filter(f => f.trim());

        // Abort merge
        await execa('git', ['merge', '--abort'], { cwd: worktreePath });

        return {
          type: 'potential',
          files,
          count: files.length,
        };
      } else {
        // No conflicts, abort merge
        await execa('git', ['merge', '--abort'], { cwd: worktreePath });
        return null;
      }
    } finally {
      // Restore stashed changes
      if (stashed) {
        await execa('git', ['stash', 'pop'], { cwd: worktreePath });
      }
    }
  } catch (error) {
    return null;
  }
}
```

### Main Detection Function

```typescript
async function detectConflicts(
  worktreePath: string,
  targetBranch: string = 'main'
): Promise<{ active?: ConflictInfo; potential?: ConflictInfo }> {
  const results: { active?: ConflictInfo; potential?: ConflictInfo } = {};

  // Detect active conflicts
  const activeConflicts = await detectActiveConflicts(worktreePath);
  if (activeConflicts) {
    results.active = activeConflicts;
  }

  // Detect potential conflicts
  const gitVersion = await getGitVersion();
  const potentialConflicts = supportsModernMergeTree(gitVersion)
    ? await detectPotentialConflictsModern(worktreePath, targetBranch)
    : await detectPotentialConflictsLegacy(worktreePath, targetBranch);

  if (potentialConflicts) {
    results.potential = potentialConflicts;
  }

  return results;
}
```

## Integration with Status Command

### Update WorktreeStatus Interface

```typescript
interface WorktreeStatus {
  name: string;
  path: string;
  branch: string;
  isActive: boolean;
  ahead: number;
  behind: number;
  conflicts?: {
    active?: ConflictInfo;
    potential?: ConflictInfo;
  };
}
```

### Update getWorktreeStatus Function

```typescript
async function getWorktreeStatus(worktree: Worktree): Promise<WorktreeStatus> {
  // ... existing code ...

  // Add conflict detection
  const conflicts = await detectConflicts(worktree.path, mainBranch);

  return {
    name: worktree.name,
    path: worktree.path,
    branch: worktree.branch,
    isActive: worktree.isActive,
    ahead,
    behind,
    ...(Object.keys(conflicts).length > 0 && { conflicts }),
  };
}
```

### Update Status Display

```typescript
function formatStatus(status: WorktreeStatus): string {
  let output = `${status.isActive ? '*' : ' '} ${status.name} (${status.branch})`;

  if (status.ahead > 0 || status.behind > 0) {
    output += ` [ahead ${status.ahead}, behind ${status.behind}]`;
  }

  // Add conflict information
  if (status.conflicts?.active) {
    output += chalk.red(` CONFLICTS: ${status.conflicts.active.count} files`);
  } else if (status.conflicts?.potential) {
    output += chalk.yellow(` POTENTIAL CONFLICTS: ${status.conflicts.potential.count} files`);
  }

  return output;
}
```

### Verbose Mode Display

```typescript
function formatVerboseStatus(status: WorktreeStatus): string {
  let output = formatStatus(status);

  if (status.conflicts?.active && status.conflicts.active.details) {
    const d = status.conflicts.active.details;
    output += '\n  Active conflicts:';
    if (d.bothModified > 0) output += `\n    - Both modified: ${d.bothModified}`;
    if (d.bothAdded > 0) output += `\n    - Both added: ${d.bothAdded}`;
    if (d.bothDeleted > 0) output += `\n    - Both deleted: ${d.bothDeleted}`;
    if (d.addedByUs > 0) output += `\n    - Added by us: ${d.addedByUs}`;
    if (d.addedByThem > 0) output += `\n    - Added by them: ${d.addedByThem}`;
    if (d.deletedByUs > 0) output += `\n    - Deleted by us: ${d.deletedByUs}`;
    if (d.deletedByThem > 0) output += `\n    - Deleted by them: ${d.deletedByThem}`;
    
    output += '\n  Files:';
    status.conflicts.active.files.forEach(file => {
      output += `\n    - ${file}`;
    });
  }

  if (status.conflicts?.potential) {
    output += '\n  Potential conflicts on merge:';
    output += `\n    - ${status.conflicts.potential.count} files would conflict`;
    if (status.conflicts.potential.files.length > 0) {
      output += '\n  Files:';
      status.conflicts.potential.files.forEach(file => {
        output += `\n    - ${file}`;
      });
    }
  }

  return output;
}
```

## Testing Strategy

### Test Cases

1. **Active Conflicts**
   - Create merge conflict in worktree
   - Verify detection of UU status
   - Test different conflict types (AA, DD, etc.)

2. **Potential Conflicts**
   - Create conflicting changes in separate branches
   - Verify detection before merge
   - Test with both Git 2.38+ and older versions

3. **Edge Cases**
   - No conflicts
   - Multiple conflicts in same file
   - Binary file conflicts
   - Submodule conflicts
   - Large number of conflicts

### Example Test Setup

```bash
# Create test repository with conflicts
git init test-repo
cd test-repo

# Create initial file
echo "line 1" > file.txt
echo "line 2" >> file.txt
echo "line 3" >> file.txt
git add file.txt
git commit -m "Initial commit"

# Create branch with changes
git checkout -b feature
echo "line 1 - feature change" > file.txt
echo "line 2" >> file.txt
echo "line 3" >> file.txt
git commit -am "Feature change"

# Create conflicting change in main
git checkout main
echo "line 1 - main change" > file.txt
echo "line 2" >> file.txt
echo "line 3" >> file.txt
git commit -am "Main change"

# Test scenario 1: Active conflict
git merge feature  # This will conflict

# Test scenario 2: Potential conflict
git merge --abort
git checkout feature
# Now feature has changes that would conflict with main
```

## Performance Considerations

1. **Caching**: Cache Git version check result
2. **Parallel Processing**: Run conflict detection in parallel for multiple worktrees
3. **Early Exit**: Skip conflict detection if on target branch
4. **Optimization**: Use `--name-only` flags where possible
5. **Timeout**: Add timeout for merge-tree operations

## Error Handling

1. **Git Command Failures**: Gracefully handle and return null
2. **Permission Issues**: Handle cases where merge operations fail due to permissions
3. **Corrupt Repository**: Handle corrupt Git repository states
4. **Network Issues**: Handle remote branch fetch failures
5. **Large Repositories**: Add progress indicators for slow operations

## Future Work: Scenario 3 - Uncommitted Changes

### Challenge

Detecting potential conflicts with uncommitted changes is not directly supported by Git since merge operations require committed changes.

### Potential Implementation Approaches

1. **Temporary Commit Method**
   ```typescript
   // Create temporary commit, check conflicts, then reset
   await execa('git', ['add', '-A'], { cwd: worktreePath });
   await execa('git', ['commit', '-m', 'temp-conflict-check'], { cwd: worktreePath });
   // Run conflict detection
   await execa('git', ['reset', '--soft', 'HEAD~1'], { cwd: worktreePath });
   await execa('git', ['reset'], { cwd: worktreePath });
   ```
   - Pros: Uses existing conflict detection
   - Cons: Modifies Git history temporarily, risky

2. **Manual Diff Analysis**
   ```typescript
   // Get uncommitted changes
   const uncommittedDiff = await execa('git', ['diff', 'HEAD']);
   // Get diff against target branch
   const targetDiff = await execa('git', ['diff', 'HEAD..main']);
   // Analyze overlapping hunks
   ```
   - Pros: No repository modifications
   - Cons: Complex implementation, may miss conflicts

3. **Three-Way Diff Tool**
   ```typescript
   // Use git's merge-file on individual files
   for (const file of modifiedFiles) {
     await execa('git', ['merge-file', '--diff3', 
       `--ours=${file}`,
       `--base=${mergeBase}:${file}`,
       `--theirs=${targetBranch}:${file}`
     ]);
   }
   ```
   - Pros: Accurate conflict detection
   - Cons: Requires file-by-file processing

4. **External Merge Tools**
   - Integrate with tools like `diff3` or `kdiff3`
   - Use language-specific AST analysis for semantic conflicts

### Recommendation

For initial implementation, focus on scenarios 1 and 2. Scenario 3 could be added later as an optional feature with appropriate warnings about limitations and performance impact.

## Implementation Steps

### Phase 1: Foundation and Types

#### Step 1.1: Create Type Definitions
**File**: `src/types/conflicts.ts`
```typescript
export interface ConflictInfo {
  type: 'active' | 'potential';
  files: string[];
  count: number;
  details?: ConflictDetails;
}

export interface ConflictDetails {
  bothModified: number;
  bothAdded: number;
  bothDeleted: number;
  addedByUs: number;
  addedByThem: number;
  deletedByUs: number;
  deletedByThem: number;
}

export interface ConflictDetectionResult {
  active?: ConflictInfo;
  potential?: ConflictInfo;
}
```

**Test**: Create unit test file `src/types/conflicts.test.ts`
```typescript
import { ConflictInfo } from './conflicts';

describe('Conflict Types', () => {
  it('should create valid ConflictInfo objects', () => {
    const conflict: ConflictInfo = {
      type: 'active',
      files: ['file1.txt'],
      count: 1,
    };
    expect(conflict.type).toBe('active');
  });
});
```

#### Step 1.2: Update WorktreeStatus Interface
**File**: `src/types/index.ts`
```typescript
import { ConflictDetectionResult } from './conflicts';

export interface WorktreeStatus {
  // ... existing fields ...
  conflicts?: ConflictDetectionResult;
}
```

**Test**: Update existing tests to handle optional conflicts field

### Phase 2: Git Version Detection

#### Step 2.1: Create Git Version Utility
**File**: `src/utils/git-version.ts`
```typescript
export interface GitVersion {
  major: number;
  minor: number;
  patch: number;
}

export async function getGitVersion(): Promise<GitVersion> {
  // Implementation
}

export function supportsModernMergeTree(version: GitVersion): boolean {
  return version.major > 2 || (version.major === 2 && version.minor >= 38);
}
```

**Test**: `src/utils/git-version.test.ts`
```typescript
import { getGitVersion, supportsModernMergeTree } from './git-version';

describe('Git Version Utils', () => {
  it('should parse git version correctly', async () => {
    const version = await getGitVersion();
    expect(version.major).toBeGreaterThanOrEqual(2);
  });

  it('should detect modern merge-tree support', () => {
    expect(supportsModernMergeTree({ major: 2, minor: 38, patch: 0 })).toBe(true);
    expect(supportsModernMergeTree({ major: 2, minor: 37, patch: 0 })).toBe(false);
    expect(supportsModernMergeTree({ major: 3, minor: 0, patch: 0 })).toBe(true);
  });
});
```

### Phase 3: Active Conflict Detection

#### Step 3.1: Create Active Conflict Detector
**File**: `src/services/conflict-detection/active.ts`
```typescript
export async function detectActiveConflicts(worktreePath: string): Promise<ConflictInfo | null> {
  // Implementation from plan
}
```

**Test**: `src/services/conflict-detection/active.test.ts`
```typescript
import { detectActiveConflicts } from './active';
import { setupTestRepo, createMergeConflict } from '../../test-utils';

describe('Active Conflict Detection', () => {
  let testRepo: string;

  beforeEach(async () => {
    testRepo = await setupTestRepo();
  });

  it('should detect no conflicts in clean repo', async () => {
    const result = await detectActiveConflicts(testRepo);
    expect(result).toBeNull();
  });

  it('should detect UU conflicts', async () => {
    await createMergeConflict(testRepo, 'both-modified');
    const result = await detectActiveConflicts(testRepo);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('active');
    expect(result?.details?.bothModified).toBe(1);
  });

  it('should detect multiple conflict types', async () => {
    await createMergeConflict(testRepo, 'mixed');
    const result = await detectActiveConflicts(testRepo);
    expect(result?.count).toBeGreaterThan(1);
  });
});
```

#### Step 3.2: Create Test Utilities
**File**: `src/test-utils/conflict-helpers.ts`
```typescript
export async function createMergeConflict(
  repoPath: string, 
  type: 'both-modified' | 'both-added' | 'mixed'
): Promise<void> {
  // Create branches and conflicting changes
  // Attempt merge to create conflict
}
```

### Phase 4: Potential Conflict Detection

#### Step 4.1: Create Modern Merge-Tree Detector
**File**: `src/services/conflict-detection/potential-modern.ts`
```typescript
export async function detectPotentialConflictsModern(
  worktreePath: string,
  targetBranch: string = 'main'
): Promise<ConflictInfo | null> {
  // Implementation from plan
}
```

**Test**: `src/services/conflict-detection/potential-modern.test.ts`
```typescript
describe('Modern Potential Conflict Detection', () => {
  it('should skip if Git version too old', async () => {
    // Mock old Git version
  });

  it('should detect potential conflicts', async () => {
    // Create divergent branches
    // Run detection
    // Verify results
  });
});
```

#### Step 4.2: Create Legacy Merge Detector
**File**: `src/services/conflict-detection/potential-legacy.ts`
```typescript
export async function detectPotentialConflictsLegacy(
  worktreePath: string,
  targetBranch: string = 'main'
): Promise<ConflictInfo | null> {
  // Implementation from plan
}
```

**Test**: Include stash/restore testing, error handling

### Phase 5: Integration

#### Step 5.1: Create Main Conflict Detection Service
**File**: `src/services/conflict-detection/index.ts`
```typescript
export async function detectConflicts(
  worktreePath: string,
  targetBranch: string = 'main'
): Promise<ConflictDetectionResult> {
  // Combine all detection methods
}
```

**Integration Test**: `src/services/conflict-detection/index.test.ts`
```typescript
describe('Conflict Detection Integration', () => {
  it('should detect both active and potential conflicts', async () => {
    // Setup repo with both types
    // Run detection
    // Verify both detected
  });

  it('should handle errors gracefully', async () => {
    // Test with invalid path
    // Test with corrupt repo
  });
});
```

### Phase 6: Status Command Integration

#### Step 6.1: Update getWorktreeStatus
**File**: `src/commands/status.ts`
```typescript
// Add conflict detection to status gathering
```

**Test**: Mock conflict detection and verify integration

#### Step 6.2: Update Status Formatting
**File**: `src/utils/formatting.ts`
```typescript
export function formatStatusWithConflicts(status: WorktreeStatus): string {
  // Add conflict display logic
}
```

**Test**: Test various conflict scenarios and formatting

### Phase 7: Performance Optimization

#### Step 7.1: Add Parallel Processing
**File**: `src/commands/status.ts`
```typescript
// Update to run conflict detection in parallel with other checks
```

**Performance Test**: Measure time with multiple worktrees

#### Step 7.2: Add Caching
**File**: `src/services/conflict-detection/cache.ts`
```typescript
// Cache Git version
// Cache merge-base calculations
```

### Phase 8: End-to-End Testing

#### Step 8.1: Create E2E Test Suite
**File**: `test/e2e/conflict-detection.test.ts`
```typescript
describe('Conflict Detection E2E', () => {
  it('should show conflicts in status output', async () => {
    // Create real worktrees
    // Create conflicts
    // Run wtt status
    // Verify output
  });
});
```

#### Step 8.2: Manual Testing Script
**File**: `scripts/test-conflicts.sh`
```bash
#!/bin/bash
# Script to create test scenarios for manual verification
```

### Phase 9: Documentation and Polish

#### Step 9.1: Update Command Documentation
- Update README with conflict detection feature
- Add examples to help text

#### Step 9.2: Add Verbose Mode Details
- Implement detailed conflict file listing
- Add flag to show only conflicted worktrees

### Testing Strategy for Each Step

1. **Unit Tests**: Each function has dedicated tests
2. **Integration Tests**: Test component interactions
3. **E2E Tests**: Verify full command behavior
4. **Manual Tests**: Scripts for edge cases
5. **Performance Tests**: Ensure no regression

### Rollback Plan

Each phase can be implemented behind a feature flag:
```typescript
const ENABLE_CONFLICT_DETECTION = process.env.WTT_CONFLICT_DETECTION !== 'false';
```

This allows gradual rollout and easy disable if issues arise.
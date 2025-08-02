# Test Sandbox Design

## Problem Statement

Currently, our tests are being prompted for git commit passwords because they inherit the user's global git configuration (e.g., GPG signing settings). This breaks test isolation and causes tests to fail in environments with certain git configurations.

## Requirements

1. **Complete Git Isolation**: Tests must not inherit any global git configuration
2. **Temporary Directory Usage**: All test data should be created in `/tmp` to avoid polluting the project
3. **Clean Environment**: Each test should have a fresh git environment with predictable defaults
4. **Node.js Native**: Use Node.js built-in APIs for temporary directory management
5. **Easy Integration**: Simple API that works with existing test helpers

## Design

### Core Components

#### 1. TestSandbox Class

```typescript
interface SandboxOptions {
  // Optional git config overrides
  gitConfig?: Record<string, string>;
  // Whether to preserve sandbox after test (for debugging)
  preserveOnError?: boolean;
}

class TestSandbox {
  private tempDir: string;
  private originalCwd: string;
  private originalEnv: NodeJS.ProcessEnv;
  private cleanupFunctions: Array<() => Promise<void>>;

  constructor(options?: SandboxOptions);
  
  // Create and enter sandbox
  async setup(): Promise<void>;
  
  // Clean up and exit sandbox
  async cleanup(): Promise<void>;
  
  // Get paths
  getTempDir(): string;
  getGitConfigPath(): string;
}
```

#### 2. Sandbox Implementation Details

##### Directory Structure
```
/tmp/wtt-test-XXXXXX/
├── git-config          # Isolated git config
├── git-credentials     # Empty credentials file
├── gnupg/              # Empty GPG home
└── workspace/          # Test workspace directory
```

##### Git Isolation Strategy

1. **Environment Variables**:
   ```
   GIT_CONFIG_GLOBAL=/tmp/wtt-test-XXXXXX/git-config
   GIT_CONFIG_SYSTEM=/dev/null
   GIT_CONFIG_NOSYSTEM=1
   HOME=/tmp/wtt-test-XXXXXX
   GNUPGHOME=/tmp/wtt-test-XXXXXX/gnupg
   GIT_ASKPASS=echo
   GIT_TERMINAL_PROMPT=0
   ```

2. **Default Git Configuration**:
   ```ini
   [user]
     name = Test User
     email = test@example.com
   [commit]
     gpgsign = false
   [tag]
     gpgsign = false
   [init]
     defaultBranch = main
   [core]
     autocrlf = false
     filemode = true
   [credential]
     helper = 
   ```

#### 3. Enhanced Test Helpers

```typescript
// Updated git helper
export async function createIsolatedTestRepo(
  sandbox: TestSandbox,
  name?: string
): Promise<SimpleGit> {
  const repoDir = path.join(sandbox.getTempDir(), 'workspace', name || 'repo');
  await fs.mkdir(repoDir, { recursive: true });
  
  const git = simpleGit(repoDir);
  await git.init();
  
  return git;
}

// Convenience wrapper for tests
export async function withTestSandbox<T>(
  fn: (sandbox: TestSandbox) => Promise<T>,
  options?: SandboxOptions
): Promise<T> {
  const sandbox = new TestSandbox(options);
  
  try {
    await sandbox.setup();
    return await fn(sandbox);
  } finally {
    await sandbox.cleanup();
  }
}
```

### Integration with Existing Tests

#### Before (Current):
```typescript
it('should create worktree', async () => {
  await withCleanEnvironment(async () => {
    const git = await createTestRepo(process.cwd());
    // Test logic...
  });
});
```

#### After (With Sandbox):
```typescript
it('should create worktree', async () => {
  await withTestSandbox(async (sandbox) => {
    const git = await createIsolatedTestRepo(sandbox);
    // Test logic...
  });
});
```

### Implementation Plan

1. **Phase 1: Core Sandbox**
   - Implement `TestSandbox` class with temp directory management
   - Add git environment isolation
   - Create default git config generation

2. **Phase 2: Helper Integration**
   - Update existing git helpers to work with sandbox
   - Add `withTestSandbox` convenience function
   - Ensure backward compatibility where possible

3. **Phase 3: Test Migration**
   - Update integration tests to use sandbox
   - Update e2e tests to use sandbox
   - Keep unit tests with mocks as-is

4. **Phase 4: Advanced Features**
   - Add sandbox preservation for debugging
   - Add sandbox state snapshots
   - Add parallel test support with unique directories

### Benefits

1. **No More Password Prompts**: GPG signing and credential helpers are disabled
2. **Predictable Environment**: Same git config across all machines
3. **True Isolation**: Tests can't affect user's git repos or config
4. **Debugging Support**: Can preserve sandbox state on test failure
5. **Performance**: Uses Node.js native temp directory APIs

### Security Considerations

1. Temp directories are created with restricted permissions (0700)
2. Git credentials are never stored
3. SSH is disabled by not setting up SSH keys
4. GPG is disabled by pointing to empty GNUPGHOME

### Example Usage

```typescript
describe('Worktree Creation', () => {
  it('should create worktree with proper isolation', async () => {
    await withTestSandbox(async (sandbox) => {
      // Create test repo
      const git = await createIsolatedTestRepo(sandbox, 'my-project');
      
      // Add initial commit
      const filePath = path.join(git.path, 'README.md');
      await fs.writeFile(filePath, '# Test');
      await git.add('.');
      await git.commit('Initial commit');
      
      // Create worktree
      const worktreePath = path.join(sandbox.getTempDir(), 'workspace', 'feature-branch');
      await git.raw(['worktree', 'add', '-b', 'feature', worktreePath]);
      
      // Verify worktree
      const worktrees = await git.raw(['worktree', 'list']);
      expect(worktrees).toContain('feature');
    });
  });
});
```

### Migration Strategy

1. Add new sandbox implementation alongside existing helpers
2. Gradually migrate tests starting with those that fail
3. Keep backward compatibility during transition
4. Remove old isolation helpers once all tests are migrated

### Future Enhancements

1. **Sandbox Templates**: Pre-configured sandboxes for common test scenarios
2. **Performance Optimization**: Reuse sandboxes for similar tests
3. **Better Debugging**: Automatic sandbox preservation on CI failures
4. **Test Fixtures**: Built-in support for common repo structures
# wtt - Git Worktree Management Tool - Overall Design

## Executive Summary

This document outlines the design for `wtt`, a cross-platform git worktree management tool optimized for AI development workflows. The tool will provide a simple, reliable interface for creating and managing git worktrees with optional tmux integration for session management. The tool is designed to be self-hosting, meaning it can be used to manage its own development worktrees.

## Git Interface Analysis

### Research Summary

We evaluated several approaches for interfacing with Git:

#### 1. **simple-git** (Recommended)
- **Type**: Git binary wrapper
- **Downloads**: 4.8M weekly
- **Last Updated**: 2 months ago
- **Dependencies**: 5,502 projects

**Pros:**
- Extremely popular and battle-tested
- Lightweight wrapper around git binary
- Supports all git commands via `.raw()` method
- TypeScript support
- Promise-based API
- Actively maintained
- Works wherever git is installed
- No native dependencies

**Cons:**
- Requires git to be installed on system
- Performance overhead of spawning processes
- Output parsing can be fragile across git versions

**Best suited for:**
- Applications that need full git functionality
- Cross-platform tools where git is already available
- Projects prioritizing simplicity and maintainability

#### 2. **isomorphic-git**
- **Type**: Pure JavaScript implementation
- **Downloads**: 429K weekly
- **Last Updated**: 4 days ago
- **Dependencies**: 420 projects

**Pros:**
- Pure JavaScript, no native dependencies
- Works in browsers and Node.js
- Modular API (tree-shakeable)
- No need for git installation

**Cons:**
- Does NOT support git worktree commands
- Limited feature set compared to full git
- Community-driven with minimal maintenance
- May have edge case compatibility issues

**Best suited for:**
- Browser-based applications
- Environments where git cannot be installed
- Simple git operations only

#### 3. **nodegit**
- **Type**: Native bindings to libgit2
- **Downloads**: 31K weekly
- **Last Updated**: 5 years ago
- **Dependencies**: 732 projects

**Pros:**
- High performance native bindings
- Direct access to libgit2 API
- No need for git binary

**Cons:**
- Not actively maintained (5 years old)
- Complex native dependencies
- Platform-specific build issues
- Large package size (23.8 MB)
- Requires specific libraries on Linux

**Best suited for:**
- Performance-critical applications
- Projects with complex git operations
- Legacy applications

#### 4. **dugite**
- **Type**: Git binary wrapper by GitHub
- **Downloads**: 3.4K weekly
- **Last Updated**: 1 year ago
- **Dependencies**: GitHub Desktop

**Pros:**
- Developed by GitHub team
- TypeScript first
- Cross-platform design
- Clean API

**Cons:**
- Less popular/community support
- Primarily driven by GitHub Desktop needs
- Still in active development
- Limited documentation

**Best suited for:**
- GitHub-integrated applications
- Electron apps
- TypeScript-first projects

#### 5. **Direct Git Binary Execution**
- **Type**: Direct child process spawning

**Pros:**
- Full control over git execution
- No dependencies
- Direct access to all git features

**Cons:**
- Must handle cross-platform differences
- Complex error handling
- Output parsing complexity
- No TypeScript support out of box

**Best suited for:**
- Minimal dependency requirements
- Custom git workflows
- Learning projects

### Recommendation: simple-git

For this project, **simple-git** is the recommended choice because:

1. **Worktree Support**: Can execute worktree commands via `.raw()` method
2. **Cross-Platform**: Works consistently across Windows, macOS, and Linux
3. **Reliability**: Battle-tested in 5,502+ projects
4. **Simplicity**: Clean API with TypeScript support
5. **Maintenance**: Actively maintained with regular updates
6. **Testing**: Easy to mock for unit tests
7. **Documentation**: Comprehensive with good examples

## Architecture Design

### Core Components

```
wtt/
├── src/
│   ├── commands/          # Command implementations
│   │   ├── init.ts       # Initialize worktree management
│   │   └── create.ts     # Create new worktree
│   ├── core/             # Core functionality
│   │   ├── git.ts        # Git operations wrapper
│   │   ├── config.ts     # Configuration management
│   │   └── types.ts      # TypeScript types
│   ├── platform/         # Platform-specific code
│   │   ├── tmux.ts       # Tmux integration
│   │   └── shell.ts      # Shell operations
│   ├── utils/            # Utility functions
│   │   ├── logger.ts     # Logging utilities
│   │   └── errors.ts     # Error handling
│   └── index.ts          # CLI entry point (wtt command)
├── test/                 # Test files
├── design/               # Design documents
└── package.json          # Defines 'wtt' as the bin command
```

### Package.json Configuration

```json
{
  "name": "wtt",
  "version": "1.0.0",
  "description": "Git worktree management tool",
  "bin": {
    "wtt": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "test": "jest"
  }
}
```

### Command Structure

#### `init` Command
- Initialize a repository for worktree management
- Validate git repository exists
- Create configuration file
- Set up base worktree structure
- Create a .gitignore file that ignores the worktree
- Detect the name of the project from package.json or use the folder name if no package.json
- Detect the mainBranch from 'main', 'master', 'trunk', or 'development', even if it is a new git repo with no commits yet
- Accepts arguments of --project-name=myproject, --base-dir=.worktrees, --enable-tmux, --disable-tmux, --main-branch=master

#### `create` Command
- Create a new worktree for a feature branch based on a user specified --name argument
- Create worktree based on mainBranch in config
- If tmux is enabled, create a window in the tmux session with the matching name. If the matching tmux session doesn't exist, create it. Switch to the new tmux window after it is created.
- If tmux is not enableed, spawn a shell in the new worktree directory and set the shell prompt to `[${worktreeName}] > `

#### `help` Command
- Unix style command line help
- Command-specific help by either `help command` or `command --help` shows specific options and descriptions for commands 

### Configuration Management

Configuration stored in `.worktree-config.json`:

```json
{
  "version": "1.0.0",
  "projectName": "myproject",
  "mainBranch": "master",
  "baseDir": ".worktrees",
  "tmux": true,
}
```

## Cross-Platform Compatibility

### Platform Detection
```typescript
interface Platform {
  os: 'windows' | 'macos' | 'linux';
  hasTmux: boolean;
  shellType: 'bash' | 'zsh' | 'powershell' | 'cmd';
}
```

### Tmux Integration
- **Auto-detect**: Check if tmux is available
- **Graceful degradation**: Work without tmux
- **Session management**: Create/attach tmux sessions when available. Create one session per worktree project and one window per worktree.

### Path Handling
- Use Node.js `path` module for cross-platform paths
- Handle Windows path separators
- Resolve symbolic links consistently

### Shell Commands
- Abstract shell operations into platform layer
- Handle command differences between platforms
- Proper escaping for different shells

## Self-Hosting Considerations

Since wtt will be used to manage its own development:

1. **Config Isolation**: The production `.worktree-config.json` in the repo root must not interfere with test configs
2. **Test Worktrees**: Tests must create worktrees in isolated temp directories, not in the actual `.worktrees` directory
3. **Git Operations**: Tests must not affect the actual wtt repository's git state
4. **Path Resolution**: Ensure tests don't accidentally use the production config or worktrees

### Test Environment Isolation

```typescript
// Test helper to ensure isolation
export function createIsolatedTestEnvironment() {
  const originalCwd = process.cwd();
  const tempDir = createTempDir();
  process.chdir(tempDir);
  
  return {
    cleanup: () => {
      process.chdir(originalCwd);
      removeTempDir(tempDir);
    }
  };
}
```

## Testing Strategy

### Testing Principles
1. **Isolation**: Tests should not affect global git config or be affected by global git config
2. **Self-hosting aware**: Tests must work even when wtt is managing its own development
3. **Reproducibility**: Tests must produce consistent results
4. **Cross-platform**: Test on Windows, macOS, and Linux
5. **Performance**: Tests should run quickly

### Test Structure

#### Unit Tests
- **Mock Strategy**: Mock simple-git for predictable behavior
- **Coverage**: Test individual functions and error cases
- **Location**: `test/unit/`

Example:
```typescript
// Mock simple-git responses
jest.mock('simple-git', () => ({
  simpleGit: jest.fn(() => ({
    checkIsRepo: jest.fn().mockResolvedValue(true),
    raw: jest.fn().mockResolvedValue(''),
  }))
}));
```

#### Integration Tests
- **Real Git**: Use actual git operations in isolated repos
- **Temp Directories**: Create temporary test repositories
- **Cleanup**: Always clean up test artifacts
- **Location**: `test/integration/`

Example:
```typescript
beforeEach(async () => {
  testDir = await createTempDir();
  await git.init();
});

afterEach(async () => {
  await cleanupTempDir(testDir);
});
```

#### End-to-End Tests
- **CLI Testing**: Test complete command flows
- **Real Environment**: Test with actual git and optional tmux
- **Platform Matrix**: Run on CI across platforms
- **Location**: `test/e2e/`

### Handling Git Configuration

To prevent global git config interference:

```typescript
// Set isolated git config for tests
const testGitConfig = {
  'user.name': 'Test User',
  'user.email': 'test@example.com',
  'commit.gpgsign': 'false',  // Disable signing
};

// Apply config in test setup
async function setupTestRepo() {
  const git = simpleGit(testDir);
  for (const [key, value] of Object.entries(testGitConfig)) {
    await git.addConfig(key, value, false, 'local');
  }
}
```

### Cross-Platform Testing

#### CI Configuration (GitHub Actions)
```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    node: [18, 20]
    include:
      - os: ubuntu-latest
        install-tmux: true
      - os: macos-latest
        install-tmux: true
```

#### Platform-Specific Tests
```typescript
describe.each([
  ['windows', 'C:\\Users\\test\\.worktrees'],
  ['linux', '/home/test/.worktrees'],
  ['macos', '/Users/test/.worktrees'],
])('Platform: %s', (platform, expectedPath) => {
  // Platform-specific test cases
});
```

### Git Output Variations

Handle potential differences in git output:

```typescript
// Parse git version for compatibility
async function getGitVersion(): Promise<string> {
  const result = await git.raw(['--version']);
  return result.match(/(\d+\.\d+\.\d+)/)?.[1] || 'unknown';
}

// Version-specific behavior
if (semver.gte(gitVersion, '2.30.0')) {
  // Use newer git features
} else {
  // Use compatible alternatives
}
```

### Test Data Management

```typescript
// Fixtures for consistent test data
const fixtures = {
  commits: [
    { message: 'Initial commit', files: ['README.md'] },
    { message: 'Add feature', files: ['src/feature.ts'] },
  ],
  branches: ['main', 'feature/test', 'bugfix/issue-123'],
};
```

## Error Handling

### Error Types
```typescript
class WorktreeError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

class GitError extends WorktreeError {}
class TmuxError extends WorktreeError {}
class ConfigError extends WorktreeError {}
```

### User-Friendly Messages
- Clear error descriptions
- Suggested fixes
- Relevant documentation links

## Implementation Phases

### Phase 1: Foundation
1. Project setup with TypeScript
2. Core git wrapper with simple-git
3. Basic `init` command
4. Unit test framework

### Phase 2: Create Command
1. Implement `create` command
2. Tmux detection and integration
3. Configuration management
4. Integration tests

### Phase 3: Polish
1. Error handling improvements
2. Cross-platform testing
3. Documentation
4. CI/CD setup
5. eslint, husky, commitlint setup based on ../graphty/algorithms

## Summary

This design prioritizes:
- **Simplicity**: Using simple-git for reliable git operations
- **Reliability**: Comprehensive testing strategy
- **Maintainability**: Clear architecture and separation of concerns
- **Cross-platform**: Careful handling of platform differences
- **User Experience**: Clear errors and graceful degradation

The choice of simple-git provides the best balance of features, reliability, and maintainability for a git worktree management tool.

## Usage Example

Once wtt is initialized in this repository, the development workflow will be:

```bash
# Initialize wtt in the wtt repository itself
wtt init --project-name=wtt

# Create a worktree for developing the list command
wtt create --name=feature-list-command

# Create another worktree for bug fixes
wtt create --name=fix-tmux-handling

# Each worktree will be in .worktrees/[name] with its own git branch
```

This self-hosting capability ensures wtt is battle-tested through its own development process.

# Initial Implementation Plan for wtt

## Overview

This implementation plan breaks down the development of `wtt` (the git worktree management tool) into incremental, testable steps. Each step builds upon the previous one, allowing for continuous testing and validation. The plan accounts for wtt being self-hosting - it will be used to manage its own development worktrees.

## Phase 1: Foundation Setup

### Step 1.1: Initialize Project Structure
**Tasks:**
1. Create package.json with TypeScript and required dependencies
2. Set up TypeScript configuration (tsconfig.json)
3. Create basic directory structure
4. Set up Jest testing framework
5. Add npm scripts for build, test, and development

**Package.json structure:**
```json
{
  "name": "wtt",
  "version": "0.1.0",
  "description": "Git worktree management tool",
  "bin": {
    "wtt": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "dependencies": {
    "simple-git": "^3.28.0",
    "commander": "^12.0.0",
    "chalk": "^5.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/jest": "^29.0.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "ts-node": "^10.0.0"
  }
}
```

**Verification:**
- Run `npm test` successfully
- Run `npm run build` successfully
- TypeScript compiles without errors

### Step 1.2: Create Core Types and Interfaces
**Files to create:**
- `src/core/types.ts` - Core TypeScript interfaces and types
- `src/utils/errors.ts` - Custom error classes

**Key interfaces:**
```typescript
interface WorktreeConfig {
  version: string;
  projectName: string;
  mainBranch: string;
  baseDir: string;
  tmux: boolean;
}

interface Platform {
  os: 'windows' | 'macos' | 'linux';
  hasTmux: boolean;
  shellType: 'bash' | 'zsh' | 'powershell';
}
```

**Tests:**
- Unit tests for error classes
- Type validation tests

### Step 1.3: Implement Git Wrapper
**Files to create:**
- `src/core/git.ts` - Git operations wrapper using simple-git
- `test/unit/core/git.test.ts` - Unit tests with mocked simple-git

**Key functions:**
```typescript
- isGitRepository(): Promise<boolean>
- getMainBranch(): Promise<string>
- createWorktree(path: string, branch: string): Promise<void>
- listWorktrees(): Promise<WorktreeInfo[]>
```

**Tests:**
- Mock all simple-git calls
- Test error handling for non-git directories
- Test branch detection logic

### Step 1.4: Implement Platform Detection
**Files to create:**
- `src/platform/detector.ts` - Platform detection logic
- `test/unit/platform/detector.test.ts` - Platform detection tests

**Key functions:**
```typescript
- detectPlatform(): Platform
- checkTmuxAvailable(): Promise<boolean>
- detectShell(): ShellType
```

**Tests:**
- Mock process.platform for OS detection
- Mock command execution for tmux detection
- Test shell detection across platforms

## Phase 2: Configuration Management

### Step 2.1: Implement Config Reader/Writer
**Files to create:**
- `src/core/config.ts` - Configuration management
- `test/unit/core/config.test.ts` - Config tests

**Key functions:**
```typescript
- loadConfig(): Promise<WorktreeConfig | null>  // Always reads .worktree-config.json
- saveConfig(config: WorktreeConfig): Promise<void>  // Always writes .worktree-config.json
- getDefaultConfig(projectName: string): WorktreeConfig
- validateConfig(config: unknown): config is WorktreeConfig
```

**Tests:**
- Test reading/writing JSON files
- Test missing config handling
- Test config validation
- Test default config generation

### Step 2.2: Implement Project Detection
**Files to create:**
- `src/utils/project.ts` - Project name and directory detection
- `test/unit/utils/project.test.ts` - Project detection tests

**Key functions:**
```typescript
- detectProjectName(dir: string): Promise<string>
- findPackageJson(dir: string): Promise<string | null>
- sanitizeProjectName(name: string): string
```

**Tests:**
- Test package.json detection
- Test fallback to directory name
- Test name sanitization for tmux compatibility

## Phase 3: Init Command Implementation

### Step 3.1: Create CLI Framework
**Files to create:**
- `src/index.ts` - Main CLI entry point with #!/usr/bin/env node
- `src/cli/program.ts` - Commander setup
- `test/unit/cli/program.test.ts` - CLI tests

**Key setup:**
- Configure commander with version and description
- Program name should be 'wtt'
- Add global options (--verbose, --quiet)
- Set up command routing

**Implementation notes:**
```typescript
// src/index.ts
#!/usr/bin/env node
import { program } from './cli/program';
program.parse(process.argv);
```

**Tests:**
- Test help output shows 'wtt' as command name
- Test version output
- Test unknown command handling

### Step 3.2: Implement Init Command Core
**Files to create:**
- `src/commands/init.ts` - Init command implementation
- `test/unit/commands/init.test.ts` - Init command unit tests

**Key functions:**
```typescript
interface InitOptions {
  projectName?: string;
  baseDir?: string;
  enableTmux?: boolean;
  disableTmux?: boolean;
  mainBranch?: string;
}

- validateInitOptions(options: InitOptions): void
- executeInit(options: InitOptions): Promise<void>
```

**Tests:**
- Test option validation
- Test config file creation
- Test .gitignore update
- Mock all file system operations

### Step 3.3: Add Init Integration Tests
**Files to create:**
- `test/integration/commands/init.test.ts` - Real file system tests
- `test/helpers/git.ts` - Test helper functions
- `test/helpers/isolation.ts` - Self-hosting isolation helpers

**Test scenarios:**
- Init in non-git directory (should fail)
- Init in git directory without commits
- Init in git directory with existing branches
- Init with custom options
- Init when already initialized
- Init doesn't interfere with parent wtt repository

**Self-hosting test example:**
```typescript
describe('init command (self-hosting)', () => {
  let isolation: { cleanup: () => Promise<void> };
  
  beforeEach(async () => {
    isolation = await ensureTestIsolation();
  });
  
  afterEach(async () => {
    await isolation.cleanup();
  });
  
  it('should not read parent .worktree-config.json', async () => {
    // Test runs in isolated temp directory
    // Should not see the wtt repo's own config
  });
});

## Phase 4: Create Command Implementation

### Step 4.1: Implement Shell Operations (Copy from ../wtt)
**Files to create:**
- `src/platform/shell.ts` - Shell spawning abstractions (copy prompt logic from ../wtt)
- `test/unit/platform/shell.test.ts` - Shell operation tests

**Key functions:**
```typescript
- spawnShell(directory: string, shellType: ShellType, worktreeName: string): Promise<void>
- getShellCommand(shellType: ShellType): string
- getShellArgs(shellType: ShellType): string[]
- setShellPrompt(shellType: ShellType, worktreeName: string): string[]
```

**Implementation notes:**
- Copy the prompt-setting logic from ../wtt project
- Support bash, zsh, and powershell prompts
- Set prompt to show `[${worktreeName}] > ` format

**Tests:**
- Test shell command generation per platform
- Test prompt setting for each shell type
- Test directory changing logic
- Mock child_process.spawn

### Step 4.2: Implement Tmux Operations
**Files to create:**
- `src/platform/tmux.ts` - Tmux session/window management
- `test/unit/platform/tmux.test.ts` - Tmux operation tests

**Key functions:**
```typescript
- sanitizeTmuxName(name: string): string  // Handle spaces and special characters
- createTmuxSession(sessionName: string): Promise<void>
- createTmuxWindow(sessionName: string, windowName: string, directory: string): Promise<void>
- switchToTmuxWindow(sessionName: string, windowName: string): Promise<void>
- tmuxSessionExists(sessionName: string): Promise<boolean>
```

**Implementation notes:**
- Replace spaces with hyphens in tmux names
- Remove or replace special characters that tmux doesn't allow
- Ensure names are valid for tmux identifiers

**Tests:**
- Mock all tmux command executions
- Test session name sanitization with spaces and special characters
- Test error handling for missing tmux

### Step 4.3: Implement Create Command Core
**Files to create:**
- `src/commands/create.ts` - Create command implementation
- `test/unit/commands/create.test.ts` - Create command unit tests

**Key functions:**
```typescript
interface CreateOptions {
  name: string;
}

- validateCreateOptions(options: CreateOptions): void
- executeCreate(options: CreateOptions): Promise<void>
- sanitizeWorktreeName(name: string): string  // For branch and directory names
```

**Implementation notes:**
- Branch name and worktree name are the same
- Sanitize names for git branch compatibility
- Handle spaces and special characters in worktree names
- Create directory as `.worktrees/${name}`

**Tests:**
- Test worktree name validation
- Test name sanitization for git compatibility
- Test tmux vs shell spawning logic
- Mock all external operations

### Step 4.4: Add Create Integration Tests
**Files to create:**
- `test/integration/commands/create.test.ts` - Full create flow tests

**Test scenarios:**
- Create worktree with tmux available
- Create worktree without tmux
- Create worktree with existing branch
- Create multiple worktrees
- Create worktree with spaces in name (e.g., "feature add new button")
- Create worktree with special characters
- Error handling for duplicate names
- Error handling for invalid git branch names

## Phase 5: Help Command and Polish

### Step 5.1: Implement Help Command
**Files to create:**
- `src/commands/help.ts` - Help command implementation
- `test/unit/commands/help.test.ts` - Help command tests

**Features:**
- General help when no command specified
- Command-specific help
- Properly formatted output with examples

### Step 5.2: Implement Logging System
**Files to create:**
- `src/utils/logger.ts` - Logging utilities
- `test/unit/utils/logger.test.ts` - Logger tests

**Features:**
- Colored output with chalk
- Verbosity levels (quiet, normal, verbose)
- Progress indicators for long operations
- **Concise output by default** (2-3 lines max)
- Detailed output only in verbose mode

**Output requirements:**
```typescript
// Default mode - minimal output
logger.success('Initialized worktree project. Config: .worktree-config.json');

// Verbose mode - detailed output
if (verbose) {
  logger.info('Repository initialized with:');
  logger.log(`  Project name: ${projectName}`);
  logger.log(`  Main branch:  ${mainBranch}`);
  // etc...
}
```

### Step 5.3: Add End-to-End Tests
**Files to create:**
- `test/e2e/full-flow.test.ts` - Complete workflow tests
- `.github/workflows/test.yml` - CI configuration

**Test scenarios:**
- Full init → create → create flow
- Cross-platform testing matrix
- Tmux availability variations

## Phase 6: Code Quality and CI/CD

### Step 6.1: Set Up Linting and Formatting
**Tasks:**
1. Configure ESLint with TypeScript rules
2. Add Prettier configuration
3. Set up Husky pre-commit hooks
4. Configure commitlint

**Files to create:**
- `.eslintrc.json`
- `.prettierrc`
- `.husky/pre-commit`
- `commitlint.config.js`

### Step 6.2: Add Build and Release Pipeline
**Tasks:**
1. Create npm publish workflow
2. Add semantic release configuration
3. Create distributable binaries
4. Add installation instructions

**Files to create:**
- `.github/workflows/release.yml`
- `.releaserc`

## Testing Strategy Implementation

### Test Utilities to Create
1. **Git Test Helpers** (`test/helpers/git.ts`):
   - `createTestRepo()` - Creates isolated test repository
   - `createTestCommit()` - Creates commits with test data
   - `cleanupTestRepo()` - Cleanup function

2. **Mock Factories** (`test/helpers/mocks.ts`):
   - `mockSimpleGit()` - Consistent simple-git mocks
   - `mockFileSystem()` - File system operation mocks
   - `mockChildProcess()` - Process spawning mocks

3. **Platform Test Helpers** (`test/helpers/platform.ts`):
   - `withPlatform()` - Run tests with mocked platform
   - `withTmux()` - Run tests with tmux available/unavailable

4. **Self-hosting Test Helpers** (`test/helpers/isolation.ts`):
   - `createIsolatedEnvironment()` - Ensures tests don't use production config
   - `withCleanEnvironment()` - Wrapper to run tests in isolation
   - `ensureNotInWorktree()` - Verify test isn't running in a wtt worktree

**Critical for self-hosting:**
```typescript
// test/helpers/isolation.ts
export async function ensureTestIsolation() {
  // Change to temp directory before tests
  const originalCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtt-test-'));
  process.chdir(tempDir);
  
  return {
    cleanup: async () => {
      process.chdir(originalCwd);
      await fs.rm(tempDir, { recursive: true });
    }
  };
}
```

### CI Test Matrix
```yaml
test:
  strategy:
    matrix:
      os: [ubuntu-latest, windows-latest, macos-latest]
      node: [18, 20]
      tmux: [true, false]
    exclude:
      - os: windows-latest
        tmux: true
```

## Implementation Guidelines

### For Each Step:
1. Write tests first (TDD approach)
2. Implement minimal code to pass tests
3. Refactor for clarity and maintainability
4. Update documentation
5. Ensure all tests pass before moving to next step

### Code Standards:
1. All public functions must have JSDoc comments
2. Use descriptive variable and function names
3. Keep functions small and focused
4. Handle errors gracefully with helpful messages
5. Log operations at appropriate verbosity levels

### Git Commit Convention:
```
type(scope): subject

- feat: New feature
- fix: Bug fix
- test: Test additions/changes
- docs: Documentation changes
- refactor: Code refactoring
- chore: Build/config changes
```

## Success Criteria

Each phase is complete when:
1. All unit tests pass with >90% coverage
2. Integration tests pass on all platforms
3. Code passes linting and formatting checks
4. Documentation is updated
5. Manual testing confirms expected behavior

## Self-Hosting Workflow

Once the initial implementation is complete, wtt will be used for its own development:

```bash
# In the wtt repository root
npm run build
npm link  # Make wtt available globally

# Initialize wtt for self-hosting
wtt init --project-name=wtt

# Create worktrees for parallel development
wtt create --name=feature-list-command
wtt create --name=fix-windows-paths
```

## Next Steps After Initial Implementation

1. Add `list` command to show all worktrees
2. Add `remove` command to delete worktrees
3. Add `switch` command to change active worktree
4. Add session recovery for interrupted operations
5. Add support for worktree templates
6. Create VS Code extension for integration
7. Add support for multiple repositories
8. Add `wtt worktree` command to run commands in all worktrees
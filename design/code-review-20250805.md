# Comprehensive Code Review - Worktree Tool
Date: 2025-08-05 (Updated with Deep Dive Analysis)

## Executive Summary

This review covers the worktree-tool codebase with special attention to the recently added `exec` command, overall architecture, code quality, and test infrastructure. After a deep analysis of every file, significant code duplication has been identified across command implementations, error handling, sanitization functions, and test infrastructure. While the codebase demonstrates solid engineering practices, there are substantial opportunities for consolidation and abstraction.

## Architecture Overview

### Strengths

1. **Clear Separation of Concerns**: The codebase follows a well-structured modular architecture:
   - `src/commands/` - Command implementations
   - `src/core/` - Core business logic (git, config, types)
   - `src/platform/` - Platform-specific abstractions (tmux, shell, detector)
   - `src/utils/` - Shared utilities (errors, logger, project)

2. **Type Safety**: Comprehensive TypeScript usage with well-defined interfaces and types in `core/types.ts`

3. **Error Handling**: Custom error classes (`WorktreeToolError`, `GitError`, `PlatformError`) provide context-specific error handling with user-friendly hints

4. **Platform Abstraction**: Good abstraction for cross-platform support (Windows, macOS, Linux) with proper detection and fallback mechanisms

### Areas for Improvement

1. **Command Pattern Implementation**: Commands are implemented as separate modules but lack a common interface or base class, leading to some code duplication in error handling and option processing

2. **Dependency Injection**: Direct imports throughout make testing more complex than necessary. Consider dependency injection for better testability

3. **Configuration Management**: Config loading is scattered across commands. Could benefit from a centralized configuration service

## Code Quality Analysis

### Exec Command Review

The `exec` command implementation (`src/commands/exec.ts`) shows good design patterns but has some areas for improvement:

**Strengths:**
- Clear validation flow with descriptive error messages
- Proper tmux session management with first-window handling
- Environment variable injection for worktree context
- Graceful fallback from tmux to shell execution

**Issues:**
1. **Long Functions**: `executeCommand` (75 lines) and the main action handler (88 lines) are too long and handle multiple responsibilities
2. **Duplicate Logger Creation**: Logger is created twice in error handling (lines 36 and 111)
3. **Magic Strings**: Environment variable names (`WTT_WORKTREE_NAME`, etc.) should be constants
4. **Complex Conditional Logic**: The tmux attachment logic (lines 174-194) has nested conditions that could be simplified

## Deep Dive Analysis: Code Duplication Patterns

After analyzing every file in the codebase, here are the detailed duplication patterns found:

### 1. Command Implementation Patterns

#### Error Handling Duplication
Every command (init.ts, create.ts, exec.ts) has nearly identical error handling:

```typescript
// Pattern repeated in init.ts:126-136, create.ts:133-142, exec.ts:109-121
} catch(error) {
    if (error instanceof ValidationError ||
        error instanceof GitError ||
        error instanceof ConfigError) {
        logger.error(error.message);
    } else {
        logger.error(`Failed to [action]: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
}
```

#### Common Command Structure
All commands follow this pattern:
1. Create logger
2. Validate options
3. Load config (except help)
4. Check git repository
5. Execute main logic
6. Handle errors with process.exit(1)

### 2. Sanitization Function Duplication

Five different sanitization functions with overlapping logic:

#### `sanitizeTmuxName` (tmux.ts:12-17)
```typescript
.replace(/\s+/g, "-")
.replace(/[^a-zA-Z0-9\-_]/g, "")
.toLowerCase();
```

#### `sanitizeTmuxWindowName` (tmux.ts:22-26)
```typescript
.replace(/['"]/g, "")
.trim();
```

#### `sanitizeProjectName` (project.ts:69-96)
```typescript
.replace(/[^a-zA-Z0-9\-_]/g, "-")
.replace(/^-+|-+$/g, "")
.replace(/-+/g, "-")
// Plus special handling for npm scopes and numeric prefixes
```

#### `sanitizeGitBranchName` (project.ts:143-175)
```typescript
.replace(/\s+/g, "-")
.replace(/[\x00-\x1F\x7F~^:?*\[\]\\!]/g, "")
.replace(/^\.+/, "")
.replace(/\.+$/, "")
.replace(/\.\.+/g, "-")
.replace(/-+/g, "-")
.replace(/^-+|-+$/g, "")
```

#### `sanitizeWorktreeName` (create.ts:31-44)
```typescript
.replace(/\s+/g, "-")
.replace(/[~^:?*[\]\\!@#$%&*()+={}|"'<>`,/]/g, "")
.replace(/^[.-]+|[.-]+$/g, "")
.replace(/^-+/, "")
.toLowerCase();
```

### 3. Error Message Formatting Duplication

The pattern `error instanceof Error ? error.message : String(error)` appears **31 times** across the codebase:

- tmux.ts: 12 occurrences
- git.ts: 5 occurrences
- shell.ts: 1 occurrence
- config.ts: 2 occurrences
- create.ts: 3 occurrences
- init.ts: 1 occurrence
- exec.ts: 4 occurrences
- Plus 3 more in other files

### 4. Test Infrastructure Duplication

#### Mock Logger Pattern
Identical in every test file:
```typescript
mockLogger = {
    verbose: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
    getLevel: vi.fn().mockReturnValue("normal"),
};
```

#### Process Exit Mock Pattern
Repeated in 5 test files with slight variations:
```typescript
mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("process.exit");
});
```

#### Common Test Setup Pattern
Every command test file has:
1. Mock imports (6-8 modules)
2. BeforeEach with identical mock setup
3. AfterEach with mockExit.mockRestore()
4. Three test suites: validation, execution, command definition

### 5. Platform-Specific Duplication

#### Terminal Detection in ShellManager
The `executeInNewWindow` method (shell.ts:184-243) has repeated terminal detection:
```typescript
// Pattern repeated for each terminal type
try {
    if (term === "gnome-terminal") {
        await execAsync(`${term} --title="${this.escapeShell(windowTitle)}" ...`);
        return;
    }
} catch {
    // Try next terminal
}
```

#### Tmux Error Handling
Every tmux function follows the same pattern:
```typescript
try {
    await execFileAsync("tmux", args);
} catch(error) {
    throw new PlatformError(`Failed to [action]: ${error instanceof Error ? error.message : String(error)}`);
}
```

### 6. Configuration and Validation Patterns

#### Empty String Validation
Repeated validation pattern across commands:
```typescript
if (options.someField !== undefined && options.someField.trim() === "") {
    throw new ValidationError("Field cannot be empty");
}
```

#### Config Loading Pattern
Both create.ts and exec.ts have identical config loading:
```typescript
const config = await loadConfig();
if (!config) {
    throw new ConfigError("Repository not initialized. Run \"wtt init\" first");
}
```

### 7. Git Repository Checks

Duplicated in init.ts and create.ts:
```typescript
const git = createGit();
const isRepo = await git.isGitRepository();
if (!isRepo) {
    throw new GitError("Not in a git repository");
}
```

### 8. Logger Verbose Patterns

Every command has similar verbose logging:
```typescript
logger.verbose("Loading configuration...");
// action
logger.verbose("Checking git repository...");
// action
logger.verbose("Creating worktree: " + name);
```

### Impact Analysis

1. **Code Volume**: Approximately 30-40% of the codebase consists of duplicated patterns
2. **Maintenance Burden**: Changes to error handling or logging require updates in 10+ locations
3. **Test Complexity**: Each test file is 50+ lines longer due to repeated mock setup
4. **Bug Risk**: Inconsistent implementations of similar functionality (e.g., different sanitization rules)

## Test Infrastructure Analysis

### Strengths

1. **Comprehensive Test Coverage**: Three test levels (unit, integration, e2e) with clear separation
2. **Test Isolation**: Excellent `TestSandbox` implementation providing:
   - Temporary directory management
   - Git configuration isolation
   - Environment variable isolation
   - Cleanup handling
3. **Mock Organization**: Well-structured mocks for external dependencies

### Areas for Improvement

1. **Mock Complexity**: Some test files have extensive mock setup (e.g., exec.test.ts with 23 mocks). Consider:
   - Factory functions for common mock configurations
   - Test data builders for complex objects
   - Reducing the number of mocks through better abstraction

2. **Test Duplication**: Similar test setups across files could be extracted to shared test utilities

3. **Integration Test Reliability**: Shell/tmux integration tests may be flaky due to system dependencies. Consider:
   - Better detection of test environment capabilities
   - Skip patterns for unsupported environments
   - Mock implementations for CI environments

## Specific Recommendations

Based on the deep dive analysis, here are detailed refactoring recommendations:

### 1. Create Unified Error Handling Utility

```typescript
// src/utils/error-handler.ts
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function handleCommandError(error: unknown, logger: Logger): never {
  if (error instanceof ValidationError ||
      error instanceof GitError ||
      error instanceof ConfigError ||
      error instanceof WorktreeToolError) {
    logger.error(error.message);
    if ('hint' in error && error.hint) {
      logger.info(`Hint: ${error.hint}`);
    }
  } else {
    logger.error(getErrorMessage(error));
  }
  process.exit(1);
}

// Usage in commands:
} catch(error) {
  handleCommandError(error, logger);
}
```

### 2. Consolidate Sanitization Functions

```typescript
// src/utils/sanitize.ts
export interface SanitizeOptions {
  allowSpaces?: boolean;
  allowUppercase?: boolean;
  allowDots?: boolean;
  allowSpecialChars?: string;
  maxLength?: number;
  defaultValue?: string;
}

const PRESETS = {
  TMUX_SESSION: {
    allowSpaces: false,
    allowUppercase: false,
    allowDots: false,
    allowSpecialChars: '-_',
  },
  TMUX_WINDOW: {
    allowSpaces: true,
    allowUppercase: true,
    allowDots: true,
    allowSpecialChars: '-_:',
  },
  GIT_BRANCH: {
    allowSpaces: false,
    allowUppercase: true,
    allowDots: true,
    allowSpecialChars: '-_/',
    maxLength: 255,
  },
  PROJECT_NAME: {
    allowSpaces: false,
    allowUppercase: true,
    allowDots: false,
    allowSpecialChars: '-_',
    defaultValue: 'project',
  },
  WORKTREE_NAME: {
    allowSpaces: false,
    allowUppercase: false,
    allowDots: false,
    allowSpecialChars: '-_',
    maxLength: 100,
  }
} as const;

export function sanitize(input: string, preset: keyof typeof PRESETS): string {
  const options = PRESETS[preset];
  // Single implementation handling all cases
  let result = input.trim();
  
  if (!options.allowSpaces) {
    result = result.replace(/\s+/g, '-');
  }
  
  // Build allowed chars regex based on options
  const allowedChars = `a-zA-Z0-9${options.allowSpecialChars || ''}`;
  const regex = new RegExp(`[^${allowedChars}]`, 'g');
  result = result.replace(regex, '');
  
  // ... rest of implementation
  
  return result;
}
```

### 3. Create Command Base Infrastructure

```typescript
// src/commands/base.ts
export interface CommandContext {
  logger: Logger;
  config: WorktreeConfig | null;
  git: Git;
}

export abstract class BaseCommand<TOptions = any> {
  protected abstract validateOptions(options: TOptions): void;
  protected abstract executeCommand(options: TOptions, context: CommandContext): Promise<void>;
  
  async execute(options: TOptions): Promise<void> {
    const logger = getLogger(options);
    
    try {
      this.validateOptions(options);
      
      const context: CommandContext = {
        logger,
        config: await this.loadConfigIfNeeded(),
        git: createGit(),
      };
      
      if (this.requiresGitRepo && !(await context.git.isGitRepository())) {
        throw new GitError("Not in a git repository");
      }
      
      await this.executeCommand(options, context);
    } catch (error) {
      handleCommandError(error, logger);
    }
  }
  
  protected get requiresConfig(): boolean { return true; }
  protected get requiresGitRepo(): boolean { return true; }
  
  private async loadConfigIfNeeded(): Promise<WorktreeConfig | null> {
    if (!this.requiresConfig) return null;
    
    const config = await loadConfig();
    if (!config) {
      throw new ConfigError('Repository not initialized. Run "wtt init" first');
    }
    return config;
  }
}

// Example usage:
export class CreateCommand extends BaseCommand<CreateOptions> {
  protected requiresConfig = true;
  protected requiresGitRepo = true;
  
  protected validateOptions(options: CreateOptions): void {
    if (!options.name || options.name.trim() === "") {
      throw new ValidationError("Worktree name is required");
    }
    // ... rest of validation
  }
  
  protected async executeCommand(options: CreateOptions, context: CommandContext): Promise<void> {
    // Implementation without error handling boilerplate
  }
}
```

### 4. Unified Test Infrastructure

```typescript
// test/helpers/mocks.ts
export function createMockLogger(overrides?: Partial<Logger>): Logger {
  return {
    verbose: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
    progress: vi.fn().mockReturnValue(vi.fn()),
    getLevel: vi.fn().mockReturnValue("normal"),
    ...overrides,
  };
}

export function createMockGit(overrides?: Partial<Git>): Git {
  return {
    isGitRepository: vi.fn().mockResolvedValue(true),
    hasCommits: vi.fn().mockResolvedValue(true),
    createWorktree: vi.fn().mockResolvedValue(undefined),
    getMainBranch: vi.fn().mockResolvedValue("main"),
    listWorktrees: vi.fn().mockResolvedValue([]),
    getRepoRoot: vi.fn().mockResolvedValue("/repo"),
    branchExists: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

export function mockProcessExit(): SpyInstance {
  return vi.spyOn(process, "exit").mockImplementation((code?: any): never => {
    throw new ProcessExitError(code);
  });
}

export class ProcessExitError extends Error {
  constructor(public code: number) {
    super(`Process exited with code ${code}`);
  }
}

// test/helpers/setup.ts
export function setupCommandTest() {
  const mocks = {
    logger: createMockLogger(),
    git: createMockGit(),
    exitSpy: mockProcessExit(),
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(logger.getLogger).mockReturnValue(mocks.logger);
    vi.mocked(git.createGit).mockReturnValue(mocks.git);
  });
  
  afterEach(() => {
    mocks.exitSpy.mockRestore();
  });
  
  return mocks;
}
```

### 5. Platform-Specific Strategy Pattern

```typescript
// src/platform/terminal-strategy.ts
interface TerminalStrategy {
  canHandle(): boolean;
  openWindow(command: string, cwd: string, title: string): Promise<void>;
}

class GnomeTerminalStrategy implements TerminalStrategy {
  canHandle(): boolean {
    return process.platform === 'linux';
  }
  
  async openWindow(command: string, cwd: string, title: string): Promise<void> {
    await execAsync(`gnome-terminal --title="${title}" -- bash -c "cd ${cwd} && ${command}; exec bash"`);
  }
}

class TerminalManager {
  private strategies: TerminalStrategy[] = [
    new GnomeTerminalStrategy(),
    new KonsoleStrategy(),
    new MacTerminalStrategy(),
    new WindowsTerminalStrategy(),
  ];
  
  async openWindow(command: string, cwd: string, title: string): Promise<void> {
    for (const strategy of this.strategies) {
      if (await strategy.canHandle()) {
        try {
          await strategy.openWindow(command, cwd, title);
          return;
        } catch {
          // Try next strategy
        }
      }
    }
    
    throw new PlatformError('No terminal emulator found. Consider enabling tmux.');
  }
}
```

### 6. Constants and Configuration

```typescript
// src/core/constants.ts
export const ENV_VARS = {
  WORKTREE_NAME: 'WTT_WORKTREE_NAME',
  WORKTREE_PATH: 'WTT_WORKTREE_PATH',
  IS_MAIN: 'WTT_IS_MAIN',
  DISABLE_TMUX: 'WTT_DISABLE_TMUX',
  TEST_TMUX: 'WTT_TEST_TMUX',
} as const;

export const VALIDATION = {
  MAX_WORKTREE_NAME_LENGTH: 100,
  MAX_BRANCH_NAME_LENGTH: 255,
  EMPTY_STRING_ERROR: 'cannot be empty',
} as const;

export const GIT_ERRORS = {
  NO_COMMITS: 'No commits found. Please make at least one commit before creating worktrees.',
  NOT_A_REPO: 'Not in a git repository',
  INVALID_HEAD: 'Not a valid object name',
} as const;
```

### 7. Validation Utilities

```typescript
// src/utils/validation.ts
export function validateNotEmpty(value: string | undefined, fieldName: string): void {
  if (value !== undefined && value.trim() === '') {
    throw new ValidationError(`${fieldName} ${VALIDATION.EMPTY_STRING_ERROR}`);
  }
}

export function validateOptions<T extends Record<string, any>>(
  options: T,
  validators: Array<(options: T) => void>
): void {
  for (const validator of validators) {
    validator(options);
  }
}

// Usage:
validateOptions(options, [
  (opts) => validateNotEmpty(opts.projectName, 'Project name'),
  (opts) => validateNotEmpty(opts.baseDir, 'Base directory'),
  (opts) => {
    if (opts.enableTmux && opts.disableTmux) {
      throw new ValidationError('Cannot specify both --enable-tmux and --disable-tmux');
    }
  },
]);
```

## Security Considerations

1. **Command Injection**: The exec command properly escapes shell commands, but consider additional validation for user-provided command strings
2. **File Permissions**: TestSandbox correctly sets restrictive permissions (0o700), good practice
3. **Git Credentials**: Proper isolation in test environment prevents credential leakage

## Performance Considerations

1. **Async Operations**: Good use of async/await throughout, but some operations could be parallelized:
   - Multiple worktree operations in exec command
   - Git operations that don't depend on each other

2. **Process Spawning**: Consider connection pooling or reuse for tmux operations to reduce overhead

## Implementation Roadmap

Based on the deep dive analysis, here's a prioritized roadmap for addressing the code duplication:

### Phase 1: Critical Infrastructure (1-2 days)
1. **Error Handling Utility** - Implement `getErrorMessage()` and `handleCommandError()`
   - Reduces 31 duplicate error formatting instances
   - Estimated LOC reduction: ~150 lines
   
2. **Test Infrastructure** - Create mock factories and `setupCommandTest()`
   - Reduces test setup by ~50 lines per test file
   - Estimated LOC reduction: ~400 lines

3. **Constants Module** - Define all magic strings
   - Improves maintainability and prevents typos
   - Makes configuration changes easier

### Phase 2: Core Refactoring (2-3 days)
1. **Sanitization Module** - Consolidate 5 sanitization functions
   - Ensures consistent behavior across the codebase
   - Estimated LOC reduction: ~200 lines
   
2. **Command Base Class** - Extract common command patterns
   - Standardizes command implementation
   - Estimated LOC reduction: ~300 lines

3. **Validation Utilities** - Common validation patterns
   - Reduces validation code duplication
   - Estimated LOC reduction: ~100 lines

### Phase 3: Platform Improvements (1-2 days)
1. **Terminal Strategy Pattern** - Refactor terminal detection
   - Makes adding new terminals easier
   - Improves testability
   
2. **Tmux Error Handling** - Create tmux command wrapper
   - Reduces duplicate error handling in 15+ tmux functions
   - Estimated LOC reduction: ~150 lines

### Total Impact
- **Estimated LOC Reduction**: ~1,300 lines (approximately 25-30% of codebase)
- **Files Affected**: ~25 files
- **Test Coverage**: Should remain at current levels or improve
- **Breaking Changes**: None - all refactoring is internal

## Conclusion

The deep dive analysis reveals that while the worktree-tool has a solid architecture, approximately 30-40% of the codebase consists of duplicated patterns. The most significant duplication occurs in:

1. **Error handling** - 31 instances of identical error message formatting
2. **Test infrastructure** - Each test file contains ~50 lines of duplicate setup
3. **Sanitization functions** - 5 different functions with overlapping logic
4. **Command structure** - Repeated patterns across all command implementations

The recommended refactoring would:
- Reduce codebase size by approximately 1,300 lines
- Improve consistency across similar functionality
- Make the codebase significantly easier to maintain
- Reduce the risk of bugs from inconsistent implementations
- Make adding new features faster and less error-prone

These improvements are not critical for functionality but would significantly enhance developer experience and long-term maintainability. The modular nature of the proposed changes allows for incremental implementation without disrupting existing functionality.
# Refactoring Implementation Plan - Worktree Tool
Date: 2025-08-05

## Overview
This document provides a step-by-step implementation plan for the refactoring recommendations from the code review. Each phase includes specific files to create/modify, exact changes to make, and validation steps.

## Phase 1: Critical Infrastructure (Day 1)

### 1.1 Create Error Handling Utility
**New File: `src/utils/error-handler.ts`**

```typescript
import { Logger } from './logger.js';
import { 
  ValidationError, 
  GitError, 
  ConfigError, 
  WorktreeToolError 
} from './errors.js';

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
```

**Files to Update:**
1. `src/commands/init.ts`
   - Import: `import { handleCommandError, getErrorMessage } from '../utils/error-handler.js';`
   - Replace lines 126-136 with: `} catch(error) { handleCommandError(error, logger); }`

2. `src/commands/create.ts`
   - Import: `import { handleCommandError, getErrorMessage } from '../utils/error-handler.js';`
   - Replace lines 133-142 with: `} catch(error) { handleCommandError(error, logger); }`
   - Replace lines 207, 229 with calls to `getErrorMessage(error)`

3. `src/commands/exec.ts`
   - Import: `import { handleCommandError, getErrorMessage } from '../utils/error-handler.js';`
   - Replace lines 109-121 with: `} catch(error) { handleCommandError(error, logger); }`
   - Replace lines 167, 183, 191 with calls to `getErrorMessage(error)`

4. `src/platform/tmux.ts`
   - Import: `import { getErrorMessage } from '../utils/error-handler.js';`
   - Replace all 12 occurrences of `error instanceof Error ? error.message : String(error)` with `getErrorMessage(error)`

5. `src/platform/shell.ts`
   - Import: `import { getErrorMessage } from '../utils/error-handler.js';`
   - Replace line 145 with `getErrorMessage(error)`

6. `src/core/git.ts`
   - Import: `import { getErrorMessage } from '../utils/error-handler.js';`
   - Replace all 5 occurrences with `getErrorMessage(error)`

7. `src/core/config.ts`
   - Import: `import { getErrorMessage } from '../utils/error-handler.js';`
   - Replace 2 occurrences with `getErrorMessage(error)`

### 1.2 Create Constants Module
**New File: `src/core/constants.ts`**

```typescript
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

export const CONFIG_DEFAULTS = {
  VERSION: '1.0.0',
  BASE_DIR: '.worktrees',
  CONFIG_FILE: '.worktree-config.json',
} as const;
```

**Files to Update:**
1. `src/commands/exec.ts`
   - Import: `import { ENV_VARS } from '../core/constants.js';`
   - Replace lines 215-218 with ENV_VARS constants
   - Replace lines 258-260 with ENV_VARS constants

2. `src/commands/create.ts`
   - Import: `import { VALIDATION, GIT_ERRORS } from '../core/constants.js';`
   - Replace line 59 with `VALIDATION.MAX_WORKTREE_NAME_LENGTH`
   - Replace lines 95, 115 with `GIT_ERRORS.NO_COMMITS`

3. `src/commands/init.ts`
   - Import: `import { VALIDATION, GIT_ERRORS } from '../core/constants.js';`
   - Replace validation error messages with constants

4. `src/platform/tmux.ts`
   - Import: `import { ENV_VARS } from '../core/constants.js';`
   - Replace line 48 with `ENV_VARS.DISABLE_TMUX`

5. `src/test/helpers/sandbox.ts`
   - Import: `import { ENV_VARS } from '../../src/core/constants.js';`
   - Replace lines 140-141 with constants

### 1.3 Create Test Infrastructure
**New File: `test/helpers/mocks.ts`**

```typescript
import { vi, SpyInstance } from 'vitest';
import { Logger } from '../../src/utils/logger';
import { Git } from '../../src/core/git';
import { WorktreeInfo } from '../../src/core/types';

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
  } as unknown as Git;
}

export function mockProcessExit(): SpyInstance {
  return vi.spyOn(process, "exit").mockImplementation((code?: any): never => {
    throw new ProcessExitError(code ?? 1);
  });
}

export class ProcessExitError extends Error {
  constructor(public code: number) {
    super(`Process exited with code ${code}`);
    this.name = 'ProcessExitError';
  }
}
```

**New File: `test/helpers/setup.ts`**

```typescript
import { vi, beforeEach, afterEach } from 'vitest';
import * as logger from '../../src/utils/logger';
import * as git from '../../src/core/git';
import * as config from '../../src/core/config';
import { createMockLogger, createMockGit, mockProcessExit } from './mocks';
import { WorktreeConfig } from '../../src/core/types';

export interface CommandTestMocks {
  logger: ReturnType<typeof createMockLogger>;
  git: ReturnType<typeof createMockGit>;
  exitSpy: ReturnType<typeof mockProcessExit>;
  config: {
    loadConfig: typeof vi.fn;
    configExists: typeof vi.fn;
    saveConfig: typeof vi.fn;
    updateGitignore: typeof vi.fn;
    getDefaultConfig: typeof vi.fn;
  };
}

export function setupCommandTest(): CommandTestMocks {
  const mocks: CommandTestMocks = {
    logger: createMockLogger(),
    git: createMockGit(),
    exitSpy: mockProcessExit(),
    config: {
      loadConfig: vi.fn(),
      configExists: vi.fn(),
      saveConfig: vi.fn(),
      updateGitignore: vi.fn(),
      getDefaultConfig: vi.fn(),
    }
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(logger.getLogger).mockReturnValue(mocks.logger);
    vi.mocked(git.createGit).mockReturnValue(mocks.git);
    vi.mocked(config.loadConfig).mockImplementation(mocks.config.loadConfig);
    vi.mocked(config.configExists).mockImplementation(mocks.config.configExists);
    vi.mocked(config.saveConfig).mockImplementation(mocks.config.saveConfig);
    vi.mocked(config.updateGitignore).mockImplementation(mocks.config.updateGitignore);
    vi.mocked(config.getDefaultConfig).mockImplementation(mocks.config.getDefaultConfig);
  });
  
  afterEach(() => {
    mocks.exitSpy.mockRestore();
  });
  
  return mocks;
}

export function createTestConfig(overrides?: Partial<WorktreeConfig>): WorktreeConfig {
  return {
    version: "1.0.0",
    projectName: "test-project",
    mainBranch: "main",
    baseDir: ".worktrees",
    tmux: false,
    commands: {},
    ...overrides,
  };
}
```

**Files to Update:**
1. `test/unit/commands/init.test.ts`
   - Import: `import { setupCommandTest, createTestConfig } from '../../helpers/setup';`
   - Replace lines 18-76 with: `const mocks = setupCommandTest();`
   - Use `createTestConfig()` for config objects

2. `test/unit/commands/create.test.ts`
   - Import: `import { setupCommandTest, createTestConfig } from '../../helpers/setup';`
   - Replace lines 24-90 with: `const mocks = setupCommandTest();`

3. `test/unit/commands/exec.test.ts`
   - Import: `import { setupCommandTest, createTestConfig, ProcessExitError } from '../../helpers/setup';`
   - Replace lines 23-73 with: `const mocks = setupCommandTest();`

### Validation Steps for Phase 1:
1. Run all tests: `npm test`
2. Verify no TypeScript errors: `npm run typecheck`
3. Check that error messages are consistent across commands
4. Verify constants are used consistently

## Phase 2: Core Refactoring (Days 2-3)

### 2.1 Create Sanitization Module
**New File: `src/utils/sanitize.ts`**

```typescript
export interface SanitizeOptions {
  allowSpaces?: boolean;
  allowUppercase?: boolean;
  allowDots?: boolean;
  allowSpecialChars?: string;
  maxLength?: number;
  defaultValue?: string;
  removeLeadingNumbers?: boolean;
}

const PRESETS = {
  TMUX_SESSION: {
    allowSpaces: false,
    allowUppercase: false,
    allowDots: false,
    allowSpecialChars: '-_',
    removeLeadingNumbers: true,
  },
  TMUX_WINDOW: {
    allowSpaces: true,
    allowUppercase: true,
    allowDots: true,
    allowSpecialChars: '-_:',
    removeLeadingNumbers: false,
  },
  GIT_BRANCH: {
    allowSpaces: false,
    allowUppercase: true,
    allowDots: true,
    allowSpecialChars: '-_/',
    maxLength: 255,
    removeLeadingNumbers: false,
  },
  PROJECT_NAME: {
    allowSpaces: false,
    allowUppercase: true,
    allowDots: false,
    allowSpecialChars: '-_',
    defaultValue: 'project',
    removeLeadingNumbers: true,
  },
  WORKTREE_NAME: {
    allowSpaces: false,
    allowUppercase: false,
    allowDots: false,
    allowSpecialChars: '-_',
    maxLength: 100,
    removeLeadingNumbers: false,
  }
} as const;

export function sanitize(input: string, preset: keyof typeof PRESETS): string {
  const options = PRESETS[preset];
  let result = input.trim();
  
  // Handle npm scopes for PROJECT_NAME
  if (preset === 'PROJECT_NAME' && result.startsWith('@') && result.includes('/')) {
    result = result.split('/')[1] ?? result;
  }
  
  // Replace spaces
  if (!options.allowSpaces) {
    result = result.replace(/\s+/g, '-');
  }
  
  // Remove invalid characters
  const allowedChars = [
    'a-z',
    options.allowUppercase ? 'A-Z' : '',
    '0-9',
    options.allowSpecialChars || ''
  ].filter(Boolean).join('');
  
  const regex = new RegExp(`[^${allowedChars}]`, 'g');
  result = result.replace(regex, '');
  
  // Handle dots
  if (!options.allowDots) {
    result = result.replace(/\./g, '');
  }
  
  // Clean up edges and duplicates
  result = result
    .replace(/^[-._]+|[-._]+$/g, '') // Remove leading/trailing special chars
    .replace(/[-._]{2,}/g, '-'); // Replace multiple special chars with single dash
  
  // Convert case
  if (!options.allowUppercase) {
    result = result.toLowerCase();
  }
  
  // Handle leading numbers
  if (options.removeLeadingNumbers && /^\d/.test(result)) {
    result = `p-${result}`;
  }
  
  // Apply max length
  if (options.maxLength && result.length > options.maxLength) {
    result = result.substring(0, options.maxLength);
  }
  
  // Apply default if empty
  if (!result && options.defaultValue) {
    result = options.defaultValue;
  }
  
  return result;
}

// Backward compatibility exports
export const sanitizeTmuxName = (name: string) => sanitize(name, 'TMUX_SESSION');
export const sanitizeTmuxWindowName = (name: string) => sanitize(name, 'TMUX_WINDOW');
export const sanitizeProjectName = (name: string) => sanitize(name, 'PROJECT_NAME');
export const sanitizeGitBranchName = (name: string) => sanitize(name, 'GIT_BRANCH');
export const sanitizeWorktreeName = (name: string) => sanitize(name, 'WORKTREE_NAME');
```

**Files to Update:**
1. `src/platform/tmux.ts`
   - Remove functions `sanitizeTmuxName` and `sanitizeTmuxWindowName`
   - Import: `import { sanitizeTmuxName, sanitizeTmuxWindowName } from '../utils/sanitize.js';`

2. `src/utils/project.ts`
   - Remove functions `sanitizeProjectName` and `sanitizeGitBranchName`
   - Import: `import { sanitizeProjectName, sanitizeGitBranchName } from './sanitize.js';`

3. `src/commands/create.ts`
   - Remove function `sanitizeWorktreeName`
   - Import: `import { sanitizeWorktreeName, sanitizeTmuxName } from '../utils/sanitize.js';`

4. `src/commands/exec.ts`
   - Import: `import { sanitizeTmuxName, sanitizeTmuxWindowName } from '../utils/sanitize.js';`

### 2.2 Create Validation Utilities
**New File: `src/utils/validation.ts`**

```typescript
import { ValidationError } from './errors.js';
import { VALIDATION } from '../core/constants.js';

export function validateNotEmpty(value: string | undefined, fieldName: string): void {
  if (value !== undefined && value.trim() === '') {
    throw new ValidationError(`${fieldName} ${VALIDATION.EMPTY_STRING_ERROR}`);
  }
}

export function validateMaxLength(value: string, maxLength: number, fieldName: string): void {
  if (value.length > maxLength) {
    throw new ValidationError(`${fieldName} is too long (max ${maxLength} characters)`);
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

// Common validator combinations
export function validateStringOption(
  value: string | undefined, 
  fieldName: string,
  options?: { maxLength?: number; allowEmpty?: boolean }
): void {
  if (!options?.allowEmpty) {
    validateNotEmpty(value, fieldName);
  }
  if (value && options?.maxLength) {
    validateMaxLength(value, options.maxLength, fieldName);
  }
}
```

**Files to Update:**
1. `src/commands/init.ts`
   - Import: `import { validateOptions, validateNotEmpty } from '../utils/validation.js';`
   - Replace `validateInitOptions` implementation with `validateOptions` usage

2. `src/commands/create.ts`
   - Import: `import { validateStringOption } from '../utils/validation.js';`
   - Simplify `validateCreateOptions` using new utilities

### 2.3 Create Command Base Class
**New File: `src/commands/base.ts`**

```typescript
import { Logger, getLogger } from '../utils/logger.js';
import { Git, createGit } from '../core/git.js';
import { WorktreeConfig, loadConfig } from '../core/config.js';
import { ConfigError, GitError } from '../utils/errors.js';
import { handleCommandError } from '../utils/error-handler.js';
import { GIT_ERRORS } from '../core/constants.js';

export interface CommandContext {
  logger: Logger;
  config: WorktreeConfig | null;
  git: Git;
}

export interface CommandOptions {
  verbose?: boolean;
  quiet?: boolean;
}

export abstract class BaseCommand<TOptions extends CommandOptions = CommandOptions> {
  protected abstract validateOptions(options: TOptions): void;
  protected abstract executeCommand(options: TOptions, context: CommandContext): Promise<void>;
  
  protected get requiresConfig(): boolean { 
    return true; 
  }
  
  protected get requiresGitRepo(): boolean { 
    return true; 
  }
  
  async execute(options: TOptions): Promise<void> {
    const logger = getLogger(options);
    
    try {
      logger.verbose('Validating options...');
      this.validateOptions(options);
      
      const context: CommandContext = {
        logger,
        config: null,
        git: createGit(),
      };
      
      if (this.requiresConfig) {
        logger.verbose('Loading configuration...');
        context.config = await this.loadConfig();
      }
      
      if (this.requiresGitRepo) {
        logger.verbose('Checking git repository...');
        const isRepo = await context.git.isGitRepository();
        if (!isRepo) {
          throw new GitError(GIT_ERRORS.NOT_A_REPO);
        }
      }
      
      await this.executeCommand(options, context);
    } catch (error) {
      handleCommandError(error, logger);
    }
  }
  
  private async loadConfig(): Promise<WorktreeConfig> {
    const config = await loadConfig();
    if (!config) {
      throw new ConfigError('Repository not initialized. Run "wtt init" first');
    }
    return config;
  }
}
```

### Validation Steps for Phase 2:
1. Run all tests
2. Test each sanitization function with edge cases
3. Verify backward compatibility is maintained
4. Check that validation messages are consistent

## Phase 3: Platform Improvements (Days 4-5)

### 3.1 Create Tmux Command Wrapper
**New File: `src/platform/tmux-wrapper.ts`**

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PlatformError } from '../utils/errors.js';
import { getErrorMessage } from '../utils/error-handler.js';

const execFileAsync = promisify(execFile);

export async function executeTmuxCommand(args: string[], errorMessage: string): Promise<string> {
  try {
    const result = await execFileAsync('tmux', args);
    return result.stdout;
  } catch (error) {
    throw new PlatformError(`${errorMessage}: ${getErrorMessage(error)}`);
  }
}

export async function executeTmuxCommandSilent(args: string[]): Promise<boolean> {
  try {
    await execFileAsync('tmux', args);
    return true;
  } catch {
    return false;
  }
}
```

**Update `src/platform/tmux.ts`:**
- Import the wrapper functions
- Replace all direct `execFileAsync` calls with wrapper calls
- Remove duplicate error handling

### 3.2 Create Terminal Strategy Pattern
**New File: `src/platform/terminal-strategy.ts`**

[Content as shown in the code review]

**Update `src/platform/shell.ts`:**
- Refactor `ShellManager` to use the strategy pattern
- Remove duplicate terminal detection code

### Validation Steps for Phase 3:
1. Test tmux operations still work correctly
2. Test terminal opening on different platforms
3. Verify error messages are consistent

## Testing Strategy

### Unit Test Updates
1. Update all command tests to use new test infrastructure
2. Add tests for new utilities:
   - `test/unit/utils/error-handler.test.ts`
   - `test/unit/utils/sanitize.test.ts`
   - `test/unit/utils/validation.test.ts`

### Integration Test Updates
1. Verify commands still work end-to-end
2. Test error handling produces correct exit codes
3. Test sanitization in real scenarios

### Manual Testing Checklist
- [ ] `wtt init` creates config with all variations
- [ ] `wtt create` handles special characters correctly
- [ ] `wtt exec` runs commands in all worktrees
- [ ] Error messages are clear and consistent
- [ ] Tmux integration works as before
- [ ] Shell spawning works on all platforms

## Rollback Plan
If issues arise during implementation:
1. Each phase is independent - can be rolled back separately
2. Git commits should be made after each successful phase
3. Keep original functions during transition (mark as deprecated)
4. Remove deprecated code only after full validation

## Success Criteria
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Code coverage maintained or improved
- [ ] ~1,300 lines of code removed
- [ ] No breaking changes to CLI interface
- [ ] Performance metrics unchanged or improved

## Next Steps After Refactoring
1. Update documentation to reflect new architecture
2. Create contributor guidelines for using new patterns
3. Consider additional improvements:
   - Async operation optimization
   - Enhanced error messages with error codes
   - Plugin architecture for commands
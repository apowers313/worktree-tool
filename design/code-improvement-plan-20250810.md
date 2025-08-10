# Code Improvement Plan - 2025-08-10

## Overview

This plan addresses all issues identified in the code review report. Each issue is broken down into small, verifiable steps that maintain existing functionality while improving code quality. Each step includes detailed implementation examples and specific code snippets.

## Critical Issues (Priority 1)

### Issue 1: Merge Command Not Implemented

**Current State**: Merge command only contains stub code  
**Goal**: Restore full merge functionality  
**Verification**: Integration tests for all merge scenarios

#### Steps:

1. **Research Original Implementation**
   ```bash
   # Commands to run:
   git log --all --grep="merge" --oneline
   git diff HEAD~20 HEAD -- src/commands/merge.ts
   # Check the merge-command branch
   cd .worktrees/merge-command
   git log --oneline -20
   ```
   - [ ] Document intended functionality in `docs/merge-command-spec.md`
   - **Verification**: Specification document exists with clear requirements

2. **Implement Basic Merge Functionality**
   
   Update `src/commands/merge.ts`:
   ```typescript
   protected override async executeCommand(
       options: MergeOptions,
       context: CommandContext,
   ): Promise<void> {
       const {logger, git, config} = context;
       
       // Step 1: Determine target worktree
       const targetWorktree = options.worktree || await this.getCurrentWorktree(git);
       logger.verbose(`Target worktree: ${targetWorktree}`);
       
       // Step 2: Validate clean working tree
       if (!options.force) {
           const hasChanges = await git.hasUncommittedChanges(targetWorktree);
           if (hasChanges) {
               throw new GitError(
                   "Working tree has uncommitted changes. Use --force to override."
               );
           }
       }
       
       // Step 3: Fetch latest changes
       if (!options.noFetch) {
           logger.info("Fetching latest changes...");
           await git.fetch();
       }
       
       // Step 4: Perform merge
       if (options.update) {
           // Merge main into worktree
           await this.mergeMainIntoWorktree(targetWorktree, context);
       } else {
           // Merge worktree into main
           await this.mergeWorktreeIntoMain(targetWorktree, context);
       }
   }
   
   private async getCurrentWorktree(git: Git): Promise<string> {
       const worktrees = await git.getWorktrees();
       const currentPath = process.cwd();
       const current = worktrees.find(w => w.path === currentPath);
       if (!current) {
           throw new GitError("Not in a worktree directory");
       }
       return current.branch;
   }
   ```
   
   Add to `src/core/git.ts`:
   ```typescript
   async hasUncommittedChanges(worktreePath: string): Promise<boolean> {
       try {
           const result = await this.git.status();
           return !result.isClean();
       } catch (error) {
           throw new GitError(`Failed to check status: ${getErrorMessage(error)}`);
       }
   }
   
   async fetch(): Promise<void> {
       try {
           await this.git.fetch();
       } catch (error) {
           throw new GitError(`Failed to fetch: ${getErrorMessage(error)}`);
       }
   }
   ```
   
   **Verification**: Create unit tests in `test/unit/commands/merge.test.ts`

3. **Implement Update Mode**
   
   Add to `src/commands/merge.ts`:
   ```typescript
   private async mergeMainIntoWorktree(
       worktreeName: string,
       context: CommandContext
   ): Promise<void> {
       const {logger, git, config} = context;
       const mainBranch = config.mainBranch;
       
       logger.info(`Merging ${mainBranch} into ${worktreeName}...`);
       
       try {
           // Switch to worktree
           await git.raw(['checkout', worktreeName]);
           
           // Merge main branch
           const mergeResult = await git.merge([mainBranch]);
           
           if (mergeResult.conflicts.length > 0) {
               logger.warn(`Merge conflicts detected: ${mergeResult.conflicts.length} files`);
               throw new GitError("Merge conflicts must be resolved manually");
           }
           
           logger.success(`Successfully merged ${mainBranch} into ${worktreeName}`);
       } catch (error) {
           if (error instanceof GitError) throw error;
           throw new GitError(`Failed to merge: ${getErrorMessage(error)}`);
       }
   }
   ```
   
   **Verification**: Integration test for update mode

4. **Add Safety Features**
   
   Add confirmation prompt:
   ```typescript
   import readline from 'readline/promises';
   
   private async confirmMerge(
       source: string,
       target: string,
       logger: Logger
   ): Promise<boolean> {
       if (process.env.WTT_NO_CONFIRM === 'true') return true;
       
       const rl = readline.createInterface({
           input: process.stdin,
           output: process.stdout
       });
       
       try {
           const answer = await rl.question(
               `Merge ${source} into ${target}? (y/N): `
           );
           return answer.toLowerCase() === 'y';
       } finally {
           rl.close();
       }
   }
   ```
   
   **Verification**: E2E test with mock stdin

5. **Integration Testing**
   
   Create `test/integration/commands/merge.test.ts`:
   ```typescript
   describe("merge command", () => {
       it("should merge worktree into main", async () => {
           await withTestSandbox(async (sandbox) => {
               const git = await createIsolatedTestRepoWithCommit(sandbox);
               
               // Initialize wtt
               execSync(`node "${WTT_BIN}" init`);
               
               // Create worktree
               execSync(`node "${WTT_BIN}" create feature-branch`);
               
               // Make changes in worktree
               const featurePath = path.join(git.path, ".worktrees/feature-branch");
               process.chdir(featurePath);
               await fs.writeFile("feature.txt", "new feature");
               await git.add("feature.txt");
               await git.commit("Add feature");
               
               // Merge back to main
               const result = execSync(
                   `node "${WTT_BIN}" merge --no-fetch`,
                   {encoding: "utf8"}
               );
               
               expect(result).toContain("Successfully merged");
               
               // Verify merge
               process.chdir(git.path);
               const files = await fs.readdir(".");
               expect(files).toContain("feature.txt");
           });
       });
   });
   ```

### Issue 2: Duplicate Error Handling Functions

**Current State**: `getErrorMessage()` and `formatErrorMessage()` do similar things  
**Goal**: Single, consistent error formatting function  
**Verification**: All error messages format consistently

#### Steps:

1. **Analyze Current Usage**
   ```bash
   # Find all usage:
   grep -r "getErrorMessage" src/ test/ --include="*.ts" -n
   grep -r "formatErrorMessage" src/ test/ --include="*.ts" -n
   ```
   
   Create analysis file:
   ```typescript
   // analysis/error-function-usage.md
   ## getErrorMessage Usage (utils/error-handler.ts)
   - Used in: 25 files
   - Returns: Simple string message
   - Handles: Error, WorktreeError, unknown
   
   ## formatErrorMessage Usage (utils/errors.ts)
   - Used in: 3 files  
   - Returns: Formatted string with error type
   - Handles: Error, WorktreeError with context
   ```

2. **Create Unified Implementation**
   
   Update `src/utils/error-handler.ts`:
   ```typescript
   export function getErrorMessage(error: unknown): string {
       // Handle null/undefined
       if (error === null || error === undefined) {
           return "Unknown error occurred";
       }
       
       // Handle WorktreeError with context
       if (isWorktreeError(error)) {
           let message = error.message;
           if (error.context) {
               const contextStr = Object.entries(error.context)
                   .map(([key, value]) => `${key}: ${value}`)
                   .join(", ");
               message += ` (${contextStr})`;
           }
           return message;
       }
       
       // Handle standard Error
       if (error instanceof Error) {
           return error.message;
       }
       
       // Handle string errors
       if (typeof error === "string") {
           return error;
       }
       
       // Handle objects with message property
       if (typeof error === "object" && "message" in error) {
           return String(error.message);
       }
       
       // Fallback for unknown types
       return String(error);
   }
   ```
   
   Add comprehensive tests:
   ```typescript
   describe("getErrorMessage", () => {
       it("should handle null", () => {
           expect(getErrorMessage(null)).toBe("Unknown error occurred");
       });
       
       it("should handle WorktreeError with context", () => {
           const error = new WorktreeError("Test error", {file: "test.ts", line: 42});
           expect(getErrorMessage(error)).toBe("Test error (file: test.ts, line: 42)");
       });
       
       it("should handle plain objects", () => {
           expect(getErrorMessage({message: "Object error"})).toBe("Object error");
       });
   });
   ```

3. **Migrate formatErrorMessage Callers**
   ```bash
   # Use this script to find and update:
   find src test -name "*.ts" -exec grep -l "formatErrorMessage" {} \; | while read file; do
       echo "Updating $file"
       sed -i 's/formatErrorMessage/getErrorMessage/g' "$file"
   done
   ```
   
   Manual verification for each file to ensure correct imports:
   ```typescript
   // Before
   import {formatErrorMessage} from "../utils/errors.js";
   
   // After  
   import {getErrorMessage} from "../utils/error-handler.js";
   ```

4. **Deprecate and Remove**
   
   First, mark as deprecated:
   ```typescript
   // src/utils/errors.ts
   /**
    * @deprecated Use getErrorMessage from utils/error-handler.ts instead
    */
   export function formatErrorMessage(error: unknown): string {
       console.warn("formatErrorMessage is deprecated. Use getErrorMessage instead.");
       return getErrorMessage(error);
   }
   ```
   
   After verification, remove the function and run:
   ```bash
   npm run lint
   npm test
   ```

### Issue 3: CI/Local Test Behavior Differences

**Current State**: Tests check `process.env.CI` and behave differently  
**Goal**: Consistent test behavior regardless of environment  
**Verification**: Tests pass identically in CI and local

#### Steps:

1. **Identify Environment-Dependent Tests**
   ```bash
   # Create list of affected files
   grep -r "process.env.CI\|process.env.GITHUB_ACTIONS" test/ --include="*.ts" -l > affected-tests.txt
   
   # Example findings:
   # test/integration/exec-modes.test.ts - Line 66-67
   # test/integration/commands/exec.test.ts - Line 79-80
   ```

2. **Implement Consistent CI Mocking**
   
   Update `test/helpers/ci-mock.ts`:
   ```typescript
   import {vi} from "vitest";
   import * as detector from "../../src/platform/detector.js";
   
   export interface CITestOptions {
       isCI: boolean;
       mode?: "window" | "exit" | "inline" | "background";
   }
   
   /**
    * Test helper to run tests in both CI and non-CI modes
    */
   export async function testWithCIVariations<T>(
       name: string,
       testFn: (options: CITestOptions) => Promise<T>
   ): Promise<void> {
       describe(name, () => {
           it("should work in non-CI environment", async () => {
               mockCIDetection(false);
               await testFn({isCI: false, mode: "window"});
           });
           
           it("should work in CI environment", async () => {
               mockCIDetection(true);
               await testFn({isCI: true, mode: "exit"});
           });
       });
   }
   
   export function mockCIDetection(isCI = false): void {
       vi.mocked(detector.isCI).mockReturnValue(isCI);
   }
   
   // Setup function for all tests
   export function setupCIMocking(): void {
       beforeEach(() => {
           vi.clearAllMocks();
           // Default to non-CI for consistent behavior
           mockCIDetection(false);
       });
   }
   ```
   
   Update `test/setup.ts`:
   ```typescript
   import {setupCIMocking} from "./helpers/ci-mock.js";
   
   // Apply to all tests
   setupCIMocking();
   ```

3. **Refactor Conditional Tests**
   
   Before:
   ```typescript
   it("executes in window mode by default (exit mode in CI)", () => {
       const isCI = process.env.CI ?? process.env.GITHUB_ACTIONS;
       const expectedMode = isCI ? "exit" : "window";
       expect(output).toContain(`(${expectedMode} mode)`);
   });
   ```
   
   After:
   ```typescript
   await testWithCIVariations("executes in correct mode", async (options) => {
       const output = execSync(`node "${WTT_BIN}" exec test`, {encoding: "utf8"});
       expect(output).toContain(`(${options.mode} mode)`);
   });
   ```

4. **Add CI Behavior Tests**
   
   Create `test/unit/platform/ci-behavior.test.ts`:
   ```typescript
   import {describe, it, expect, beforeEach} from "vitest";
   import {mockCIDetection} from "../../helpers/ci-mock.js";
   import {getDefaultMode} from "../../../src/exec/modes/factory.js";
   
   describe("CI-specific behavior", () => {
       describe("execution mode defaults", () => {
           it("should default to window mode in non-CI", () => {
               mockCIDetection(false);
               expect(getDefaultMode()).toBe("window");
           });
           
           it("should default to exit mode in CI", () => {
               mockCIDetection(true);
               expect(getDefaultMode()).toBe("exit");
           });
       });
       
       describe("tmux behavior", () => {
           it("should disable tmux features in CI", () => {
               mockCIDetection(true);
               const tmux = new TmuxIntegration();
               expect(tmux.isAvailable()).toBe(false);
           });
       });
   });
   ```

## High Priority Issues (Priority 2)

### Issue 4: Duplicate Sanitization Logic

**Current State**: Multiple sanitization implementations  
**Goal**: Single sanitization system with presets  
**Verification**: All names sanitized consistently

#### Steps:

1. **Document Sanitization Requirements**
   
   Create `docs/sanitization-rules.md`:
   ```markdown
   # Sanitization Rules
   
   ## Project Names
   - Allowed: alphanumeric, dash, underscore
   - Max length: 50
   - Cannot start/end with dash
   - Examples: "my-project", "test_app", "app123"
   
   ## Git Branch Names  
   - Allowed: alphanumeric, dash, underscore, forward slash
   - Max length: 100
   - Cannot contain: spaces, ~, ^, :, ?, *, [, ], @{, \, ..
   - Examples: "feature/new-ui", "bugfix/issue-123"
   
   ## Tmux Session Names
   - Allowed: alphanumeric, dash, underscore
   - Max length: 30
   - Cannot contain: dots, colons
   - Examples: "my-session", "work_project"
   ```
   
   Create test cases:
   ```typescript
   // test/unit/utils/sanitization-rules.test.ts
   const testCases = {
       project: [
           {input: "My Project", expected: "my-project"},
           {input: "test@app!", expected: "test-app"},
           {input: "-start-dash", expected: "start-dash"},
       ],
       gitBranch: [
           {input: "feature test", expected: "feature-test"},
           {input: "bug#123", expected: "bug-123"},
           {input: "feat/[ui]", expected: "feat/ui"},
       ],
       tmux: [
           {input: "my.session", expected: "my-session"},
           {input: "work:project", expected: "work-project"},
       ]
   };
   ```

2. **Enhance Generic Sanitize Function**
   
   Verify `src/utils/sanitize.ts` has all presets:
   ```typescript
   const PRESETS: Record<SanitizePreset, SanitizeOptions> = {
       "project": {
           allowed: /[a-zA-Z0-9-_]/g,
           replacement: "-",
           maxLength: 50,
           transform: "lowercase",
           trimPattern: /^-+|-+$/g,
       },
       "git-branch": {
           allowed: /[a-zA-Z0-9-_\/]/g,
           replacement: "-",
           maxLength: 100,
           preserveCase: true,
           blacklist: ["~", "^", ":", "?", "*", "[", "]", "@{", "\\", ".."],
       },
       "tmux-session": {
           allowed: /[a-zA-Z0-9-_]/g,
           replacement: "-",
           maxLength: 30,
           transform: "lowercase",
       },
       // ... other presets
   };
   ```

3. **Migrate Project Sanitization**
   
   Update `src/utils/project.ts`:
   ```typescript
   // Remove this function:
   // export function sanitizeProjectName(name: string): string { ... }
   
   // Update imports where used:
   import {sanitize} from "./sanitize.js";
   
   // Update callers:
   // Before: sanitizeProjectName(name)
   // After: sanitize(name, "project")
   ```
   
   Find and update all usages:
   ```bash
   grep -r "sanitizeProjectName" src/ test/ --include="*.ts" -l | while read file; do
       echo "Updating $file"
       # Update import
       sed -i 's/import.*sanitizeProjectName.*from/import {sanitize} from/g' "$file"
       # Update function calls
       sed -i 's/sanitizeProjectName(\([^)]*\))/sanitize(\1, "project")/g' "$file"
   done
   ```

4. **Migrate Branch Sanitization**
   
   Similar process for `sanitizeGitBranchName`:
   ```typescript
   // Update callers from:
   sanitizeGitBranchName(branchName)
   // To:
   sanitize(branchName, "git-branch")
   ```

5. **Remove Duplicate Functions**
   
   After all migrations:
   ```typescript
   // Remove from src/utils/project.ts:
   // - sanitizeProjectName
   // - sanitizeGitBranchName
   
   // Run tests to verify:
   npm test
   npm run typecheck
   ```

### Issue 5: Scattered Type Definitions

**Current State**: Types in multiple locations  
**Goal**: Centralized type management  
**Verification**: All types easily discoverable

#### Steps:

1. **Audit Current Type Locations**
   ```bash
   # Find all type definitions
   grep -r "export interface\|export type" src/ --include="*.ts" | grep -v "src/core/types.ts" > type-audit.txt
   
   # Categorize findings:
   # Shared types (used in 2+ files):
   # - ConflictInfo, ConflictDetails (src/types/conflicts.ts)
   # - PortRange (src/utils/port-manager.ts)
   # - ExecutionContext (src/exec/modes/base.ts)
   
   # Local types (used in 1 file):
   # - GitError interface (src/services/conflict-detection/potential-modern.ts)
   ```

2. **Move Conflict Types**
   
   Add to `src/core/types.ts`:
   ```typescript
   /**
    * Conflict Detection Types
    */
   export interface ConflictInfo {
       path: string;
       conflictType: "merge" | "tree";
       ours?: string;
       theirs?: string;
   }
   
   export interface ConflictDetails {
       conflictedFiles: string[];
       conflictType: "merge" | "tree";
       canResolve: boolean;
       suggestedResolution?: string;
       affectedWorktrees?: string[];
   }
   
   export interface ConflictDetectionResult {
       hasConflicts: boolean;
       details?: ConflictDetails;
       potentialConflicts?: ConflictInfo[];
   }
   ```
   
   Update imports:
   ```bash
   # Update all files importing from types/conflicts.ts
   find src test -name "*.ts" -exec sed -i 's|types/conflicts|core/types|g' {} \;
   
   # Remove old file
   rm -rf src/types/
   ```

3. **Move Shared Interfaces**
   
   Add to appropriate sections in `src/core/types.ts`:
   ```typescript
   /**
    * Execution Types
    */
   export interface ExecutionContext {
       worktreeName: string;
       worktreePath: string;
       command: string;
       logger: Logger;
       env?: Record<string, string>;
   }
   
   /**
    * Port Management Types
    */
   export interface PortRange {
       start: number;
       end: number;
   }
   ```
   
   Update imports in affected files.

4. **Document Type Organization**
   
   Add to top of `src/core/types.ts`:
   ```typescript
   /**
    * Core TypeScript interfaces and types for wtt
    * 
    * Organization:
    * - Command Types: Options and configs for CLI commands
    * - Core Types: Fundamental types like WorktreeInfo, Platform
    * - Execution Types: Types for command execution
    * - Conflict Types: Merge conflict detection
    * - Utility Types: Helper types used across utils
    * 
    * Keep implementation-specific types with their modules.
    * Only shared types (used in 2+ files) belong here.
    */
   ```
   
   Create `.eslintrc.json` rule:
   ```json
   {
     "rules": {
       "no-restricted-syntax": [
         "error",
         {
           "selector": "ExportNamedDeclaration[declaration.type='TSInterfaceDeclaration']",
           "message": "Consider moving shared interfaces to src/core/types.ts"
         }
       ]
     }
   }
   ```

### Issue 6: Inconsistent Test Configuration

**Current State**: Different timeouts, duplicate configuration  
**Goal**: DRY test configuration with clear rationale  
**Verification**: Consistent test behavior

#### Steps:

1. **Create Shared Configuration**
   
   Create `vitest.config.shared.ts`:
   ```typescript
   import {defineConfig} from 'vitest/config';
   import path from 'path';
   
   export const sharedConfig = {
       globals: true,
       environment: 'node',
       setupFiles: ['./test/setup.ts'],
       coverage: {
           provider: 'v8',
           reporter: ['text', 'lcov', 'html'],
           include: ['src/**/*.ts'],
           exclude: ['src/index.ts', 'test/**', 'node_modules/**']
       },
       resolve: {
           alias: {
               '@': path.resolve(__dirname, './src')
           }
       }
   };
   
   // Timeout rationale:
   export const timeouts = {
       unit: 10000,        // 10s - Simple, fast tests
       integration: 30000, // 30s - Git operations, file I/O
       e2e: 60000         // 60s - Full workflows, multiple commands
   };
   ```

2. **Update Test Configurations**
   
   Update `vitest.config.ts`:
   ```typescript
   import {defineConfig} from 'vitest/config';
   import {sharedConfig, timeouts} from './vitest.config.shared';
   
   export default defineConfig({
       test: {
           ...sharedConfig,
           include: ['test/unit/**/*.test.ts', 'test/helpers/**/*.test.ts'],
           exclude: ['node_modules', 'dist', 'test/integration', 'test/e2e'],
           testTimeout: timeouts.unit
       }
   });
   ```
   
   Update `vitest.config.integration.ts`:
   ```typescript
   import {defineConfig} from 'vitest/config';
   import {sharedConfig, timeouts} from './vitest.config.shared';
   
   export default defineConfig({
       test: {
           ...sharedConfig,
           include: ['test/integration/**/*.test.ts'],
           exclude: ['node_modules', 'dist'],
           testTimeout: timeouts.integration
       }
   });
   ```

3. **Document Timeout Requirements**
   
   Add to `test/README.md`:
   ```markdown
   # Test Configuration
   
   ## Timeout Guidelines
   
   - **Unit tests (10s)**: Pure logic, no I/O
   - **Integration tests (30s)**: File system, git operations
   - **E2E tests (60s)**: Full command execution, multiple operations
   
   Override only when necessary:
   ```typescript
   it('handles large repository', {timeout: 120000}, async () => {
       // Test that needs 2 minutes
   });
   ```
   ```

## Medium Priority Issues (Priority 3)

### Issue 7: Code Organization

**Current State**: Some utilities could be better organized  
**Goal**: Clear, logical organization  
**Verification**: Improved code discoverability

#### Steps:

1. **Create Organization Plan**
   ```markdown
   # Utility Organization Plan
   
   ## Current Structure
   - utils/
     - error-handler.ts (error formatting)
     - errors.ts (error classes)
     - find-root.ts (directory traversal)
     - git-version.ts (git version parsing)
     - logger.ts (logging)
     - port-manager.ts (port allocation)
     - project.ts (project name detection)
     - sanitize.ts (string sanitization)
     - status-formatter.ts (status display)
     - validation.ts (input validation)
   
   ## Proposed Structure
   - utils/
     - errors/
       - classes.ts (error class definitions)
       - handler.ts (error formatting)
     - git/
       - version.ts (version detection)
       - status-formatter.ts (status display)
     - string/
       - sanitize.ts (sanitization)
       - validation.ts (validation)
     - project/
       - find-root.ts (root detection)
       - detect-name.ts (name detection)
     - io/
       - logger.ts (logging)
       - port-manager.ts (ports)
   ```

2. **Implement Reorganization**
   ```bash
   # Create new structure
   mkdir -p src/utils/{errors,git,string,project,io}
   
   # Move files with git
   git mv src/utils/errors.ts src/utils/errors/classes.ts
   git mv src/utils/error-handler.ts src/utils/errors/handler.ts
   # ... continue for other files
   
   # Update imports using a script
   find src test -name "*.ts" -exec sed -i 's|utils/errors|utils/errors/classes|g' {} \;
   ```

### Issue 8: Test Coverage Gaps

**Current State**: Some error paths not tested  
**Goal**: Comprehensive error path coverage  
**Verification**: Coverage reports show improvement

#### Steps:

1. **Generate Coverage Report**
   ```bash
   npm run test:coverage
   # Open coverage/index.html
   # Look for red (uncovered) lines in error handling
   ```

2. **Add Error Path Tests**
   
   Example for uncovered error in `git.ts`:
   ```typescript
   it("should handle git command failures", async () => {
       const git = new Git();
       
       // Mock git failure
       vi.spyOn(git['git'], 'raw').mockRejectedValue(
           new Error("fatal: not a git repository")
       );
       
       await expect(git.getWorktrees()).rejects.toThrow(GitError);
       await expect(git.getWorktrees()).rejects.toThrow("Failed to list worktrees");
   });
   ```

### Issue 9: Documentation

**Current State**: Missing JSDoc for public APIs  
**Goal**: Complete API documentation  
**Verification**: Documentation coverage tool

#### Steps:

1. **Add JSDoc Template**
   ```typescript
   /**
    * Brief description of what the function does.
    * 
    * @param {string} paramName - Description of parameter
    * @returns {ReturnType} Description of return value
    * @throws {ErrorType} When this error occurs
    * 
    * @example
    * ```typescript
    * const result = functionName("example");
    * console.log(result); // "expected output"
    * ```
    */
   ```

2. **Document Public APIs**
   
   Example for `src/utils/sanitize.ts`:
   ```typescript
   /**
    * Sanitizes a string according to the specified preset rules.
    * 
    * @param {string} input - The string to sanitize
    * @param {SanitizePreset} preset - The preset rules to apply
    * @returns {string} The sanitized string
    * 
    * @example
    * ```typescript
    * sanitize("My Project!", "project"); // "my-project"
    * sanitize("feature/test branch", "git-branch"); // "feature/test-branch"
    * ```
    */
   export function sanitize(
       input: string,
       preset: SanitizePreset
   ): string {
       // ... implementation
   }
   ```

## Implementation Verification

After each step, run:
```bash
# Verify no regressions
npm test
npm run test:integration
npm run test:e2e

# Check types
npm run typecheck

# Check linting
npm run lint

# Check coverage
npm run test:coverage
```

## Success Criteria

1. **No Regressions**: All existing tests continue to pass
2. **Improved Maintainability**: Reduced code duplication
3. **Better Testing**: Consistent behavior across environments
4. **Clear Organization**: Easy to find and understand code
5. **Full Documentation**: Public APIs fully documented

## Risk Mitigation

1. **Create branch for each issue**: `git checkout -b fix/issue-name`
2. **Small, focused commits**: One logical change per commit
3. **Comprehensive testing**: Add tests before making changes
4. **Incremental deployment**: Merge one fix at a time
5. **Rollback plan**: Tag before each merge for easy revert
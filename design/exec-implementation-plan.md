# wtt exec Command Implementation Plan

## Overview

This document provides a detailed implementation plan for the `wtt exec` command, following the design in `exec-design.md`. The implementation will be done in phases according to the priority order specified.

## Phase 1: Update Core Types and Config

### 1.1 Update WorktreeConfig Interface

**File: `src/core/types.ts`**

Add commands to the WorktreeConfig interface:

```typescript
export interface WorktreeConfig {
    version: string;
    projectName: string;
    mainBranch: string;
    baseDir: string;
    tmux: boolean;
    /** User-defined commands to execute in worktrees */
    commands?: Record<string, string>;
}
```

### 1.2 Update Config Validation

**File: `src/core/config.ts`**

Add validation for commands in the `loadConfig` function:

```typescript
// In loadConfig function, after loading config:
if (config.commands) {
    for (const [name, command] of Object.entries(config.commands)) {
        if (typeof command !== 'string' || command.trim() === '') {
            throw new Error(`Invalid command "${name}": command must be a non-empty string`);
        }
    }
}
```

## Phase 2: Create Exec Command Module

### 2.1 Create Base Exec Command

**File: `src/commands/exec.ts`**

```typescript
import { Command } from 'commander';
import { loadConfig } from '../core/config.js';
import { getWorktrees } from '../core/git.js';
import { logger } from '../utils/logger.js';
import { WorktreeToolError } from '../utils/errors.js';
import { detectPlatform } from '../platform/detector.js';
import { TmuxManager } from '../platform/tmux.js';
import { ShellManager } from '../platform/shell.js';
import path from 'path';

interface ExecOptions {
    verbose?: boolean;
    quiet?: boolean;
}

export const execCommand = new Command('exec')
    .description('Execute a predefined command in one or more worktrees')
    .argument('<command>', 'Command name to execute')
    .argument('[worktree]', 'Specific worktree to run command in')
    .option('-v, --verbose', 'Show verbose output')
    .option('-q, --quiet', 'Suppress output')
    .action(async (commandName: string, worktreeName: string | undefined, options: ExecOptions) => {
        try {
            logger.setLevel(options.quiet ? 'quiet' : options.verbose ? 'verbose' : 'normal');
            
            // Load config
            const config = loadConfig();
            
            // Validate commands exist
            if (!config.commands || Object.keys(config.commands).length === 0) {
                throw new WorktreeToolError(
                    'No commands configured',
                    'Add commands to .worktree-config.json under the "commands" key'
                );
            }
            
            // Validate command exists
            const command = config.commands[commandName];
            if (!command) {
                const available = Object.keys(config.commands).join(', ');
                throw new WorktreeToolError(
                    `Command "${commandName}" not found`,
                    `Available commands: ${available}`
                );
            }
            
            // Get worktrees
            const worktrees = await getWorktrees();
            
            // Filter to specific worktree if requested
            let targetWorktrees = worktrees;
            if (worktreeName) {
                const worktree = worktrees.find(w => 
                    path.basename(w.path) === worktreeName || 
                    w.branch === worktreeName
                );
                
                if (!worktree) {
                    const available = worktrees.map(w => path.basename(w.path)).join(', ');
                    throw new WorktreeToolError(
                        `Worktree "${worktreeName}" not found`,
                        `Available worktrees: ${available}`
                    );
                }
                
                targetWorktrees = [worktree];
            }
            
            // Execute command
            await executeCommand(commandName, command, targetWorktrees, config);
            
        } catch (error) {
            if (error instanceof WorktreeToolError) {
                logger.error(error.message);
                if (error.hint) {
                    logger.info(`Hint: ${error.hint}`);
                }
                process.exit(1);
            }
            throw error;
        }
    });

async function executeCommand(
    commandName: string, 
    command: string, 
    worktrees: WorktreeInfo[],
    config: WorktreeConfig
): Promise<void> {
    const platform = await detectPlatform();
    
    logger.info(`Executing '${commandName}' in ${worktrees.length} worktree${worktrees.length > 1 ? 's' : ''}...`);
    
    let failureCount = 0;
    
    // Execute in each worktree
    for (const worktree of worktrees) {
        const worktreeName = path.basename(worktree.path);
        const windowName = `${worktreeName} ${commandName}`;
        
        try {
            if (config.tmux && platform.hasTmux) {
                await executeTmux(worktree, command, windowName);
            } else {
                await executeShell(worktree, command, windowName, platform);
            }
            
            logger.success(`Starting in ${worktreeName}: ${command}`);
        } catch (error) {
            logger.error(`Failed to start in ${worktreeName}: ${error}`);
            failureCount++;
        }
    }
    
    if (failureCount === 0) {
        logger.info('\nAll commands started. Check individual windows for output.');
    } else {
        logger.error(`\n${failureCount} command(s) failed to start.`);
        process.exit(failureCount);
    }
}

async function executeTmux(worktree: WorktreeInfo, command: string, windowName: string): Promise<void> {
    const tmux = new TmuxManager();
    
    // Create environment variables
    const env = {
        WTT_WORKTREE_NAME: path.basename(worktree.path),
        WTT_WORKTREE_PATH: worktree.path,
        WTT_IS_MAIN: worktree.isMain ? 'true' : 'false'
    };
    
    // Create new window and execute command
    await tmux.createWindow(windowName, worktree.path);
    await tmux.sendKeys(windowName, command, true);
}

async function executeShell(
    worktree: WorktreeInfo, 
    command: string, 
    windowName: string,
    platform: Platform
): Promise<void> {
    const shell = new ShellManager(platform.shellType);
    
    // Set environment variables
    process.env.WTT_WORKTREE_NAME = path.basename(worktree.path);
    process.env.WTT_WORKTREE_PATH = worktree.path;
    process.env.WTT_IS_MAIN = worktree.isMain ? 'true' : 'false';
    
    // Execute in new shell
    await shell.executeInNewWindow(command, worktree.path, windowName);
}
```

## Phase 3: Update Shell and Tmux Managers

### 3.1 Add executeInNewWindow to ShellManager

**File: `src/platform/shell.ts`**

Add method to execute command in new window:

```typescript
export class ShellManager {
    // ... existing code ...
    
    async executeInNewWindow(command: string, cwd: string, windowTitle: string): Promise<void> {
        switch (this.shellType) {
            case 'bash':
            case 'zsh':
                // On macOS, use Terminal.app
                if (process.platform === 'darwin') {
                    const script = `
                        tell application "Terminal"
                            do script "cd ${cwd} && ${command}"
                            set custom title of front window to "${windowTitle}"
                        end tell
                    `;
                    await execAsync(`osascript -e '${script}'`);
                } else {
                    // On Linux, try common terminal emulators
                    const terminals = ['gnome-terminal', 'konsole', 'xterm'];
                    for (const term of terminals) {
                        try {
                            if (term === 'gnome-terminal') {
                                await execAsync(`${term} --title="${windowTitle}" -- bash -c "cd ${cwd} && ${command}; exec bash"`);
                                return;
                            } else if (term === 'konsole') {
                                await execAsync(`${term} --title "${windowTitle}" -e bash -c "cd ${cwd} && ${command}; exec bash"`);
                                return;
                            } else {
                                await execAsync(`${term} -T "${windowTitle}" -e bash -c "cd ${cwd} && ${command}; exec bash"`);
                                return;
                            }
                        } catch {
                            // Try next terminal
                        }
                    }
                    throw new Error('No supported terminal emulator found');
                }
                break;
                
            case 'powershell':
                // On Windows, use Windows Terminal or PowerShell
                const psCommand = `Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '${cwd}'; ${command}"`;
                await execAsync(`powershell -Command "${psCommand}"`);
                break;
        }
    }
}
```

### 3.2 Update TmuxManager for Environment Variables

**File: `src/platform/tmux.ts`**

Update createWindow to support environment variables:

```typescript
export class TmuxManager {
    // ... existing code ...
    
    async createWindow(name: string, directory: string, env?: Record<string, string>): Promise<void> {
        // Create window with directory
        await this.execute(['new-window', '-n', name, '-c', directory]);
        
        // Set environment variables if provided
        if (env) {
            for (const [key, value] of Object.entries(env)) {
                await this.sendKeys(name, `export ${key}="${value}"`, true);
            }
        }
    }
}
```

## Phase 4: Register Command and Update CLI

### 4.1 Update Program

**File: `src/cli/program.ts`**

Import and register exec command:

```typescript
import { execCommand } from '../commands/exec.js';

// In createProgram function, add:
program.addCommand(execCommand);
```

### 4.2 Update Help Command

**File: `src/commands/help.ts`**

Add exec command to help output:

```typescript
const commands = [
    { name: 'init', description: 'Initialize wtt in a git repository' },
    { name: 'create <name>', description: 'Create a new worktree' },
    { name: 'exec <command> [worktree]', description: 'Execute a command in worktrees' },
    { name: 'help', description: 'Show this help message' },
];
```

## Phase 5: Implement Tests

### 5.1 Unit Tests

**File: `test/unit/commands/exec.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execCommand } from '../../../src/commands/exec.js';
import * as config from '../../../src/core/config.js';
import * as git from '../../../src/core/git.js';

vi.mock('../../../src/core/config.js');
vi.mock('../../../src/core/git.js');
vi.mock('../../../src/platform/tmux.js');
vi.mock('../../../src/platform/shell.js');

describe('exec command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    
    describe('validation', () => {
        it('should error when no commands configured', async () => {
            vi.mocked(config.loadConfig).mockReturnValue({
                version: '1.0.0',
                projectName: 'test',
                mainBranch: 'main',
                baseDir: '.worktrees',
                tmux: true
            });
            
            // Test execution and verify error
        });
        
        it('should error when command not found', async () => {
            vi.mocked(config.loadConfig).mockReturnValue({
                version: '1.0.0',
                projectName: 'test',
                mainBranch: 'main',
                baseDir: '.worktrees',
                tmux: true,
                commands: {
                    test: 'npm test'
                }
            });
            
            // Test with non-existent command
        });
        
        it('should error when worktree not found', async () => {
            // Setup mocks and test
        });
    });
    
    describe('execution', () => {
        it('should execute command in all worktrees', async () => {
            // Setup mocks
            vi.mocked(config.loadConfig).mockReturnValue({
                version: '1.0.0',
                projectName: 'test',
                mainBranch: 'main',
                baseDir: '.worktrees',
                tmux: true,
                commands: {
                    test: 'npm test'
                }
            });
            
            vi.mocked(git.getWorktrees).mockResolvedValue([
                { path: '/project', branch: 'main', commit: 'abc', isMain: true, isLocked: false },
                { path: '/project/.worktrees/feature', branch: 'feature', commit: 'def', isMain: false, isLocked: false }
            ]);
            
            // Test execution
        });
        
        it('should execute command in specific worktree', async () => {
            // Test single worktree execution
        });
    });
});
```

### 5.2 Integration Tests

**File: `test/integration/commands/exec.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSandbox } from '../../helpers/sandbox.js';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

describe('exec command integration', () => {
    let sandbox: any;
    
    beforeEach(async () => {
        sandbox = await createSandbox();
    });
    
    afterEach(async () => {
        await sandbox.cleanup();
    });
    
    it('should execute command with special characters', async () => {
        // Create config with complex command
        const config = {
            version: '1.0.0',
            projectName: 'test',
            mainBranch: 'main',
            baseDir: '.worktrees',
            tmux: false,
            commands: {
                complex: 'echo "test" | grep "t" > output.txt'
            }
        };
        
        await fs.writeJson(path.join(sandbox.dir, '.worktree-config.json'), config);
        
        // Execute and verify
    });
    
    it('should set environment variables correctly', async () => {
        // Test environment variable setting
    });
});
```

### 5.3 Config Validation Tests

**File: `test/unit/core/config.test.ts`**

Add tests for command validation:

```typescript
describe('loadConfig with commands', () => {
    it('should validate command values are non-empty strings', () => {
        const invalidConfig = {
            version: '1.0.0',
            projectName: 'test',
            mainBranch: 'main',
            baseDir: '.worktrees',
            tmux: true,
            commands: {
                empty: '',
                invalid: 123
            }
        };
        
        // Test validation
    });
    
    it('should accept valid commands', () => {
        const validConfig = {
            version: '1.0.0',
            projectName: 'test',
            mainBranch: 'main',
            baseDir: '.worktrees',
            tmux: true,
            commands: {
                test: 'npm test',
                build: 'npm run build'
            }
        };
        
        // Test acceptance
    });
});
```

## Phase 6: Manual Testing Scripts

### 6.1 Create Manual Test Script

**File: `test/manual/test-exec.sh`**

```bash
#!/bin/bash

# Setup test environment
echo "Setting up test environment for wtt exec..."

# Create test config
cat > .worktree-config.json << EOF
{
  "version": "1.0.0",
  "projectName": "exec-test",
  "mainBranch": "main",
  "baseDir": ".worktrees",
  "tmux": true,
  "commands": {
    "echo": "echo 'Hello from worktree'",
    "longrun": "sleep 30 && echo 'Done'",
    "special": "echo 'Test' | grep 'T' && ls -la",
    "env": "echo \"Worktree: \$WTT_WORKTREE_NAME, Path: \$WTT_WORKTREE_PATH, Main: \$WTT_IS_MAIN\""
  }
}
EOF

# Test scenarios
echo "1. Testing basic command execution..."
wtt exec echo

echo "2. Testing long-running command..."
wtt exec longrun

echo "3. Testing special characters..."
wtt exec special

echo "4. Testing environment variables..."
wtt exec env

echo "5. Testing specific worktree..."
wtt exec echo main

echo "6. Testing invalid command..."
wtt exec nonexistent || echo "Error handling works"

echo "7. Testing invalid worktree..."
wtt exec echo fakeworktree || echo "Error handling works"
```

## Implementation Checklist

1. **Phase 1: Core Types and Config**
   - [ ] Update WorktreeConfig interface
   - [ ] Add command validation to loadConfig
   - [ ] Write config validation tests

2. **Phase 2: Exec Command**
   - [ ] Create exec.ts command file
   - [ ] Implement command validation
   - [ ] Implement worktree filtering
   - [ ] Implement execution logic

3. **Phase 3: Platform Support**
   - [ ] Add executeInNewWindow to ShellManager
   - [ ] Update TmuxManager for env vars
   - [ ] Test on different platforms

4. **Phase 4: CLI Integration**
   - [ ] Register exec command in program.ts
   - [ ] Update help command
   - [ ] Test CLI integration

5. **Phase 5: Testing**
   - [ ] Write unit tests for exec command
   - [ ] Write integration tests
   - [ ] Update config tests
   - [ ] Create manual test scripts

6. **Phase 6: Documentation**
   - [ ] Update README with exec command
   - [ ] Add examples to help text
   - [ ] Document configuration format

## Error Codes

- Exit code 0: Success
- Exit code 1: Configuration or validation error
- Exit code N: N commands failed to execute

## Notes for Implementation

1. Use existing error handling patterns from other commands
2. Follow existing code style and conventions
3. Ensure all async operations are properly awaited
4. Test thoroughly on both tmux and non-tmux environments
5. Consider Windows compatibility for shell execution
6. Make sure environment variables are properly escaped
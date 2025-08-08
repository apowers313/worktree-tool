# Implementation Plan for Exec Command Expansion

## Overview
This plan breaks down the implementation of the expanded exec feature into small, testable steps. Each step includes code examples and testing instructions.

## Step 1: Update Config Types and Schema

### 1.1 Update TypeScript Types
**File:** `src/types/config.ts`

```typescript
// Update the command type to support both string and object formats
export type CommandConfig = string | {
  command: string;
  mode?: 'window' | 'inline' | 'background' | 'exit';
};

export interface WorktreeConfig {
  // ... existing fields ...
  commands?: Record<string, CommandConfig>;
}
```

### 1.2 Update Config Schema Validation
**File:** `src/config/schema.ts`

```typescript
const commandConfigSchema = z.union([
  z.string(),
  z.object({
    command: z.string(),
    mode: z.enum(['window', 'inline', 'background', 'exit']).optional()
  })
]);

const configSchema = z.object({
  // ... existing schema ...
  commands: z.record(commandConfigSchema).optional()
});
```

### Testing Step 1
```bash
# Test that existing string configs still work
echo '{"commands": {"build": "npm run build"}}' > test-config.json
npm test -- config.test.ts

# Test new object format
echo '{"commands": {"test": {"command": "npm test", "mode": "exit"}}}' > test-config.json
npm test -- config.test.ts
```

## Step 2: Add Mode Option to CLI

### 2.1 Update Command Options
**File:** `src/cli/commands/exec.ts`

```typescript
interface ExecOptions {
  worktrees?: string;
  verbose?: boolean;
  quiet?: boolean;
  mode?: 'window' | 'inline' | 'background' | 'exit';
}

// Update the command builder
export const execCommand = new Command('exec')
  .arguments('[command] [args...]')
  .option('-w, --worktrees <worktrees>', 'Comma-separated list of worktrees')
  .option('--mode <mode>', 'Execution mode', /^(window|inline|background|exit)$/)
  .option('-v, --verbose', 'Show verbose output')
  .option('-q, --quiet', 'Suppress output')
  .action(async (command?: string, args?: string[], options?: ExecOptions) => {
    // Implementation in next steps
  });
```

### Testing Step 2
```bash
# Test that mode option is recognized
wtt exec --mode inline -- echo "test"
# Should not error on option parsing

# Test invalid mode
wtt exec --mode invalid -- echo "test"
# Should show error about invalid mode
```

## Step 3: Implement Command Parser Logic

### 3.1 Create Command Parser
**File:** `src/exec/parser.ts`

```typescript
export interface ParsedCommand {
  type: 'predefined' | 'inline';
  command: string;
  args: string[];
  mode?: 'window' | 'inline' | 'background' | 'exit';
}

export function parseExecCommand(
  args: string[],
  config: WorktreeConfig,
  options: ExecOptions
): ParsedCommand {
  // Find the -- separator
  const separatorIndex = args.indexOf('--');
  
  if (separatorIndex === -1) {
    // No separator, must be predefined command
    const commandName = args[0];
    if (!commandName || !config.commands?.[commandName]) {
      throw new Error(`Command "${commandName}" not found in config`);
    }
    
    const commandConfig = config.commands[commandName];
    if (typeof commandConfig === 'string') {
      return {
        type: 'predefined',
        command: commandConfig,
        args: args.slice(1),
        mode: options.mode || 'window'
      };
    } else {
      return {
        type: 'predefined',
        command: commandConfig.command,
        args: args.slice(1),
        mode: options.mode || commandConfig.mode || 'window'
      };
    }
  } else {
    // Has separator, inline command
    const inlineArgs = args.slice(separatorIndex + 1);
    if (inlineArgs.length === 0) {
      throw new Error('No command specified after --');
    }
    
    return {
      type: 'inline',
      command: inlineArgs[0],
      args: inlineArgs.slice(1),
      mode: options.mode || 'window'
    };
  }
}
```

### Testing Step 3
```typescript
// test/exec/parser.test.ts
describe('parseExecCommand', () => {
  it('parses predefined string command', () => {
    const config = { commands: { build: 'npm run build' } };
    const result = parseExecCommand(['build'], config, {});
    expect(result).toEqual({
      type: 'predefined',
      command: 'npm run build',
      args: [],
      mode: 'window'
    });
  });
  
  it('parses predefined object command with mode', () => {
    const config = { 
      commands: { 
        test: { command: 'npm test', mode: 'exit' as const }
      }
    };
    const result = parseExecCommand(['test'], config, {});
    expect(result.mode).toBe('exit');
  });
  
  it('parses inline command', () => {
    const result = parseExecCommand(['--', 'npm', 'install'], {}, {});
    expect(result).toEqual({
      type: 'inline',
      command: 'npm',
      args: ['install'],
      mode: 'window'
    });
  });
  
  it('CLI option overrides config mode', () => {
    const config = { 
      commands: { 
        test: { command: 'npm test', mode: 'exit' as const }
      }
    };
    const result = parseExecCommand(['test'], config, { mode: 'inline' });
    expect(result.mode).toBe('inline');
  });
});
```

## Step 4: Implement Execution Modes

### 4.1 Create Mode Executors
**File:** `src/exec/modes/base.ts`

```typescript
export interface ExecutionContext {
  worktreeName: string;
  worktreePath: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export abstract class ExecutionMode {
  abstract execute(contexts: ExecutionContext[]): Promise<void>;
  
  protected getEnvironment(context: ExecutionContext): Record<string, string> {
    return {
      ...process.env,
      WTT_WORKTREE_NAME: context.worktreeName,
      WTT_WORKTREE_PATH: context.worktreePath,
      WTT_IS_MAIN: context.worktreeName === 'main' ? 'true' : 'false',
      ...context.env
    };
  }
}
```

### 4.2 Window Mode (Default)
**File:** `src/exec/modes/window.ts`

```typescript
import { ExecutionMode, ExecutionContext } from './base';
import { TmuxManager } from '../../tmux/manager';

export class WindowMode extends ExecutionMode {
  constructor(private tmux: TmuxManager) {
    super();
  }
  
  async execute(contexts: ExecutionContext[]): Promise<void> {
    for (const context of contexts) {
      const windowName = `wtt-${context.worktreeName}`;
      
      if (this.tmux.isInTmux()) {
        // Create new tmux window
        await this.tmux.createWindow({
          name: windowName,
          command: this.buildCommand(context),
          cwd: context.worktreePath,
          env: this.getEnvironment(context)
        });
        
        // Switch to the last created window
        if (context === contexts[contexts.length - 1]) {
          await this.tmux.selectWindow(windowName);
        }
      } else {
        // Fallback: spawn in new terminal
        const { spawn } = await import('child_process');
        spawn(context.command, context.args, {
          cwd: context.worktreePath,
          env: this.getEnvironment(context),
          detached: true,
          stdio: 'inherit'
        });
      }
    }
  }
  
  private buildCommand(context: ExecutionContext): string {
    return [context.command, ...context.args].join(' ');
  }
}
```

### 4.3 Inline Mode
**File:** `src/exec/modes/inline.ts`

```typescript
import { ExecutionMode, ExecutionContext } from './base';
import { spawn } from 'child_process';

export class InlineMode extends ExecutionMode {
  async execute(contexts: ExecutionContext[]): Promise<void> {
    const executions = contexts.map(context => this.executeOne(context));
    await Promise.all(executions);
  }
  
  private async executeOne(context: ExecutionContext): Promise<void> {
    return new Promise((resolve, reject) => {
      const output: string[] = [];
      const errors: string[] = [];
      
      const proc = spawn(context.command, context.args, {
        cwd: context.worktreePath,
        env: this.getEnvironment(context)
      });
      
      proc.stdout.on('data', (data) => {
        output.push(data.toString());
      });
      
      proc.stderr.on('data', (data) => {
        errors.push(data.toString());
      });
      
      proc.on('close', (code) => {
        // Print buffered output with worktree label
        console.log(`\n[${context.worktreeName}] Output:`);
        console.log(output.join(''));
        
        if (errors.length > 0) {
          console.error(`[${context.worktreeName}] Errors:`);
          console.error(errors.join(''));
        }
        
        if (code !== 0) {
          reject(new Error(`Command failed in ${context.worktreeName} with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }
}
```

### Testing Step 4
```bash
# Test window mode (default)
wtt exec -- echo "Hello from window"
# Should create new window/terminal

# Test inline mode
wtt exec --mode inline -- echo "Hello inline"
# Should output in current terminal with worktree labels

# Test with multiple worktrees
wtt exec -w frontend,backend --mode inline -- pwd
# Should show both paths with labels
```

## Step 5: Implement Background and Exit Modes

### 5.1 Background Mode
**File:** `src/exec/modes/background.ts`

```typescript
export class BackgroundMode extends ExecutionMode {
  constructor(private tmux: TmuxManager) {
    super();
  }
  
  async execute(contexts: ExecutionContext[]): Promise<void> {
    for (const context of contexts) {
      const windowName = `wtt-bg-${context.worktreeName}`;
      
      if (this.tmux.isInTmux()) {
        // Create window but don't switch
        await this.tmux.createWindow({
          name: windowName,
          command: this.buildCommand(context),
          cwd: context.worktreePath,
          env: this.getEnvironment(context),
          background: true  // Don't switch to window
        });
      } else {
        // Fork process in background
        const { spawn } = await import('child_process');
        const proc = spawn(context.command, context.args, {
          cwd: context.worktreePath,
          env: this.getEnvironment(context),
          detached: true,
          stdio: 'ignore'
        });
        proc.unref();
      }
    }
    
    console.log(`Started ${contexts.length} background process(es)`);
  }
}
```

### 5.2 Exit Mode
**File:** `src/exec/modes/exit.ts`

```typescript
export class ExitMode extends ExecutionMode {
  constructor(private tmux: TmuxManager) {
    super();
  }
  
  async execute(contexts: ExecutionContext[]): Promise<void> {
    for (const context of contexts) {
      const windowName = `wtt-tmp-${context.worktreeName}`;
      
      if (this.tmux.isInTmux()) {
        // Wrap command to exit after completion
        const wrappedCommand = `${this.buildCommand(context)}; exit`;
        
        await this.tmux.createWindow({
          name: windowName,
          command: wrappedCommand,
          cwd: context.worktreePath,
          env: this.getEnvironment(context)
        });
      } else {
        // Run in new shell that exits
        const { execSync } = await import('child_process');
        const shellCommand = process.platform === 'win32' ? 'cmd /c' : 'sh -c';
        
        execSync(`${shellCommand} "${this.buildCommand(context)}"`, {
          cwd: context.worktreePath,
          env: this.getEnvironment(context),
          stdio: 'inherit'
        });
      }
    }
  }
}
```

### Testing Step 5
```bash
# Test background mode
wtt exec --mode background -- npm run dev
# Should start without switching windows
# Verify with: tmux list-windows

# Test exit mode
wtt exec --mode exit -- echo "Done" && sleep 2
# Window should close after 2 seconds
```

## Step 6: Wire Everything Together

### 6.1 Update Main Exec Command
**File:** `src/cli/commands/exec.ts`

```typescript
import { parseExecCommand } from '../../exec/parser';
import { WindowMode } from '../../exec/modes/window';
import { InlineMode } from '../../exec/modes/inline';
import { BackgroundMode } from '../../exec/modes/background';
import { ExitMode } from '../../exec/modes/exit';

export async function execAction(
  command?: string,
  args: string[] = [],
  options: ExecOptions = {}
) {
  const config = await loadConfig();
  const worktrees = await getWorktrees(options.worktrees);
  
  // Parse command
  const parsedCommand = parseExecCommand(
    command ? [command, ...args] : args,
    config,
    options
  );
  
  // Create execution contexts
  const contexts = worktrees.map(wt => ({
    worktreeName: wt.name,
    worktreePath: wt.path,
    command: parsedCommand.command,
    args: parsedCommand.args,
    env: {}
  }));
  
  // Select and execute mode
  const mode = createExecutionMode(parsedCommand.mode);
  await mode.execute(contexts);
}

function createExecutionMode(mode: string): ExecutionMode {
  const tmux = new TmuxManager();
  
  switch (mode) {
    case 'window':
      return new WindowMode(tmux);
    case 'inline':
      return new InlineMode();
    case 'background':
      return new BackgroundMode(tmux);
    case 'exit':
      return new ExitMode(tmux);
    default:
      throw new Error(`Unknown mode: ${mode}`);
  }
}
```

### Testing Step 6
```bash
# Full integration test - predefined command
echo '{"commands": {"test": {"command": "echo Test", "mode": "inline"}}}' > .worktree-config.json
wtt exec test
# Should run inline

# Full integration test - inline command with mode override
wtt exec --mode exit -- echo "Goodbye"
# Should create window that exits

# Test error handling
wtt exec nonexistent
# Should show "Command not found" error
```

## Step 7: Add Tests and Documentation

### 7.1 Integration Tests
**File:** `test/integration/exec-modes.test.ts`

```typescript
describe('Exec Modes Integration', () => {
  it('executes in window mode by default', async () => {
    // Setup test worktrees and config
    // Run exec command
    // Verify window was created
  });
  
  it('respects mode from config', async () => {
    // Test each mode from config
  });
  
  it('CLI mode overrides config mode', async () => {
    // Test precedence
  });
});
```

### 7.2 Update README
Add examples and documentation for the new features.

## Testing Strategy

After each step:
1. Run unit tests: `npm test`
2. Run linting: `npm run lint`
3. Test manually with example commands
4. Verify no regressions in existing functionality

## Rollback Plan

Each step is designed to be independently testable. If issues arise:
1. Git stash or commit current changes
2. Revert to last working state
3. Debug and fix the specific step
4. Re-apply subsequent steps

## Success Criteria

- [ ] All existing tests pass
- [ ] New tests cover all modes
- [ ] Manual testing confirms all modes work
- [ ] No performance regressions
- [ ] Documentation is updated
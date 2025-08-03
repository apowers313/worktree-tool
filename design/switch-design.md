# wtt switch Command Design

## Overview

The `wtt switch` command allows users to quickly switch to a worktree within their project. It provides a seamless workflow for jumping between different worktrees, with tmux integration when enabled.

## Command Specification

### Usage
```bash
wtt switch <worktree-name>
```

### Arguments
- `worktree-name` (required): The name of the worktree to switch to

### Options
- `-v, --verbose`: Enable verbose output
- `-q, --quiet`: Suppress output except errors

### Output
- Normal mode: `Switching to <worktree-name>: <path>`
- Quiet mode: No output unless error
- Verbose mode: Additional logging about shell or tmux session/window creation

## Behavior

### When tmux is disabled (`.worktree-config.json` has `"tmux": false`)
1. Validate the worktree exists
2. Get the worktree path
3. Print switching message
4. Spawn a new shell in the worktree directory using `spawnShell` from `platform/shell.ts`

### When tmux is enabled (`.worktree-config.json` has `"tmux": true`)
1. Validate the worktree exists
2. Get the worktree path
3. Print switching message
4. Check if tmux is available
5. Check if a tmux session exists for the project:
   - If session exists:
     - Check if a window exists with the worktree name
     - If window exists: switch to it using `switchToTmuxWindow`
     - If window doesn't exist: create new window using `createTmuxWindow` and switch to it
   - If session doesn't exist:
     - Create new session with project name using `createTmuxSession`
     - Create first window with worktree name
     - Switch to the session/window

### Error Conditions
- No configuration found: "No worktree configuration found. Run 'wtt init' first."
- Invalid worktree name: "Worktree '<name>' not found"
- Tmux not available (when enabled): Fall back to shell spawn with warning
- Shell spawn failure: Display error and exit

## Implementation Details

### File Location
`src/commands/switch.ts`

### Dependencies
- `src/core/config.ts`: Load configuration
- `src/core/git.ts`: List and validate 
- `src/platform/tmux.ts`: Tmux operations
- `src/platform/shell.ts`: Shell spawning
- `src/platform/detector.ts`: Detect shell type
- `src/utils/logger.ts`: Logging
- `src/utils/errors.ts`: Error handling
- `src/utils/project.ts`: Get project name from path

### Code Structure
```typescript
export interface SwitchOptions extends GlobalOptions {
  name: string;
}

export async function executeSwitch(options: SwitchOptions): Promise<void> {
  // 1. Load config
  // 2. Validate worktree exists
  // 3. Get worktree path
  // 4. Print switching message
  // 5. If tmux enabled and available:
  //    - Handle tmux session/window logic
  // 6. Else:
  //    - Spawn shell in worktree directory
}
```

### Reusable Components

From existing code:
- `loadConfig()` from `core/config.ts`
- `createGit().listWorktrees()` from `core/git.ts`
- `sanitizeTmuxName()`, `tmuxSessionExists()`, `createTmuxSession()`, `createTmuxWindow()`, `switchToTmuxWindow()` from `platform/tmux.ts`
- `spawnShell()` from `platform/shell.ts`
- `detectShellType()` from `platform/detector.ts`
- `getLogger()` from `utils/logger.ts`
- Error types from `utils/errors.ts`

## Testing Requirements

### Unit Tests (`test/unit/commands/switch.test.ts`)
1. **Valid worktree switch**
   - Mock config, git operations, and platform calls
   - Verify correct path resolution
   - Verify correct output message
   
2. **Non-existent worktree**
   - Should throw appropriate error
   
3. **No configuration**
   - Should suggest running 'wtt init'
   
4. **Tmux disabled**
   - Should call spawnShell with correct parameters
   
5. **Tmux enabled - new session**
   - Should create session and window
   
6. **Tmux enabled - existing session**
   - Should create new window in existing session
   
7. **Tmux enabled - existing window**
   - Should switch to existing window
   
8. **Verbose/quiet modes**
   - Verify appropriate logging levels

### Integration Tests (`test/integration/switch.test.ts`)
1. **Full workflow with real git worktrees**
   - Create test repo with worktrees
   - Test switching between them
   
2. **Shell spawn integration**
   - Verify shell actually spawns (may need to mock spawn)
   
3. **Tmux integration** (if available)
   - Test actual tmux session/window creation
   - Use conditional test skipping if tmux not available

### Manual Testing
1. Test with tmux enabled and disabled
2. Test on different shells (bash, zsh, powershell)
3. Test with various worktree names (spaces, special characters)
4. Test switching to main worktree
5. Test rapid switching between worktrees

## CLI Integration

Add to `src/index.ts`:
```typescript
import { executeSwitch } from './commands/switch';

program
  .command('switch <name>')
  .description('Switch to a worktree')
  .action(async (name: string, options: GlobalOptions) => {
    await executeSwitch({ ...options, name });
  });
```

## Future Enhancements
1. Tab completion for worktree names
2. Option to switch to last used worktree
3. Integration with IDE/editor to open in worktree
4. Option to run commands after switching
5. Fuzzy search for worktree names

# wtt exec Command Design

## Overview

The `wtt exec` command provides a way to run predefined commands across one or more worktrees. Commands are defined in the `.worktree-config.json` file and can be executed in all worktrees or specific worktrees.

## Command Structure

### Configuration Format

Commands will be stored in `.worktree-config.json` under a `commands` object:

```json
{
  "version": "1.0.0",
  "projectName": "worktree-tool",
  "mainBranch": "master",
  "baseDir": ".worktrees",
  "tmux": true,
  "commands": {
    "test": "npm test",
    "build": "npm run build",
    "lint": "npm run lint",
    "dev": "npm run dev",
    "clean": "rm -rf node_modules dist",
    "install": "npm install"
  }
}
```

### Command Syntax

```bash
# Run command in all worktrees
wtt exec <command-name>

# Run command in specific worktree
wtt exec <command-name> <worktree-name>

# Examples
wtt exec test              # Runs 'npm test' in all worktrees
wtt exec build feature-x   # Runs 'npm run build' only in feature-x worktree
```

## Execution Environment

### Window Management

#### Tmux Mode
- Create new tmux window for each worktree execution
- Window naming: `{worktreeName} {commandName}`
- Example: `feature-x test`, `bugfix-123 build`

#### Non-Tmux Mode
- Open new shell process for each worktree
- Window title set to: `{worktreeName} {commandName}` (if supported by terminal)

### Working Directory
- Commands execute in the root directory of each worktree
- Current directory is changed before command execution

## Error Handling

### Missing Command
- Error if command name not found in config
- Display available commands from config
- Exit code: 1

### Missing Worktree
- Error if specified worktree doesn't exist
- Display available worktrees
- Exit code: 1

### No Commands Configured
- Error if `commands` object is empty or missing
- Suggest adding commands to config
- Exit code: 1

### Command Execution Failure
- Don't stop execution for other worktrees
- Report failures at the end
- Exit code: Number of failed executions

## Edge Cases

### Empty Command String
- Validate that command values are non-empty strings
- Error during config validation

### Special Characters in Commands
- Support shell metacharacters (pipes, redirects, etc.)
- Commands executed through shell, not directly

### Long-Running Commands
- Commands run in detached windows/shells
- No timeout imposed
- User responsible for monitoring/terminating

### Concurrent Execution
- All worktree executions start simultaneously
- No dependency management between worktrees
- Each execution is independent

### Environment Variables
- Commands inherit environment from parent process
- Consider adding worktree-specific env vars:
  - `WTT_WORKTREE_NAME`: Current worktree name
  - `WTT_WORKTREE_PATH`: Current worktree path
  - `WTT_IS_MAIN`: "true" if main worktree, "false" otherwise

### Command Arguments
- Commands can include arguments in the config
- No dynamic argument passing from CLI to prevent injection
- If needed, use separate command definitions

### Window Reuse
- Check if window with same name exists
- Option to reuse or create new (future enhancement)
- For now, always create new window

## User Experience

### Progress Indication
- Show which worktrees are being executed
- Display command being run
- Clear indication when all executions started

### Output Format
```
Executing 'test' in 3 worktrees...
✓ Starting in main: npm test
✓ Starting in feature-x: npm test
✓ Starting in bugfix-123: npm test

All commands started. Check individual windows for output.
```

### Verbose Mode
- Show full paths when verbose flag is set
- Display additional execution details

## Future Enhancements

### Sequential Execution
- Add `--sequential` flag to run one at a time
- Useful for resource-intensive commands

### Background Execution
- Add `--background` flag to run commands in background (don't switch to window)
- Useful for starting daemons

### Inline Execution
- Add `--inline` flag for displaying the out put of each command sequentially in the current window
- Useful for status commands, like `git status`

### Exit After Execution
- Add `--exit` flag to exit after the command has completed
- Useful for one-off commands, like `npx eslint --fix`

### Output Capture
- Option to capture and aggregate output
- Useful for CI/CD scenarios

### Command Templates
- Support variables in commands
- Example: `"test": "npm test -- --grep {{branch_name}}"`

### Pre/Post Hooks
- Run commands before/after main command
- Useful for setup/cleanup

### Conditional Execution
- Skip certain worktrees based on conditions
- Example: Skip if branch matches pattern

## Implementation Priority

1. Basic command execution in all worktrees
2. Single worktree execution
3. Tmux window creation
4. Non-tmux shell support
5. Error handling and validation
6. Environment variables

## Testing Strategy

### Unit Tests
- Config parsing with commands
- Command validation
- Worktree name validation

### Integration Tests
- Actual command execution
- Window creation (mock for tmux)
- Error scenarios

### Manual Testing
- Long-running commands
- Commands with special characters
- Concurrent execution stress test

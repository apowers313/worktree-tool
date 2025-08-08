# Exec Command Expansion Design

## Overview

This design document outlines the expansion of the `wtt exec` command to support both predefined commands from configuration and arbitrary inline commands, along with new execution modes.

## Command Syntax

### Predefined Commands (from config)
```bash
wtt exec <command> [options]
wtt exec <command> -w <worktrees> [options]
```

### Inline Commands
```bash
wtt exec [options] -- <command> [args...]
wtt exec -w <worktrees> [options] -- <command> [args...]
```

The `--` separator is required for inline commands to disambiguate them from predefined commands.

## Options

### Worktree Selection
- `-w, --worktrees <worktrees>`: Comma-separated list of worktrees to execute in
  - Example: `-w frontend,backend,api` or `--worktrees frontend,backend,api`
  - Default: All worktrees

### Execution Modes
- `--mode <mode>`: Specify execution mode (default: window)
  - `window`: Create new window/shell for each worktree (default)
    - In tmux: Creates new window and switches to it
    - In shell: Opens new shell instance
  
  - `inline`: Run in current window/shell
    - All processes run in parallel
    - Output is batched and displayed when each command completes
  
  - `background`: Run command without switching to it
    - In tmux: Create window but don't switch to it
    - In shell: Fork process and run in background
  
  - `exit`: Close the window/shell after command completes
    - In tmux: Window closes after command finishes
    - In shell: Shell exits after command finishes

### Existing Options
- `-v, --verbose`: Show verbose output
- `-q, --quiet`: Suppress output

## Configuration File Changes

The `commands` object in `.worktree-config.json` now supports both string and object values:

### String Format (existing)
```json
{
  "commands": {
    "build": "npm run build",
    "test": "npm test"
  }
}
```

### Object Format (new)
```json
{
  "commands": {
    "build": "npm run build",
    "test": {
      "command": "npm test",
      "mode": "exit"
    },
    "watch": {
      "command": "npm run watch",
      "mode": "background"
    },
    "lint": {
      "command": "npm run lint",
      "mode": "inline"
    }
  }
}
```

### Command Object Properties
- `command` (string, required): The command to execute
- `mode` (string, optional): Default execution mode ("window", "inline", "background", "exit")
  - Default: "window"

Command-line flags override config file defaults.

## Examples

### Predefined Commands
```bash
# Run 'build' command in all worktrees
wtt exec build

# Run 'test' in specific worktrees
wtt exec test -w frontend,backend

# Run 'lint' inline with verbose output
wtt exec lint --mode inline -v
```

### Inline Commands
```bash
# Install dependencies in all worktrees
wtt exec -- npm install

# Run tests with watch mode in frontend
wtt exec -w frontend -- npm test --watch

# Check git status inline in specific worktrees
wtt exec -w frontend,backend --mode inline -- git status

# Run a background server
wtt exec --mode background -- npm run dev

# Run a one-off command that exits
wtt exec --mode exit -- npm run build
```

## Implementation Notes

1. **Parser Logic**: The command parser checks if the first non-flag argument exists in the config commands. If not found and `--` is present, everything after `--` is treated as an inline command.

2. **Flag Precedence**: Command-line flags always override config file defaults.

3. **Validation**: 
   - Only one mode can be specified at a time
   - Inline commands require the `--` separator
   - Mode defaults to "window" if not specified

4. **Environment Variables**: All execution modes preserve the existing environment variables:
   - `WTT_WORKTREE_NAME`
   - `WTT_WORKTREE_PATH`
   - `WTT_IS_MAIN`

5. **Output Handling**:
   - `window` (default): Output streams directly to new window/shell
   - `exit`: Output streams directly to window/shell, then closes
   - `background`: No output unless error occurs
   - `inline`: Output is buffered and displayed per-worktree with clear labels

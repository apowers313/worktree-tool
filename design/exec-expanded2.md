# Exec Expanded Features Design

## Overview

This document outlines additional features for the `wtt exec` command, enhancing automatic command execution, window management, and port allocation capabilities.

## New Features

### 1. Auto-Run Commands (`autoRun`)

**Purpose**: Automatically execute specific commands after worktree creation.

**Configuration**:
```json
{
  "commands": {
    "dev": {
      "command": "npm run dev",
      "autoRun": true
    },
    "test": {
      "command": "npm test",
      "autoRun": false
    }
  }
}
```

**Behavior**:
- When `wtt create` completes, it checks all commands with `autoRun: true`
- Executes these commands in the new worktree automatically
- Commands run in their configured mode (window/inline/background)
- Default value: `false` if not specified

### 2. Automatic Window Sorting (`autoSort`)

**Purpose**: Keep tmux windows organized alphabetically by title.

**Configuration**:
```json
{
  "autoSort": true,
  "projectName": "my-project",
  "commands": { ... }
}
```

**Behavior**:
- Top-level boolean option
- When `true`, tmux windows are sorted alphabetically after creation
- Applied during `wtt create` and `wtt exec --refresh`
- Default value: `true` (included in `wtt init` template)
- Sorting order: A-Z by window name (e.g., "feature1::dev", "feature2::dev")

### 3. Refresh Command (`--refresh`)

**Purpose**: Ensure all autoRun commands are running and windows are sorted.

**Usage**:
```bash
# Refresh all worktrees
wtt exec --refresh

# Refresh specific worktrees
wtt exec --refresh feature1 feature2
```

**Behavior**:
1. Scans specified worktrees (or all if none specified)
2. For each worktree:
   - Checks which commands have `autoRun: true`
   - Determines if command is already running (by checking tmux windows)
   - Starts missing commands
3. If `autoSort: true`, re-sorts all tmux windows for this worktree session alphabetically

### 4. Port Allocation (`numPorts` and `availablePorts`)

**Purpose**: Automatically allocate unique ports for services.

**Configuration**:
```json
{
  "availablePorts": "9000-9099",
  "commands": {
    "dev": {
      "command": "npm run dev",
      "numPorts": 1
    },
    "api": {
      "command": "npm run api",
      "numPorts": 2
    }
  }
}
```

**Environment Variables**:
- `WTT_PORT1`: First allocated port
- `WTT_PORT2`: Second allocated port (if numPorts >= 2)
- `WTT_PORT{n}`: Nth allocated port

**Behavior**:
1. Parse `availablePorts` range (e.g., "9000-9099")
2. For each command execution:
   - Check `numPorts` value (default: 0)
   - Find `numPorts` available ports in range
   - Verify ports are not in use (using net connection check)
   - Set environment variables before command execution
3. Port allocation is per-worktree to avoid conflicts
4. Ports are checked at execution time to ensure availability

## Implementation Details

### Config Schema Updates

```typescript
interface WorktreeConfig {
  // Existing fields...
  autoSort?: boolean;              // New: default true
  availablePorts?: string;         // New: format "start-end"
  commands: {
    [name: string]: {
      command: string;
      mode?: string;
      autoRun?: boolean;           // New: default false
      numPorts?: number;           // New: default 0
    };
  };
}
```

### Port Management

```typescript
interface PortManager {
  parseRange(range: string): { start: number; end: number };
  findAvailablePorts(start: number, end: number, count: number): Promise<number[]>;
  isPortAvailable(port: number): Promise<boolean>;
}
```

### Window Management

```typescript
interface TmuxWindowManager {
  getWindowList(sessionName: string): Promise<TmuxWindow[]>;
  sortWindowsAlphabetically(sessionName: string): Promise<void>;
  isCommandRunning(sessionName: string, windowName: string): Promise<boolean>;
}
```

### Refresh Logic

```typescript
interface RefreshManager {
  refreshWorktrees(worktrees: string[]): Promise<void>;
  startMissingAutoRunCommands(worktree: WorktreeInfo): Promise<void>;
  sortWindowsIfEnabled(config: WorktreeConfig): Promise<void>;
}
```

## User Experience

### During `wtt init`
```json
{
  "version": "1.0.0",
  "projectName": "my-project",
  "mainBranch": "main",
  "baseDir": ".worktrees",
  "tmux": true,
  "autoSort": true,
  "availablePorts": "9000-9099",
  "commands": {
    "shell": "bash"
  }
}
```

### During `wtt create feature-x`
1. Creates worktree
2. Checks for `autoRun: true` commands
3. Allocates ports if needed
4. Executes autoRun commands
5. Sorts windows if `autoSort: true`

### During `wtt exec --refresh`
1. Identifies missing autoRun commands
2. Starts them with proper port allocation
3. Re-sorts windows if needed

## Error Handling

- **Port allocation failure**: Skip port allocation, log warning, continue execution
- **AutoRun failure**: Log error, continue with other commands
- **Window sorting failure**: Log warning, continue operation
- **Invalid port range**: Use validation during config load, reject invalid ranges

## Backward Compatibility

- All new config options are optional
- Missing options use sensible defaults
- Existing configs continue to work unchanged
- `wtt init` updated to include new options with defaults

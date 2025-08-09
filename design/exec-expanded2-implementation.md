# Implementation Plan for Exec Expanded Features

## Overview
This plan breaks down the implementation of exec-expanded2.md into small, testable steps. Each step includes source code examples and testing requirements.

## Phase 1: Config Schema Updates

### Step 1.1: Update Type Definitions
**File**: `src/core/types.ts`

Add new fields to WorktreeConfig and CommandConfig interfaces:

```typescript
export interface CommandConfig {
    command: string;
    mode?: ExecutionMode;
    autoRun?: boolean;    // New field
    numPorts?: number;    // New field
}

export interface WorktreeConfig {
    version: string;
    projectName: string;
    mainBranch: string;
    baseDir: string;
    tmux: boolean;
    autoSort?: boolean;        // New field
    availablePorts?: string;   // New field
    commands: {
        [name: string]: string | CommandConfig;
    };
}
```

**Testing**:
- Run `npm run build` to ensure types compile
- Run `npm run test` to ensure existing tests pass

### Step 1.2: Update Config Validation
**File**: `src/core/config.ts`

Add validation for new fields in validateConfig function:

```typescript
function validatePortRange(range: string): boolean {
    const match = range.match(/^(\d+)-(\d+)$/);
    if (!match) return false;
    const start = parseInt(match[1]);
    const end = parseInt(match[2]);
    return start < end && start >= 1024 && end <= 65535;
}

// In validateConfig function, add:
if (config.availablePorts && !validatePortRange(config.availablePorts)) {
    errors.push("availablePorts must be in format 'start-end' (e.g., '9000-9099')");
}

if (config.autoSort !== undefined && typeof config.autoSort !== "boolean") {
    errors.push("autoSort must be a boolean");
}

// For each command config:
if (cmd.autoRun !== undefined && typeof cmd.autoRun !== "boolean") {
    errors.push(`autoRun must be a boolean for command ${name}`);
}

if (cmd.numPorts !== undefined && (typeof cmd.numPorts !== "number" || cmd.numPorts < 0)) {
    errors.push(`numPorts must be a non-negative number for command ${name}`);
}
```

**Testing**:
- Create unit tests for validatePortRange
- Test config loading with various port range formats
- Test config validation with invalid autoSort/autoRun values

### Step 1.3: Update Init Command Template
**File**: `src/commands/init.ts`

Update the default config template:

```typescript
const defaultConfig: WorktreeConfig = {
    version: "1.0.0",
    projectName: path.basename(projectRoot),
    mainBranch: mainBranch,
    baseDir: ".worktrees",
    tmux: true,
    autoSort: true,              // New default
    availablePorts: "9000-9099", // New default
    commands: {
        shell: "bash",
    },
};
```

**Testing**:
- Run `wtt init` in a test directory
- Verify generated config includes new fields
- Run existing init tests

## Phase 2: Port Management

### Step 2.1: Create Port Manager
**File**: `src/utils/port-manager.ts`

```typescript
import net from "net";

export interface PortRange {
    start: number;
    end: number;
}

export class PortManager {
    parseRange(range: string): PortRange {
        const match = range.match(/^(\d+)-(\d+)$/);
        if (!match) {
            throw new Error(`Invalid port range format: ${range}`);
        }
        return {
            start: parseInt(match[1]),
            end: parseInt(match[2]),
        };
    }

    async isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            
            server.once("error", () => {
                resolve(false);
            });
            
            server.once("listening", () => {
                server.close();
                resolve(true);
            });
            
            server.listen(port);
        });
    }

    async findAvailablePorts(start: number, end: number, count: number): Promise<number[]> {
        const available: number[] = [];
        
        for (let port = start; port <= end && available.length < count; port++) {
            if (await this.isPortAvailable(port)) {
                available.push(port);
            }
        }
        
        if (available.length < count) {
            throw new Error(`Could not find ${count} available ports in range ${start}-${end}`);
        }
        
        return available;
    }
}

export const portManager = new PortManager();
```

**Testing**:
```typescript
// test/utils/port-manager.test.ts
import { portManager } from "../../src/utils/port-manager.js";

describe("PortManager", () => {
    describe("parseRange", () => {
        it("should parse valid range", () => {
            const range = portManager.parseRange("9000-9099");
            expect(range).toEqual({ start: 9000, end: 9099 });
        });
        
        it("should throw on invalid range", () => {
            expect(() => portManager.parseRange("invalid")).toThrow();
        });
    });
    
    describe("isPortAvailable", () => {
        it("should detect available port", async () => {
            const available = await portManager.isPortAvailable(0);
            expect(available).toBe(true);
        });
    });
});
```

### Step 2.2: Update Execution Context
**File**: `src/exec/modes/base.ts`

Add port environment variables to ExecutionContext:

```typescript
export interface ExecutionContext {
    worktreeName: string;
    worktreePath: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    ports?: number[];  // New field
}
```

### Step 2.3: Integrate Port Allocation
**File**: `src/commands/exec.ts`

Add port allocation before command execution:

```typescript
import { portManager } from "../utils/port-manager.js";

// In execCommand action, after creating contexts:
if (config.availablePorts) {
    const portRange = portManager.parseRange(config.availablePorts);
    
    for (const context of contexts) {
        const cmdConfig = config.commands[parsedCommand.commandName];
        if (typeof cmdConfig === "object" && cmdConfig.numPorts && cmdConfig.numPorts > 0) {
            try {
                const ports = await portManager.findAvailablePorts(
                    portRange.start,
                    portRange.end,
                    cmdConfig.numPorts
                );
                
                context.ports = ports;
                // Set environment variables
                ports.forEach((port, index) => {
                    context.env[`WTT_PORT${index + 1}`] = port.toString();
                });
            } catch (error) {
                logger.warn(`Port allocation failed for ${context.worktreeName}: ${error.message}`);
            }
        }
    }
}
```

**Testing**:
- Test exec with numPorts configured
- Verify WTT_PORT environment variables are set
- Test port allocation failure handling

## Phase 3: Window Management

### Step 3.1: Create Window Manager
**File**: `src/platform/tmux-window-manager.ts`

```typescript
import { exec } from "../utils/shell.js";

export interface TmuxWindow {
    index: number;
    name: string;
    active: boolean;
}

export class TmuxWindowManager {
    async getWindowList(sessionName: string): Promise<TmuxWindow[]> {
        try {
            const result = await exec(
                `tmux list-windows -t ${sessionName} -F "#{window_index}:#{window_name}:#{window_active}"`
            );
            
            return result.stdout.trim().split("\n").map(line => {
                const [index, name, active] = line.split(":");
                return {
                    index: parseInt(index),
                    name,
                    active: active === "1"
                };
            });
        } catch {
            return [];
        }
    }
    
    async sortWindowsAlphabetically(sessionName: string): Promise<void> {
        const windows = await this.getWindowList(sessionName);
        const sorted = [...windows].sort((a, b) => a.name.localeCompare(b.name));
        
        // Skip if already sorted
        if (windows.every((w, i) => w.name === sorted[i].name)) {
            return;
        }
        
        // Move windows to correct positions
        for (let i = 0; i < sorted.length; i++) {
            const window = sorted[i];
            if (window.index !== i) {
                await exec(`tmux move-window -s ${sessionName}:${window.index} -t ${sessionName}:${i}`);
            }
        }
    }
    
    async isCommandRunning(sessionName: string, windowName: string): Promise<boolean> {
        const windows = await this.getWindowList(sessionName);
        return windows.some(w => w.name === windowName);
    }
}

export const tmuxWindowManager = new TmuxWindowManager();
```

**Testing**:
- Mock tmux commands for unit tests
- Test window sorting algorithm
- Test detection of running commands

### Step 3.2: Add autoSort to Window Creation
**File**: `src/exec/modes/window.ts`

After creating windows, add sorting:

```typescript
import { tmuxWindowManager } from "../../platform/tmux-window-manager.js";

// In WindowExecutionMode.execute, after creating all windows:
if (this.config.autoSort) {
    const sessionName = sanitizeTmuxName(this.config.projectName);
    try {
        await tmuxWindowManager.sortWindowsAlphabetically(sessionName);
    } catch (error) {
        this.logger.warn(`Failed to sort windows: ${error.message}`);
    }
}
```

## Phase 4: Auto-Run Implementation

### Step 4.1: Create AutoRun Manager
**File**: `src/exec/autorun-manager.ts`

```typescript
import { WorktreeConfig, WorktreeInfo } from "../core/types.js";
import { createExecutionMode } from "./modes/factory.js";
import { ExecutionContext } from "./modes/base.js";
import { portManager } from "../utils/port-manager.js";
import { tmuxWindowManager } from "../platform/tmux-window-manager.js";
import { sanitizeTmuxName } from "../platform/tmux.js";
import path from "path";

export class AutoRunManager {
    constructor(
        private config: WorktreeConfig,
        private logger: Logger
    ) {}
    
    async runAutoCommands(worktree: WorktreeInfo): Promise<void> {
        const worktreeName = path.basename(worktree.path);
        
        for (const [cmdName, cmdConfig] of Object.entries(this.config.commands)) {
            if (typeof cmdConfig === "object" && cmdConfig.autoRun) {
                await this.runCommand(cmdName, cmdConfig, worktreeName, worktree.path);
            }
        }
    }
    
    private async runCommand(
        cmdName: string,
        cmdConfig: CommandConfig,
        worktreeName: string,
        worktreePath: string
    ): Promise<void> {
        const context: ExecutionContext = {
            worktreeName,
            worktreePath,
            command: cmdConfig.command,
            args: [],
            env: {}
        };
        
        // Allocate ports if needed
        if (this.config.availablePorts && cmdConfig.numPorts && cmdConfig.numPorts > 0) {
            try {
                const portRange = portManager.parseRange(this.config.availablePorts);
                const ports = await portManager.findAvailablePorts(
                    portRange.start,
                    portRange.end,
                    cmdConfig.numPorts
                );
                
                ports.forEach((port, index) => {
                    context.env[`WTT_PORT${index + 1}`] = port.toString();
                });
            } catch (error) {
                this.logger.warn(`Port allocation failed for ${cmdName}: ${error.message}`);
            }
        }
        
        const mode = cmdConfig.mode || "window";
        const executionMode = createExecutionMode(mode, this.config, this.logger);
        await executionMode.execute([context]);
    }
}
```

### Step 4.2: Integrate AutoRun with Create Command
**File**: `src/commands/create.ts`

Add after worktree creation:

```typescript
import { AutoRunManager } from "../exec/autorun-manager.js";

// After successful worktree creation:
const autoRunManager = new AutoRunManager(config, logger);
await autoRunManager.runAutoCommands(newWorktree);

// Sort windows if enabled
if (config.autoSort && config.tmux) {
    const sessionName = sanitizeTmuxName(config.projectName);
    await tmuxWindowManager.sortWindowsAlphabetically(sessionName);
}
```

## Phase 5: Refresh Implementation

### Step 5.1: Add Refresh Option
**File**: `src/commands/exec.ts`

Add refresh option to command:

```typescript
.option("--refresh", "Ensure autoRun commands are running and re-sort windows")

// Update ExecOptions interface:
interface ExecOptions {
    verbose?: boolean;
    quiet?: boolean;
    worktrees?: string;
    mode?: string;
    refresh?: boolean;  // New field
}
```

### Step 5.2: Implement Refresh Logic
**File**: `src/exec/refresh-manager.ts`

```typescript
export class RefreshManager {
    constructor(
        private config: WorktreeConfig,
        private logger: Logger
    ) {}
    
    async refreshWorktrees(worktrees: WorktreeInfo[]): Promise<void> {
        const sessionName = sanitizeTmuxName(this.config.projectName);
        
        for (const worktree of worktrees) {
            await this.refreshWorktree(worktree, sessionName);
        }
        
        // Sort windows if enabled
        if (this.config.autoSort && this.config.tmux) {
            await tmuxWindowManager.sortWindowsAlphabetically(sessionName);
        }
    }
    
    private async refreshWorktree(worktree: WorktreeInfo, sessionName: string): Promise<void> {
        const worktreeName = path.basename(worktree.path);
        
        for (const [cmdName, cmdConfig] of Object.entries(this.config.commands)) {
            if (typeof cmdConfig === "object" && cmdConfig.autoRun) {
                const windowName = `${worktreeName}::${cmdName}`;
                
                if (!await tmuxWindowManager.isCommandRunning(sessionName, windowName)) {
                    this.logger.info(`Starting missing autoRun command: ${cmdName} for ${worktreeName}`);
                    const autoRunManager = new AutoRunManager(this.config, this.logger);
                    await autoRunManager.runCommand(cmdName, cmdConfig, worktreeName, worktree.path);
                }
            }
        }
    }
}
```

### Step 5.3: Handle Refresh in Exec Command
**File**: `src/commands/exec.ts`

Add refresh handling:

```typescript
// In execCommand action, before normal execution:
if (options.refresh) {
    const refreshManager = new RefreshManager(config, logger);
    
    // If specific worktrees provided via args, use those
    let refreshTargets = targetWorktrees;
    if (commandName || args.length > 0) {
        // Parse worktree names from command/args
        const requestedNames = [commandName, ...args].filter(Boolean);
        refreshTargets = worktrees.filter(w => 
            requestedNames.includes(path.basename(w.path)) ||
            requestedNames.includes(w.branch)
        );
    }
    
    await refreshManager.refreshWorktrees(refreshTargets);
    return; // Exit after refresh
}
```

## Phase 6: Testing & Integration

### Step 6.1: Create Integration Tests
**File**: `test/integration/exec-expanded.test.ts`

```typescript
describe("Exec Expanded Features", () => {
    describe("autoRun", () => {
        it("should run autoRun commands after create", async () => {
            // Setup config with autoRun command
            // Run wtt create
            // Verify command is running in tmux
        });
    });
    
    describe("port allocation", () => {
        it("should allocate ports and set env vars", async () => {
            // Setup config with numPorts
            // Run exec command
            // Verify WTT_PORT1 etc are set
        });
    });
    
    describe("refresh", () => {
        it("should start missing autoRun commands", async () => {
            // Setup worktrees with autoRun commands
            // Kill one command
            // Run wtt exec --refresh
            // Verify command restarted
        });
    });
});
```

### Step 6.2: Update Documentation
**Files**: `README.md`, `docs/`

Add documentation for:
- New config options
- --refresh usage
- Port allocation
- Auto-run behavior

## Testing Strategy

After each step:
1. Run `npm run lint` and fix any linting errors
2. Run `npm run build` to ensure TypeScript compiles
3. Run `npm run test` to ensure existing tests pass
4. Add specific unit tests for new functionality
5. Test manually with a sample project

## Rollback Plan

Each step is designed to be independently deployable. If issues arise:
1. Revert the specific step's changes
2. Fix issues in isolation
3. Re-apply with fixes
4. Continue to next step
# Tmux Module Design

## Overview

This document outlines the design for a proper tmux wrapper module that follows the patterns established by libraries like `simple-git`. The module will wrap tmux CLI commands and provide a clean, testable API for our worktree tool.

## Design Principles

1. **Command Wrapper Pattern**: Like `simple-git`, we'll wrap tmux CLI commands with a promise-based API
2. **Minimal Surface Area**: Only implement features we currently use
3. **Testability First**: Easy to mock for unit tests
4. **Type Safety**: Full TypeScript support with proper types
5. **Error Handling**: Consistent error handling with meaningful messages

## Test Sandbox Integration

The tmux module is designed to work seamlessly with our test sandbox architecture:

- **Mock by Default**: All tests use MockTmux to avoid external dependencies
- **Sandbox Isolation**: Tmux operations respect sandbox temp directory boundaries
- **Automatic Detection**: Integration tests automatically detect tmux availability and skip when not present
- **Environment Awareness**: Module works correctly within isolated test environments

This approach ensures fast, reliable tests that don't require tmux installation while still allowing thorough integration testing when needed.

## Module Structure

```typescript
// src/lib/tmux/index.ts
export { tmux, createTmux } from './tmux';
export { TmuxError } from './errors';
export type { Tmux, TmuxOptions, Session, Window } from './types';

// src/lib/tmux/tmux.ts
class TmuxImpl implements Tmux {
  // Implementation
}

// Factory function (similar to simple-git)
export function tmux(options?: TmuxOptions): Tmux {
  return new TmuxImpl(options);
}

// For testing - allows injection of executor
export function createTmux(executor: CommandExecutor): Tmux {
  return new TmuxImpl({ executor });
}
```

## Core Interfaces

```typescript
// src/lib/tmux/types.ts

export interface TmuxOptions {
  binary?: string;  // Default: 'tmux'
  executor?: CommandExecutor;  // For testing
}

export interface Session {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
}

export interface Window {
  index: number;
  name: string;
  active: boolean;
  panes: number;
  layout: string;
  path: string;
}

export interface Tmux {
  // Session Management
  newSession(name: string, options?: NewSessionOptions): Promise<void>;
  hasSession(name: string): Promise<boolean>;
  listSessions(): Promise<Session[]>;
  killSession(name: string): Promise<void>;
  attachSession(name: string): Promise<void>;
  switchClient(name: string): Promise<void>;
  
  // Window Management
  newWindow(session: string, name: string, options?: NewWindowOptions): Promise<void>;
  listWindows(session: string): Promise<Window[]>;
  renameWindow(session: string, index: number, name: string): Promise<void>;
  selectWindow(session: string, window: string): Promise<void>;
  
  // Utility
  isInsideTmux(): boolean;
  canAttach(): boolean;
  isAvailable(): Promise<boolean>;
  version(): Promise<string>;
  
  // Low-level (for special cases)
  sendKeys(target: string, keys: string[]): Promise<void>;
  raw(args: string[]): Promise<{ stdout: string; stderr: string }>;
}

export interface NewSessionOptions {
  detached?: boolean;  // Default: true
  startDirectory?: string;
  windowName?: string;
}

export interface NewWindowOptions {
  startDirectory?: string;
  detached?: boolean;  // Default: true
}

export interface CommandExecutor {
  exec(command: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
}
```

## Implementation Details

### Core Implementation

```typescript
// src/lib/tmux/tmux.ts

import { spawn } from 'child_process';
import { promisify } from 'util';
import { TmuxError } from './errors';
import type { Tmux, TmuxOptions, Session, Window, CommandExecutor } from './types';

class TmuxImpl implements Tmux {
  private binary: string;
  private executor: CommandExecutor;
  
  constructor(options: TmuxOptions = {}) {
    this.binary = options.binary || 'tmux';
    this.executor = options.executor || new DefaultExecutor(this.binary);
  }
  
  async newSession(name: string, options: NewSessionOptions = {}): Promise<void> {
    const args = ['new-session'];
    
    if (options.detached !== false) {
      args.push('-d');
    }
    
    args.push('-s', this.sanitizeName(name));
    
    if (options.startDirectory) {
      args.push('-c', options.startDirectory);
    }
    
    if (options.windowName) {
      args.push('-n', this.sanitizeName(options.windowName));
    }
    
    try {
      await this.executor.exec(this.binary, args);
    } catch (error) {
      throw new TmuxError(`Failed to create session '${name}': ${error.message}`);
    }
  }
  
  async hasSession(name: string): Promise<boolean> {
    try {
      await this.executor.exec(this.binary, ['has-session', '-t', name]);
      return true;
    } catch {
      return false;
    }
  }
  
  // ... other methods following similar pattern
  
  private sanitizeName(name: string): string {
    return name
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9\-_]/g, '')
      .toLowerCase();
  }
}

class DefaultExecutor implements CommandExecutor {
  constructor(private binary: string) {}
  
  async exec(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          const error = new Error(`Command failed: ${command} ${args.join(' ')}\n${stderr}`);
          (error as any).code = code;
          (error as any).stdout = stdout;
          (error as any).stderr = stderr;
          reject(error);
        }
      });
    });
  }
}
```

### Error Handling

```typescript
// src/lib/tmux/errors.ts

export class TmuxError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
    this.name = 'TmuxError';
  }
}

export class TmuxNotFoundError extends TmuxError {
  constructor() {
    super('tmux not found. Please install tmux to use this feature.');
    this.name = 'TmuxNotFoundError';
  }
}

export class TmuxSessionExistsError extends TmuxError {
  constructor(sessionName: string) {
    super(`Session '${sessionName}' already exists`);
    this.name = 'TmuxSessionExistsError';
  }
}
```

## Testing Strategy

### Sandbox Integration

Based on our test sandbox design, tmux should be mocked by default in all unit and integration tests. This ensures:
- Tests run in complete isolation without requiring tmux installation
- Predictable test behavior across different environments
- No external tmux processes that could interfere with tests
- Fast test execution without process spawning overhead

### Mock Implementation

```typescript
// src/lib/tmux/mock.ts

export class MockTmux implements Tmux {
  private sessions: Map<string, Session> = new Map();
  private windows: Map<string, Window[]> = new Map();
  
  // Track calls for assertions
  public calls: { method: string; args: any[] }[] = [];
  
  async newSession(name: string, options?: NewSessionOptions): Promise<void> {
    this.calls.push({ method: 'newSession', args: [name, options] });
    
    if (this.sessions.has(name)) {
      throw new TmuxSessionExistsError(name);
    }
    
    this.sessions.set(name, {
      name,
      windows: 1,
      created: new Date().toISOString(),
      attached: false
    });
    
    this.windows.set(name, [{
      index: 0,
      name: options?.windowName || name,
      active: true,
      panes: 1,
      layout: 'even-horizontal',
      path: options?.startDirectory || process.cwd()
    }]);
  }
  
  async hasSession(name: string): Promise<boolean> {
    this.calls.push({ method: 'hasSession', args: [name] });
    return this.sessions.has(name);
  }
  
  // ... implement other methods
  
  // Test helpers
  reset(): void {
    this.sessions.clear();
    this.windows.clear();
    this.calls = [];
  }
  
  getCall(index: number) {
    return this.calls[index];
  }
  
  getCalls(method: string) {
    return this.calls.filter(c => c.method === method);
  }
}

// Factory for tests
export function createMockTmux(): MockTmux {
  return new MockTmux();
}
```

### Test Examples with Sandbox

```typescript
// Example test file using sandbox
import { createMockTmux } from '@/lib/tmux/mock';
import { withTestSandbox } from '@/test/helpers/sandbox';

describe('Create Command', () => {
  let mockTmux: MockTmux;
  
  beforeEach(() => {
    mockTmux = createMockTmux();
  });
  
  it('should create tmux session with correct parameters', async () => {
    await withTestSandbox(async (sandbox) => {
      // Git operations happen in sandbox
      const git = await createIsolatedTestRepo(sandbox, 'my-project');
      
      // Tmux operations use mock
      await executeCreate({ 
        name: 'feature-x',
        tmux: mockTmux  // Inject mock
      });
      
      const calls = mockTmux.getCalls('newSession');
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0]).toBe('my-project');
      expect(calls[0].args[1]).toMatchObject({
        startDirectory: expect.stringContaining('.worktrees/feature-x'),
        windowName: 'feature-x'
      });
    });
  });
});
```

### Tmux Integration Tests

Integration tests automatically detect tmux availability and skip gracefully when not present:

```typescript
// test/integration/tmux-integration.test.ts
import { tmux } from '@/lib/tmux';
import { withTestSandbox } from '@/test/helpers/sandbox';

describe('Tmux Integration Tests', () => {
  let tm: Tmux;
  let tmuxAvailable: boolean;
  
  beforeAll(async () => {
    tm = tmux();
    // Check if tmux is available on the system
    tmuxAvailable = await tm.isAvailable().catch(() => false);
  });
  
  beforeEach(() => {
    if (!tmuxAvailable) {
      console.log('Tmux not found on system, skipping integration tests');
      return;
    }
  });
  
  it('should execute tmux commands correctly', async () => {
    if (!tmuxAvailable) {
      return; // Skip test gracefully
    }
    
    await withTestSandbox(async (sandbox) => {
      const sessionName = `wtt-test-${Date.now()}`;
      
      try {
        // Test real tmux command execution
        await tm.newSession(sessionName, {
          startDirectory: sandbox.getTempDir(),
          detached: true
        });
        
        const sessions = await tm.listSessions();
        expect(sessions).toContainEqual(
          expect.objectContaining({ name: sessionName })
        );
      } finally {
        // Clean up
        await tm.killSession(sessionName).catch(() => {});
      }
    });
  });
  
  it('should handle multiple windows', async () => {
    if (!tmuxAvailable) {
      return; // Skip test gracefully
    }
    
    await withTestSandbox(async (sandbox) => {
      const sessionName = `wtt-test-${Date.now()}`;
      
      try {
        await tm.newSession(sessionName, {
          startDirectory: sandbox.getTempDir(),
          windowName: 'main',
          detached: true
        });
        
        await tm.newWindow(sessionName, 'feature', {
          startDirectory: sandbox.getTempDir()
        });
        
        const windows = await tm.listWindows(sessionName);
        expect(windows).toHaveLength(2);
        expect(windows.map(w => w.name)).toEqual(['main', 'feature']);
      } finally {
        await tm.killSession(sessionName).catch(() => {});
      }
    });
  });
});

// Alternative approach using Jest's conditional describe
describe.each([
  ['with real tmux', async () => {
    const tm = tmux();
    return await tm.isAvailable().catch(() => false);
  }]
])('%s', (name, checkAvailable) => {
  let shouldRun: boolean;
  
  beforeAll(async () => {
    shouldRun = await checkAvailable();
  });
  
  test('tmux operations', async () => {
    if (!shouldRun) {
      console.log('Skipping tmux test - tmux not available');
      return;
    }
    
    // Test implementation
  });
});
```

### Test Helper for Tmux Availability

```typescript
// test/helpers/tmux.ts

import { tmux } from '@/lib/tmux';

/**
 * Check if tmux is available and skip test if not
 */
export async function skipIfNoTmux(): Promise<void> {
  const tm = tmux();
  const available = await tm.isAvailable().catch(() => false);
  
  if (!available) {
    console.log('Tmux not available on system, skipping test');
    return;
  }
}

/**
 * Conditional test runner for tmux tests
 */
export function itWithTmux(name: string, fn: () => Promise<void>): void {
  it(name, async () => {
    const tm = tmux();
    const available = await tm.isAvailable().catch(() => false);
    
    if (!available) {
      console.log(`Skipping "${name}" - tmux not available`);
      return;
    }
    
    await fn();
  });
}

// Usage example:
itWithTmux('should create tmux session', async () => {
  // This test only runs if tmux is available
  const tm = tmux();
  await tm.newSession('test-session');
  // ...
});
```

### Test Configuration

```typescript
// src/lib/tmux/test-factory.ts

export function createTmuxForTest(options?: { useMock?: boolean }): Tmux {
  // Default to mock in test environment
  if (options?.useMock !== false && process.env.NODE_ENV === 'test') {
    return createMockTmux();
  }
  
  return tmux();
}
```

## Migration Plan

### Phase 1: Create Module Structure
1. Create `src/lib/tmux/` directory structure
2. Implement core interfaces and types
3. Implement mock for testing
4. Create test factory for easy mock/real switching

### Phase 2: Implement Core Functionality
1. Implement TmuxImpl with current feature set
2. Add comprehensive error handling
3. Add logging/debugging support
4. Ensure tmux operations work within sandbox paths

### Phase 3: Update Application Code
1. Replace current `src/platform/tmux.ts` with new module usage
2. Update all imports to use new module
3. Update tests to use mock implementation with sandbox

### Phase 4: Testing Integration
1. Update all existing tests to use MockTmux by default
2. Integrate with TestSandbox for path isolation
3. Create tmux integration test suite with automatic detection
4. Tests automatically skip when tmux is not available

### Phase 5: Sandbox Awareness
1. Ensure tmux module works with sandbox temp directories
2. Update mock to respect sandbox boundaries
3. Add validation for sandbox path usage in tests

## Testing Best Practices

### When to Use Mock vs Real Tmux

1. **Use MockTmux (default) for:**
   - Unit tests of commands and business logic
   - Integration tests that combine git and tmux operations
   - CI/CD environments where tmux may not be available
   - Fast feedback during development
   - Testing error conditions and edge cases

2. **Use Real Tmux for:**
   - Verifying actual tmux command construction
   - Testing tmux-specific behavior (session naming, window management)
   - Manual testing and development
   - Integration test suite (auto-skips when tmux not available)

### Example Test Structure

```
test/
├── unit/
│   └── commands/
│       └── create.test.ts          # Uses MockTmux
├── integration/
│   ├── commands/
│   │   └── create.test.ts          # Uses MockTmux with TestSandbox
│   └── tmux-integration.test.ts    # Uses real tmux (auto-skips if unavailable)
└── helpers/
    ├── sandbox.ts                  # TestSandbox implementation
    └── tmux.ts                     # Test utilities for tmux
```

## Usage Examples

### Basic Usage
```typescript
import { tmux } from '@/lib/tmux';

const tm = tmux();

// Create a new session
await tm.newSession('my-project', {
  startDirectory: '/path/to/project',
  windowName: 'main'
});

// Check if session exists
if (await tm.hasSession('my-project')) {
  // Create a new window
  await tm.newWindow('my-project', 'feature-x', {
    startDirectory: '/path/to/worktree'
  });
}
```

### With Dependency Injection
```typescript
class CreateCommand {
  constructor(private tmux: Tmux) {}
  
  async execute(options: CreateOptions) {
    if (await this.tmux.hasSession(projectName)) {
      await this.tmux.newWindow(projectName, options.name, {
        startDirectory: worktreePath
      });
    } else {
      await this.tmux.newSession(projectName, {
        startDirectory: worktreePath,
        windowName: options.name
      });
    }
  }
}
```

## Future Enhancements

1. **Pane Management**: Add pane splitting, resizing, and navigation
2. **Session Templates**: Support for session templates/layouts
3. **Event Monitoring**: Watch for tmux events (window closed, session killed)
4. **Configuration**: Read/write tmux configuration
5. **Advanced Features**: Copy mode, buffers, hooks

## Benefits

1. **Testability**: Easy to mock without actual tmux
2. **Type Safety**: Full TypeScript support
3. **Maintainability**: Clear separation of concerns
4. **Extensibility**: Easy to add new tmux features
5. **Consistency**: Similar API to established libraries like simple-git
6. **Error Handling**: Proper error types and messages
7. **Graceful Degradation**: Tests automatically adapt to tmux availability
8. **CI/CD Friendly**: No special configuration needed for environments without tmux
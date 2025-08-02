# Test Isolation System

## Overview

The worktree-tool test suite uses a comprehensive test isolation system to ensure tests run in a clean, isolated environment without interfering with the developer's git configuration or system settings.

## Problem Statement

Tests that interact with git were triggering:
- GPG signing prompts for commits
- Credential helper authentication dialogs
- SSH key prompts
- Using the developer's global git configuration

## Solution

The test suite implements a `TestSandbox` class that provides:

1. **Temporary Directory Isolation**: Each test runs in its own temporary directory under `/tmp/wtt-test-XXXXXX/`
2. **Git Configuration Isolation**: Tests use isolated git configs that disable signing and authentication
3. **Environment Variable Isolation**: Critical environment variables are overridden to prevent external interference

## Usage

### For Unit Tests

Unit tests that don't interact with git don't need special handling.

### For Integration/E2E Tests

Use the `withTestSandbox` helper:

```typescript
import { withTestSandbox, createIsolatedTestRepoWithCommit } from '../helpers/git';

it('should do something with git', async () => {
  await withTestSandbox(async (sandbox) => {
    // Create an isolated git repository
    const git = await createIsolatedTestRepoWithCommit(sandbox);
    
    // Change to the repo directory
    process.chdir(git.path);
    
    // Run your test...
  });
});
```

## Test Categories

1. **Unit Tests** (fast, run by default with `npm test`)
   - Located in `test/unit/`
   - Mock external dependencies
   - Run in < 10 seconds total

2. **Integration/E2E Tests** (slow, run with `npm run test:slow`)
   - Located in `test/integration/` and `test/e2e/`
   - Interact with real git repositories
   - May spawn shells or tmux sessions
   - Have 30-second timeout per test
   - Note: Tests that spawn interactive shells will timeout (expected behavior)

3. **Tmux Integration Tests** (run with `npm run test:tmux`)
   - Located in `test/integration/tmux-integration.test.ts`
   - Test tmux session and window management
   - Only run when tmux is installed
   - Disabled by default to prevent timeouts

## Environment Isolation Details

The TestSandbox sets these environment variables:

- `GIT_CONFIG_GLOBAL`: Points to isolated git config
- `GIT_CONFIG_SYSTEM`: Set to `/dev/null`
- `GIT_CONFIG_NOSYSTEM`: Set to `1`
- `HOME`: Points to sandbox temp directory
- `GIT_ASKPASS`: Set to `echo` (prevents prompts)
- `GIT_TERMINAL_PROMPT`: Set to `0`
- `GNUPGHOME`: Points to empty directory
- `GPG_TTY`: Set to empty string
- `SSH_ASKPASS`: Set to `echo`
- `GIT_SSH_COMMAND`: Uses batch mode
- `WTT_DISABLE_TMUX`: Set to `true` (unless testing tmux)

## Default Git Configuration

The sandbox creates a git config with:

```ini
[user]
  name = Test User
  email = test@example.com
[commit]
  gpgsign = false
[tag]
  gpgsign = false
[init]
  defaultBranch = main
[core]
  autocrlf = false
  filemode = true
[credential]
  helper = 
```

## Running Tests

```bash
# Run only unit tests (fast, default)
npm test

# Run integration/e2e tests (slow) 
npm run test:slow

# Run tmux integration tests (requires tmux)
npm run test:tmux

# Run all tests (unit + integration)
npm run test:all

# Run tests with coverage
npm run test:coverage
```

## What Gets Tested

### Git Integration (✅ Fully Tested)
- Repository initialization
- Worktree creation and management  
- Branch creation and switching
- Git configuration handling
- Error scenarios (no commits, invalid names, etc.)

### Tmux Integration (⚠️ Optional Tests)
- Session creation and management
- Window creation for each worktree
- Proper directory switching
- Session attachment behavior
- Run with `npm run test:tmux` when needed

### Shell Integration (⏭️ Skipped in Tests)
- Interactive shell spawning is not tested (would hang)
- Tests verify worktree creation up to shell spawn
- Manual testing required for shell integration

## Debugging Failed Tests

To preserve the sandbox directory for debugging:

```typescript
await withTestSandbox(async (sandbox) => {
  // test code
}, { preserveOnError: true });
```

The sandbox path will be printed if the test fails.

## Important Notes

1. Never use `execSync('git ...')` directly in tests - it bypasses the sandbox
2. Always use SimpleGit API or the provided git helpers
3. Tests that spawn interactive shells (like the `create` command) will timeout - this is expected
4. The sandbox automatically cleans up after each test
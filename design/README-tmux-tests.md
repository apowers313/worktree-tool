# Tmux Window Creation Tests

This document summarizes the tests added to prevent regression of the tmux window creation fix.

## Unit Tests (test/unit/platform/tmux.test.ts)

### New Tests Added:

1. **isInsideTmux()**
   - Tests that it returns true when TMUX environment variable is set
   - Tests that it returns false when TMUX environment variable is not set

2. **createTmuxSession() with start directory**
   - Tests that session creation includes the `-c` flag with the provided directory
   - Verifies: `tmux new-session -d -s test-session -c /path/to/worktree`

3. **isTmuxAvailable() with WTT_DISABLE_TMUX**
   - Tests that it returns false when WTT_DISABLE_TMUX is set to 'true'
   - Ensures tmux operations are properly disabled during testing

## Integration Tests (test/integration/tmux-window-creation.test.ts)

### Tests Created:

1. **should create session with first window in worktree directory**
   - Verifies that when creating the first worktree, a tmux session is created
   - Ensures the window is positioned in the worktree directory, not home or project root

2. **should add new window to existing session**
   - Verifies that subsequent worktrees create new windows in the existing session
   - Each window should be in its respective worktree directory

3. **should not create extra windows in home or root directory**
   - Specifically tests the bug that was fixed
   - Ensures only one window is created per worktree
   - Verifies no windows are created in home directory or project root

## What Was Fixed

The original issue was that `wtt create blah` would create two windows:
- One in the project root directory
- One in the home directory

The fix ensures:
- Only one window is created per worktree
- The window is created in the worktree directory (e.g., `.worktrees/blah`)
- Sessions are created with the `-c` flag to set the start directory
- Proper handling of being inside vs outside tmux to avoid nested sessions

## Running the Tests

```bash
# Run unit tests
npm test -- test/unit/platform/tmux.test.ts

# Run integration tests (requires tmux)
npm test -- test/integration/tmux-window-creation.test.ts

# Run with tmux disabled (for CI)
WTT_DISABLE_TMUX=true npm test
```
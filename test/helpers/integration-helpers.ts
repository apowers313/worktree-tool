/**
 * Helper functions for integration tests to handle CI/non-CI behavior consistently
 */

/**
 * Determine if running in CI environment
 * This is used by integration tests that need to handle CI differently
 */
export function isRunningInCI(): boolean {
    return !!(process.env.CI ?? process.env.GITHUB_ACTIONS);
}

/**
 * Get expected execution mode based on environment
 * In CI, default to "exit" mode to avoid terminal emulator issues
 * In local development, default to "window" mode
 */
export function getExpectedDefaultMode(): "exit" | "window" {
    return isRunningInCI() ? "exit" : "window";
}

/**
 * Check if tmux tests should be skipped
 * Skip if:
 * - Not in CI and no TMUX session
 * - DISABLE_TMUX is set
 */
export function shouldSkipTmuxTest(): boolean {
    return (!isRunningInCI() && !process.env.TMUX) || process.env.DISABLE_TMUX === "true";
}

/**
 * Get environment variables for subprocess execution
 * Ensures consistent behavior in tests
 */
export function getTestEnvironment(overrides: Record<string, string> = {}): Record<string, string> {
    return {
        ... process.env,
        // Always disable color in tests for consistent output
        NO_COLOR: "1",
        // Apply any overrides
        ... overrides,
    };
}

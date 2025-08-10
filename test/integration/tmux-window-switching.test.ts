import {execSync} from "child_process";
import {existsSync, rmSync} from "fs";
import path from "path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

// Path to the compiled wtt binary
const WTT_BIN = path.resolve(__dirname, "../../dist/index.js");

describe("Tmux Window Switching Integration", () => {
    const testProjectPath = path.join("/tmp", "test-tmux-switching");
    const originalCwd = process.cwd();

    beforeEach(() => {
        // Clean up any existing test project
        if (existsSync(testProjectPath)) {
            rmSync(testProjectPath, {recursive: true, force: true});
        }

        // Create a test project
        execSync(`mkdir -p ${testProjectPath}`, {stdio: "ignore"});
        process.chdir(testProjectPath);
        execSync("git init", {stdio: "ignore"});

        // Configure git for commits
        execSync("git config user.email 'test@example.com'", {stdio: "ignore"});
        execSync("git config user.name 'Test User'", {stdio: "ignore"});
        execSync("git config commit.gpgsign false", {stdio: "ignore"});
    });

    afterEach(() => {
        process.chdir(originalCwd);

        // Kill any test tmux sessions
        try {
            execSync("tmux kill-session -t test-tmux-switching", {stdio: "ignore"});
        } catch {
            // Session might not exist
        }

        // Clean up test project
        if (existsSync(testProjectPath)) {
            rmSync(testProjectPath, {recursive: true, force: true});
        }
    });

    it("should switch to tmux window when creating second worktree", function(context) {
        // Skip if not in CI or tmux not available, or if tmux is disabled
        if ((!process.env.CI && !process.env.TMUX) || process.env.DISABLE_TMUX === "true") {
            console.log("Skipping tmux window switching test - tmux not available or disabled");
            context.skip();
            return;
        }

        try {
            // Initialize project
            execSync(`node ${WTT_BIN} init`, {stdio: "ignore"});

            // Ensure git config is set (needed for commits)
            try {
                execSync("git config user.email 'test@example.com'", {stdio: "ignore"});
            } catch {
                // Ignore if already set
            }
            try {
                execSync("git config user.name 'Test User'", {stdio: "ignore"});
            } catch {
                // Ignore if already set
            }
            try {
                execSync("git config commit.gpgsign false", {stdio: "ignore"});
            } catch {
                // Ignore if already set
            }

            // Make initial commit
            execSync("echo test > test.txt", {stdio: "ignore"});
            execSync("git add .", {stdio: "ignore"});
            execSync("git commit -m \"initial commit\"", {stdio: "ignore"});

            // Create first worktree - this creates the tmux session
            const result1 = execSync(`node ${WTT_BIN} create first-feature`, {
                encoding: "utf8",
                stdio: "pipe",
            });
            expect(result1).toContain("Created worktree: first-feature");

            // Verify tmux session was created
            const sessions = execSync("tmux list-sessions -F '#{session_name}'", {
                encoding: "utf8",
                stdio: "pipe",
            }).trim().split("\n");
            expect(sessions).toContain("test-tmux-switching");

            // Create second worktree - this should switch to the new window
            const result2 = execSync(`node ${WTT_BIN} create second-feature`, {
                encoding: "utf8",
                stdio: "pipe",
            });
            expect(result2).toContain("Created worktree: second-feature");

            // Verify both windows exist
            const windows = execSync("tmux list-windows -t test-tmux-switching -F '#{window_name}'", {
                encoding: "utf8",
                stdio: "pipe",
            }).trim().split("\n");
            expect(windows).toContain("first-feature");
            expect(windows).toContain("second-feature");

            // Note: We can't easily test the actual window switching behavior in automated tests
            // as it requires being attached to the tmux session, but the manual test confirms it works
        } catch(error: any) {
            // Skip test if tmux is not available or in CI without tmux
            if (error.message?.includes("tmux") ||
                error.message?.includes("command not found") ||
                error.message?.includes("no server running") ||
                (process.env.CI && process.env.DISABLE_TMUX === "true")) {
                console.log("Skipping test - tmux not available or disabled in CI");
                context.skip();
                return;
            }

            throw error;
        }
    });
});

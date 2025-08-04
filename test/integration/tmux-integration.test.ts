import {execSync} from "child_process";
import {promises as fs} from "fs";
import * as path from "path";

import {
    createIsolatedTestRepoWithCommit,
    withTestSandbox} from "../helpers/git";
import {
    ensureNotInWorktree,
    execSyncWithoutTmux,
} from "../helpers/isolation";

// Path to the compiled wtt binary
const WTT_BIN = path.resolve(__dirname, "../../dist/index.js");

// Check if tmux is available
const isTmuxAvailable = () => {
    if (process.env.WTT_DISABLE_TMUX === "true") {
        return false;
    }

    try {
        execSync("tmux -V", {stdio: "pipe"});
        return true;
    } catch {
        return false;
    }
};

const describeTmux = isTmuxAvailable() ? describe : describe.skip;

describeTmux("Tmux Integration Tests", () => {
    // Increase timeout for integration tests
    vi.setConfig({testTimeout: 30000}); // Replace jest.setTimeout(30000);

    beforeAll(async() => {
        await ensureNotInWorktree();
    });

    afterEach(async() => {
    // Clean up any test tmux sessions
        const testSessions = ["test-tmux-project", "test-attach-project", "test-env-project"];
        for (const session of testSessions) {
            try {
                execSync(`tmux kill-session -t ${session} 2>/dev/null`, {stdio: "ignore"});
            } catch {
                // Session might not exist, that's fine
            }
        }
    });

    describe("Session and Window Creation", () => {
        it("should create session with first window in worktree directory", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo with commit and initialize wtt with tmux
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Update config to use a unique project name
                const configPath = path.join(git.path, ".worktree-config.json");
                await fs.writeFile(configPath, JSON.stringify({
                    version: "1.0.0",
                    projectName: "test-tmux-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                }, null, 2));

                // Create a worktree
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-one`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                    timeout: 5000,
                });

                // Verify tmux session was created
                const sessions = execSync("tmux list-sessions -F \"#{session_name}\"", {
                    encoding: "utf-8",
                }).trim().split("\n");
                expect(sessions).toContain("test-tmux-project");

                // Verify window was created in the correct directory
                const windowInfo = execSync("tmux list-windows -t test-tmux-project -F \"#{window_name}:#{pane_current_path}\"", {
                    encoding: "utf-8",
                }).trim();

                expect(windowInfo).toContain("feature-one");
                expect(windowInfo).toContain(".worktrees/feature-one");

                // Verify only one window exists
                const windowCount = execSync("tmux list-windows -t test-tmux-project | wc -l", {
                    encoding: "utf-8",
                }).trim();
                expect(parseInt(windowCount)).toBe(1);
            });
        });

        it("should add new window to existing session", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo with commit and initialize wtt with tmux
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Update config to use a unique project name
                const configPath = path.join(git.path, ".worktree-config.json");
                await fs.writeFile(configPath, JSON.stringify({
                    version: "1.0.0",
                    projectName: "test-tmux-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                }, null, 2));

                // Create first worktree
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-one`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                    timeout: 5000,
                });

                // Create second worktree
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-two`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                    timeout: 5000,
                });

                // Verify both windows exist
                const windows = execSync("tmux list-windows -t test-tmux-project -F \"#{window_name}\"", {
                    encoding: "utf-8",
                }).trim().split("\n");

                expect(windows).toContain("feature-one");
                expect(windows).toContain("feature-two");
                expect(windows).toHaveLength(2);

                // Verify each window is in its correct directory
                const windowPaths = execSync("tmux list-windows -t test-tmux-project -F \"#{window_name}:#{pane_current_path}\"", {
                    encoding: "utf-8",
                }).trim().split("\n");

                const featureOne = windowPaths.find((w) => w.includes("feature-one"));
                const featureTwo = windowPaths.find((w) => w.includes("feature-two"));

                expect(featureOne).toContain(".worktrees/feature-one");
                expect(featureTwo).toContain(".worktrees/feature-two");
            });
        });

        it("should not create extra windows in home or root directory", async() => {
            await withTestSandbox(async(sandbox) => {
                const homeDir = process.env.HOME ?? "";

                // Create git repo with commit and initialize wtt with tmux
                const git = await createIsolatedTestRepoWithCommit(sandbox);
                const projectRoot = git.path;

                // Change to repo directory
                process.chdir(projectRoot);

                // Update config to use a unique project name
                const configPath = path.join(projectRoot, ".worktree-config.json");
                await fs.writeFile(configPath, JSON.stringify({
                    version: "1.0.0",
                    projectName: "test-tmux-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                }, null, 2));

                // Create a worktree
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-test`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                    timeout: 5000,
                });

                // Get all window paths
                const windowPaths = execSync("tmux list-windows -t test-tmux-project -F \"#{pane_current_path}\"", {
                    encoding: "utf-8",
                }).trim().split("\n");

                // Verify no window is in home directory or project root
                windowPaths.forEach((path) => {
                    expect(path).not.toBe(homeDir);
                    expect(path).not.toBe(projectRoot);
                    expect(path).toContain(".worktrees/");
                });

                // Verify only one window was created
                expect(windowPaths).toHaveLength(1);
            });
        });
    });

    describe("Attachment Behavior", () => {
        it("should handle creation outside tmux without TTY gracefully", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                const configPath = path.join(git.path, ".worktree-config.json");
                await fs.writeFile(configPath, JSON.stringify({
                    version: "1.0.0",
                    projectName: "test-attach-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                }, null, 2));

                // Create worktree without TTY (pipe stdio simulates non-TTY)
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" create no-tty-test`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                    timeout: 5000,
                });

                // Should create session but not try to attach
                expect(output).toContain("Created worktree: no-tty-test");

                // Verify session exists
                const sessions = execSync("tmux list-sessions -F \"#{session_name}\"", {
                    encoding: "utf-8",
                }).trim().split("\n");
                expect(sessions).toContain("test-attach-project");

                // Should inform user how to attach
                expect(output).toMatch(/tmux attach -t test-attach-project/);
            });
        });
    });

    describe("Environment Detection", () => {
        it("should detect when running inside tmux", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                const configPath = path.join(git.path, ".worktree-config.json");
                await fs.writeFile(configPath, JSON.stringify({
                    version: "1.0.0",
                    projectName: "test-env-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                }, null, 2));

                // Create initial session
                execSync("tmux new-session -d -s test-env-project", {stdio: "ignore"});

                // Simulate running inside tmux
                const env = {... process.env, TMUX: "/tmp/tmux-1000/default,12345,0"};
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" create inside-tmux`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                    env,
                });

                // Should create window without trying to attach
                expect(output).toContain("Created worktree: inside-tmux");

                // Verify window was created
                const windows = execSync("tmux list-windows -t test-env-project -F \"#{window_name}\"", {
                    encoding: "utf-8",
                }).trim().split("\n");
                expect(windows).toContain("inside-tmux");
            });
        });
    });

    describe("Session Naming", () => {
        it("should sanitize session names properly", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Test with project name containing special characters
                const configPath = path.join(git.path, ".worktree-config.json");
                await fs.writeFile(configPath, JSON.stringify({
                    version: "1.0.0",
                    projectName: "test/project:with.special-chars!",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                }, null, 2));

                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-sanitize`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                    timeout: 5000,
                });

                // Session name should be sanitized
                const sessions = execSync("tmux list-sessions -F \"#{session_name}\"", {
                    encoding: "utf-8",
                }).trim().split("\n");

                // Check if a sanitized version exists
                const sanitizedSession = sessions.find((s) => s.includes("test") && s.includes("project"));
                expect(sanitizedSession).toBeDefined();

                // Clean up
                if (sanitizedSession) {
                    execSync(`tmux kill-session -t ${sanitizedSession}`, {stdio: "ignore"});
                }
            });
        });
    });

    describe("Error Handling", () => {
        it("should fall back to shell spawning when tmux fails", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                const configPath = path.join(git.path, ".worktree-config.json");
                await fs.writeFile(configPath, JSON.stringify({
                    version: "1.0.0",
                    projectName: "test-tmux-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                }, null, 2));

                // Make tmux fail by setting a bad TMUX env var
                const env = {... process.env, TMUX: "invalid-tmux-value"};
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" create fallback-test 2>&1`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                    env,
                });

                // Should still create worktree
                expect(output).toContain("Created worktree: fallback-test");

                // Should show warning about tmux failure
                const outputStr = output.toString();
                expect(outputStr.toLowerCase()).toMatch(/tmux.*failed|warning/i);
            });
        });
    });
});

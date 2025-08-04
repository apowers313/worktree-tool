import {promises as fs} from "fs";
import * as path from "path";
import {simpleGit} from "simple-git";

import {
    createIsolatedTestRepoWithCommit,
    withTestSandbox} from "../helpers/git";
import {
    ensureNotInWorktree,
    execSyncWithoutTmux,
} from "../helpers/isolation";

// Path to the compiled wtt binary
const WTT_BIN = path.resolve(__dirname, "../../dist/index.js");

describe("End-to-End Full Flow Tests", () => {
    // Increase timeout for e2e tests
    vi.setConfig({testTimeout: 30000}); // Replace jest.setTimeout(30000);

    // Ensure tests are not running in a worktree
    beforeAll(async() => {
        await ensureNotInWorktree();
    });

    describe("Complete Init → Create Workflow", () => {
        it("should complete full workflow: init → create → create multiple", async() => {
            await withTestSandbox(async(sandbox) => {
                // Step 1: Create git repo with commit
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Step 2: Initialize wtt
                const initOutput = execSyncWithoutTmux(`node "${WTT_BIN}" init`, {encoding: "utf-8"});
                expect(initOutput).toContain("Initialized worktree project");

                // Verify config file was created
                const configExists = await fs.access(".worktree-config.json").then(() => true).catch(() => false);
                expect(configExists).toBe(true);

                // Step 3: Create first worktree
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create feature-auth`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 5000, // Short timeout since shell spawning will hang
                    });
                } catch {
                    // Expected to timeout due to shell spawning
                }

                // Verify first worktree was created
                const worktree1Path = path.join(git.path, ".worktrees", "feature-auth");
                const worktree1Exists = await fs.access(worktree1Path).then(() => true).catch(() => false);
                expect(worktree1Exists).toBe(true);

                // Verify it's a valid git worktree
                const gitDir1 = path.join(worktree1Path, ".git");
                const gitDir1Exists = await fs.access(gitDir1).then(() => true).catch(() => false);
                expect(gitDir1Exists).toBe(true);

                // Step 4: Create second worktree with complex name
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create "Feature/User Dashboard!"`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 5000,
                    });
                } catch {
                    // Expected timeout
                }

                // Verify second worktree was created with sanitized name
                const worktree2Path = path.join(git.path, ".worktrees", "featureuser-dashboard");
                const worktree2Exists = await fs.access(worktree2Path).then(() => true).catch(() => false);
                expect(worktree2Exists).toBe(true);

                // Step 5: Verify git branches were created
                const branchResult = await git.branch();
                expect(branchResult.all).toContain("feature-auth");
                expect(branchResult.all).toContain("featureuser-dashboard");

                // Step 6: Verify both worktrees are independent
                const worktree1Git = simpleGit(worktree1Path);
                const worktree1Status = await worktree1Git.status();
                expect(worktree1Status.current).toBe("feature-auth");

                const worktree2Git = simpleGit(worktree2Path);
                const worktree2Status = await worktree2Git.status();
                expect(worktree2Status.current).toBe("featureuser-dashboard");
            });
        });

        it("should handle init with custom options then create", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Initialize with custom options
                execSyncWithoutTmux(`node "${WTT_BIN}" init --project-name "Custom Project" --base-dir custom-worktrees --disable-tmux`, {
                    encoding: "utf-8",
                });

                // Verify custom config
                const configContent = await fs.readFile(".worktree-config.json", "utf-8");
                const config = JSON.parse(configContent) as {projectName?: unknown, baseDir?: unknown, tmux?: unknown};
                expect(config.projectName).toBe("Custom Project");
                expect(config.baseDir).toBe("custom-worktrees");
                expect(config.tmux).toBe(false);

                // Create worktree with custom base directory
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create test-feature`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 5000,
                    });
                } catch {
                    // Expected timeout
                }

                // Verify worktree was created in custom directory
                const worktreePath = path.join(git.path, "custom-worktrees", "test-feature");
                const worktreeExists = await fs.access(worktreePath).then(() => true).catch(() => false);
                expect(worktreeExists).toBe(true);
            });
        });
    });

    describe("Help Command Integration", () => {
        it("should display help without errors", async() => {
            await withTestSandbox(async() => {
                const helpOutput = execSyncWithoutTmux(`node "${WTT_BIN}" help`, {encoding: "utf-8"});

                expect(helpOutput).toContain("wtt - Git worktree management tool");
                expect(helpOutput).toContain("Usage:");
                expect(helpOutput).toContain("Commands:");
                expect(helpOutput).toContain("init");
                expect(helpOutput).toContain("create");
                expect(helpOutput).toContain("help");
                expect(helpOutput).toContain("Examples:");
            });
        });

        it("should show command-specific help", async() => {
            await withTestSandbox(async() => {
                const initHelp = execSyncWithoutTmux(`node "${WTT_BIN}" init --help`, {encoding: "utf-8"});
                expect(initHelp).toContain("Initialize a repository for worktree management");

                const createHelp = execSyncWithoutTmux(`node "${WTT_BIN}" create --help`, {encoding: "utf-8"});
                expect(createHelp).toContain("Create a new worktree");
            });
        });
    });

    describe("Error Handling End-to-End", () => {
        it("should handle complete error scenarios", async() => {
            await withTestSandbox(async(sandbox) => {
                // Change to workspace (non-git directory)
                process.chdir(sandbox.getWorkspacePath());

                // Try to create without init
                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create test`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                }).toThrow();

                // Try to init in non-git directory
                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                }).toThrow();

                // Create git repo and init
                const git = await createIsolatedTestRepoWithCommit(sandbox);
                process.chdir(git.path);
                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Try to create with invalid name
                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create ""`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                }).toThrow();

                // Try to create duplicate
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create duplicate`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                } catch {
                    // Expected timeout
                }

                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create duplicate`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                }).toThrow();
            });
        });
    });

    describe("Cross-Platform Compatibility", () => {
        it("should work regardless of line endings and paths", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Test with various path formats
                const initOutput = execSyncWithoutTmux(`node "${WTT_BIN}" init`, {encoding: "utf-8"});
                expect(initOutput).toContain("Initialized worktree project");

                // Test with paths containing spaces
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create "path with spaces"`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 5000,
                    });
                } catch {
                    // Expected timeout
                }

                const worktreePath = path.join(git.path, ".worktrees", "path-with-spaces");
                const worktreeExists = await fs.access(worktreePath).then(() => true).catch(() => false);
                expect(worktreeExists).toBe(true);
            });
        });
    });

    describe("Gitignore Integration", () => {
        it("should handle existing .gitignore files properly", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Create existing .gitignore
                await fs.writeFile(".gitignore", "node_modules/\n*.log\n");

                // Initialize wtt
                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Verify .gitignore was updated, not overwritten
                const gitignoreContent = await fs.readFile(".gitignore", "utf-8");
                expect(gitignoreContent).toContain("node_modules/");
                expect(gitignoreContent).toContain("*.log");
                expect(gitignoreContent).toContain(".worktrees/");
                // Config file is not added to gitignore, only the worktrees directory
                expect(gitignoreContent).toContain("# wtt worktrees");
            });
        });
    });
});

import {promises as fs} from "fs";
import * as path from "path";
import {simpleGit} from "simple-git";

import {
    createIsolatedTestRepoWithCommit,
    withTestSandbox} from "../../helpers/git";
import {
    ensureNotInWorktree,
    execSyncWithoutTmux,
} from "../../helpers/isolation";

// Path to the compiled wtt binary
const WTT_BIN = path.resolve(__dirname, "../../../dist/index.js");

describe("Create Command Integration Tests", () => {
    // Increase timeout for integration tests
    vi.setConfig({testTimeout: 30000}); // Replace jest.setTimeout(30000);

    // Ensure tests are not running in a worktree
    beforeAll(async() => {
        await ensureNotInWorktree();
    });

    describe("Basic Creation", () => {
        it("should fail when not initialized", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo with commit
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Try to run create without init
                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create test-feature`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                }).toThrow();

                // Verify error message
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create test-feature`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                } catch(error) {
                    expect((error as {stderr?: string}).stderr).toContain("not initialized");
                }
            });
        });

        it("should create worktree after init", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo with commit and initialize wtt
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Create worktree (this will try to spawn shell, so we expect it to fail but create the worktree)
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create test-feature`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 5000, // Short timeout since shell spawning will hang
                    });
                } catch {
                    // Expected to timeout due to shell spawning, but worktree should be created
                }

                // Verify worktree directory was created
                const worktreePath = path.join(git.path, ".worktrees", "test-feature");
                const worktreeExists = await fs.access(worktreePath).then(() => true).catch(() => false);
                expect(worktreeExists).toBe(true);

                // Verify it's a valid git worktree
                const gitDirPath = path.join(worktreePath, ".git");
                const gitDirExists = await fs.access(gitDirPath).then(() => true).catch(() => false);
                expect(gitDirExists).toBe(true);
            });
        });

        it("should sanitize worktree names", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Create worktree with special characters
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create "Feature/Add New Button!"`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 5000,
                    });
                } catch {
                    // Expected timeout
                }

                // Verify sanitized directory was created
                const worktreePath = path.join(git.path, ".worktrees", "featureadd-new-button");
                const worktreeExists = await fs.access(worktreePath).then(() => true).catch(() => false);
                expect(worktreeExists).toBe(true);
            });
        });

        it("should handle spaces in names", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Create worktree with spaces
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create "my awesome feature"`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 5000,
                    });
                } catch {
                    // Expected timeout
                }

                // Verify sanitized directory was created
                const worktreePath = path.join(git.path, ".worktrees", "my-awesome-feature");
                const worktreeExists = await fs.access(worktreePath).then(() => true).catch(() => false);
                expect(worktreeExists).toBe(true);
            });
        });
    });

    describe("Error Handling", () => {
        it("should fail when no commits exist", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create empty git repo
                const repoPath = path.join(sandbox.getWorkspacePath(), "repo");
                await fs.mkdir(repoPath, {recursive: true});
                const git = simpleGit(repoPath);
                await git.init();

                // Change to repo directory
                process.chdir(repoPath);

                // Initialize wtt
                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Try to create worktree without any commits
                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create test-feature`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                }).toThrow();

                // Verify error message
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create test-feature`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                } catch(error) {
                    expect((error as {stderr?: string}).stderr).toContain("No commits found");
                    expect((error as {stderr?: string}).stderr).toContain("Please make at least one commit");
                }
            });
        });

        it("should fail in non-git directory", async() => {
            await withTestSandbox(async(sandbox) => {
                // Change to workspace (non-git directory)
                process.chdir(sandbox.getWorkspacePath());

                // Create wtt config in non-git directory
                const config = {
                    version: "1.0.0",
                    projectName: "test",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: false,
                };
                await fs.writeFile(".worktree-config.json", JSON.stringify(config, null, 2));

                // Try to create worktree
                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create test-feature`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                }).toThrow();

                // Verify error message
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create test-feature`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                } catch(error) {
                    expect((error as {stderr?: string}).stderr).toContain("Not in a git repository");
                }
            });
        });

        it("should reject empty worktree name", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Try to create worktree with empty name
                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create ""`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                }).toThrow();

                // Verify error message
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create ""`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                } catch(error) {
                    expect((error as {stderr?: string}).stderr).toContain("required");
                }
            });
        });

        it("should reject names with only invalid characters", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Try to create worktree with invalid characters only
                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create "~^:?*[]\\!"`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                }).toThrow();

                // Verify error message
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create "~^:?*[]\\!"`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                } catch(error) {
                    expect((error as {stderr?: string}).stderr).toContain("invalid characters");
                }
            });
        });
    });

    describe("Multiple Worktrees", () => {
        it("should create multiple worktrees", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Create first worktree
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create feature-1`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                } catch {
                    // Expected timeout
                }

                // Create second worktree
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create feature-2`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                } catch {
                    // Expected timeout
                }

                // Verify both worktrees exist
                const worktree1Path = path.join(git.path, ".worktrees", "feature-1");
                const worktree2Path = path.join(git.path, ".worktrees", "feature-2");

                const worktree1Exists = await fs.access(worktree1Path).then(() => true).catch(() => false);
                const worktree2Exists = await fs.access(worktree2Path).then(() => true).catch(() => false);

                expect(worktree1Exists).toBe(true);
                expect(worktree2Exists).toBe(true);
            });
        });

        it("should handle duplicate branch names gracefully", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Create first worktree
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create duplicate-feature`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                } catch {
                    // Expected timeout
                }

                // Try to create second worktree with same name
                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create duplicate-feature`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                }).toThrow();

                // Verify error message about branch existing
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create duplicate-feature`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                } catch(error) {
                    expect((error as {stderr?: string}).stderr).toContain("Failed to create worktree");
                }
            });
        });
    });

    describe("Configuration Handling", () => {
        it("should use custom base directory", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                execSyncWithoutTmux(`node "${WTT_BIN}" init --base-dir custom-worktrees --disable-tmux`, {encoding: "utf-8"});

                // Create worktree
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create test-feature`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
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

        it("should work with different project names", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                execSyncWithoutTmux(`node "${WTT_BIN}" init --project-name "My Custom Project" --disable-tmux`, {encoding: "utf-8"});

                // Create worktree
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create test-feature`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                } catch {
                    // Expected timeout
                }

                // Verify worktree was created
                const worktreePath = path.join(git.path, ".worktrees", "test-feature");
                const worktreeExists = await fs.access(worktreePath).then(() => true).catch(() => false);
                expect(worktreeExists).toBe(true);
            });
        });
    });

    describe("Git Branch Validation", () => {
        it("should create valid git branches", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Create worktree
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create "valid-branch-name"`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                } catch {
                    // Expected timeout
                }

                // Verify branch was created by checking git branch list
                const branchResult = await git.branch();
                expect(branchResult.all).toContain("valid-branch-name");
            });
        });

        it("should handle branch names with numbers", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Create worktree with numbers
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" create "feature-123"`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                        timeout: 3000,
                    });
                } catch {
                    // Expected timeout
                }

                // Verify branch was created
                const branchResult = await git.branch();
                expect(branchResult.all).toContain("feature-123");
            });
        });
    });
});

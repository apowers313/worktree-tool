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

describe("Status Command Integration Tests", () => {
    // Increase timeout for integration tests
    vi.setConfig({testTimeout: 30000});

    // Ensure tests are not running in a worktree
    beforeAll(async() => {
        await ensureNotInWorktree();
    });

    describe("Basic Status", () => {
        it("should show clean status for new worktree", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo with commit
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Initialize wtt
                process.chdir(git.path);
                execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Create a worktree
                execSyncWithoutTmux(`node "${WTT_BIN}" create test-feature`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Run status command
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" status`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Should show the worktree with no changes
                expect(output).toContain("[test-feature]");
                expect(output).not.toContain("(+)");
                expect(output).not.toContain("(*)");
                expect(output).not.toContain("(-)");
            });
        });

        it("should show changes in worktrees", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo with commit
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Initialize wtt
                process.chdir(git.path);
                execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Create a worktree
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-branch`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Make changes in the worktree
                const worktreePath = path.join(git.path, ".worktrees", "feature-branch");
                const worktreeGit = simpleGit(worktreePath);

                // Add a new file
                await fs.writeFile(path.join(worktreePath, "new-file.txt"), "content");
                await worktreeGit.add("new-file.txt");

                // Modify existing file
                await fs.writeFile(path.join(worktreePath, "README.md"), "modified content");

                // Run status command
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" status`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Should show staged and unstaged changes
                expect(output).toContain("[feature-branch]");
                expect(output).toContain("(+)1"); // 1 added file (staged)
                expect(output).toContain("(*)1"); // 1 modified file (unstaged)
            });
        });

        it("should show ahead/behind status vs main branch", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo with commit
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Initialize wtt
                process.chdir(git.path);
                execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Create a worktree
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-ahead`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Make a commit in the worktree
                const worktreePath = path.join(git.path, ".worktrees", "feature-ahead");
                const worktreeGit = simpleGit(worktreePath);
                await fs.writeFile(path.join(worktreePath, "feature.txt"), "feature content");
                await worktreeGit.add("feature.txt");
                await worktreeGit.commit("Add feature");

                // Run status command
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" status`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Should show 1 commit ahead
                expect(output).toContain("[feature-ahead]");
                expect(output).toContain("↑1");
            });
        });

        it("should filter worktrees with -w option", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo with commit
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Initialize wtt
                process.chdir(git.path);
                execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Create multiple worktrees
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-1`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-2`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });
                execSyncWithoutTmux(`node "${WTT_BIN}" create bugfix-1`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Run status with filter
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" status -w "feature-1,bugfix-1"`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Should only show filtered worktrees
                // Allow for potential trailing spaces in the output
                expect(output).toMatch(/\[feature-1[\s\]]/);
                expect(output).toMatch(/\[bugfix-1[\s\]]/);
                expect(output).not.toMatch(/\[feature-2[\s\]]/);
            });
        });
    });

    describe("Verbose Mode", () => {
        it("should show legend and file details with --verbose", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo with commit
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Initialize wtt
                process.chdir(git.path);
                execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Create a worktree
                execSyncWithoutTmux(`node "${WTT_BIN}" create verbose-test`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Make various changes
                const worktreePath = path.join(git.path, ".worktrees", "verbose-test");
                const worktreeGit = simpleGit(worktreePath);

                // Staged add
                await fs.writeFile(path.join(worktreePath, "staged.txt"), "staged content");
                await worktreeGit.add("staged.txt");

                // Unstaged modify
                await fs.writeFile(path.join(worktreePath, "README.md"), "modified content");

                // Untracked file
                await fs.writeFile(path.join(worktreePath, "untracked.txt"), "untracked content");

                // Run status with verbose
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" status --verbose`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Should show legend
                expect(output).toContain("Legend:");
                expect(output).toContain("(+) Added files");
                expect(output).toContain("(*) Modified files");
                expect(output).toContain("green: staged changes");
                expect(output).toContain("yellow: mix of staged and unstaged changes");

                // Should show file details
                expect(output).toContain("(+) staged.txt");
                expect(output).toContain("(*) README.md");
                expect(output).toContain("(?) untracked.txt");
            });
        });
    });

    describe("Conflict Detection", () => {
        it("should detect conflicts with main branch", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo with commit
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Initialize wtt
                process.chdir(git.path);
                execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Create a file in main
                await fs.writeFile(path.join(git.path, "conflict.txt"), "main content");
                await git.add("conflict.txt");
                await git.commit("Add conflict file in main");

                // Create a worktree
                execSyncWithoutTmux(`node "${WTT_BIN}" create conflict-branch`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Modify the same file in worktree
                const worktreePath = path.join(git.path, ".worktrees", "conflict-branch");
                const worktreeGit = simpleGit(worktreePath);
                await fs.writeFile(path.join(worktreePath, "conflict.txt"), "branch content");
                await worktreeGit.add("conflict.txt");
                await worktreeGit.commit("Modify conflict file in branch");

                // Modify again in main to create conflict
                await fs.writeFile(path.join(git.path, "conflict.txt"), "main content updated");
                await git.add("conflict.txt");
                await git.commit("Update conflict file in main");

                // Run status command
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" status`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Should show conflict indicator
                expect(output).toContain("[conflict-branch]");
                expect(output).toContain("(!)");
            });
        });
    });

    describe("Edge Cases", () => {
        it("should handle empty repository", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create empty git repo (no commits)
                const repoPath = path.join(sandbox.getWorkspacePath(), "empty-repo");
                await fs.mkdir(repoPath);
                const repo = simpleGit(repoPath);
                await repo.init();

                // Initialize wtt
                process.chdir(repoPath);
                execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Try to run status
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" status`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Should handle gracefully (no worktrees to show)
                expect(output).toBe("");
            });
        });

        it("should handle worktree with no upstream branch", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo with commit
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Initialize wtt
                process.chdir(git.path);
                execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Create a worktree
                execSyncWithoutTmux(`node "${WTT_BIN}" create orphan-branch`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Run status command
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" status`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Should show worktree without errors
                expect(output).toContain("[orphan-branch]");
                // No ahead/behind indicators since comparing to main not upstream
                expect(output).not.toMatch(/↑\d+↓\d+/);
            });
        });

        it("should handle multiple types of changes", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo with commit
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Initialize wtt
                process.chdir(git.path);
                execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Create a worktree
                execSyncWithoutTmux(`node "${WTT_BIN}" create complex-changes`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                const worktreePath = path.join(git.path, ".worktrees", "complex-changes");
                const worktreeGit = simpleGit(worktreePath);

                // Create multiple file changes
                // Staged additions
                await fs.writeFile(path.join(worktreePath, "added1.txt"), "content1");
                await fs.writeFile(path.join(worktreePath, "added2.txt"), "content2");
                await worktreeGit.add(["added1.txt", "added2.txt"]);

                // Mixed staged/unstaged (same file type)
                await fs.writeFile(path.join(worktreePath, "mixed.txt"), "initial");
                await worktreeGit.add("mixed.txt");
                await fs.writeFile(path.join(worktreePath, "mixed.txt"), "modified");

                // Deleted file
                await fs.unlink(path.join(worktreePath, "README.md"));

                // Untracked files
                await fs.writeFile(path.join(worktreePath, "untracked1.txt"), "untracked");
                await fs.writeFile(path.join(worktreePath, "untracked2.txt"), "untracked");

                // Run status command
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" status`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });

                // Check summary shows correct counts
                expect(output).toContain("[complex-changes]");
                expect(output).toContain("(+)"); // Should show additions
                expect(output).toContain("(-)"); // Should show deletion
                expect(output).toContain("(?)"); // Should show untracked
            });
        });
    });
});

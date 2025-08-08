import {promises as fs} from "fs";
import path from "path";
import {beforeAll, describe, expect, it} from "vitest";

import {
    createIsolatedTestRepoWithCommit,
    withTestSandbox,
} from "../helpers/git";
import {
    ensureNotInWorktree,
    execSyncWithoutTmux,
} from "../helpers/isolation";

// Path to the compiled wtt binary
const WTT_BIN = path.resolve(__dirname, "../../dist/index.js");

describe("Remove Command E2E", () => {
    // Increase timeout for e2e tests
    vi.setConfig({testTimeout: 30000});

    // Ensure tests are not running in a worktree
    beforeAll(async() => {
        await ensureNotInWorktree();
    });

    it("should remove a clean worktree", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            // Initialize wtt
            execSyncWithoutTmux(`node "${WTT_BIN}" init`);

            // Create a worktree
            try {
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-1`, {
                    timeout: 5000,
                });
            } catch {
                // Expected to timeout due to shell spawning
            }

            const worktreePath = path.join(git.path, ".worktrees", "feature-1");
            const exists = await fs.access(worktreePath).then(() => true).catch(() => false);
            expect(exists).toBe(true);

            // Remove the worktree
            const output = execSyncWithoutTmux(`node "${WTT_BIN}" remove feature-1`);

            expect(output).toContain("Removed worktree 'feature-1'");
            const existsAfter = await fs.access(worktreePath).then(() => true).catch(() => false);
            expect(existsAfter).toBe(false);
        });
    });

    it("should fail to remove worktree with untracked files", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            // Initialize wtt
            execSyncWithoutTmux(`node "${WTT_BIN}" init`);

            // Create a worktree
            try {
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-2`, {
                    timeout: 5000,
                });
            } catch {
                // Expected to timeout due to shell spawning
            }

            const worktreePath = path.join(git.path, ".worktrees", "feature-2");

            // Add untracked file
            await fs.writeFile(path.join(worktreePath, "untracked.txt"), "content");

            // Try to remove the worktree - expect it to fail
            let output = "";
            try {
                output = execSyncWithoutTmux(`node "${WTT_BIN}" remove feature-2 2>&1`);
            } catch(error: any) {
                output = String(error.stdout) + String(error.stderr);
            }

            expect(output).toContain("Has untracked files");
            const exists = await fs.access(worktreePath).then(() => true).catch(() => false);
            expect(exists).toBe(true);
        });
    });

    it("should force remove worktree with untracked files", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            // Initialize wtt
            execSyncWithoutTmux(`node "${WTT_BIN}" init`);

            // Create a worktree
            try {
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-3`, {
                    timeout: 5000,
                });
            } catch {
                // Expected to timeout due to shell spawning
            }

            const worktreePath = path.join(git.path, ".worktrees", "feature-3");

            // Add untracked file
            await fs.writeFile(path.join(worktreePath, "untracked.txt"), "content");

            // Force remove the worktree
            const output = execSyncWithoutTmux(`node "${WTT_BIN}" remove --force feature-3`);

            expect(output).toContain("Removed worktree 'feature-3'");
            const exists = await fs.access(worktreePath).then(() => true).catch(() => false);
            expect(exists).toBe(false);
        });
    });

    it("should prune fully merged worktrees", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            // Initialize wtt
            execSyncWithoutTmux(`node "${WTT_BIN}" init`);

            // Create multiple worktrees
            try {
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-merged`, {
                    timeout: 5000,
                });
            } catch {
                // Expected to timeout due to shell spawning
            }

            try {
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-unmerged`, {
                    timeout: 5000,
                });
            } catch {
                // Expected to timeout due to shell spawning
            }

            const mergedPath = path.join(git.path, ".worktrees", "feature-merged");
            const unmergedPath = path.join(git.path, ".worktrees", "feature-unmerged");

            // Make a commit in the unmerged branch
            await fs.writeFile(path.join(unmergedPath, "newfile.txt"), "content");
            execSyncWithoutTmux("git add .", {cwd: unmergedPath});
            execSyncWithoutTmux("git commit -m \"Add new file\"", {cwd: unmergedPath});

            // Run prune
            const output = execSyncWithoutTmux(`node "${WTT_BIN}" remove --prune`);

            expect(output).toContain("Pruned worktree: feature-merged");
            const mergedExists = await fs.access(mergedPath).then(() => true).catch(() => false);
            const unmergedExists = await fs.access(unmergedPath).then(() => true).catch(() => false);
            expect(mergedExists).toBe(false);
            expect(unmergedExists).toBe(true);
        });
    });

    it("should handle multiple worktree removal", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            // Initialize wtt
            execSyncWithoutTmux(`node "${WTT_BIN}" init`);

            // Create multiple worktrees
            try {
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-a`, {
                    timeout: 5000,
                });
            } catch {
                // Expected to timeout due to shell spawning
            }

            try {
                execSyncWithoutTmux(`node "${WTT_BIN}" create feature-b`, {
                    timeout: 5000,
                });
            } catch {
                // Expected to timeout due to shell spawning
            }

            const pathA = path.join(git.path, ".worktrees", "feature-a");
            const pathB = path.join(git.path, ".worktrees", "feature-b");

            const existsA = await fs.access(pathA).then(() => true).catch(() => false);
            const existsB = await fs.access(pathB).then(() => true).catch(() => false);
            expect(existsA).toBe(true);
            expect(existsB).toBe(true);

            // Remove both worktrees
            const output = execSyncWithoutTmux(`node "${WTT_BIN}" remove feature-a feature-b`);

            expect(output).toContain("Removed worktree 'feature-a'");
            expect(output).toContain("Removed worktree 'feature-b'");
            const existsAAfter = await fs.access(pathA).then(() => true).catch(() => false);
            const existsBAfter = await fs.access(pathB).then(() => true).catch(() => false);
            expect(existsAAfter).toBe(false);
            expect(existsBAfter).toBe(false);
        });
    });

    it("should not remove main worktree", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            // Initialize wtt
            execSyncWithoutTmux(`node "${WTT_BIN}" init`);

            let output = "";
            try {
                output = execSyncWithoutTmux(`node "${WTT_BIN}" remove main 2>&1`);
            } catch(error: any) {
                output = String(error.stdout) + String(error.stderr);
            }

            expect(output).toContain("Cannot remove main worktree");
        });
    });

    it("should handle non-existent worktree", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            // Initialize wtt
            execSyncWithoutTmux(`node "${WTT_BIN}" init`);

            let output = "";
            try {
                output = execSyncWithoutTmux(`node "${WTT_BIN}" remove non-existent 2>&1`);
            } catch(error: any) {
                output = String(error.stdout) + String(error.stderr);
            }

            expect(output).toContain("Worktree 'non-existent' not found");
        });
    });
});

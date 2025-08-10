import {execSync} from "child_process";
import {promises as fs} from "fs";
import path from "path";
import simpleGit from "simple-git";
import {beforeEach, describe, expect, it} from "vitest";

import {
    createIsolatedTestRepoWithCommit,
    withTestSandbox,
} from "../../helpers/git.js";

const WTT_BIN = path.resolve(__dirname, "../../../dist/index.js");

describe("merge command integration", () => {
    beforeEach(() => {
        process.env.WTT_NO_CONFIRM = "true"; // Skip confirmation prompts in tests
    });

    it("should merge worktree into main", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);

            // Initialize wtt
            execSync(`node "${WTT_BIN}" init`, {cwd: git.path});

            // Create worktree
            execSync(`node "${WTT_BIN}" create feature-branch`, {cwd: git.path});

            // Make changes in worktree
            const featurePath = path.join(git.path, ".worktrees/feature-branch");
            await fs.writeFile(path.join(featurePath, "feature.txt"), "new feature");

            // Create a git instance for the worktree directory
            const worktreeGit = simpleGit(featurePath);
            await worktreeGit.add("feature.txt");
            await worktreeGit.commit("Add feature");

            // Merge back to main
            const result = execSync(
                `node "${WTT_BIN}" merge --no-fetch`,
                {encoding: "utf8", cwd: featurePath},
            );

            expect(result).toContain("Successfully merged");

            // Verify merge
            process.chdir(git.path);
            const files = await fs.readdir(".");
            expect(files).toContain("feature.txt");

            // Verify we're still on main
            const branch = await git.branchLocal();
            expect(branch.current).toBe("main");
        });
    });

    it("should merge main into worktree with --update", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);

            // Initialize wtt
            execSync(`node "${WTT_BIN}" init`, {cwd: git.path});

            // Create worktree
            execSync(`node "${WTT_BIN}" create feature-branch`, {cwd: git.path});

            // Make changes in main
            await fs.writeFile(path.join(git.path, "main-change.txt"), "main change");
            await git.add("main-change.txt");
            await git.commit("Add main change");

            // Update worktree from main
            const featurePath = path.join(git.path, ".worktrees/feature-branch");

            const result = execSync(
                `node "${WTT_BIN}" merge --update --no-fetch`,
                {encoding: "utf8", cwd: featurePath},
            );

            expect(result).toContain("Successfully merged");

            // Verify update
            const files = await fs.readdir(featurePath);
            expect(files).toContain("main-change.txt");
        });
    });

    it("should handle merge conflicts", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);

            // Initialize wtt
            execSync(`node "${WTT_BIN}" init`, {cwd: git.path});

            // Create worktree
            execSync(`node "${WTT_BIN}" create feature-branch`, {cwd: git.path});

            // Create conflicting changes
            const conflictFile = "conflict.txt";

            // Change in main
            await fs.writeFile(path.join(git.path, conflictFile), "main version");
            await git.add(conflictFile);
            await git.commit("Add conflict file in main");

            // Change in worktree
            const featurePath = path.join(git.path, ".worktrees/feature-branch");
            await fs.writeFile(path.join(featurePath, conflictFile), "feature version");

            // Create a git instance for the worktree directory
            const worktreeGit = simpleGit(featurePath);
            await worktreeGit.add(conflictFile);
            await worktreeGit.commit("Add conflict file in feature");

            // Try to merge - should fail
            expect(() => {
                execSync(`node "${WTT_BIN}" merge --no-fetch`, {cwd: featurePath});
            }).toThrow();
        });
    });

    it("should error on uncommitted changes without --force", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);

            // Initialize wtt
            execSync(`node "${WTT_BIN}" init`, {cwd: git.path});

            // Create worktree
            execSync(`node "${WTT_BIN}" create feature-branch`, {cwd: git.path});

            // Make uncommitted changes
            const featurePath = path.join(git.path, ".worktrees/feature-branch");
            await fs.writeFile(path.join(featurePath, "uncommitted.txt"), "uncommitted changes");

            // Try to merge - should fail
            expect(() => {
                execSync(`node "${WTT_BIN}" merge --no-fetch`, {cwd: featurePath});
            }).toThrow("uncommitted changes");
        });
    });

    it("should merge with --force despite uncommitted changes", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);

            // Initialize wtt
            execSync(`node "${WTT_BIN}" init`, {cwd: git.path});

            // Create worktree
            execSync(`node "${WTT_BIN}" create feature-branch`, {cwd: git.path});

            // Make uncommitted changes
            const featurePath = path.join(git.path, ".worktrees/feature-branch");
            await fs.writeFile(path.join(featurePath, "uncommitted.txt"), "uncommitted changes");

            // Make committed changes too
            await fs.writeFile(path.join(featurePath, "committed.txt"), "committed changes");

            // Create a git instance for the worktree directory
            const worktreeGit = simpleGit(featurePath);
            await worktreeGit.add("committed.txt");
            await worktreeGit.commit("Add committed file");

            // Merge with force
            const result = execSync(
                `node "${WTT_BIN}" merge --force --no-fetch`,
                {encoding: "utf8", cwd: featurePath},
            );

            expect(result).toContain("Successfully merged");
        });
    });

    it("should merge specified worktree from main directory", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);

            // Initialize wtt
            execSync(`node "${WTT_BIN}" init`, {cwd: git.path});

            // Create worktree
            execSync(`node "${WTT_BIN}" create feature-branch`, {cwd: git.path});

            // Make changes in worktree
            const featurePath = path.join(git.path, ".worktrees/feature-branch");
            await fs.writeFile(path.join(featurePath, "feature.txt"), "new feature");

            // Create a git instance for the worktree directory
            const worktreeGit = simpleGit(featurePath);
            await worktreeGit.add("feature.txt");
            await worktreeGit.commit("Add feature");

            // Merge from main directory by specifying worktree name
            process.chdir(git.path);
            const result = execSync(
                `node "${WTT_BIN}" merge feature-branch --no-fetch`,
                {encoding: "utf8"},
            );

            expect(result).toContain("Successfully merged");

            // Verify merge
            const files = await fs.readdir(".");
            expect(files).toContain("feature.txt");
        });
    });

    it("should error when not in a worktree without specifying name", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);

            // Initialize wtt
            execSync(`node "${WTT_BIN}" init`, {cwd: git.path});

            // Try to merge from main directory without specifying worktree
            expect(() => {
                execSync(`node "${WTT_BIN}" merge --no-fetch`, {cwd: git.path});
            }).toThrow("Not in a worktree");
        });
    });

    it("should handle confirmation prompt cancellation", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);

            // Initialize wtt
            execSync(`node "${WTT_BIN}" init`, {cwd: git.path});

            // Create worktree
            execSync(`node "${WTT_BIN}" create feature-branch`, {cwd: git.path});

            // Remove WTT_NO_CONFIRM for this test
            delete process.env.WTT_NO_CONFIRM;

            // Try to merge with 'n' response
            const featurePath = path.join(git.path, ".worktrees/feature-branch");
            const result = execSync(
                `echo n | node "${WTT_BIN}" merge --no-fetch`,
                {encoding: "utf8", cwd: featurePath, shell: true},
            );

            expect(result).toContain("Merge cancelled");

            // Restore WTT_NO_CONFIRM
            process.env.WTT_NO_CONFIRM = "true";
        });
    });
});

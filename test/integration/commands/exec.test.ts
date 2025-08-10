import {execSync} from "child_process";
import fs from "fs-extra";
import path from "path";
import {describe, expect, it} from "vitest";

import {createIsolatedTestRepoWithCommit, withTestSandbox} from "../../helpers/git";

// Path to the compiled wtt binary
const WTT_BIN = path.resolve(__dirname, "../../../dist/index.js");

describe("exec command integration", () => {
    it("should error when no config exists", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            const result = runWtt(["exec", "test"]);

            expect(result.code).not.toBe(0);
            expect(result.stderr).toContain("No configuration found");
        });
    });

    it("should error when command not found", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            const config = {
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false,
                commands: {
                    test: "echo 'test'",
                },
            };

            await fs.writeJson(".worktree-config.json", config);

            const result = runWtt(["exec", "build"]);

            expect(result.code).not.toBe(0);
            expect(result.stderr).toContain("Command \"build\" not found");
        });
    });

    it("should execute command with special characters", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            const config = {
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false,
                commands: {
                    complex: "echo \"test\" | grep \"t\" > output.txt",
                },
            };

            await fs.writeJson(".worktree-config.json", config);

            // Create a worktree
            execSync("git worktree add .worktrees/test -b test", {
                stdio: "pipe",
            });

            // Note: This would normally open a new window, but in test environment
            // without a display it will fail. We're testing that the command parsing works.
            const result = runWtt(["exec", "complex"]);

            // On some CI systems (like Windows), terminal may be available and command succeeds
            const output = result.stdout + result.stderr;
            // Either it fails (no terminal) or succeeds (terminal available)
            expect(output).toMatch(/Failed to start in test|Starting in test/);
        });
    });

    it("should handle worktree-specific execution", {timeout: 10000}, async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            const config = {
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false,
                commands: {
                    echo: "echo 'Hello'",
                },
            };

            await fs.writeJson(".worktree-config.json", config);

            // Create a worktree
            execSync("git worktree add .worktrees/feature -b feature", {
                stdio: "pipe",
            });

            const result = runWtt(["exec", "echo", "feature"]);

            // On some CI systems (like Windows), terminal may be available and command succeeds
            const output = result.stdout + result.stderr;
            // Either it fails (no terminal) or succeeds (terminal available)
            expect(output).toMatch(/Failed to start in feature|Starting in feature/);
        });
    });

    it("should show available commands in error message", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            const config = {
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false,
                commands: {
                    test: "npm test",
                    build: "npm run build",
                    lint: "npm run lint",
                },
            };

            await fs.writeJson(".worktree-config.json", config);

            const result = runWtt(["exec", "deploy"]);

            expect(result.code).not.toBe(0);
            expect(result.stderr).toContain("Command \"deploy\" not found");
            // The hint might be in stdout due to how logger outputs
            const combined = result.stdout + result.stderr;
            expect(combined).toMatch(/Available commands.*test.*build.*lint/s);
        });
    });

    it("should show available worktrees in error message", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            const config = {
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false,
                commands: {
                    test: "echo test",
                },
            };

            await fs.writeJson(".worktree-config.json", config);

            // Create worktrees
            execSync("git worktree add .worktrees/feature-a -b feature-a", {
                stdio: "pipe",
            });

            execSync("git worktree add .worktrees/feature-b -b feature-b", {
                stdio: "pipe",
            });

            const result = runWtt(["exec", "-w", "feature-c", "test"]);

            expect(result.code).not.toBe(0);
            expect(result.stderr).toContain("Worktree(s) not found: feature-c");
            // The hint might be in stdout due to how logger outputs
            const combined = result.stdout + result.stderr;
            expect(combined).toMatch(/Available worktrees/);
            expect(combined).toMatch(/feature-a|feature-b/);
        });
    });

    it("should respect verbose flag", {timeout: 10000}, async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepoWithCommit(sandbox);
            process.chdir(git.path);

            const config = {
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false,
                commands: {
                    test: "echo test",
                },
            };

            await fs.writeJson(".worktree-config.json", config);

            // Create a worktree
            execSync("git worktree add .worktrees/test -b test", {
                stdio: "pipe",
            });

            const result = runWtt(["exec", "test", "--verbose"]);

            // Should see verbose output about execution
            expect(result.stdout).toContain("Executing 'test'");
        });
    });
});

function runWtt(args: string[]): {code: number, stdout: string, stderr: string} {
    try {
        const output = execSync(`node ${WTT_BIN} ${args.join(" ")}`, {
            encoding: "utf8",
            stdio: "pipe",
        });

        return {
            code: 0,
            stdout: output,
            stderr: "",
        };
    } catch(error: any) {
        return {
            code: error.status ?? 1,
            stdout: error.stdout ?? "",
            stderr: error.stderr ?? error.message ?? "",
        };
    }
}


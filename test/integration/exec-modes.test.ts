import {execSync} from "child_process";
import {existsSync, mkdirSync, rmSync, writeFileSync} from "fs";
import {tmpdir} from "os";
import path from "path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

describe("Exec Modes Integration", () => {
    let testDir: string;
    let originalCwd: string;

    beforeEach(() => {
        // Create a temporary test directory
        testDir = path.join(tmpdir(), `wtt-test-${String(Date.now())}`);
        mkdirSync(testDir, {recursive: true});
        originalCwd = process.cwd();
        process.chdir(testDir);

        // Initialize a git repo
        execSync("git init", {stdio: "ignore"});
        execSync("git config user.email 'test@example.com'", {stdio: "ignore"});
        execSync("git config user.name 'Test User'", {stdio: "ignore"});
        execSync("git config commit.gpgsign false", {stdio: "ignore"});

        // Create initial commit
        writeFileSync("README.md", "# Test Project");
        execSync("git add .", {stdio: "ignore"});
        execSync("git commit -m 'Initial commit'", {stdio: "ignore"});
    });

    afterEach(() => {
        process.chdir(originalCwd);
        if (existsSync(testDir)) {
            rmSync(testDir, {recursive: true, force: true});
        }
    });

    it("executes in window mode by default (exit mode in CI)", () => {
        // Initialize wtt config
        const config = {
            version: "1.0.0",
            projectName: "test-project",
            mainBranch: "main",
            baseDir: ".worktrees",
            tmux: false, // Disable tmux for testing
            commands: {
                test: "echo 'Window mode test'",
            },
        };
        writeFileSync(".worktree-config.json", JSON.stringify(config, null, 2));

        // Create a worktree
        execSync("git worktree add .worktrees/feature-a -b feature-a", {stdio: "ignore"});

        // Run exec command
        const wttPath = path.join(__dirname, "..", "..", "dist", "index.js");
        const result = execSync(`node ${wttPath} exec test`, {
            encoding: "utf8",
            env: {... process.env, WTT_DISABLE_TMUX: "true"},
        });

        // In CI environments, it defaults to exit mode to avoid terminal emulator issues
        const isCI = process.env.CI ?? process.env.GITHUB_ACTIONS;
        const expectedMode = isCI ? "exit" : "window";
        // Check for the appropriate mode message
        if (expectedMode === "exit") {
            expect(result).toContain("Executing command in 1 worktree(s) (exit mode)");
        } else {
            expect(result).toContain("Executing command in 1 worktree(s) (mode: window)");
        }
    });

    it("respects mode from config", () => {
        // Initialize wtt config with exit mode
        const config = {
            version: "1.0.0",
            projectName: "test-project",
            mainBranch: "main",
            baseDir: ".worktrees",
            tmux: false,
            commands: {
                test: {
                    command: "echo 'Exit mode test'",
                    mode: "exit",
                },
            },
        };
        writeFileSync(".worktree-config.json", JSON.stringify(config, null, 2));

        // Create a worktree
        execSync("git worktree add .worktrees/feature-b -b feature-b", {stdio: "ignore"});

        // Run exec command
        const wttPath = path.join(__dirname, "..", "..", "dist", "index.js");
        const result = execSync(`node ${wttPath} exec test`, {
            encoding: "utf8",
            env: {... process.env, WTT_DISABLE_TMUX: "true"},
        });

        expect(result).toContain("Executing command in 1 worktree(s) (exit mode)");
    });

    it("CLI mode overrides config mode", () => {
        // Initialize wtt config with exit mode
        const config = {
            version: "1.0.0",
            projectName: "test-project",
            mainBranch: "main",
            baseDir: ".worktrees",
            tmux: false,
            commands: {
                test: {
                    command: "echo 'Mode override test'",
                    mode: "exit",
                },
            },
        };
        writeFileSync(".worktree-config.json", JSON.stringify(config, null, 2));

        // Create a worktree
        execSync("git worktree add .worktrees/feature-c -b feature-c", {stdio: "ignore"});

        // Run exec command with inline mode override
        const wttPath = path.join(__dirname, "..", "..", "dist", "index.js");
        const result = execSync(`node ${wttPath} exec test --mode inline`, {
            encoding: "utf8",
            env: {... process.env, WTT_DISABLE_TMUX: "true"},
        });

        expect(result).toContain("Executing command in 1 worktree(s) (inline mode)");
        expect(result).toContain("[feature-c] Output:");
    });

    it("handles inline commands with --", () => {
        // Initialize wtt config
        const config = {
            version: "1.0.0",
            projectName: "test-project",
            mainBranch: "main",
            baseDir: ".worktrees",
            tmux: false,
        };
        writeFileSync(".worktree-config.json", JSON.stringify(config, null, 2));

        // Create a worktree
        execSync("git worktree add .worktrees/feature-d -b feature-d", {stdio: "ignore"});

        // Run inline command
        const wttPath = path.join(__dirname, "..", "..", "dist", "index.js");
        const result = execSync(`node ${wttPath} exec --mode inline -- echo "Inline command test"`, {
            encoding: "utf8",
            env: {... process.env, WTT_DISABLE_TMUX: "true"},
        });

        expect(result).toContain("[feature-d] Output:");
        expect(result).toContain("Inline command test");
    });

    it("handles inline commands with -- when no predefined commands exist", () => {
        // Initialize wtt config WITHOUT any commands defined
        const config = {
            version: "1.0.0",
            projectName: "test-project",
            mainBranch: "main",
            baseDir: ".worktrees",
            tmux: false,
            // No commands defined - this is the key to reproducing the bug
        };
        writeFileSync(".worktree-config.json", JSON.stringify(config, null, 2));

        // Create a worktree
        execSync("git worktree add .worktrees/feature-e -b feature-e", {stdio: "ignore"});

        // Run inline command without any options before --
        // This should work and not throw "No commands configured" error
        const wttPath = path.join(__dirname, "..", "..", "dist", "index.js");
        const result = execSync(`node ${wttPath} exec --mode inline -- ls`, {
            encoding: "utf8",
            env: {... process.env, WTT_DISABLE_TMUX: "true"},
        });

        // Should execute successfully and show output from ls
        expect(result).toContain("[feature-e] Output:");
        // The output should contain at least some files (like the .git directory)
        expect(result.toLowerCase()).toMatch(/\.git|readme|package\.json|src/);
    });
});

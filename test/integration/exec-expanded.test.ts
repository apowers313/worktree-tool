import {promises as fs} from "fs";
import path from "path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import {createIsolatedTestRepoWithCommit} from "../helpers/git.js";
import {execSyncWithoutTmux} from "../helpers/isolation.js";
import {TestSandbox} from "../helpers/sandbox.js";

describe("Exec Expanded Features", () => {
    let sandbox: TestSandbox;
    let wttPath: string;
    let originalCwd: string;
    let git: any;

    beforeEach(async() => {
        sandbox = new TestSandbox();
        await sandbox.setup();
        originalCwd = process.cwd();
        wttPath = path.resolve(__dirname, "../../dist/index.js");

        // Initialize git repo with commit - this returns a git instance with a path property
        git = await createIsolatedTestRepoWithCommit(sandbox);
        process.chdir(git.path);
    });

    afterEach(async() => {
        process.chdir(originalCwd);
        await sandbox.cleanup();
    });

    describe("autoRun", () => {
        it("should run autoRun commands after create", async() => {
            // Initialize wtt first
            execSyncWithoutTmux(`node ${wttPath} init --disable-tmux`);

            // Create config with autoRun command
            const config = {
                version: "1.0.0",
                projectName: "test-project",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false, // Disable tmux for testing
                commands: {
                    setup: {
                        command: "echo 'Setup complete' > setup.log",
                        mode: "inline" as const,
                        autoRun: true,
                    },
                    dev: {
                        command: "echo 'Dev server' > dev.log",
                        mode: "inline" as const,
                        autoRun: false,
                    },
                },
            };

            await fs.writeFile(
                path.join(git.path, ".worktree-config.json"),
                JSON.stringify(config, null, 2),
            );

            // Create a worktree
            const result = execSyncWithoutTmux(`node ${wttPath} create feature-test`);
            expect(result).toContain("Created worktree: feature-test");

            // Check that autoRun command was executed
            const setupLogPath = path.join(git.path, ".worktrees", "feature-test", "setup.log");
            const setupLogExists = await fs.access(setupLogPath).then(() => true).catch(() => false);
            expect(setupLogExists).toBe(true);

            const setupLog = await fs.readFile(setupLogPath, "utf-8");
            // On Windows, echo might include quotes
            expect(setupLog.trim().replace(/^'|'$/g, "")).toBe("Setup complete");

            // Check that non-autoRun command was NOT executed
            const devLogPath = path.join(git.path, ".worktrees", "feature-test", "dev.log");
            const devLogExists = await fs.access(devLogPath).then(() => true).catch(() => false);
            expect(devLogExists).toBe(false);
        });
    });

    describe("port allocation", () => {
        it("should allocate ports and set env vars", async() => {
            // Initialize wtt first
            execSyncWithoutTmux(`node ${wttPath} init --disable-tmux`);

            // Create config with port allocation
            const config = {
                version: "1.0.0",
                projectName: "test-project",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false,
                availablePorts: "19000-19099",
                commands: {
                    server: {
                        command: "node -e \"console.log('PORT1=' + process.env.WTT_PORT1 + ', PORT2=' + process.env.WTT_PORT2)\" > ports.log",
                        mode: "inline" as const,
                        numPorts: 2,
                    },
                },
            };

            await fs.writeFile(
                path.join(git.path, ".worktree-config.json"),
                JSON.stringify(config, null, 2),
            );

            // Create a worktree first
            execSyncWithoutTmux(`node ${wttPath} create feature-port-test`);

            // Execute command with port allocation
            const result = execSyncWithoutTmux(`node ${wttPath} exec server`);
            expect(result).not.toContain("error");

            // Check that ports were allocated
            const portsLogPath = path.join(git.path, ".worktrees", "feature-port-test", "ports.log");
            const portsLog = await fs.readFile(portsLogPath, "utf-8");

            // Parse the output
            const portMatch = /PORT1=(\d+), PORT2=(\d+)/.exec(portsLog);
            expect(portMatch).not.toBeNull();

            if (!portMatch) {
                throw new Error("Port match failed");
            }

            const port1 = parseInt(portMatch[1]);
            const port2 = parseInt(portMatch[2]);

            // Verify ports are in the correct range
            expect(port1).toBeGreaterThanOrEqual(19000);
            expect(port1).toBeLessThanOrEqual(19099);
            expect(port2).toBeGreaterThanOrEqual(19000);
            expect(port2).toBeLessThanOrEqual(19099);
            expect(port1).not.toBe(port2);
        });

        it("should handle port allocation with autoRun", async() => {
            // Initialize wtt first
            execSyncWithoutTmux(`node ${wttPath} init --disable-tmux`);

            // Create config with port allocation in autoRun command
            const config = {
                version: "1.0.0",
                projectName: "test-project",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false,
                availablePorts: "19100-19199",
                commands: {
                    api: {
                        command: "echo $WTT_PORT1 > api-port.log",
                        mode: "inline" as const,
                        autoRun: true,
                        numPorts: 1,
                    },
                },
            };

            await fs.writeFile(
                path.join(git.path, ".worktree-config.json"),
                JSON.stringify(config, null, 2),
            );

            // Create a worktree
            const result = execSyncWithoutTmux(`node ${wttPath} create feature-auto-port`);
            expect(result).toContain("Created worktree: feature-auto-port");

            // Check that port was allocated for autoRun command
            const portLogPath = path.join(git.path, ".worktrees", "feature-auto-port", "api-port.log");
            const portLog = await fs.readFile(portLogPath, "utf-8");
            const port = parseInt(portLog.trim());

            expect(port).toBeGreaterThanOrEqual(19100);
            expect(port).toBeLessThanOrEqual(19199);
        });
    });

    describe("refresh", () => {
        it("should detect that autoRun commands need to be started", async() => {
            // Initialize wtt first
            execSyncWithoutTmux(`node ${wttPath} init --disable-tmux`);

            // Create config with autoRun commands
            const config = {
                version: "1.0.0",
                projectName: "test-project",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false,
                autoSort: false,
                commands: {
                    monitor: {
                        command: "echo 'Monitoring started' > monitor.log",
                        mode: "inline" as const,
                        autoRun: true,
                    },
                },
            };

            await fs.writeFile(
                path.join(git.path, ".worktree-config.json"),
                JSON.stringify(config, null, 2),
            );

            // Create worktrees without running autoRun commands
            // (simulate existing worktrees before autoRun was added)
            execSyncWithoutTmux("git worktree add .worktrees/feature-refresh1 -b feature-refresh1");
            execSyncWithoutTmux("git worktree add .worktrees/feature-refresh2 -b feature-refresh2");

            // Run refresh
            const result = execSyncWithoutTmux(`node ${wttPath} exec --refresh`);
            expect(result).not.toContain("error");

            // Since we're not using tmux, the refresh won't actually start commands
            // but we can verify the command ran successfully
        });
    });

    describe("autoSort", () => {
        it("should respect autoSort configuration", async() => {
            // Initialize wtt first
            execSyncWithoutTmux(`node ${wttPath} init --disable-tmux`);

            // Create config with autoSort
            const config = {
                version: "1.0.0",
                projectName: "test-project",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false,
                autoSort: true, // This would sort tmux windows if tmux was enabled
                commands: {
                    test: "echo 'test'",
                },
            };

            await fs.writeFile(
                path.join(git.path, ".worktree-config.json"),
                JSON.stringify(config, null, 2),
            );

            // Create worktrees
            execSyncWithoutTmux(`node ${wttPath} create zebra-feature`);
            execSyncWithoutTmux(`node ${wttPath} create alpha-feature`);

            // Verify worktrees were created
            const worktrees = execSyncWithoutTmux("git worktree list");
            expect(worktrees).toContain("zebra-feature");
            expect(worktrees).toContain("alpha-feature");

            // Note: actual window sorting would happen in tmux, which we've disabled for testing
        });
    });
});

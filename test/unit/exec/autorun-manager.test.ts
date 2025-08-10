import {beforeEach, describe, expect, it, vi} from "vitest";

import {WorktreeConfig, WorktreeInfo} from "../../../src/core/types.js";
import {AutoRunManager} from "../../../src/exec/autorun-manager.js";
import * as modeFactory from "../../../src/exec/modes/factory.js";
import * as detector from "../../../src/platform/detector.js";
import {Logger} from "../../../src/utils/logger.js";
import * as portManager from "../../../src/utils/port-manager.js";

vi.mock("../../../src/exec/modes/factory.js");
vi.mock("../../../src/platform/detector.js");
vi.mock("../../../src/utils/port-manager.js");

describe("AutoRunManager", () => {
    const mockLogger = {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    } as unknown as Logger;

    const mockExecutionMode = {
        execute: vi.fn(),
    };

    const baseConfig: WorktreeConfig = {
        version: "1.0.0",
        projectName: "test-project",
        mainBranch: "main",
        baseDir: ".worktrees",
        tmux: true,
        commands: {
            dev: {
                command: "npm run dev",
                autoRun: true,
            },
            test: {
                command: "npm test",
                autoRun: false,
            },
            build: "npm run build", // String format, no autoRun
        },
    };

    const worktree: WorktreeInfo = {
        path: "/home/user/project/.worktrees/feature-1",
        branch: "feature-1",
        commit: "abc123",
        isMain: false,
        isLocked: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock isCI to always return false in tests
        vi.mocked(detector.isCI).mockReturnValue(false);
        vi.mocked(modeFactory.createExecutionMode).mockReturnValue(mockExecutionMode);
    });

    describe("runAutoCommands", () => {
        it("should run only commands with autoRun: true", async() => {
            const manager = new AutoRunManager(baseConfig, mockLogger);
            await manager.runAutoCommands(worktree);

            expect(mockExecutionMode.execute).toHaveBeenCalledTimes(1);
            expect(mockExecutionMode.execute).toHaveBeenCalledWith([
                expect.objectContaining({
                    worktreeName: "feature-1",
                    worktreePath: "/home/user/project/.worktrees/feature-1",
                    command: "npm run dev",
                    args: [],
                    env: {},
                }),
            ]);
        });

        it("should skip if no commands configured", async() => {
            const configWithoutCommands: WorktreeConfig = {
                ... baseConfig,
                commands: undefined,
            };
            const manager = new AutoRunManager(configWithoutCommands, mockLogger);
            await manager.runAutoCommands(worktree);

            expect(mockExecutionMode.execute).not.toHaveBeenCalled();
        });

        it("should handle empty commands object", async() => {
            const configWithEmptyCommands: WorktreeConfig = {
                ... baseConfig,
                commands: {},
            };
            const manager = new AutoRunManager(configWithEmptyCommands, mockLogger);
            await manager.runAutoCommands(worktree);

            expect(mockExecutionMode.execute).not.toHaveBeenCalled();
        });
    });

    describe("runCommand", () => {
        it("should allocate ports when configured", async() => {
            const configWithPorts: WorktreeConfig = {
                ... baseConfig,
                availablePorts: "9000-9099",
                commands: {
                    dev: {
                        command: "npm run dev",
                        autoRun: true,
                        numPorts: 2,
                    },
                },
            };

            vi.mocked(portManager.portManager.parseRange).mockReturnValue({start: 9000, end: 9099});
            vi.mocked(portManager.portManager.findAvailablePorts).mockResolvedValue([9001, 9002]);

            const manager = new AutoRunManager(configWithPorts, mockLogger);
            const devCommand = configWithPorts.commands?.dev;
            if (typeof devCommand !== "object") {
                throw new Error("Test configuration error: dev command should be an object");
            }

            await manager.runCommand(
                "dev",
                devCommand,
                "feature-1",
                "/home/user/project/.worktrees/feature-1",
            );

            expect(portManager.portManager.findAvailablePorts).toHaveBeenCalledWith(9000, 9099, 2);
            expect(mockExecutionMode.execute).toHaveBeenCalledWith([
                expect.objectContaining({
                    env: {
                        WTT_PORT1: "9001",
                        WTT_PORT2: "9002",
                    },
                }),
            ]);
        });

        it("should warn on port allocation failure", async() => {
            const configWithPorts: WorktreeConfig = {
                ... baseConfig,
                availablePorts: "9000-9099",
                commands: {
                    dev: {
                        command: "npm run dev",
                        autoRun: true,
                        numPorts: 2,
                    },
                },
            };

            vi.mocked(portManager.portManager.parseRange).mockReturnValue({start: 9000, end: 9099});
            vi.mocked(portManager.portManager.findAvailablePorts).mockRejectedValue(
                new Error("No ports available"),
            );

            const manager = new AutoRunManager(configWithPorts, mockLogger);
            const devCommand = configWithPorts.commands?.dev;
            if (typeof devCommand !== "object") {
                throw new Error("Test configuration error: dev command should be an object");
            }

            await manager.runCommand(
                "dev",
                devCommand,
                "feature-1",
                "/home/user/project/.worktrees/feature-1",
            );

            expect(mockLogger.warn).toHaveBeenCalledWith("Port allocation failed for dev: No ports available");
            expect(mockExecutionMode.execute).toHaveBeenCalledWith([
                expect.objectContaining({
                    env: {}, // No ports allocated
                }),
            ]);
        });

        it("should use window mode by default", async() => {
            const manager = new AutoRunManager(baseConfig, mockLogger);
            await manager.runCommand(
                "dev",
                {command: "npm run dev"},
                "feature-1",
                "/home/user/project/.worktrees/feature-1",
            );

            expect(modeFactory.createExecutionMode).toHaveBeenCalledWith("window", baseConfig, mockLogger);
        });

        it("should use configured mode", async() => {
            const manager = new AutoRunManager(baseConfig, mockLogger);
            await manager.runCommand(
                "dev",
                {command: "npm run dev", mode: "background"},
                "feature-1",
                "/home/user/project/.worktrees/feature-1",
            );

            expect(modeFactory.createExecutionMode).toHaveBeenCalledWith("background", baseConfig, mockLogger);
        });
    });
});

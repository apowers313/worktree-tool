import {beforeEach, describe, expect, it, vi} from "vitest";

import {AutoRunManager} from "../../../src/exec/autorun-manager.js";
import {RefreshManager} from "../../../src/exec/refresh-manager.js";
import * as tmux from "../../../src/platform/tmux.js";
import * as tmuxWindowManager from "../../../src/platform/tmux-window-manager.js";
import {Logger} from "../../../src/utils/logger.js";

vi.mock("../../../src/platform/tmux.js");
vi.mock("../../../src/platform/tmux-window-manager.js");
vi.mock("../../../src/exec/autorun-manager.js");

describe("RefreshManager", () => {
    const mockLogger = {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        verbose: vi.fn(),
        log: vi.fn(),
        getLevel: vi.fn(),
    } as unknown as Logger;

    const baseConfig = {
        version: "1.0.0",
        projectName: "test-project",
        mainBranch: "main",
        baseDir: ".worktrees",
        tmux: true,
        autoSort: true,
        commands: {
            dev: {
                command: "npm run dev",
                autoRun: true,
            },
            test: {
                command: "npm test",
                autoRun: false,
            },
            build: {
                command: "npm run build",
                autoRun: true,
            },
        },
    };

    const worktrees = [
        {
            path: "/home/user/project/.worktrees/feature-1",
            branch: "feature-1",
            commit: "abc123",
            isMain: false,
            isLocked: false,
        },
        {
            path: "/home/user/project/.worktrees/feature-2",
            branch: "feature-2",
            commit: "def456",
            isMain: false,
            isLocked: false,
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(tmux.sanitizeTmuxName).mockReturnValue("test-project");
    });

    describe("refreshWorktrees", () => {
        it("should refresh all worktrees and sort windows", async() => {
            vi.mocked(tmuxWindowManager.tmuxWindowManager.isCommandRunning).mockResolvedValue(true);
            vi.mocked(tmuxWindowManager.tmuxWindowManager.sortWindowsAlphabetically).mockResolvedValue();

            const manager = new RefreshManager(baseConfig, mockLogger);
            await manager.refreshWorktrees(worktrees);

            // Should check each autoRun command for each worktree
            expect(tmuxWindowManager.tmuxWindowManager.isCommandRunning).toHaveBeenCalledTimes(4); // 2 worktrees * 2 autoRun commands
            expect(tmuxWindowManager.tmuxWindowManager.isCommandRunning).toHaveBeenCalledWith("test-project", "feature-1::dev");
            expect(tmuxWindowManager.tmuxWindowManager.isCommandRunning).toHaveBeenCalledWith("test-project", "feature-1::build");
            expect(tmuxWindowManager.tmuxWindowManager.isCommandRunning).toHaveBeenCalledWith("test-project", "feature-2::dev");
            expect(tmuxWindowManager.tmuxWindowManager.isCommandRunning).toHaveBeenCalledWith("test-project", "feature-2::build");

            // Should sort windows
            expect(tmuxWindowManager.tmuxWindowManager.sortWindowsAlphabetically).toHaveBeenCalledWith("test-project");
        });

        it("should restart missing autoRun commands", async() => {
            // First command is running, second is not
            vi.mocked(tmuxWindowManager.tmuxWindowManager.isCommandRunning)
                .mockResolvedValueOnce(true) // feature-1::dev
                .mockResolvedValueOnce(false) // feature-1::build
                .mockResolvedValueOnce(true) // feature-2::dev
                .mockResolvedValueOnce(false); // feature-2::build

            const mockAutoRunManager = {
                runCommand: vi.fn().mockResolvedValue(undefined),
            };
            vi.mocked(AutoRunManager).mockImplementation(() => mockAutoRunManager as any);

            const manager = new RefreshManager(baseConfig, mockLogger);
            await manager.refreshWorktrees(worktrees);

            // Should log that it's restarting missing commands
            expect(mockLogger.info).toHaveBeenCalledWith("Starting missing autoRun command: build for feature-1");
            expect(mockLogger.info).toHaveBeenCalledWith("Starting missing autoRun command: build for feature-2");

            // Should create AutoRunManager and run missing commands
            expect(AutoRunManager).toHaveBeenCalledTimes(2);
            expect(mockAutoRunManager.runCommand).toHaveBeenCalledTimes(2);
            expect(mockAutoRunManager.runCommand).toHaveBeenCalledWith(
                "build",
                baseConfig.commands.build,
                "feature-1",
                "/home/user/project/.worktrees/feature-1",
            );
            expect(mockAutoRunManager.runCommand).toHaveBeenCalledWith(
                "build",
                baseConfig.commands.build,
                "feature-2",
                "/home/user/project/.worktrees/feature-2",
            );
        });

        it("should skip if tmux is disabled", async() => {
            const configWithoutTmux = {... baseConfig, tmux: false};
            vi.mocked(tmuxWindowManager.tmuxWindowManager.isCommandRunning).mockResolvedValue(true);

            const manager = new RefreshManager(configWithoutTmux, mockLogger);
            await manager.refreshWorktrees(worktrees);

            // Should not sort windows
            expect(tmuxWindowManager.tmuxWindowManager.sortWindowsAlphabetically).not.toHaveBeenCalled();
        });

        it("should skip sorting if autoSort is disabled", async() => {
            const configWithoutSort = {... baseConfig, autoSort: false};
            vi.mocked(tmuxWindowManager.tmuxWindowManager.isCommandRunning).mockResolvedValue(true);

            const manager = new RefreshManager(configWithoutSort, mockLogger);
            await manager.refreshWorktrees(worktrees);

            // Should not sort windows
            expect(tmuxWindowManager.tmuxWindowManager.sortWindowsAlphabetically).not.toHaveBeenCalled();
        });

        it("should handle sorting error gracefully", async() => {
            vi.mocked(tmuxWindowManager.tmuxWindowManager.isCommandRunning).mockResolvedValue(true);
            vi.mocked(tmuxWindowManager.tmuxWindowManager.sortWindowsAlphabetically).mockRejectedValue(
                new Error("Sort failed"),
            );

            const manager = new RefreshManager(baseConfig, mockLogger);
            await manager.refreshWorktrees(worktrees);

            expect(mockLogger.warn).toHaveBeenCalledWith("Failed to sort windows: Sort failed");
        });

        it("should skip if no commands configured", async() => {
            const configWithoutCommands = {... baseConfig, commands: undefined};

            const manager = new RefreshManager(configWithoutCommands, mockLogger);
            await manager.refreshWorktrees(worktrees);

            expect(tmuxWindowManager.tmuxWindowManager.isCommandRunning).not.toHaveBeenCalled();
        });
    });
});

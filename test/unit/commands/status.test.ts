import {beforeEach, describe, expect, it, vi} from "vitest";

import {CommandContext} from "../../../src/commands/base.js";
import {StatusCommand} from "../../../src/commands/status.js";
import {StatusOptions, WorktreeConfig} from "../../../src/core/types.js";
import {createMockGit, createMockLogger} from "../../helpers/mocks.js";

describe("StatusCommand", () => {
    let mockContext: CommandContext;
    let command: StatusCommand;
    let mockConfig: WorktreeConfig;

    beforeEach(() => {
        mockConfig = {
            version: "1.0.0",
            projectName: "test-project",
            mainBranch: "main",
            baseDir: ".worktrees",
            tmux: false,
        };

        mockContext = {
            logger: createMockLogger(),
            config: mockConfig,
            git: createMockGit(),
        };

        command = new StatusCommand();
    });

    describe("configuration requirements", () => {
        it("should require config", () => {
            expect(command.requiresConfig()).toBe(true);
        });

        it("should require git repo", () => {
            expect(command.requiresGitRepo()).toBe(true);
        });
    });

    describe("validateOptions", () => {
        it("should accept empty options", () => {
            const options: StatusOptions = {};
            expect(() => {
                command.validateOptions(options);
            }).not.toThrow();
        });

        it("should accept worktrees filter option", () => {
            const options: StatusOptions = {
                worktrees: "main,feature",
            };
            expect(() => {
                command.validateOptions(options);
            }).not.toThrow();
        });
    });

    describe("executeCommand", () => {
        beforeEach(() => {
            // Mock git methods with default values
            mockContext.git.getWorktreeStatus = vi.fn().mockResolvedValue([]);
            mockContext.git.getAheadBehindBranch = vi.fn().mockResolvedValue({ahead: 0, behind: 0});
            mockContext.git.hasConflicts = vi.fn().mockResolvedValue(false);
        });

        it("should list all worktrees when no filter provided", async() => {
            const options: StatusOptions = {};
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

            mockContext.git.listWorktrees = vi.fn().mockResolvedValue([
                {name: "main", path: "/path/to/main", isMain: true, branch: "main"},
                {name: "feature", path: "/path/to/feature", isMain: false, branch: "feature"},
            ]);

            await command.executeCommand(options, mockContext);

            expect(mockContext.git.listWorktrees).toHaveBeenCalledOnce();
            // Should only process non-main worktrees
            expect(mockContext.git.getWorktreeStatus).toHaveBeenCalledTimes(1);
            expect(mockContext.git.getWorktreeStatus).toHaveBeenCalledWith("/path/to/feature");
            expect(mockContext.git.getAheadBehindBranch).toHaveBeenCalledTimes(1);
            expect(mockContext.git.getAheadBehindBranch).toHaveBeenCalledWith("/path/to/feature", "main");
            expect(mockContext.git.hasConflicts).toHaveBeenCalledTimes(1);
            expect(mockContext.git.hasConflicts).toHaveBeenCalledWith("/path/to/feature", "main");
            expect(consoleSpy).toHaveBeenCalledTimes(1);
        });

        it("should filter worktrees by name when -w option provided", async() => {
            const options: StatusOptions = {
                worktrees: "feature,bugfix",
            };
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

            mockContext.git.listWorktrees = vi.fn().mockResolvedValue([
                {name: "main", path: "/path/to/main", isMain: true, branch: "main"},
                {name: "feature", path: "/path/to/feature", isMain: false, branch: "feature"},
                {name: "bugfix", path: "/path/to/bugfix", isMain: false, branch: "bugfix"},
                {name: "experiment", path: "/path/to/experiment", isMain: false, branch: "experiment"},
            ]);

            await command.executeCommand(options, mockContext);

            expect(mockContext.git.listWorktrees).toHaveBeenCalledOnce();
            expect(mockContext.git.getWorktreeStatus).toHaveBeenCalledTimes(2);
            expect(mockContext.git.getWorktreeStatus).toHaveBeenCalledWith("/path/to/feature");
            expect(mockContext.git.getWorktreeStatus).toHaveBeenCalledWith("/path/to/bugfix");
            expect(mockContext.git.getWorktreeStatus).not.toHaveBeenCalledWith("/path/to/main");
            expect(mockContext.git.getWorktreeStatus).not.toHaveBeenCalledWith("/path/to/experiment");
            expect(consoleSpy).toHaveBeenCalledTimes(2);
        });

        it("should handle spaces in worktree filter", async() => {
            const options: StatusOptions = {
                worktrees: "feature , bugfix",
            };
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

            mockContext.git.listWorktrees = vi.fn().mockResolvedValue([
                {name: "main", path: "/path/to/main", isMain: true, branch: "main"},
                {name: "feature", path: "/path/to/feature", isMain: false, branch: "feature"},
                {name: "bugfix", path: "/path/to/bugfix", isMain: false, branch: "bugfix"},
            ]);

            await command.executeCommand(options, mockContext);

            expect(mockContext.git.getWorktreeStatus).toHaveBeenCalledTimes(2);
            expect(consoleSpy).toHaveBeenCalledTimes(2);
        });

        it("should show commits ahead/behind main branch", async() => {
            const options: StatusOptions = {};
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

            mockContext.git.listWorktrees = vi.fn().mockResolvedValue([
                {name: "main", path: "/path/to/main", isMain: true, branch: "main"},
                {name: "feature", path: "/path/to/feature", isMain: false, branch: "feature"},
            ]);

            mockContext.git.getWorktreeStatus = vi.fn().mockResolvedValue(["M  file.txt"]);
            mockContext.git.getAheadBehindBranch = vi.fn().mockResolvedValue({ahead: 2, behind: 1});

            await command.executeCommand(options, mockContext);

            expect(mockContext.git.getAheadBehindBranch).toHaveBeenCalledWith("/path/to/feature", "main");
            // The output should contain ahead/behind indicators
            expect(consoleSpy).toHaveBeenCalled();
            const output = consoleSpy.mock.calls[0][0];
            expect(output).toContain("↑2↓1");
        });

        it("should detect merge conflicts with main branch", async() => {
            const options: StatusOptions = {};
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

            mockContext.git.listWorktrees = vi.fn().mockResolvedValue([
                {name: "main", path: "/path/to/main", isMain: true, branch: "main"},
                {name: "feature", path: "/path/to/feature", isMain: false, branch: "feature"},
            ]);

            mockContext.git.getWorktreeStatus = vi.fn().mockResolvedValue(["UU conflict.txt"]);
            mockContext.git.hasConflicts = vi.fn().mockResolvedValue(true);

            await command.executeCommand(options, mockContext);

            expect(mockContext.git.hasConflicts).toHaveBeenCalledWith("/path/to/feature", "main");
            // The output should contain conflict warning
            expect(consoleSpy).toHaveBeenCalled();
            const output = consoleSpy.mock.calls[0][0];
            expect(output).toContain("(!");
        });
    });
});


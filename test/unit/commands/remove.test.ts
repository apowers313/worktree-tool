import {beforeEach, describe, expect, it, vi} from "vitest";

import {CommandContext} from "../../../src/commands/base.js";
import {RemoveCommand, RemoveOptions} from "../../../src/commands/remove.js";
import {createMockContext} from "../../helpers/mocks.js";

// Mock the cleanup modules
vi.mock("../../../src/platform/process-cleanup.js", () => ({
    isCurrentProcessInWorktree: vi.fn().mockReturnValue(false),
    changeToMainWorktree: vi.fn().mockResolvedValue(undefined),
    terminateShellProcessesInDirectory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/platform/tmux-cleanup.js", () => ({
    closeTmuxWindowsForWorktree: vi.fn().mockResolvedValue(undefined),
}));

describe("RemoveCommand", () => {
    let command: RemoveCommand;
    let mockContext: CommandContext;

    beforeEach(() => {
        vi.clearAllMocks();
        command = new RemoveCommand();
        mockContext = createMockContext();
    });

    it("should require config", () => {
        expect(command.requiresConfig()).toBe(true);
    });

    it("should require git repo", () => {
        expect(command.requiresGitRepo()).toBe(true);
    });

    it("should execute prune mode", async() => {
        const options: RemoveOptions = {
            worktrees: [],
            force: false,
            prune: true,
        };

        // Mock worktrees
        const mockWorktrees = [
            {
                path: "/repo",
                branch: "refs/heads/main",
                isMain: true,
                isLocked: false,
                commit: "abc123",
            },
            {
                path: "/repo/.worktrees/feature-1",
                branch: "refs/heads/feature-1",
                isMain: false,
                isLocked: false,
                commit: "def456",
            },
            {
                path: "/repo/.worktrees/feature-2",
                branch: "refs/heads/feature-2",
                isMain: false,
                isLocked: false,
                commit: "ghi789",
            },
        ];
        mockContext.git.listWorktrees.mockResolvedValue(mockWorktrees);
        mockContext.git.getMainBranch.mockResolvedValue("main");
        mockContext.git.hasUnmergedCommits.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        mockContext.git.hasUntrackedFiles.mockResolvedValue(false);
        mockContext.git.hasUncommittedChanges.mockResolvedValue(false);
        mockContext.git.hasStagedChanges.mockResolvedValue(false);
        mockContext.git.hasStashedChanges.mockResolvedValue(false);
        mockContext.git.hasSubmoduleModifications.mockResolvedValue(false);
        mockContext.git.removeWorktree.mockResolvedValue(undefined);

        await command.executeCommand(options, mockContext);

        expect(mockContext.logger.verbose).toHaveBeenCalledWith("Finding fully merged worktrees...");
        expect(mockContext.logger.verbose).toHaveBeenCalledWith("Found 1 worktrees to prune");
        expect(mockContext.git.removeWorktree).toHaveBeenCalledWith("/repo/.worktrees/feature-1", false);
        expect(mockContext.logger.success).toHaveBeenCalledWith("Pruned worktree: feature-1");
    });

    it("should handle no worktrees to prune", async() => {
        const options: RemoveOptions = {
            worktrees: [],
            force: false,
            prune: true,
        };

        const mockWorktrees = [
            {
                path: "/repo",
                branch: "refs/heads/main",
                isMain: true,
                isLocked: false,
                commit: "abc123",
            },
        ];
        mockContext.git.listWorktrees.mockResolvedValue(mockWorktrees);
        mockContext.git.getMainBranch.mockResolvedValue("main");

        await command.executeCommand(options, mockContext);

        expect(mockContext.logger.info).toHaveBeenCalledWith("No fully merged worktrees to prune");
    });

    it("should skip locked worktrees in prune mode", async() => {
        const options: RemoveOptions = {
            worktrees: [],
            force: false,
            prune: true,
        };

        const mockWorktrees = [
            {
                path: "/repo",
                branch: "refs/heads/main",
                isMain: true,
                isLocked: false,
                commit: "abc123",
            },
            {
                path: "/repo/.worktrees/feature-1",
                branch: "refs/heads/feature-1",
                isMain: false,
                isLocked: true,
                commit: "def456",
            },
        ];
        mockContext.git.listWorktrees.mockResolvedValue(mockWorktrees);
        mockContext.git.getMainBranch.mockResolvedValue("main");

        await command.executeCommand(options, mockContext);

        expect(mockContext.git.hasUnmergedCommits).not.toHaveBeenCalled();
        expect(mockContext.logger.info).toHaveBeenCalledWith("No fully merged worktrees to prune");
    });

    it("should skip worktrees with pending changes in prune mode", async() => {
        const options: RemoveOptions = {
            worktrees: [],
            force: false,
            prune: true,
        };

        const mockWorktrees = [
            {
                path: "/repo",
                branch: "refs/heads/main",
                isMain: true,
                isLocked: false,
                commit: "abc123",
            },
            {
                path: "/repo/.worktrees/feature-1",
                branch: "refs/heads/feature-1",
                isMain: false,
                isLocked: false,
                commit: "def456",
            },
        ];
        mockContext.git.listWorktrees.mockResolvedValue(mockWorktrees);
        mockContext.git.getMainBranch.mockResolvedValue("main");
        mockContext.git.hasUnmergedCommits.mockResolvedValue(false);
        mockContext.git.hasUntrackedFiles.mockResolvedValue(true); // Has untracked files

        await command.executeCommand(options, mockContext);

        expect(mockContext.logger.verbose).toHaveBeenCalledWith("Skipping feature-1: Has untracked files");
        expect(mockContext.logger.info).toHaveBeenCalledWith("No worktrees pruned (all had pending changes)");
        expect(mockContext.git.removeWorktree).not.toHaveBeenCalled();
    });

    it("should handle worktree not found", async() => {
        const options: RemoveOptions = {
            worktrees: ["non-existent"],
            force: false,
            prune: false,
        };

        mockContext.git.getWorktreeByName.mockResolvedValue(null);

        await command.executeCommand(options, mockContext);

        expect(mockContext.logger.error).toHaveBeenCalledWith("Worktree 'non-existent' not found");
    });

    it("should prevent removing main worktree", async() => {
        const options: RemoveOptions = {
            worktrees: ["main"],
            force: false,
            prune: false,
        };

        mockContext.git.getWorktreeByName.mockResolvedValue({
            path: "/repo",
            branch: "refs/heads/main",
            isMain: true,
            isLocked: false,
            commit: "abc123",
        });

        await command.executeCommand(options, mockContext);

        expect(mockContext.logger.error).toHaveBeenCalledWith("Cannot remove main worktree");
    });

    it("should perform safety checks and fail", async() => {
        const options: RemoveOptions = {
            worktrees: ["feature-1"],
            force: false,
            prune: false,
        };

        mockContext.git.getWorktreeByName.mockResolvedValue({
            path: "/repo/.worktrees/feature-1",
            branch: "refs/heads/feature-1",
            isMain: false,
            isLocked: false,
            commit: "abc123",
        });
        mockContext.git.hasUntrackedFiles.mockResolvedValue(true);
        mockContext.git.hasUncommittedChanges.mockResolvedValue(false);
        mockContext.git.hasStagedChanges.mockResolvedValue(false);
        mockContext.git.hasUnmergedCommits.mockResolvedValue(false);
        mockContext.git.hasStashedChanges.mockResolvedValue(false);
        mockContext.git.hasSubmoduleModifications.mockResolvedValue(false);
        mockContext.git.getMainBranch.mockResolvedValue("main");

        await command.executeCommand(options, mockContext);

        expect(mockContext.logger.error).toHaveBeenCalledWith("Has untracked files");
        expect(mockContext.git.removeWorktree).not.toHaveBeenCalled();
    });

    it("should remove worktree successfully", async() => {
        const options: RemoveOptions = {
            worktrees: ["feature-1"],
            force: false,
            prune: false,
        };

        mockContext.git.getWorktreeByName.mockResolvedValue({
            path: "/repo/.worktrees/feature-1",
            branch: "refs/heads/feature-1",
            isMain: false,
            isLocked: false,
            commit: "abc123",
        });
        mockContext.git.hasUntrackedFiles.mockResolvedValue(false);
        mockContext.git.hasUncommittedChanges.mockResolvedValue(false);
        mockContext.git.hasStagedChanges.mockResolvedValue(false);
        mockContext.git.hasUnmergedCommits.mockResolvedValue(false);
        mockContext.git.hasStashedChanges.mockResolvedValue(false);
        mockContext.git.hasSubmoduleModifications.mockResolvedValue(false);
        mockContext.git.getMainBranch.mockResolvedValue("main");
        mockContext.git.removeWorktree.mockResolvedValue(undefined);

        await command.executeCommand(options, mockContext);

        expect(mockContext.git.removeWorktree).toHaveBeenCalledWith("/repo/.worktrees/feature-1", false);
        expect(mockContext.logger.info).toHaveBeenCalledWith("Removed worktree 'feature-1'");
    });

    it("should bypass safety checks with force", async() => {
        const options: RemoveOptions = {
            worktrees: ["feature-1"],
            force: true,
            prune: false,
        };

        mockContext.git.getWorktreeByName.mockResolvedValue({
            path: "/repo/.worktrees/feature-1",
            branch: "refs/heads/feature-1",
            isMain: false,
            isLocked: false,
            commit: "abc123",
        });
        mockContext.git.removeWorktree.mockResolvedValue(undefined);

        await command.executeCommand(options, mockContext);

        // Should not call any safety checks
        expect(mockContext.git.hasUntrackedFiles).not.toHaveBeenCalled();
        expect(mockContext.git.hasUncommittedChanges).not.toHaveBeenCalled();
        expect(mockContext.git.removeWorktree).toHaveBeenCalledWith("/repo/.worktrees/feature-1", true);
        expect(mockContext.logger.info).toHaveBeenCalledWith("Removed worktree 'feature-1'");
    });

    it("should perform cleanup before removal", async() => {
        const {terminateShellProcessesInDirectory} = await import("../../../src/platform/process-cleanup.js");
        const {closeTmuxWindowsForWorktree} = await import("../../../src/platform/tmux-cleanup.js");

        const options: RemoveOptions = {
            worktrees: ["feature-1"],
            force: false,
            prune: false,
        };

        mockContext.git.getWorktreeByName.mockResolvedValue({
            path: "/repo/.worktrees/feature-1",
            branch: "refs/heads/feature-1",
            isMain: false,
            isLocked: false,
            commit: "abc123",
        });
        mockContext.git.hasUntrackedFiles.mockResolvedValue(false);
        mockContext.git.hasUncommittedChanges.mockResolvedValue(false);
        mockContext.git.hasStagedChanges.mockResolvedValue(false);
        mockContext.git.hasUnmergedCommits.mockResolvedValue(false);
        mockContext.git.hasStashedChanges.mockResolvedValue(false);
        mockContext.git.hasSubmoduleModifications.mockResolvedValue(false);
        mockContext.git.getMainBranch.mockResolvedValue("main");
        mockContext.git.removeWorktree.mockResolvedValue(undefined);
        mockContext.config.tmux = true;
        mockContext.config.projectName = "test-project";

        await command.executeCommand(options, mockContext);

        expect(terminateShellProcessesInDirectory).toHaveBeenCalledWith("/repo/.worktrees/feature-1");
        expect(closeTmuxWindowsForWorktree).toHaveBeenCalledWith("test-project", "feature-1");
        expect(mockContext.logger.verbose).toHaveBeenCalledWith("Closed tmux windows");
        expect(mockContext.logger.verbose).toHaveBeenCalledWith("Terminated shell processes");
    });

    it("should change directory if removing current worktree", async() => {
        const {isCurrentProcessInWorktree, changeToMainWorktree} = await import("../../../src/platform/process-cleanup.js");
        vi.mocked(isCurrentProcessInWorktree).mockReturnValue(true);

        const options: RemoveOptions = {
            worktrees: ["feature-1"],
            force: false,
            prune: false,
        };

        mockContext.git.getWorktreeByName.mockResolvedValue({
            path: "/repo/.worktrees/feature-1",
            branch: "refs/heads/feature-1",
            isMain: false,
            isLocked: false,
            commit: "abc123",
        });
        mockContext.git.hasUntrackedFiles.mockResolvedValue(false);
        mockContext.git.hasUncommittedChanges.mockResolvedValue(false);
        mockContext.git.hasStagedChanges.mockResolvedValue(false);
        mockContext.git.hasUnmergedCommits.mockResolvedValue(false);
        mockContext.git.hasStashedChanges.mockResolvedValue(false);
        mockContext.git.hasSubmoduleModifications.mockResolvedValue(false);
        mockContext.git.getMainBranch.mockResolvedValue("main");
        mockContext.git.getMainWorktree.mockResolvedValue({
            path: "/repo",
            branch: "refs/heads/main",
            isMain: true,
            isLocked: false,
            commit: "def456",
        });
        mockContext.git.removeWorktree.mockResolvedValue(undefined);

        await command.executeCommand(options, mockContext);

        expect(isCurrentProcessInWorktree).toHaveBeenCalledWith("/repo/.worktrees/feature-1");
        expect(changeToMainWorktree).toHaveBeenCalledWith("/repo");
        expect(mockContext.logger.verbose).toHaveBeenCalledWith("Changed to main worktree before removal");
    });

    describe("validateOptions", () => {
        it("should throw if no worktrees and no prune", () => {
            const options: RemoveOptions = {
                worktrees: [],
                force: false,
                prune: false,
            };

            expect(() => {
                command.validateOptions(options);
            })
                .toThrow("No worktrees specified");
        });

        it("should throw if worktrees specified with prune", () => {
            const options: RemoveOptions = {
                worktrees: ["feature-1"],
                force: false,
                prune: true,
            };

            expect(() => {
                command.validateOptions(options);
            })
                .toThrow("Cannot specify worktrees with --prune option");
        });

        it("should validate worktree names", () => {
            const options: RemoveOptions = {
                worktrees: [""],
                force: false,
                prune: false,
            };

            expect(() => {
                command.validateOptions(options);
            })
                .toThrow("Worktree name is required");
        });

        it("should pass validation for valid options", () => {
            const options: RemoveOptions = {
                worktrees: ["feature-1", "feature-2"],
                force: false,
                prune: false,
            };

            expect(() => {
                command.validateOptions(options);
            })
                .not.toThrow();
        });

        it("should pass validation for prune only", () => {
            const options: RemoveOptions = {
                worktrees: [],
                force: false,
                prune: true,
            };

            expect(() => {
                command.validateOptions(options);
            })
                .not.toThrow();
        });
    });
});

import {beforeEach, describe, expect, it, vi} from "vitest";

import {CommandContext} from "../../../src/commands/base.js";
import {MergeCommand, MergeOptions} from "../../../src/commands/merge.js";
import * as gitModule from "../../../src/core/git.js";
import {GitError} from "../../../src/utils/errors.js";

// Create mock functions that can be changed per test
const mockQuestion = vi.fn();
const mockClose = vi.fn();

// Mock readline module
vi.mock("readline/promises", () => ({
    default: {
        createInterface: vi.fn(() => ({
            question: mockQuestion,
            close: mockClose,
        })),
    },
    createInterface: vi.fn(() => ({
        question: mockQuestion,
        close: mockClose,
    })),
}));

// Mock createGit
vi.mock("../../../src/core/git.js", async() => {
    const actual = await vi.importActual("../../../src/core/git.js");
    return {
        ... actual,
        createGit: vi.fn(),
    };
});

describe("MergeOptions", () => {
    it("should define correct option types", () => {
        const options: MergeOptions = {
            update: true,
            noFetch: false,
            force: false,
            worktree: "feature1",
            verbose: true,
            quiet: false,
        };
        expect(options).toBeDefined();
    });
});

describe("MergeCommand", () => {
    it("should require config", () => {
        const command = new MergeCommand();
        expect(command.requiresConfig()).toBe(true);
    });

    it("should require git repo", () => {
        const command = new MergeCommand();
        expect(command.requiresGitRepo()).toBe(true);
    });

    it("should validate worktree name", () => {
        const command = new MergeCommand();
        expect(() => {
            command.validateOptions({worktree: "////"});
        }).toThrow();
    });

    it("should accept valid worktree name", () => {
        const command = new MergeCommand();
        expect(() => {
            command.validateOptions({worktree: "feature-1"});
        }).not.toThrow();
    });

    it("should accept options without worktree name", () => {
        const command = new MergeCommand();
        expect(() => {
            command.validateOptions({});
        }).not.toThrow();
    });

    describe("getTargetWorktree", () => {
        it("should detect current worktree", async() => {
            const command = new MergeCommand();
            const mockGit = {
                listWorktrees: vi.fn().mockResolvedValue([
                    {path: "/main", isMain: true},
                    {path: "/worktrees/feature1", isMain: false, branch: "feature1"},
                ]),
            };
            const mockLogger = {
                verbose: vi.fn(),
            };
            const mockContext = {git: mockGit, logger: mockLogger} as unknown as CommandContext;

            // Mock process.cwd
            vi.spyOn(process, "cwd").mockReturnValue("/worktrees/feature1");

            // Mock createGit to return a git instance that returns the current branch
            const mockLocalGit = {
                getCurrentBranch: vi.fn().mockResolvedValue("feature1"),
            };
            vi.mocked(gitModule.createGit).mockReturnValue(mockLocalGit as any);

            // eslint-disable-next-line dot-notation, @typescript-eslint/dot-notation
            const result = await command["getTargetWorktree"]({}, mockContext);
            expect(result.name).toBe("feature1");
        });

        it("should throw if in main worktree", async() => {
            const command = new MergeCommand();
            const mockGit = {
                listWorktrees: vi.fn().mockResolvedValue([
                    {path: "/main", isMain: true},
                ]),
            };
            const mockContext = {git: mockGit} as unknown as CommandContext;

            vi.spyOn(process, "cwd").mockReturnValue("/main");

            // eslint-disable-next-line dot-notation, @typescript-eslint/dot-notation
            await expect(command["getTargetWorktree"]({}, mockContext))
                .rejects.toThrow("Not in a worktree");
        });

        it("should use specified worktree", async() => {
            const command = new MergeCommand();
            const mockGit = {
                getWorktreeByName: vi.fn().mockResolvedValue({
                    path: "/worktrees/feature2",
                    isMain: false,
                    branch: "feature2",
                }),
            };
            const mockContext = {git: mockGit} as unknown as CommandContext;

            // eslint-disable-next-line dot-notation, @typescript-eslint/dot-notation
            const result = await command["getTargetWorktree"](
                {worktree: "feature2"},
                mockContext,
            );
            expect(result.name).toBe("feature2");
            expect(mockGit.getWorktreeByName).toHaveBeenCalledWith("feature2");
        });

        it("should throw if specified worktree not found", async() => {
            const command = new MergeCommand();
            const mockGit = {
                getWorktreeByName: vi.fn().mockResolvedValue(null),
            };
            const mockContext = {git: mockGit} as unknown as CommandContext;

            await expect(
                // eslint-disable-next-line dot-notation, @typescript-eslint/dot-notation
                command["getTargetWorktree"]({worktree: "nonexistent"}, mockContext),
            ).rejects.toThrow("Worktree 'nonexistent' not found");
        });
    });

    describe("executeCommand", () => {
        let mockGit: any;
        let mockLogger: any;
        let mockConfig: any;
        let mockContext: CommandContext;
        let command: MergeCommand;

        beforeEach(() => {
            // Reset mock functions
            mockQuestion.mockReset();
            mockClose.mockReset();
            mockQuestion.mockResolvedValue("y"); // Default to yes for confirmation

            mockGit = {
                hasUncommittedChanges: vi.fn().mockResolvedValue(false),
                fetch: vi.fn().mockResolvedValue(undefined),
                getCurrentBranch: vi.fn().mockResolvedValue("feature1"),
                raw: vi.fn().mockResolvedValue(""),
                merge: vi.fn().mockResolvedValue({success: true, conflicts: false}),
                getConflictedFiles: vi.fn().mockResolvedValue([]),
                listWorktrees: vi.fn().mockResolvedValue([
                    {path: "/main", isMain: true, branch: "main"},
                    {path: "/worktrees/feature1", isMain: false, branch: "feature1"},
                ]),
                getWorktreeByName: vi.fn().mockResolvedValue({
                    path: "/worktrees/feature1",
                    isMain: false,
                    branch: "feature1",
                }),
            };

            // Mock createGit to return our mockGit
            vi.mocked(gitModule.createGit).mockReturnValue(mockGit);

            mockLogger = {
                verbose: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                success: vi.fn(),
            };

            mockConfig = {
                mainBranch: "main",
            };

            mockContext = {
                git: mockGit,
                logger: mockLogger,
                config: mockConfig,
            } as unknown as CommandContext;

            command = new MergeCommand();
            vi.spyOn(process, "cwd").mockReturnValue("/worktrees/feature1");
        });

        it("should merge worktree into main by default", async() => {
            await command.executeCommand({}, mockContext);

            expect(mockGit.hasUncommittedChanges).toHaveBeenCalled();
            expect(mockGit.fetch).toHaveBeenCalled();
            expect(mockGit.raw).toHaveBeenCalledWith(["checkout", "main"]);
            expect(mockGit.merge).toHaveBeenCalledWith("feature1", expect.any(String));
            expect(mockGit.raw).toHaveBeenCalledWith(["checkout", "feature1"]);
            expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining("Successfully merged"));
        });

        it("should merge main into worktree with --update", async() => {
            await command.executeCommand({update: true}, mockContext);

            // In update mode, we don't checkout since we're already in the worktree
            expect(mockGit.raw).not.toHaveBeenCalledWith(["checkout", "feature1"]);
            // The merge happens with the local git instance created by createGit
            expect(mockGit.merge).toHaveBeenCalledWith("main", expect.any(String));
            expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining("Successfully merged"));
        });

        it("should skip fetch with --no-fetch", async() => {
            await command.executeCommand({noFetch: true}, mockContext);

            expect(mockGit.fetch).not.toHaveBeenCalled();
        });

        it("should throw on uncommitted changes without --force", async() => {
            mockGit.hasUncommittedChanges.mockResolvedValue(true);

            await expect(
                command.executeCommand({}, mockContext),
            ).rejects.toThrow(GitError);
            await expect(
                command.executeCommand({}, mockContext),
            ).rejects.toThrow("Working tree has uncommitted changes");
        });

        it("should allow merge with --force despite uncommitted changes", async() => {
            mockGit.hasUncommittedChanges.mockResolvedValue(true);

            await command.executeCommand({force: true}, mockContext);

            expect(mockGit.merge).toHaveBeenCalled();
        });

        it("should handle merge conflicts", async() => {
            mockGit.merge.mockResolvedValue({success: false, conflicts: true});
            mockGit.getConflictedFiles.mockResolvedValue(["file1.txt", "file2.txt"]);

            await expect(
                command.executeCommand({}, mockContext),
            ).rejects.toThrow("Merge conflicts must be resolved manually");

            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Merge conflicts detected"));
        });

        it("should return to original branch on error", async() => {
            mockGit.merge.mockRejectedValue(new Error("Merge failed"));

            await expect(
                command.executeCommand({}, mockContext),
            ).rejects.toThrow();

            // Should attempt to return to original branch
            const checkoutCalls = mockGit.raw.mock.calls.filter(
                (call: any[]) => call[0][0] === "checkout",
            );
            expect(checkoutCalls[checkoutCalls.length - 1][0]).toEqual(["checkout", "feature1"]);
        });

        it("should handle confirmation cancellation", async() => {
            mockQuestion.mockResolvedValueOnce("n"); // User says no

            await command.executeCommand({}, mockContext);

            expect(mockGit.merge).not.toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith("Merge cancelled.");
        });

        it("should skip confirmation with WTT_NO_CONFIRM env var", async() => {
            process.env.WTT_NO_CONFIRM = "true";

            await command.executeCommand({}, mockContext);

            expect(mockGit.merge).toHaveBeenCalled();

            delete process.env.WTT_NO_CONFIRM;
        });
    });
});

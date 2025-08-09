import {describe, expect, it, vi} from "vitest";

import {CommandContext} from "../../../src/commands/base.js";
import {MergeCommand, MergeOptions} from "../../../src/commands/merge.js";

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
            const mockContext = {git: mockGit} as unknown as CommandContext;

            // Mock process.cwd
            vi.spyOn(process, "cwd").mockReturnValue("/worktrees/feature1");

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
});

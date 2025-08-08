import simpleGit from "simple-git";
import {beforeEach, describe, expect, it} from "vitest";

import {Git} from "../../../src/core/git";

// Mock simple-git
vi.mock("simple-git");

describe("Git Status Checks", () => {
    let mockGit: any;
    let git: Git;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Create mock git instance
        mockGit = {
            checkIsRepo: vi.fn(),
            status: vi.fn(),
            branch: vi.fn(),
            raw: vi.fn(),
            revparse: vi.fn(),
        };

        // Make simpleGit return our mock
        (simpleGit as any).mockReturnValue(mockGit);

        git = new Git();
    });

    describe("hasUntrackedFiles", () => {
        it("should return true when untracked files exist", async() => {
            const mockStatus = "?? untracked.txt\n";
            mockGit.raw.mockResolvedValue(mockStatus);

            const result = await git.hasUntrackedFiles("/path/to/worktree");

            expect(result).toBe(true);
            expect(simpleGit).toHaveBeenCalledWith("/path/to/worktree");
        });

        it("should return false when no untracked files", async() => {
            const mockStatus = " M modified.txt\n";
            mockGit.raw.mockResolvedValue(mockStatus);

            const result = await git.hasUntrackedFiles("/path/to/worktree");

            expect(result).toBe(false);
        });

        it("should return false for empty status", async() => {
            mockGit.raw.mockResolvedValue("");

            const result = await git.hasUntrackedFiles("/path/to/worktree");

            expect(result).toBe(false);
        });
    });

    describe("hasUncommittedChanges", () => {
        it("should return true for modified files", async() => {
            const mockStatus = " M modified.txt\n";
            mockGit.raw.mockResolvedValue(mockStatus);

            const result = await git.hasUncommittedChanges("/path/to/worktree");

            expect(result).toBe(true);
        });

        it("should return true for deleted files", async() => {
            const mockStatus = " D deleted.txt\n";
            mockGit.raw.mockResolvedValue(mockStatus);

            const result = await git.hasUncommittedChanges("/path/to/worktree");

            expect(result).toBe(true);
        });

        it("should return false when no uncommitted changes", async() => {
            const mockStatus = "?? untracked.txt\nA  added.txt\n";
            mockGit.raw.mockResolvedValue(mockStatus);

            const result = await git.hasUncommittedChanges("/path/to/worktree");

            expect(result).toBe(false);
        });
    });

    describe("hasStagedChanges", () => {
        it("should return true for staged additions", async() => {
            const mockStatus = "A  new-file.txt\n";
            mockGit.raw.mockResolvedValue(mockStatus);

            const result = await git.hasStagedChanges("/path/to/worktree");

            expect(result).toBe(true);
        });

        it("should return true for staged modifications", async() => {
            const mockStatus = "M  modified-file.txt\n";
            mockGit.raw.mockResolvedValue(mockStatus);

            const result = await git.hasStagedChanges("/path/to/worktree");

            expect(result).toBe(true);
        });

        it("should return true for staged deletions", async() => {
            const mockStatus = "D  deleted-file.txt\n";
            mockGit.raw.mockResolvedValue(mockStatus);

            const result = await git.hasStagedChanges("/path/to/worktree");

            expect(result).toBe(true);
        });

        it("should return false when no staged changes", async() => {
            const mockStatus = "?? untracked.txt\n M modified.txt\n";
            mockGit.raw.mockResolvedValue(mockStatus);

            const result = await git.hasStagedChanges("/path/to/worktree");

            expect(result).toBe(false);
        });
    });

    describe("hasSubmoduleModifications", () => {
        it("should return true when submodule is ahead", async() => {
            const mockStatus = "+c3fb96a0d6b5c2e2e6f5f5c3a2b1a0f9e8d7c6b5 lib/module (heads/main)\n";
            mockGit.raw.mockResolvedValue(mockStatus);

            const result = await git.hasSubmoduleModifications("/path/to/worktree");

            expect(result).toBe(true);
            expect(simpleGit).toHaveBeenCalledWith("/path/to/worktree");
        });

        it("should return true when submodule is behind", async() => {
            const mockStatus = "-c3fb96a0d6b5c2e2e6f5f5c3a2b1a0f9e8d7c6b5 lib/module (heads/main)\n";
            mockGit.raw.mockResolvedValue(mockStatus);

            const result = await git.hasSubmoduleModifications("/path/to/worktree");

            expect(result).toBe(true);
        });

        it("should return false when submodule is clean", async() => {
            const mockStatus = " c3fb96a0d6b5c2e2e6f5f5c3a2b1a0f9e8d7c6b5 lib/module (heads/main)\n";
            mockGit.raw.mockResolvedValue(mockStatus);

            const result = await git.hasSubmoduleModifications("/path/to/worktree");

            expect(result).toBe(false);
        });

        it("should return false when no submodules exist", async() => {
            mockGit.raw.mockResolvedValue("");

            const result = await git.hasSubmoduleModifications("/path/to/worktree");

            expect(result).toBe(false);
        });

        it("should return false on error", async() => {
            mockGit.raw.mockRejectedValue(new Error("Git error"));

            const result = await git.hasSubmoduleModifications("/path/to/worktree");

            expect(result).toBe(false);
        });
    });
});

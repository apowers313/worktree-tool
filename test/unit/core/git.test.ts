import simpleGit from "simple-git";

import {createGit, Git} from "../../../src/core/git";
import {GitError} from "../../../src/utils/errors";

// Mock simple-git
vi.mock("simple-git");

describe("Git Wrapper", () => {
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

    describe("isGitRepository", () => {
        it("should return true when in a git repository", async() => {
            mockGit.checkIsRepo.mockResolvedValue(true);

            const result = await git.isGitRepository();

            expect(result).toBe(true);
            expect(mockGit.checkIsRepo).toHaveBeenCalledTimes(1);
        });

        it("should return false when not in a git repository", async() => {
            mockGit.checkIsRepo.mockResolvedValue(false);

            const result = await git.isGitRepository();

            expect(result).toBe(false);
        });

        it("should return false when checkIsRepo throws an error", async() => {
            mockGit.checkIsRepo.mockRejectedValue(new Error("Not a git repository"));

            const result = await git.isGitRepository();

            expect(result).toBe(false);
        });
    });

    describe("getMainBranch", () => {
        it("should detect \"main\" branch when it exists", async() => {
            mockGit.status.mockResolvedValue({current: "feature"});
            mockGit.branch.mockResolvedValue({
                all: ["main", "feature", "develop"],
                current: "feature",
            });

            const result = await git.getMainBranch();

            expect(result).toBe("main");
        });

        it("should detect \"master\" branch when \"main\" does not exist", async() => {
            mockGit.status.mockResolvedValue({current: "feature"});
            mockGit.branch.mockResolvedValue({
                all: ["master", "feature", "develop"],
                current: "feature",
            });

            const result = await git.getMainBranch();

            expect(result).toBe("master");
        });

        it("should detect \"trunk\" branch", async() => {
            mockGit.status.mockResolvedValue({current: "feature"});
            mockGit.branch.mockResolvedValue({
                all: ["trunk", "feature"],
                current: "feature",
            });

            const result = await git.getMainBranch();

            expect(result).toBe("trunk");
        });

        it("should detect \"development\" branch", async() => {
            mockGit.status.mockResolvedValue({current: "feature"});
            mockGit.branch.mockResolvedValue({
                all: ["development", "feature"],
                current: "feature",
            });

            const result = await git.getMainBranch();

            expect(result).toBe("development");
        });

        it("should use git config init.defaultBranch when no common branch found", async() => {
            mockGit.status.mockResolvedValue({current: "feature"});
            mockGit.branch.mockResolvedValue({
                all: ["feature", "custom"],
                current: "feature",
            });
            mockGit.raw.mockResolvedValue("custom-main\n");

            const result = await git.getMainBranch();

            expect(result).toBe("custom-main");
            expect(mockGit.raw).toHaveBeenCalledWith(["config", "--get", "init.defaultBranch"]);
        });

        it("should detect default branch when no commits exist", async() => {
            mockGit.status.mockResolvedValue({current: null});
            mockGit.branch.mockResolvedValue({
                all: [],
                current: null,
            });
            mockGit.raw.mockImplementation((args: string[]) => {
                if (args[0] === "symbolic-ref" && args[1] === "HEAD") {
                    return Promise.resolve("refs/heads/master\n");
                }

                return Promise.reject(new Error("Command not found"));
            });

            const result = await git.getMainBranch();

            expect(result).toBe("master");
            expect(mockGit.raw).toHaveBeenCalledWith(["symbolic-ref", "HEAD"]);
        });

        it("should fall back to config when symbolic-ref fails", async() => {
            mockGit.status.mockResolvedValue({current: null});
            mockGit.branch.mockResolvedValue({
                all: [],
                current: null,
            });
            mockGit.raw.mockImplementation((args: string[]) => {
                if (args[0] === "symbolic-ref" && args[1] === "HEAD") {
                    return Promise.reject(new Error("Not a symbolic ref"));
                }

                if (args[0] === "config" && args[1] === "--get" && args[2] === "init.defaultBranch") {
                    return Promise.resolve("main\n");
                }

                return Promise.reject(new Error("Command not found"));
            });

            const result = await git.getMainBranch();

            expect(result).toBe("main");
        });

        it("should default to main when no branch info available", async() => {
            mockGit.status.mockResolvedValue({current: null});
            mockGit.branch.mockResolvedValue({
                all: [],
                current: null,
            });
            mockGit.raw.mockRejectedValue(new Error("Command failed"));

            const result = await git.getMainBranch();

            expect(result).toBe("main");
        });

        it("should throw GitError when status fails", async() => {
            mockGit.status.mockRejectedValue(new Error("Git error"));

            await expect(git.getMainBranch()).rejects.toThrow(GitError);
            await expect(git.getMainBranch()).rejects.toThrow("Failed to detect main branch");
        });
    });

    describe("createWorktree", () => {
        it("should create worktree with existing branch", async() => {
            mockGit.branch.mockResolvedValue({
                all: ["main", "feature-branch"],
                current: "main",
            });
            mockGit.raw.mockResolvedValue("");

            await git.createWorktree("/path/to/worktree", "feature-branch");

            expect(mockGit.raw).toHaveBeenCalledWith(["worktree", "add", "/path/to/worktree", "feature-branch"]);
        });

        it("should create worktree with new branch", async() => {
            mockGit.branch.mockResolvedValue({
                all: ["main"],
                current: "main",
            });
            mockGit.raw.mockResolvedValue("");

            await git.createWorktree("/path/to/worktree", "new-feature");

            expect(mockGit.raw).toHaveBeenCalledWith(["worktree", "add", "-b", "new-feature", "/path/to/worktree"]);
        });

        it("should throw GitError when worktree creation fails", async() => {
            mockGit.branch.mockResolvedValue({
                all: ["main"],
                current: "main",
            });
            mockGit.raw.mockRejectedValue(new Error("Worktree already exists"));

            await expect(git.createWorktree("/path/to/worktree", "feature"))
                .rejects.toThrow(GitError);
            await expect(git.createWorktree("/path/to/worktree", "feature"))
                .rejects.toThrow("Failed to create worktree");
        });
    });

    describe("listWorktrees", () => {
        it("should parse worktree list correctly", async() => {
            const porcelainOutput = `worktree /home/user/project
HEAD abc123def456
branch refs/heads/main

worktree /home/user/project/.worktrees/feature
HEAD 789012ghi345
branch refs/heads/feature

worktree /home/user/project/.worktrees/locked-feature
HEAD 456789jkl012
branch refs/heads/locked-feature
locked
`;

            mockGit.raw.mockResolvedValue(porcelainOutput);

            const result = await git.listWorktrees();

            expect(result).toHaveLength(3);

            expect(result[0]).toEqual({
                path: "/home/user/project",
                commit: "abc123def456",
                branch: "refs/heads/main",
                isMain: true,
                isLocked: false,
            });

            expect(result[1]).toEqual({
                path: "/home/user/project/.worktrees/feature",
                commit: "789012ghi345",
                branch: "refs/heads/feature",
                isMain: false,
                isLocked: false,
            });

            expect(result[2]).toEqual({
                path: "/home/user/project/.worktrees/locked-feature",
                commit: "456789jkl012",
                branch: "refs/heads/locked-feature",
                isMain: false,
                isLocked: true,
            });
        });

        it("should return empty array when no worktrees", async() => {
            mockGit.raw.mockResolvedValue("");

            const result = await git.listWorktrees();

            expect(result).toEqual([]);
        });

        it("should handle bare repository", async() => {
            const porcelainOutput = `worktree /home/user/repo.git
bare
`;

            mockGit.raw.mockResolvedValue(porcelainOutput);

            const result = await git.listWorktrees();

            expect(result).toHaveLength(1);
            expect(result[0]?.isMain).toBe(true);
        });

        it("should throw GitError when listing fails", async() => {
            mockGit.raw.mockRejectedValue(new Error("Git command failed"));

            await expect(git.listWorktrees()).rejects.toThrow(GitError);
            await expect(git.listWorktrees()).rejects.toThrow("Failed to list worktrees");
        });
    });

    describe("getRepoRoot", () => {
        it("should return repository root path", async() => {
            mockGit.revparse.mockResolvedValue("/home/user/project\n");

            const result = await git.getRepoRoot();

            expect(result).toBe("/home/user/project");
            expect(mockGit.revparse).toHaveBeenCalledWith(["--show-toplevel"]);
        });

        it("should throw GitError when not in a repository", async() => {
            mockGit.revparse.mockRejectedValue(new Error("Not in a git repository"));

            await expect(git.getRepoRoot()).rejects.toThrow(GitError);
            await expect(git.getRepoRoot()).rejects.toThrow("Failed to get repository root");
        });
    });

    describe("branchExists", () => {
        it("should return true when branch exists", async() => {
            mockGit.branch.mockResolvedValue({
                all: ["main", "feature", "develop"],
                current: "main",
            });

            const result = await git.branchExists("feature");

            expect(result).toBe(true);
        });

        it("should return false when branch does not exist", async() => {
            mockGit.branch.mockResolvedValue({
                all: ["main", "develop"],
                current: "main",
            });

            const result = await git.branchExists("feature");

            expect(result).toBe(false);
        });

        it("should throw GitError when branch check fails", async() => {
            mockGit.branch.mockRejectedValue(new Error("Git error"));

            await expect(git.branchExists("feature")).rejects.toThrow(GitError);
            await expect(git.branchExists("feature")).rejects.toThrow("Failed to check branch existence");
        });
    });

    describe("getWorktreeByName", () => {
        it("should find worktree by exact branch name", async() => {
            mockGit.raw.mockResolvedValue("worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo/.worktrees/feature-1\nHEAD def\nbranch refs/heads/feature-1\n");

            const result = await git.getWorktreeByName("feature-1");

            expect(result).toBeTruthy();
            expect(result?.branch).toBe("refs/heads/feature-1");
            expect(result?.path).toBe("/repo/.worktrees/feature-1");
        });

        it("should find worktree by directory name", async() => {
            mockGit.raw.mockResolvedValue("worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo/.worktrees/my-feature\nHEAD def\nbranch refs/heads/feature/xyz\n");

            const result = await git.getWorktreeByName("my-feature");

            expect(result).toBeTruthy();
            expect(result?.branch).toBe("refs/heads/feature/xyz");
            expect(result?.path).toBe("/repo/.worktrees/my-feature");
        });

        it("should return null if worktree not found", async() => {
            mockGit.raw.mockResolvedValue("");

            const result = await git.getWorktreeByName("nonexistent");

            expect(result).toBeNull();
        });

        it("should throw GitError on failure", async() => {
            mockGit.raw.mockRejectedValue(new Error("Git error"));

            await expect(git.getWorktreeByName("test")).rejects.toThrow(GitError);
            await expect(git.getWorktreeByName("test")).rejects.toThrow("Failed to find worktree");
        });
    });

    describe("getMainWorktree", () => {
        it("should return the main worktree", async() => {
            mockGit.raw.mockResolvedValue("worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo/.worktrees/feature-1\nHEAD def\nbranch refs/heads/feature-1\n");

            const result = await git.getMainWorktree();

            expect(result).toBeTruthy();
            expect(result.isMain).toBe(true);
            expect(result.path).toBe("/repo");
        });

        it("should throw error if main worktree not found", async() => {
            mockGit.raw.mockResolvedValue("");

            await expect(git.getMainWorktree()).rejects.toThrow(GitError);
            await expect(git.getMainWorktree()).rejects.toThrow("Could not find main worktree");
        });
    });

    describe("hasUnmergedCommits", () => {
        it("should return true when branch has unmerged commits", async() => {
            mockGit.raw.mockResolvedValue("3\n");

            const result = await git.hasUnmergedCommits("feature", "main");

            expect(result).toBe(true);
            expect(mockGit.raw).toHaveBeenCalledWith([
                "rev-list",
                "main..feature",
                "--count",
            ]);
        });

        it("should return false when branch is fully merged", async() => {
            mockGit.raw.mockResolvedValue("0\n");

            const result = await git.hasUnmergedCommits("feature", "main");

            expect(result).toBe(false);
        });

        it("should return true on error", async() => {
            mockGit.raw.mockRejectedValue(new Error("Branch not found"));

            const result = await git.hasUnmergedCommits("nonexistent", "main");

            expect(result).toBe(true);
        });
    });

    describe("hasStashedChanges", () => {
        it("should return true when branch has stashes", async() => {
            mockGit.stashList = vi.fn().mockResolvedValue({
                all: [
                    {message: "WIP on feature-branch: 123abc Fix bug"},
                    {message: "On main: 456def Update docs"},
                ],
            });

            const result = await git.hasStashedChanges("feature-branch");

            expect(result).toBe(true);
            expect(mockGit.stashList).toHaveBeenCalled();
        });

        it("should return false when branch has no stashes", async() => {
            mockGit.stashList = vi.fn().mockResolvedValue({
                all: [
                    {message: "WIP on other-branch: 123abc Fix bug"},
                    {message: "On main: 456def Update docs"},
                ],
            });

            const result = await git.hasStashedChanges("feature-branch");

            expect(result).toBe(false);
        });

        it("should return false when stash list is empty", async() => {
            mockGit.stashList = vi.fn().mockResolvedValue({
                all: [],
            });

            const result = await git.hasStashedChanges("feature-branch");

            expect(result).toBe(false);
        });

        it("should handle stashes with capital On", async() => {
            mockGit.stashList = vi.fn().mockResolvedValue({
                all: [
                    {message: "On feature-branch: 123abc Fix bug"},
                ],
            });

            const result = await git.hasStashedChanges("feature-branch");

            expect(result).toBe(true);
        });

        it("should handle stashes without message", async() => {
            mockGit.stashList = vi.fn().mockResolvedValue({
                all: [
                    {message: null},
                    {message: undefined},
                    {message: ""},
                ],
            });

            const result = await git.hasStashedChanges("feature-branch");

            expect(result).toBe(false);
        });

        it("should return false on error", async() => {
            mockGit.stashList = vi.fn().mockRejectedValue(new Error("Git error"));

            const result = await git.hasStashedChanges("feature-branch");

            expect(result).toBe(false);
        });
    });

    describe("removeWorktree", () => {
        it("should remove worktree without force", async() => {
            mockGit.raw.mockResolvedValue("");

            await git.removeWorktree("/path/to/worktree");

            expect(mockGit.raw).toHaveBeenCalledWith(["worktree", "remove", "/path/to/worktree"]);
        });

        it("should remove worktree with force", async() => {
            mockGit.raw.mockResolvedValue("");

            await git.removeWorktree("/path/to/worktree", true);

            expect(mockGit.raw).toHaveBeenCalledWith(["worktree", "remove", "--force", "/path/to/worktree"]);
        });

        it("should throw GitError when removal fails", async() => {
            mockGit.raw.mockRejectedValue(new Error("Worktree is dirty"));

            await expect(git.removeWorktree("/path/to/worktree"))
                .rejects.toThrow(GitError);
            await expect(git.removeWorktree("/path/to/worktree"))
                .rejects.toThrow("Failed to remove worktree");
        });
    });

    describe("createGit", () => {
        it("should create Git instance with default directory", () => {
            const gitInstance = createGit();

            expect(gitInstance).toBeInstanceOf(Git);
            expect(simpleGit).toHaveBeenCalledWith(undefined);
        });

        it("should create Git instance with specified directory", () => {
            const gitInstance = createGit("/custom/path");

            expect(gitInstance).toBeInstanceOf(Git);
            expect(simpleGit).toHaveBeenCalledWith("/custom/path");
        });
    });
});

import simpleGit from "simple-git";

import {Git} from "../../../src/core/git";

// Mock simple-git
vi.mock("simple-git");

describe("Git Conflict Detection", () => {
    let mockGit: any;
    let git: Git;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Create mock git instance
        mockGit = {
            raw: vi.fn(),
        };

        // Make simpleGit return our mock
        (simpleGit as any).mockReturnValue(mockGit);

        git = new Git();
    });

    describe("hasConflicts", () => {
        it("should return true when merge-tree shows conflicts", async() => {
            // Mock merge-base
            mockGit.raw.mockImplementation((args: string[]) => {
                if (args.includes("merge-base")) {
                    return Promise.resolve("abc123\n");
                }

                if (args.includes("merge-tree")) {
                    return Promise.resolve(`
100644 blob abc123 test.txt
100644 blob def456 test.txt
100644 blob ghi789 test.txt
<<<<<<< HEAD
boom
=======
bar
>>>>>>> main
`);
                }

                return Promise.reject(new Error("Unknown command"));
            });

            const result = await git.hasConflicts("/path/to/worktree", "main");

            expect(result).toBe(true);
            expect(mockGit.raw).toHaveBeenCalledWith(["-C", "/path/to/worktree", "merge-base", "HEAD", "main"]);
            expect(mockGit.raw).toHaveBeenCalledWith(["-C", "/path/to/worktree", "merge-tree", "abc123", "HEAD", "main"]);
        });

        it("should return false when merge-tree shows no conflicts", async() => {
            mockGit.raw.mockImplementation((args: string[]) => {
                if (args.includes("merge-base")) {
                    return Promise.resolve("abc123\n");
                }

                if (args.includes("merge-tree")) {
                    return Promise.resolve(`
100644 blob abc123 test.txt
100644 blob def456 other.txt
`);
                }

                return Promise.reject(new Error("Unknown command"));
            });

            const result = await git.hasConflicts("/path/to/worktree", "main");

            expect(result).toBe(false);
        });

        it("should return false when no merge base is found", async() => {
            mockGit.raw.mockImplementation((args: string[]) => {
                if (args.includes("merge-base")) {
                    return Promise.reject(new Error("No merge base"));
                }

                return Promise.resolve("");
            });

            const result = await git.hasConflicts("/path/to/worktree", "main");

            expect(result).toBe(false);
            expect(mockGit.raw).toHaveBeenCalledTimes(1);
        });

        it("should return false when branches are identical", async() => {
            mockGit.raw.mockImplementation((args: string[]) => {
                if (args.includes("merge-base")) {
                    return Promise.resolve("abc123\n");
                }

                if (args.includes("merge-tree")) {
                    // Empty output means no differences
                    return Promise.resolve("");
                }

                return Promise.reject(new Error("Unknown command"));
            });

            const result = await git.hasConflicts("/path/to/worktree", "main");

            expect(result).toBe(false);
        });

        it("should handle git command errors gracefully", async() => {
            mockGit.raw.mockRejectedValue(new Error("Git command failed"));

            const result = await git.hasConflicts("/path/to/worktree", "main");

            expect(result).toBe(false);
        });
    });

    describe("raw", () => {
        it("should pass through raw git commands", async() => {
            const expectedOutput = "file1.txt\nfile2.txt\n";
            mockGit.raw.mockResolvedValue(expectedOutput);

            const result = await git.raw(["-C", "/path", "diff", "--name-only", "main"]);

            expect(result).toBe(expectedOutput);
            expect(mockGit.raw).toHaveBeenCalledWith(["-C", "/path", "diff", "--name-only", "main"]);
        });

        it("should propagate errors from raw commands", async() => {
            const error = new Error("Command failed");
            mockGit.raw.mockRejectedValue(error);

            await expect(git.raw(["invalid", "command"])).rejects.toThrow("Command failed");
        });
    });
});

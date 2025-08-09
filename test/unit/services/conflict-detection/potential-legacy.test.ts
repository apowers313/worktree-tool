import simpleGit from "simple-git";
import {vi} from "vitest";

import {detectPotentialConflictsLegacy} from "../../../../src/services/conflict-detection/potential-legacy";

vi.mock("simple-git");

describe("Legacy Potential Conflict Detection", () => {
    let mockGit: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGit = {
            branch: vi.fn(),
            status: vi.fn(),
            stash: vi.fn(),
            merge: vi.fn(),
            raw: vi.fn(),
        };
        (simpleGit as any).mockReturnValue(mockGit);
    });

    it("should return null if on target branch", async() => {
        mockGit.branch.mockResolvedValue({
            current: "main",
        });

        const result = await detectPotentialConflictsLegacy("/test/repo", "main");
        expect(result).toBeNull();
    });

    it("should handle clean merge without stashing", async() => {
        mockGit.branch.mockResolvedValue({
            current: "feature",
        });
        mockGit.status.mockResolvedValue({
            isClean: () => true,
        });
        mockGit.merge.mockResolvedValue({}); // Merge succeeds
        mockGit.raw.mockResolvedValue(""); // Abort succeeds

        const result = await detectPotentialConflictsLegacy("/test/repo", "main");
        expect(result).toBeNull();
        expect(mockGit.stash).not.toHaveBeenCalled();
    });

    it("should detect conflicts and stash uncommitted changes", async() => {
        mockGit.branch.mockResolvedValue({
            current: "feature",
        });
        mockGit.status
            .mockResolvedValueOnce({
                isClean: () => false, // Has uncommitted changes
            })
            .mockResolvedValueOnce({
                conflicted: ["file1.txt", "file2.txt"],
            });
        mockGit.merge.mockRejectedValue(new Error("Merge conflict"));
        mockGit.stash.mockResolvedValue({});

        const result = await detectPotentialConflictsLegacy("/test/repo", "main");
        expect(result).not.toBeNull();
        expect(result?.type).toBe("potential");
        expect(result?.files).toEqual(["file1.txt", "file2.txt"]);
        expect(result?.count).toBe(2);

        // Check stash was used
        expect(mockGit.stash).toHaveBeenCalledWith(["push", "-m", "wtt-conflict-check"]);
        expect(mockGit.stash).toHaveBeenCalledWith(["pop"]);
    });

    it("should handle errors gracefully", async() => {
        mockGit.branch.mockRejectedValue(new Error("Git error"));

        const result = await detectPotentialConflictsLegacy("/test/repo", "main");
        expect(result).toBeNull();
    });
});

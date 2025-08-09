import simpleGit from "simple-git";
import {vi} from "vitest";

import {detectPotentialConflictsModern} from "../../../../src/services/conflict-detection/potential-modern";

vi.mock("simple-git");

describe("Modern Potential Conflict Detection", () => {
    let mockGit: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGit = {
            branch: vi.fn(),
            raw: vi.fn(),
        };
        (simpleGit as any).mockReturnValue(mockGit);
    });

    it("should return null if on target branch", async() => {
        mockGit.branch.mockResolvedValue({
            current: "main",
        });

        const result = await detectPotentialConflictsModern("/test/repo", "main");
        expect(result).toBeNull();
    });

    it("should return null if no conflicts", async() => {
        mockGit.branch.mockResolvedValue({
            current: "feature",
        });
        mockGit.raw
            .mockResolvedValueOnce("abc123\n") // merge-base
            .mockResolvedValueOnce("tree-hash\n"); // merge-tree succeeds

        const result = await detectPotentialConflictsModern("/test/repo", "main");
        expect(result).toBeNull();
    });

    it("should detect potential conflicts", async() => {
        mockGit.branch.mockResolvedValue({
            current: "feature",
        });
        mockGit.raw
            .mockResolvedValueOnce("abc123\n") // merge-base
            .mockRejectedValueOnce({
                exitCode: 1,
                stdOut: "+++ file1.txt\n<<<<<<< ours\ncontent\n=======\nother\n>>>>>>> theirs\n",
            });

        const result = await detectPotentialConflictsModern("/test/repo", "main");
        expect(result).not.toBeNull();
        expect(result?.type).toBe("potential");
        expect(result?.files).toContain("file1.txt");
    });

    it("should handle merge-tree errors", async() => {
        mockGit.branch.mockResolvedValue({
            current: "feature",
        });
        mockGit.raw
            .mockResolvedValueOnce("abc123\n") // merge-base
            .mockRejectedValueOnce({
                exitCode: 128, // Other error
            });

        const result = await detectPotentialConflictsModern("/test/repo", "main");
        expect(result).toBeNull();
    });
});

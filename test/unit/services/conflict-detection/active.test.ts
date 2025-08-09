import simpleGit from "simple-git";
import {vi} from "vitest";

import {detectActiveConflicts} from "../../../../src/services/conflict-detection/active";

vi.mock("simple-git");

describe("Active Conflict Detection", () => {
    let mockGit: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGit = {
            status: vi.fn(),
            raw: vi.fn(),
        };
        (simpleGit as any).mockReturnValue(mockGit);
    });

    it("should detect no conflicts in clean repo", async() => {
        mockGit.status.mockResolvedValue({
            conflicted: [],
        });

        const result = await detectActiveConflicts("/test/repo");
        expect(result).toBeNull();
    });

    it("should detect UU conflicts", async() => {
        mockGit.status.mockResolvedValue({
            conflicted: ["file1.txt"],
        });
        mockGit.raw.mockResolvedValue("UU file1.txt");

        const result = await detectActiveConflicts("/test/repo");
        expect(result).not.toBeNull();
        expect(result?.type).toBe("active");
        expect(result?.files).toEqual(["file1.txt"]);
        expect(result?.count).toBe(1);
        expect(result?.details?.bothModified).toBe(1);
    });

    it("should detect multiple conflict types", async() => {
        mockGit.status.mockResolvedValue({
            conflicted: ["file1.txt", "file2.txt", "file3.txt"],
        });
        mockGit.raw
            .mockResolvedValueOnce("UU file1.txt")
            .mockResolvedValueOnce("AA file2.txt")
            .mockResolvedValueOnce("DU file3.txt");

        const result = await detectActiveConflicts("/test/repo");
        expect(result).not.toBeNull();
        expect(result?.count).toBe(3);
        expect(result?.details?.bothModified).toBe(1);
        expect(result?.details?.bothAdded).toBe(1);
        expect(result?.details?.deletedByUs).toBe(1);
    });

    it("should handle errors gracefully", async() => {
        mockGit.status.mockRejectedValue(new Error("Not a git repository"));

        const result = await detectActiveConflicts("/test/repo");
        expect(result).toBeNull();
    });
});

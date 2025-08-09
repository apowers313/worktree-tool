import {vi} from "vitest";

import {clearGitVersionCache, detectConflicts} from "../../../../src/services/conflict-detection";
import * as activeModule from "../../../../src/services/conflict-detection/active";
import * as legacyModule from "../../../../src/services/conflict-detection/potential-legacy";
import * as modernModule from "../../../../src/services/conflict-detection/potential-modern";
import * as gitVersionModule from "../../../../src/utils/git-version";

vi.mock("../../../../src/services/conflict-detection/active");
vi.mock("../../../../src/services/conflict-detection/potential-legacy");
vi.mock("../../../../src/services/conflict-detection/potential-modern");
vi.mock("../../../../src/utils/git-version");

describe("Conflict Detection Integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitVersionCache();
    });

    it("should detect both active and potential conflicts", async() => {
        const activeConflicts = {
            type: "active" as const,
            files: ["conflict1.txt"],
            count: 1,
        };
        const potentialConflicts = {
            type: "potential" as const,
            files: ["future-conflict.txt"],
            count: 1,
        };

        vi.mocked(activeModule.detectActiveConflicts).mockResolvedValue(activeConflicts);
        vi.mocked(modernModule.detectPotentialConflictsModern).mockResolvedValue(potentialConflicts);
        vi.mocked(gitVersionModule.getGitVersion).mockResolvedValue({
            major: 2,
            minor: 39,
            patch: 0,
        });
        vi.mocked(gitVersionModule.supportsModernMergeTree).mockReturnValue(true);

        const result = await detectConflicts("/test/repo", "main");

        expect(result.active).toEqual(activeConflicts);
        expect(result.potential).toEqual(potentialConflicts);
        expect(modernModule.detectPotentialConflictsModern).toHaveBeenCalledWith("/test/repo", "main");
        expect(legacyModule.detectPotentialConflictsLegacy).not.toHaveBeenCalled();
    });

    it("should use legacy detection for older Git versions", async() => {
        const potentialConflicts = {
            type: "potential" as const,
            files: ["legacy-conflict.txt"],
            count: 1,
        };

        vi.mocked(activeModule.detectActiveConflicts).mockResolvedValue(null);
        vi.mocked(legacyModule.detectPotentialConflictsLegacy).mockResolvedValue(potentialConflicts);
        vi.mocked(gitVersionModule.getGitVersion).mockResolvedValue({
            major: 2,
            minor: 37,
            patch: 0,
        });
        vi.mocked(gitVersionModule.supportsModernMergeTree).mockReturnValue(false);

        const result = await detectConflicts("/test/repo", "main");

        expect(result.active).toBeUndefined();
        expect(result.potential).toEqual(potentialConflicts);
        expect(legacyModule.detectPotentialConflictsLegacy).toHaveBeenCalledWith("/test/repo", "main");
        expect(modernModule.detectPotentialConflictsModern).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async() => {
        vi.mocked(activeModule.detectActiveConflicts).mockResolvedValue(null);
        vi.mocked(gitVersionModule.getGitVersion).mockRejectedValue(new Error("Git error"));

        const result = await detectConflicts("/test/repo", "main");

        expect(result).toEqual({});
    });

    it("should cache git version", async() => {
        vi.mocked(activeModule.detectActiveConflicts).mockResolvedValue(null);
        vi.mocked(gitVersionModule.getGitVersion).mockResolvedValue({
            major: 2,
            minor: 39,
            patch: 0,
        });
        vi.mocked(gitVersionModule.supportsModernMergeTree).mockReturnValue(true);

        // First call
        await detectConflicts("/test/repo", "main");
        // Second call
        await detectConflicts("/test/repo", "main");

        // Git version should only be fetched once
        expect(gitVersionModule.getGitVersion).toHaveBeenCalledTimes(1);
    });
});

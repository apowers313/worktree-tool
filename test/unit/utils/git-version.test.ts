import simpleGit from "simple-git";
import {vi} from "vitest";

import {getGitVersion, supportsModernMergeTree} from "../../../src/utils/git-version";

vi.mock("simple-git");

describe("Git Version Utils", () => {
    let mockGit: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGit = {
            raw: vi.fn(),
        };
        (simpleGit as any).mockReturnValue(mockGit);
    });

    describe("getGitVersion", () => {
        it("should parse git version correctly", async() => {
            mockGit.raw.mockResolvedValue("git version 2.39.1");

            const version = await getGitVersion();
            expect(version).toEqual({
                major: 2,
                minor: 39,
                patch: 1,
            });
            expect(mockGit.raw).toHaveBeenCalledWith(["--version"]);
        });

        it("should parse git version with additional info", async() => {
            mockGit.raw.mockResolvedValue("git version 2.38.0.windows.1");

            const version = await getGitVersion();
            expect(version).toEqual({
                major: 2,
                minor: 38,
                patch: 0,
            });
        });

        it("should throw error for unparseable version", async() => {
            mockGit.raw.mockResolvedValue("invalid version string");

            await expect(getGitVersion()).rejects.toThrow("Unable to parse git version");
        });
    });

    describe("supportsModernMergeTree", () => {
        it("should detect modern merge-tree support for 2.38+", () => {
            expect(supportsModernMergeTree({major: 2, minor: 38, patch: 0})).toBe(true);
            expect(supportsModernMergeTree({major: 2, minor: 39, patch: 0})).toBe(true);
            expect(supportsModernMergeTree({major: 2, minor: 40, patch: 0})).toBe(true);
        });

        it("should detect modern merge-tree support for 3.x", () => {
            expect(supportsModernMergeTree({major: 3, minor: 0, patch: 0})).toBe(true);
            expect(supportsModernMergeTree({major: 3, minor: 1, patch: 0})).toBe(true);
        });

        it("should detect no support for older versions", () => {
            expect(supportsModernMergeTree({major: 2, minor: 37, patch: 0})).toBe(false);
            expect(supportsModernMergeTree({major: 2, minor: 30, patch: 0})).toBe(false);
            expect(supportsModernMergeTree({major: 1, minor: 9, patch: 0})).toBe(false);
        });
    });
});

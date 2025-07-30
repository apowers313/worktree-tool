import {promises as fs} from "fs";

import {
    detectProjectName,
    findPackageJson,
    isValidGitBranchName,
    sanitizeGitBranchName,
    sanitizeProjectName} from "../../../src/utils/project";

// Mock fs module
jest.mock("fs", () => ({
    promises: {
        readFile: jest.fn(),
        access: jest.fn(),
    },
}));

describe("Project Detection", () => {
    const mockFs = fs as jest.Mocked<typeof fs>;
    const originalCwd = process.cwd();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(process, "cwd").mockReturnValue("/home/user/my-project");
    });

    afterEach(() => {
        jest.spyOn(process, "cwd").mockReturnValue(originalCwd);
    });

    describe("detectProjectName", () => {
        it("should use name from package.json if available", async() => {
            mockFs.access.mockResolvedValueOnce(); // package.json exists
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                name: "@myorg/awesome-project",
                version: "1.0.0",
            }));

            const name = await detectProjectName();

            expect(name).toBe("awesome-project");
            expect(mockFs.readFile).toHaveBeenCalledWith(
                "/home/user/my-project/package.json",
                "utf-8",
            );
        });

        it("should handle package.json without scope", async() => {
            mockFs.access.mockResolvedValueOnce();
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                name: "simple-project",
            }));

            const name = await detectProjectName();

            expect(name).toBe("simple-project");
        });

        it("should fall back to directory name if package.json not found", async() => {
            mockFs.access.mockRejectedValue(new Error("ENOENT"));

            const name = await detectProjectName();

            expect(name).toBe("my-project");
        });

        it("should fall back to directory name if package.json has no name", async() => {
            mockFs.access.mockResolvedValueOnce();
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                version: "1.0.0",
                description: "A project without a name",
            }));

            const name = await detectProjectName();

            expect(name).toBe("my-project");
        });

        it("should fall back to directory name if package.json is invalid", async() => {
            mockFs.access.mockResolvedValueOnce();
            mockFs.readFile.mockResolvedValue("{ invalid json");

            const name = await detectProjectName();

            expect(name).toBe("my-project");
        });

        it("should sanitize the detected name", async() => {
            mockFs.access.mockResolvedValueOnce();
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                name: "My Awesome Project!",
            }));

            const name = await detectProjectName();

            expect(name).toBe("My-Awesome-Project");
        });

        it("should work with custom directory", async() => {
            mockFs.access.mockRejectedValue(new Error("ENOENT"));

            const name = await detectProjectName("/custom/path/different-project");

            expect(name).toBe("different-project");
        });
    });

    describe("findPackageJson", () => {
        it("should find package.json in current directory", async() => {
            mockFs.access.mockResolvedValueOnce();

            const result = await findPackageJson("/home/user/project");

            expect(result).toBe("/home/user/project/package.json");
            expect(mockFs.access).toHaveBeenCalledWith("/home/user/project/package.json");
        });

        it("should find package.json in parent directory", async() => {
            mockFs.access
                .mockRejectedValueOnce(new Error("ENOENT")) // Not in /home/user/project/src/components
                .mockRejectedValueOnce(new Error("ENOENT")) // Not in /home/user/project/src
                .mockResolvedValueOnce(); // Found in /home/user/project

            const result = await findPackageJson("/home/user/project/src/components");

            expect(result).toBe("/home/user/project/package.json");
        });

        it("should search up to root directory", async() => {
            // Mock all directories not having package.json until root
            mockFs.access.mockRejectedValue(new Error("ENOENT"));

            const result = await findPackageJson("/home/user/project/deep/nested/path");

            expect(result).toBeNull();
            // Should have checked multiple directories
            expect(mockFs.access.mock.calls.length).toBeGreaterThan(3);
        });

        it("should find package.json at root", async() => {
            mockFs.access
                .mockRejectedValueOnce(new Error("ENOENT")) // Not in /home
                .mockResolvedValueOnce(); // Found at /

            const result = await findPackageJson("/home");

            expect(result).toBe("/package.json");
        });

        it("should return null if no package.json found", async() => {
            mockFs.access.mockRejectedValue(new Error("ENOENT"));

            const result = await findPackageJson("/home/user/project");

            expect(result).toBeNull();
        });
    });

    describe("sanitizeProjectName", () => {
        it("should remove npm scope", () => {
            expect(sanitizeProjectName("@myorg/package")).toBe("package");
            expect(sanitizeProjectName("@org/name")).toBe("name");
        });

        it("should keep simple names unchanged", () => {
            expect(sanitizeProjectName("my-project")).toBe("my-project");
            expect(sanitizeProjectName("project_name")).toBe("project_name");
            expect(sanitizeProjectName("project123")).toBe("project123");
        });

        it("should replace spaces with hyphens", () => {
            expect(sanitizeProjectName("my project")).toBe("my-project");
            expect(sanitizeProjectName("my   project")).toBe("my-project");
        });

        it("should replace special characters with hyphens", () => {
            expect(sanitizeProjectName("my!project")).toBe("my-project");
            expect(sanitizeProjectName("my@#$project")).toBe("my-project");
            expect(sanitizeProjectName("my.project")).toBe("my-project");
        });

        it("should remove leading and trailing hyphens", () => {
            expect(sanitizeProjectName("-project-")).toBe("project");
            expect(sanitizeProjectName("---project---")).toBe("project");
        });

        it("should replace multiple hyphens with single hyphen", () => {
            expect(sanitizeProjectName("my---project")).toBe("my-project");
            expect(sanitizeProjectName("my----awesome----project")).toBe("my-awesome-project");
        });

        it("should handle empty or invalid names", () => {
            expect(sanitizeProjectName("")).toBe("project");
            expect(sanitizeProjectName("---")).toBe("project");
            expect(sanitizeProjectName("@#$%")).toBe("project");
        });

        it("should prefix names starting with numbers", () => {
            expect(sanitizeProjectName("123project")).toBe("p-123project");
            expect(sanitizeProjectName("1-my-project")).toBe("p-1-my-project");
        });

        it("should handle scope without slash correctly", () => {
            expect(sanitizeProjectName("@myorg")).toBe("myorg");
        });
    });

    describe("isValidGitBranchName", () => {
        it("should accept valid branch names", () => {
            expect(isValidGitBranchName("feature-branch")).toBe(true);
            expect(isValidGitBranchName("feature/new")).toBe(true);
            expect(isValidGitBranchName("bugfix-123")).toBe(true);
            expect(isValidGitBranchName("release-1.0.0")).toBe(true);
        });

        it("should reject empty or @ names", () => {
            expect(isValidGitBranchName("")).toBe(false);
            expect(isValidGitBranchName("@")).toBe(false);
        });

        it("should reject names starting or ending with dot", () => {
            expect(isValidGitBranchName(".branch")).toBe(false);
            expect(isValidGitBranchName("branch.")).toBe(false);
            expect(isValidGitBranchName(".branch.")).toBe(false);
        });

        it("should reject names containing double dots", () => {
            expect(isValidGitBranchName("feature..branch")).toBe(false);
            expect(isValidGitBranchName("a..b")).toBe(false);
        });

        it("should reject names ending with .lock", () => {
            expect(isValidGitBranchName("branch.lock")).toBe(false);
            expect(isValidGitBranchName("feature.lock")).toBe(false);
        });

        it("should reject names with invalid characters", () => {
            expect(isValidGitBranchName("feature branch")).toBe(false); // space
            expect(isValidGitBranchName("feature~branch")).toBe(false); // tilde
            expect(isValidGitBranchName("feature^branch")).toBe(false); // caret
            expect(isValidGitBranchName("feature:branch")).toBe(false); // colon
            expect(isValidGitBranchName("feature?branch")).toBe(false); // question
            expect(isValidGitBranchName("feature*branch")).toBe(false); // asterisk
            expect(isValidGitBranchName("feature[branch")).toBe(false); // bracket
            expect(isValidGitBranchName("feature\\branch")).toBe(false); // backslash
        });

        it("should reject names with control characters", () => {
            expect(isValidGitBranchName("feature\x00branch")).toBe(false);
            expect(isValidGitBranchName("feature\x1Fbranch")).toBe(false);
            expect(isValidGitBranchName("feature\x7Fbranch")).toBe(false);
        });
    });

    describe("sanitizeGitBranchName", () => {
        it("should replace spaces with hyphens", () => {
            expect(sanitizeGitBranchName("feature branch")).toBe("feature-branch");
            expect(sanitizeGitBranchName("my awesome feature")).toBe("my-awesome-feature");
        });

        it("should remove invalid characters", () => {
            expect(sanitizeGitBranchName("feature~branch")).toBe("featurebranch");
            expect(sanitizeGitBranchName("feature^branch")).toBe("featurebranch");
            expect(sanitizeGitBranchName("feature:branch")).toBe("featurebranch");
            expect(sanitizeGitBranchName("feature?branch")).toBe("featurebranch");
            expect(sanitizeGitBranchName("feature*branch")).toBe("featurebranch");
            expect(sanitizeGitBranchName("feature[branch]")).toBe("featurebranch");
            expect(sanitizeGitBranchName("feature\\branch")).toBe("featurebranch");
        });

        it("should remove leading and trailing dots", () => {
            expect(sanitizeGitBranchName(".feature")).toBe("feature");
            expect(sanitizeGitBranchName("feature.")).toBe("feature");
            expect(sanitizeGitBranchName("...feature...")).toBe("feature");
        });

        it("should replace double dots with hyphen", () => {
            expect(sanitizeGitBranchName("feature..branch")).toBe("feature-branch");
            expect(sanitizeGitBranchName("a...b")).toBe("a-b");
        });

        it("should remove .lock suffix", () => {
            expect(sanitizeGitBranchName("branch.lock")).toBe("branch");
            expect(sanitizeGitBranchName("feature.lock")).toBe("feature");
        });

        it("should handle multiple consecutive hyphens", () => {
            expect(sanitizeGitBranchName("feature---branch")).toBe("feature-branch");
            expect(sanitizeGitBranchName("a----b----c")).toBe("a-b-c");
        });

        it("should remove leading and trailing hyphens", () => {
            expect(sanitizeGitBranchName("-feature-")).toBe("feature");
            expect(sanitizeGitBranchName("---feature---")).toBe("feature");
        });

        it("should handle empty or invalid input", () => {
            expect(sanitizeGitBranchName("")).toBe("branch");
            expect(sanitizeGitBranchName("@")).toBe("branch");
            expect(sanitizeGitBranchName("...")).toBe("branch");
            expect(sanitizeGitBranchName("---")).toBe("branch");
        });

        it("should handle complex cases", () => {
            expect(sanitizeGitBranchName("..feature: add new *awesome* feature!")).toBe("feature-add-new-awesome-feature");
            expect(sanitizeGitBranchName("WIP: [JIRA-123] ~temp branch~")).toBe("WIP-JIRA-123-temp-branch");
        });
    });
});

import {promises as fs} from "fs";
import * as path from "path";

import {
    configExists,
    getDefaultConfig,
    loadConfig,
    saveConfig,
    updateGitignore,
    validateConfig} from "../../../src/core/config";
import {WorktreeConfig} from "../../../src/core/types";
import {ConfigError, FileSystemError} from "../../../src/utils/errors";

// Mock fs module
jest.mock("fs", () => ({
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
        access: jest.fn(),
    },
}));

describe("Config Management", () => {
    const mockFs = fs as jest.Mocked<typeof fs>;
    const originalCwd = process.cwd();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(process, "cwd").mockReturnValue("/test/project");
    });

    afterEach(() => {
        jest.spyOn(process, "cwd").mockReturnValue(originalCwd);
    });

    describe("loadConfig", () => {
        it("should load valid configuration", async() => {
            const config: WorktreeConfig = {
                version: "1.0.0",
                projectName: "test-project",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            };

            mockFs.readFile.mockResolvedValue(JSON.stringify(config));

            const result = await loadConfig();

            expect(result).toEqual(config);
            expect(mockFs.readFile).toHaveBeenCalledWith(
                path.join("/test/project", ".worktree-config.json"),
                "utf-8",
            );
        });

        it("should return null when config file does not exist", async() => {
            const error = new Error("ENOENT") as any;
            error.code = "ENOENT";
            mockFs.readFile.mockRejectedValue(error);

            const result = await loadConfig();

            expect(result).toBeNull();
        });

        it("should throw ConfigError for invalid JSON", async() => {
            mockFs.readFile.mockResolvedValue("{ invalid json");

            await expect(loadConfig()).rejects.toThrow(ConfigError);
            await expect(loadConfig()).rejects.toThrow("Invalid JSON in configuration file");
        });

        it("should throw ConfigError for invalid configuration format", async() => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                version: "1.0.0",
                // Missing required fields
            }));

            await expect(loadConfig()).rejects.toThrow(ConfigError);
            await expect(loadConfig()).rejects.toThrow("Invalid configuration format");
        });

        it("should throw FileSystemError for other read errors", async() => {
            mockFs.readFile.mockRejectedValue(new Error("Permission denied"));

            await expect(loadConfig()).rejects.toThrow(FileSystemError);
            await expect(loadConfig()).rejects.toThrow("Failed to read configuration");
        });
    });

    describe("saveConfig", () => {
        it("should save configuration as formatted JSON", async() => {
            const config: WorktreeConfig = {
                version: "1.0.0",
                projectName: "test-project",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false,
            };

            mockFs.writeFile.mockResolvedValue();

            await saveConfig(config);

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                path.join("/test/project", ".worktree-config.json"),
                JSON.stringify(config, null, 2),
                "utf-8",
            );
        });

        it("should throw FileSystemError on write failure", async() => {
            const config = getDefaultConfig("test");
            mockFs.writeFile.mockRejectedValue(new Error("Disk full"));

            await expect(saveConfig(config)).rejects.toThrow(FileSystemError);
            await expect(saveConfig(config)).rejects.toThrow("Failed to save configuration");
        });
    });

    describe("getDefaultConfig", () => {
        it("should return default configuration with given project name", () => {
            const config = getDefaultConfig("my-project");

            expect(config).toEqual({
                version: "1.0.0",
                projectName: "my-project",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            });
        });
    });

    describe("validateConfig", () => {
        it("should validate correct configuration", () => {
            const config = {
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            };

            expect(validateConfig(config)).toBe(true);
        });

        it("should reject null or undefined", () => {
            expect(validateConfig(null)).toBe(false);
            expect(validateConfig(undefined)).toBe(false);
        });

        it("should reject non-objects", () => {
            expect(validateConfig("string")).toBe(false);
            expect(validateConfig(123)).toBe(false);
            expect(validateConfig(true)).toBe(false);
        });

        it("should reject missing version", () => {
            const config = {
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            };

            expect(validateConfig(config)).toBe(false);
        });

        it("should reject non-string version", () => {
            const config = {
                version: 123,
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            };

            expect(validateConfig(config)).toBe(false);
        });

        it("should reject missing or empty projectName", () => {
            const config1 = {
                version: "1.0.0",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            };

            const config2 = {
                version: "1.0.0",
                projectName: "",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            };

            const config3 = {
                version: "1.0.0",
                projectName: "   ",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            };

            expect(validateConfig(config1)).toBe(false);
            expect(validateConfig(config2)).toBe(false);
            expect(validateConfig(config3)).toBe(false);
        });

        it("should reject missing or empty mainBranch", () => {
            const config1 = {
                version: "1.0.0",
                projectName: "test",
                baseDir: ".worktrees",
                tmux: true,
            };

            const config2 = {
                version: "1.0.0",
                projectName: "test",
                mainBranch: "",
                baseDir: ".worktrees",
                tmux: true,
            };

            expect(validateConfig(config1)).toBe(false);
            expect(validateConfig(config2)).toBe(false);
        });

        it("should reject missing or empty baseDir", () => {
            const config1 = {
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                tmux: true,
            };

            const config2 = {
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: "",
                tmux: true,
            };

            expect(validateConfig(config1)).toBe(false);
            expect(validateConfig(config2)).toBe(false);
        });

        it("should reject missing or non-boolean tmux", () => {
            const config1 = {
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
            };

            const config2 = {
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: "yes",
            };

            expect(validateConfig(config1)).toBe(false);
            expect(validateConfig(config2)).toBe(false);
        });
    });

    describe("configExists", () => {
        it("should return true when config file exists", async() => {
            mockFs.access.mockResolvedValue();

            const result = await configExists();

            expect(result).toBe(true);
            expect(mockFs.access).toHaveBeenCalledWith(
                path.join("/test/project", ".worktree-config.json"),
            );
        });

        it("should return false when config file does not exist", async() => {
            mockFs.access.mockRejectedValue(new Error("ENOENT"));

            const result = await configExists();

            expect(result).toBe(false);
        });
    });

    describe("updateGitignore", () => {
        it("should create .gitignore with worktree directory", async() => {
            const error = new Error("ENOENT") as any;
            error.code = "ENOENT";
            mockFs.readFile.mockRejectedValue(error);
            mockFs.writeFile.mockResolvedValue();

            await updateGitignore(".worktrees");

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                path.join("/test/project", ".gitignore"),
                "\n# wtt worktrees\n.worktrees/\n",
                "utf-8",
            );
        });

        it("should append to existing .gitignore", async() => {
            mockFs.readFile.mockResolvedValue("node_modules/\n*.log\n");
            mockFs.writeFile.mockResolvedValue();

            await updateGitignore(".worktrees");

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                path.join("/test/project", ".gitignore"),
                "node_modules/\n*.log\n\n# wtt worktrees\n.worktrees/\n",
                "utf-8",
            );
        });

        it("should not duplicate entry if already present", async() => {
            mockFs.readFile.mockResolvedValue("node_modules/\n.worktrees/\n");

            await updateGitignore(".worktrees");

            expect(mockFs.writeFile).not.toHaveBeenCalled();
        });

        it("should not duplicate entry if present without slash", async() => {
            mockFs.readFile.mockResolvedValue("node_modules/\n.worktrees\n");

            await updateGitignore(".worktrees");

            expect(mockFs.writeFile).not.toHaveBeenCalled();
        });

        it("should handle custom baseDir", async() => {
            mockFs.readFile.mockResolvedValue("");
            mockFs.writeFile.mockResolvedValue();

            await updateGitignore("my-worktrees");

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                path.join("/test/project", ".gitignore"),
                "\n# wtt worktrees\nmy-worktrees/\n",
                "utf-8",
            );
        });

        it("should throw FileSystemError on write failure", async() => {
            mockFs.readFile.mockResolvedValue("");
            mockFs.writeFile.mockRejectedValue(new Error("Permission denied"));

            await expect(updateGitignore(".worktrees")).rejects.toThrow(FileSystemError);
            await expect(updateGitignore(".worktrees")).rejects.toThrow("Failed to update .gitignore");
        });

        it("should throw FileSystemError on unexpected read error", async() => {
            mockFs.readFile.mockRejectedValue(new Error("Permission denied"));

            await expect(updateGitignore(".worktrees")).rejects.toThrow(FileSystemError);
        });
    });
});

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
vi.mock("fs", () => ({
    promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        access: vi.fn(),
    },
}));

describe("Config Management", () => {
    const mockFs = fs as any;
    const originalCwd = process.cwd();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(process, "cwd").mockReturnValue("/test/project");
    });

    afterEach(() => {
        vi.spyOn(process, "cwd").mockReturnValue(originalCwd);
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

        describe("commands validation in loadConfig", () => {
            it("should load valid configuration with commands", async() => {
                const config: WorktreeConfig = {
                    version: "1.0.0",
                    projectName: "test-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        test: "npm test",
                        build: "npm run build",
                        lint: "npm run lint",
                    },
                };

                mockFs.readFile.mockResolvedValue(JSON.stringify(config));

                const result = await loadConfig();

                expect(result).toEqual(config);
            });

            it("should throw ConfigError for empty command string", async() => {
                const config = {
                    version: "1.0.0",
                    projectName: "test-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        test: "npm test",
                        empty: "",
                        whitespace: "   ",
                    },
                };

                mockFs.readFile.mockResolvedValue(JSON.stringify(config));

                await expect(loadConfig()).rejects.toThrow(ConfigError);
                await expect(loadConfig()).rejects.toThrow("Invalid command \"empty\": command must be a non-empty string");
            });

            it("should throw ConfigError for non-string command value", async() => {
                const config = {
                    version: "1.0.0",
                    projectName: "test-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        test: "npm test",
                        invalid: 123,
                    },
                };

                mockFs.readFile.mockResolvedValue(JSON.stringify(config));

                // This will fail at validateConfig stage with generic error
                await expect(loadConfig()).rejects.toThrow(ConfigError);
                await expect(loadConfig()).rejects.toThrow("Invalid configuration format");
            });

            it("should load configuration with object format commands", async() => {
                const config: WorktreeConfig = {
                    version: "1.0.0",
                    projectName: "test-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        test: {command: "npm test", mode: "exit"},
                        build: {command: "npm run build", mode: "window"},
                        watch: {command: "npm run watch", mode: "background"},
                        lint: {command: "npm run lint", mode: "inline"},
                    },
                };

                mockFs.readFile.mockResolvedValue(JSON.stringify(config));

                const result = await loadConfig();

                expect(result).toEqual(config);
            });

            it("should load configuration with mixed format commands", async() => {
                const config: WorktreeConfig = {
                    version: "1.0.0",
                    projectName: "test-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        test: "npm test",
                        build: {command: "npm run build", mode: "exit"},
                        watch: {command: "npm run watch"},
                    },
                };

                mockFs.readFile.mockResolvedValue(JSON.stringify(config));

                const result = await loadConfig();

                expect(result).toEqual(config);
            });

            it("should throw ConfigError for empty command string in object format", async() => {
                const config = {
                    version: "1.0.0",
                    projectName: "test-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        test: {command: "", mode: "exit"},
                    },
                };

                mockFs.readFile.mockResolvedValue(JSON.stringify(config));

                await expect(loadConfig()).rejects.toThrow(ConfigError);
                await expect(loadConfig()).rejects.toThrow("Invalid command \"test\": command must be a non-empty string");
            });
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
                commands: {},
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

        describe("commands validation", () => {
            it("should accept valid commands", () => {
                const config = {
                    version: "1.0.0",
                    projectName: "test",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        "test": "npm test",
                        "build": "npm run build",
                        "complex-command": "echo 'test' | grep 't' > output.txt",
                    },
                };

                expect(validateConfig(config)).toBe(true);
            });

            it("should accept config without commands", () => {
                const config = {
                    version: "1.0.0",
                    projectName: "test",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                };

                expect(validateConfig(config)).toBe(true);
            });

            it("should reject commands that is not an object", () => {
                const config1 = {
                    version: "1.0.0",
                    projectName: "test",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: "invalid",
                };

                const config2 = {
                    version: "1.0.0",
                    projectName: "test",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: null,
                };

                const config3 = {
                    version: "1.0.0",
                    projectName: "test",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: ["npm test"],
                };

                expect(validateConfig(config1)).toBe(false);
                expect(validateConfig(config2)).toBe(false);
                expect(validateConfig(config3)).toBe(false);
            });

            it("should reject commands with non-string values", () => {
                const config = {
                    version: "1.0.0",
                    projectName: "test",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        test: "npm test",
                        invalid: 123,
                        alsoInvalid: null,
                    },
                };

                expect(validateConfig(config)).toBe(false);
            });

            it("should accept object format commands with mode", () => {
                const config = {
                    version: "1.0.0",
                    projectName: "test",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        test: {command: "npm test", mode: "exit"},
                        build: {command: "npm run build", mode: "window"},
                        watch: {command: "npm run watch", mode: "background"},
                        lint: {command: "npm run lint", mode: "inline"},
                    },
                };

                expect(validateConfig(config)).toBe(true);
            });

            it("should accept object format commands without mode", () => {
                const config = {
                    version: "1.0.0",
                    projectName: "test",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        test: {command: "npm test"},
                        build: {command: "npm run build"},
                    },
                };

                expect(validateConfig(config)).toBe(true);
            });

            it("should accept mixed string and object format commands", () => {
                const config = {
                    version: "1.0.0",
                    projectName: "test",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        test: "npm test",
                        build: {command: "npm run build", mode: "exit"},
                        lint: "npm run lint",
                        watch: {command: "npm run watch", mode: "background"},
                    },
                };

                expect(validateConfig(config)).toBe(true);
            });

            it("should reject object format without command property", () => {
                const config = {
                    version: "1.0.0",
                    projectName: "test",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        test: {mode: "exit"},
                    },
                };

                expect(validateConfig(config)).toBe(false);
            });

            it("should reject object format with non-string command", () => {
                const config = {
                    version: "1.0.0",
                    projectName: "test",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        test: {command: 123, mode: "exit"},
                    },
                };

                expect(validateConfig(config)).toBe(false);
            });

            it("should reject object format with invalid mode", () => {
                const config = {
                    version: "1.0.0",
                    projectName: "test",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {
                        test: {command: "npm test", mode: "invalid"},
                    },
                };

                expect(validateConfig(config)).toBe(false);
            });
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

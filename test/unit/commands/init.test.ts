import {vi} from "vitest";

import {executeInit, initCommand, validateInitOptions} from "../../../src/commands/init";
import * as config from "../../../src/core/config";
import * as git from "../../../src/core/git";
import * as detector from "../../../src/platform/detector";
import {ValidationError} from "../../../src/utils/errors";
import * as logger from "../../../src/utils/logger";
import * as project from "../../../src/utils/project";

// Mock all dependencies
vi.mock("../../../src/core/git");
vi.mock("../../../src/core/config");
vi.mock("../../../src/utils/project");
vi.mock("../../../src/platform/detector");
vi.mock("../../../src/utils/logger");

describe("Init Command", () => {
    let mockLogger: any;
    let mockGit: any;
    let mockExit: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock logger
        mockLogger = {
            verbose: vi.fn(),
            info: vi.fn(),
            success: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
            getLevel: vi.fn().mockReturnValue("normal"),
        };
        vi.mocked(logger.getLogger).mockReturnValue(mockLogger);

        // Mock git
        mockGit = {
            isGitRepository: vi.fn().mockResolvedValue(true),
            getMainBranch: vi.fn().mockResolvedValue("main"),
        };
        vi.mocked(git.createGit).mockReturnValue(mockGit);

        // Mock config functions
        vi.mocked(config.configExists).mockResolvedValue(false);
        vi.mocked(config.saveConfig).mockResolvedValue(undefined);
        vi.mocked(config.updateGitignore).mockResolvedValue(undefined);
        vi.mocked(config.getDefaultConfig).mockReturnValue({
            version: "1.0.0",
            projectName: "test-project",
            mainBranch: "main",
            baseDir: ".worktrees",
            tmux: true,
            commands: {},
        });

        // Mock project detection
        vi.mocked(project.detectProjectName).mockResolvedValue("detected-project");

        // Mock platform detection
        vi.mocked(detector.detectPlatform).mockReturnValue({
            os: "linux",
            hasTmux: true,
            shellType: "bash",
        });

        // Mock process.exit
        mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
            throw new Error("process.exit");
        });
    });

    afterEach(() => {
        mockExit.mockRestore();
    });

    describe("validateInitOptions", () => {
        it("should accept valid options", () => {
            expect(() => {
                validateInitOptions({});
            }).not.toThrow();
            expect(() => {
                validateInitOptions({
                    projectName: "my-project",
                    baseDir: ".wt",
                    mainBranch: "master",
                });
            }).not.toThrow();
        });

        it("should reject conflicting tmux options", () => {
            expect(() => {
                validateInitOptions({
                    enableTmux: true,
                    disableTmux: true,
                });
            }).toThrow(ValidationError);
            expect(() => {
                validateInitOptions({
                    enableTmux: true,
                    disableTmux: true,
                });
            }).toThrow("Cannot specify both --enable-tmux and --disable-tmux");
        });

        it("should reject empty baseDir", () => {
            expect(() => {
                validateInitOptions({
                    baseDir: "",
                });
            }).toThrow(ValidationError);
            expect(() => {
                validateInitOptions({
                    baseDir: "   ",
                });
            }).toThrow("Base directory cannot be empty");
        });

        it("should reject empty projectName", () => {
            expect(() => {
                validateInitOptions({
                    projectName: "",
                });
            }).toThrow(ValidationError);
            expect(() => {
                validateInitOptions({
                    projectName: "   ",
                });
            }).toThrow("Project name cannot be empty");
        });

        it("should reject empty mainBranch", () => {
            expect(() => {
                validateInitOptions({
                    mainBranch: "",
                });
            }).toThrow(ValidationError);
            expect(() => {
                validateInitOptions({
                    mainBranch: "   ",
                });
            }).toThrow("Main branch cannot be empty");
        });

        it("should accept individual tmux options", () => {
            expect(() => {
                validateInitOptions({
                    enableTmux: true,
                });
            }).not.toThrow();
            expect(() => {
                validateInitOptions({
                    disableTmux: true,
                });
            }).not.toThrow();
        });
    });

    describe("executeInit", () => {
        it("should initialize with default options", async() => {
            await executeInit({});

            // Should check if already initialized
            expect(config.configExists).toHaveBeenCalled();

            // Should check git repository
            expect(mockGit.isGitRepository).toHaveBeenCalled();

            // Should detect project name
            expect(project.detectProjectName).toHaveBeenCalled();

            // Should detect main branch
            expect(mockGit.getMainBranch).toHaveBeenCalled();

            // Should detect platform for tmux
            expect(detector.detectPlatform).toHaveBeenCalled();

            // Should save config with empty commands object
            expect(config.saveConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectName: "detected-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
                    commands: {},
                }),
            );

            // Should update gitignore
            expect(config.updateGitignore).toHaveBeenCalledWith(".worktrees");

            // Should show concise success message
            expect(mockLogger.success).toHaveBeenCalledWith("Initialized worktree project. Config: .worktree-config.json");
        });

        it("should use provided options", async() => {
            await executeInit({
                projectName: "custom-project",
                baseDir: ".wt",
                mainBranch: "master",
                enableTmux: true,
            });

            // Should not detect project name
            expect(project.detectProjectName).not.toHaveBeenCalled();

            // Should not detect main branch
            expect(mockGit.getMainBranch).not.toHaveBeenCalled();

            // Should save config with provided values and empty commands
            expect(config.saveConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectName: "custom-project",
                    mainBranch: "master",
                    baseDir: ".wt",
                    tmux: true,
                    commands: {},
                }),
            );
        });

        it("should disable tmux when requested", async() => {
            await executeInit({disableTmux: true});

            expect(config.saveConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    tmux: false,
                    commands: {},
                }),
            );
        });

        it("should auto-detect tmux as disabled", async() => {
            vi.mocked(detector.detectPlatform).mockReturnValue({
                os: "windows",
                hasTmux: false,
                shellType: "powershell",
            });

            await executeInit({});

            expect(config.saveConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    tmux: false,
                    commands: {},
                }),
            );
        });

        it("should fail if already initialized", async() => {
            vi.mocked(config.configExists).mockResolvedValue(true);

            await expect(executeInit({})).rejects.toThrow("process.exit");

            expect(mockLogger.error).toHaveBeenCalledWith("This repository is already initialized for wtt");
            expect(mockExit).toHaveBeenCalledWith(1);
        });

        it("should fail if not in git repository", async() => {
            mockGit.isGitRepository.mockResolvedValue(false);

            await expect(executeInit({})).rejects.toThrow("process.exit");

            expect(mockLogger.error).toHaveBeenCalledWith("Not in a git repository. Please run \"git init\" first");
            expect(mockExit).toHaveBeenCalledWith(1);
        });

        it("should handle validation errors", async() => {
            await expect(executeInit({
                enableTmux: true,
                disableTmux: true,
            })).rejects.toThrow("process.exit");

            expect(mockLogger.error).toHaveBeenCalledWith("Cannot specify both --enable-tmux and --disable-tmux");
            expect(mockExit).toHaveBeenCalledWith(1);
        });

        it("should handle unexpected errors", async() => {
            vi.mocked(config.saveConfig).mockRejectedValue(new Error("Disk full"));

            await expect(executeInit({})).rejects.toThrow("process.exit");

            expect(mockLogger.error).toHaveBeenCalledWith("Initialization failed: Disk full");
            expect(mockExit).toHaveBeenCalledWith(1);
        });

        it("should show verbose logs when verbose mode is enabled", async() => {
            await executeInit({});

            expect(mockLogger.verbose).toHaveBeenCalledWith("Checking if already initialized...");
            expect(mockLogger.verbose).toHaveBeenCalledWith("Checking git repository...");
            expect(mockLogger.verbose).toHaveBeenCalledWith("Detecting project configuration...");
            expect(mockLogger.verbose).toHaveBeenCalledWith("Project name: detected-project");
            expect(mockLogger.verbose).toHaveBeenCalledWith("Main branch: main");
            expect(mockLogger.verbose).toHaveBeenCalledWith("Base directory: .worktrees");
            expect(mockLogger.verbose).toHaveBeenCalledWith("Tmux auto-detected: true");
        });

        it("should show detailed output in verbose mode", async() => {
            mockLogger.getLevel.mockReturnValue("verbose");

            await executeInit({});

            // Should show detailed success messages in verbose mode
            expect(mockLogger.success).toHaveBeenCalledWith("Created .worktree-config.json");
            expect(mockLogger.success).toHaveBeenCalledWith("Updated .gitignore");
            expect(mockLogger.info).toHaveBeenCalledWith("Repository initialized with:");
            expect(mockLogger.log).toHaveBeenCalledWith("  Project name: detected-project");
            expect(mockLogger.log).toHaveBeenCalledWith("  Main branch:  main");
            expect(mockLogger.log).toHaveBeenCalledWith("  Worktree dir: .worktrees/");
            expect(mockLogger.log).toHaveBeenCalledWith("  Tmux support: enabled");

            // Should still show concise message at the end
            expect(mockLogger.success).toHaveBeenCalledWith("Initialized worktree project. Config: .worktree-config.json");
        });

        it("should include empty commands object in saved config", async() => {
            await executeInit({});

            // Verify the saved config includes an empty commands object
            const savedConfig = vi.mocked(config.saveConfig).mock.calls[0][0];
            expect(savedConfig).toHaveProperty("commands");
            expect(savedConfig.commands).toEqual({});
        });
    });

    describe("Init Command Definition", () => {
        it("should have correct command name", () => {
            expect(initCommand.name()).toBe("init");
        });

        it("should have description", () => {
            expect(initCommand.description()).toContain("Initialize a repository");
        });

        it("should have all required options", () => {
            const {options} = initCommand;

            const projectNameOpt = options.find((opt) => opt.long === "--project-name");
            expect(projectNameOpt).toBeDefined();
            expect(projectNameOpt?.flags).toContain("<name>");

            const baseDirOpt = options.find((opt) => opt.long === "--base-dir");
            expect(baseDirOpt).toBeDefined();
            expect(baseDirOpt?.flags).toContain("<dir>");

            const enableTmuxOpt = options.find((opt) => opt.long === "--enable-tmux");
            expect(enableTmuxOpt).toBeDefined();

            const disableTmuxOpt = options.find((opt) => opt.long === "--disable-tmux");
            expect(disableTmuxOpt).toBeDefined();

            const mainBranchOpt = options.find((opt) => opt.long === "--main-branch");
            expect(mainBranchOpt).toBeDefined();
            expect(mainBranchOpt?.flags).toContain("<branch>");
        });
    });
});

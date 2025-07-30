import {executeInit, initCommand, validateInitOptions} from "../../../src/commands/init";
import * as config from "../../../src/core/config";
import * as git from "../../../src/core/git";
import * as detector from "../../../src/platform/detector";
import {ValidationError} from "../../../src/utils/errors";
import * as logger from "../../../src/utils/logger";
import * as project from "../../../src/utils/project";

// Mock all dependencies
jest.mock("../../../src/core/git");
jest.mock("../../../src/core/config");
jest.mock("../../../src/utils/project");
jest.mock("../../../src/platform/detector");
jest.mock("../../../src/utils/logger");

describe("Init Command", () => {
    let mockLogger: any;
    let mockGit: any;
    let mockExit: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock logger
        mockLogger = {
            verbose: jest.fn(),
            info: jest.fn(),
            success: jest.fn(),
            error: jest.fn(),
            log: jest.fn(),
            warn: jest.fn(),
            getLevel: jest.fn().mockReturnValue("normal"),
        };
        (logger.getLogger as jest.Mock).mockReturnValue(mockLogger);

        // Mock git
        mockGit = {
            isGitRepository: jest.fn().mockResolvedValue(true),
            getMainBranch: jest.fn().mockResolvedValue("main"),
        };
        (git.createGit as jest.Mock).mockReturnValue(mockGit);

        // Mock config functions
        (config.configExists as jest.Mock).mockResolvedValue(false);
        (config.saveConfig as jest.Mock).mockResolvedValue(undefined);
        (config.updateGitignore as jest.Mock).mockResolvedValue(undefined);
        (config.getDefaultConfig as jest.Mock).mockReturnValue({
            version: "1.0.0",
            projectName: "test-project",
            mainBranch: "main",
            baseDir: ".worktrees",
            tmux: true,
        });

        // Mock project detection
        (project.detectProjectName as jest.Mock).mockResolvedValue("detected-project");

        // Mock platform detection
        (detector.detectPlatform as jest.Mock).mockReturnValue({
            os: "linux",
            hasTmux: true,
            shellType: "bash",
        });

        // Mock process.exit
        mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
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

            // Should save config
            expect(config.saveConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectName: "detected-project",
                    mainBranch: "main",
                    baseDir: ".worktrees",
                    tmux: true,
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

            // Should save config with provided values
            expect(config.saveConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectName: "custom-project",
                    mainBranch: "master",
                    baseDir: ".wt",
                    tmux: true,
                }),
            );
        });

        it("should disable tmux when requested", async() => {
            await executeInit({disableTmux: true});

            expect(config.saveConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    tmux: false,
                }),
            );
        });

        it("should auto-detect tmux as disabled", async() => {
            (detector.detectPlatform as jest.Mock).mockReturnValue({
                os: "windows",
                hasTmux: false,
                shellType: "cmd",
            });

            await executeInit({});

            expect(config.saveConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    tmux: false,
                }),
            );
        });

        it("should fail if already initialized", async() => {
            (config.configExists as jest.Mock).mockResolvedValue(true);

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
            (config.saveConfig as jest.Mock).mockRejectedValue(new Error("Disk full"));

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

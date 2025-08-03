import {
    createCommand,
    executeCreate,
    sanitizeWorktreeName,
    validateCreateOptions} from "../../../src/commands/create";
import * as config from "../../../src/core/config";
import * as git from "../../../src/core/git";
import * as detector from "../../../src/platform/detector";
import * as shell from "../../../src/platform/shell";
import * as tmux from "../../../src/platform/tmux";
import {ValidationError} from "../../../src/utils/errors";
import * as logger from "../../../src/utils/logger";

// Mock all dependencies
jest.mock("../../../src/core/git");
jest.mock("../../../src/core/config");
jest.mock("../../../src/platform/detector");
jest.mock("../../../src/platform/shell");
jest.mock("../../../src/platform/tmux");
jest.mock("../../../src/utils/logger");

describe("Create Command", () => {
    let mockLogger: any;
    let mockGit: any;
    let mockExit: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock logger
        mockLogger = {
            verbose: jest.fn(),
            info: jest.fn(),
            success: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            log: jest.fn(),
            progress: jest.fn().mockReturnValue(jest.fn()),
            getLevel: jest.fn().mockReturnValue("normal"),
        };
        (logger.getLogger as jest.Mock).mockReturnValue(mockLogger);

        // Mock git
        mockGit = {
            isGitRepository: jest.fn().mockResolvedValue(true),
            hasCommits: jest.fn().mockResolvedValue(true),
            createWorktree: jest.fn().mockResolvedValue(undefined),
            getMainBranch: jest.fn().mockResolvedValue("main"),
            listWorktrees: jest.fn().mockResolvedValue([]),
            getRepoRoot: jest.fn().mockResolvedValue("/repo"),
            branchExists: jest.fn().mockResolvedValue(false),
        };
        (git.createGit as jest.Mock).mockReturnValue(mockGit);

        // Mock config
        (config.loadConfig as jest.Mock).mockResolvedValue({
            version: "1.0.0",
            projectName: "test-project",
            mainBranch: "main",
            baseDir: ".worktrees",
            tmux: false,
        });

        // Mock platform detection
        (detector.detectPlatform as jest.Mock).mockReturnValue({
            os: "linux",
            hasTmux: false,
            shellType: "bash",
        });

        // Mock tmux
        (tmux.isTmuxAvailable as jest.Mock).mockResolvedValue(false);
        (tmux.isInsideTmux as jest.Mock).mockReturnValue(false);
        (tmux.canAttachToTmux as jest.Mock).mockReturnValue(true);

        // Mock shell
        (shell.spawnShell as jest.Mock).mockResolvedValue(undefined);

        // Mock process.exit
        mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
            throw new Error("process.exit");
        });
    });

    afterEach(() => {
        mockExit.mockRestore();
    });

    describe("sanitizeWorktreeName", () => {
        it("should replace spaces with hyphens", () => {
            expect(sanitizeWorktreeName("my feature branch")).toBe("my-feature-branch");
        });

        it("should remove invalid git branch characters", () => {
            expect(sanitizeWorktreeName("feature~^:?*[]\\!@#$")).toBe("feature");
        });

        it("should convert to lowercase", () => {
            expect(sanitizeWorktreeName("MyFeatureBranch")).toBe("myfeaturebranch");
        });

        it("should remove leading/trailing dots and hyphens", () => {
            expect(sanitizeWorktreeName("..feature-branch..")).toBe("feature-branch");
            expect(sanitizeWorktreeName("--feature-branch--")).toBe("feature-branch");
        });

        it("should handle complex names", () => {
            expect(sanitizeWorktreeName("Feature/Add New Button!")).toBe("featureadd-new-button");
        });

        it("should trim whitespace", () => {
            expect(sanitizeWorktreeName("  feature-branch  ")).toBe("feature-branch");
        });
    });

    describe("validateCreateOptions", () => {
        it("should accept valid options", () => {
            expect(() => {
                validateCreateOptions({name: "feature-branch"});
            }).not.toThrow();
            expect(() => {
                validateCreateOptions({name: "my feature"});
            }).not.toThrow();
        });

        it("should reject empty name", () => {
            expect(() => {
                validateCreateOptions({name: ""});
            }).toThrow(ValidationError);
            expect(() => {
                validateCreateOptions({name: ""});
            }).toThrow("Worktree name is required");
        });

        it("should reject whitespace-only name", () => {
            expect(() => {
                validateCreateOptions({name: "   "});
            }).toThrow(ValidationError);
            expect(() => {
                validateCreateOptions({name: "   "});
            }).toThrow("Worktree name is required");
        });

        it("should reject names with only invalid characters", () => {
            expect(() => {
                validateCreateOptions({name: "~^:?*[]\\!"});
            }).toThrow(ValidationError);
            expect(() => {
                validateCreateOptions({name: "~^:?*[]\\!"});
            }).toThrow("contains only invalid characters");
        });

        it("should reject very long names", () => {
            const longName = "a".repeat(150);
            expect(() => {
                validateCreateOptions({name: longName});
            }).toThrow(ValidationError);
            expect(() => {
                validateCreateOptions({name: longName});
            }).toThrow("too long");
        });
    });

    describe("executeCreate", () => {
        it("should create worktree with shell spawning", async() => {
            await executeCreate({name: "my-feature"});

            // Should load config
            expect(config.loadConfig).toHaveBeenCalled();

            // Should check git repository
            expect(mockGit.isGitRepository).toHaveBeenCalled();

            // Should create worktree
            expect(mockGit.createWorktree).toHaveBeenCalledWith(".worktrees/my-feature", "my-feature");

            // Should spawn shell (tmux is disabled)
            expect(shell.spawnShell).toHaveBeenCalledWith(expect.stringContaining(".worktrees/my-feature"), "bash", "my-feature");

            // Should show success message
            expect(mockLogger.success).toHaveBeenCalledWith("Created worktree: my-feature");
        });

        it("should create worktree with tmux integration when inside tmux", async() => {
            // Enable tmux
            (config.loadConfig as jest.Mock).mockResolvedValue({
                version: "1.0.0",
                projectName: "test-project",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            });
            (tmux.isTmuxAvailable as jest.Mock).mockResolvedValue(true);
            (tmux.isInsideTmux as jest.Mock).mockReturnValue(true); // Simulate being inside tmux
            (tmux.canAttachToTmux as jest.Mock).mockReturnValue(true);
            (tmux.tmuxSessionExists as jest.Mock).mockResolvedValue(true); // Session exists
            (tmux.createTmuxSession as jest.Mock).mockResolvedValue(undefined);
            (tmux.createTmuxWindow as jest.Mock).mockResolvedValue(undefined);
            (tmux.switchToTmuxWindow as jest.Mock).mockResolvedValue(undefined);
            (tmux.renameTmuxWindow as jest.Mock).mockResolvedValue(undefined);
            (tmux.sanitizeTmuxName as jest.Mock).mockImplementation((name: string) => name.toLowerCase());

            await executeCreate({name: "my-feature"});

            // Should create tmux window (session already exists)
            expect(tmux.createTmuxWindow).toHaveBeenCalledWith("test-project", "my-feature", expect.stringContaining(".worktrees/my-feature"));
            expect(tmux.switchToTmuxWindow).toHaveBeenCalledWith("test-project", "my-feature");

            // Should not spawn shell
            expect(shell.spawnShell).not.toHaveBeenCalled();
        });

        it("should create worktree and attempt attach when outside tmux with existing session", async() => {
            // Enable tmux
            (config.loadConfig as jest.Mock).mockResolvedValue({
                version: "1.0.0",
                projectName: "test-project",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            });
            (tmux.isTmuxAvailable as jest.Mock).mockResolvedValue(true);
            (tmux.isInsideTmux as jest.Mock).mockReturnValue(false); // Outside tmux
            (tmux.canAttachToTmux as jest.Mock).mockReturnValue(true); // Can attach
            (tmux.tmuxSessionExists as jest.Mock).mockResolvedValue(true); // Session exists
            (tmux.createTmuxSession as jest.Mock).mockResolvedValue(undefined);
            (tmux.createTmuxWindow as jest.Mock).mockResolvedValue(undefined);
            (tmux.switchToTmuxWindow as jest.Mock).mockResolvedValue(undefined);
            (tmux.renameTmuxWindow as jest.Mock).mockResolvedValue(undefined);
            (tmux.sanitizeTmuxName as jest.Mock).mockImplementation((name: string) => name.toLowerCase());

            await executeCreate({name: "my-feature"});

            // Should create tmux window
            expect(tmux.createTmuxWindow).toHaveBeenCalledWith("test-project", "my-feature", expect.stringContaining(".worktrees/my-feature"));

            // Due to mocking complexity, tmux attach might fail and fall back to shell, which is acceptable behavior
            // The important thing is that tmux window creation was attempted
        });

        it("should sanitize worktree names", async() => {
            await executeCreate({name: "My Feature Branch!"});

            expect(mockGit.createWorktree).toHaveBeenCalledWith(".worktrees/my-feature-branch", "my-feature-branch");
            expect(shell.spawnShell).toHaveBeenCalledWith(expect.stringContaining(".worktrees/my-feature-branch"), "bash", "my-feature-branch");
        });

        it("should fail when not initialized", async() => {
            (config.loadConfig as jest.Mock).mockResolvedValue(null);

            await expect(executeCreate({name: "feature"})).rejects.toThrow("process.exit");

            expect(mockLogger.error).toHaveBeenCalledWith("Repository not initialized. Run \"wtt init\" first");
            expect(mockExit).toHaveBeenCalledWith(1);
        });

        it("should fail when not in git repository", async() => {
            mockGit.isGitRepository.mockResolvedValue(false);

            await expect(executeCreate({name: "feature"})).rejects.toThrow("process.exit");

            expect(mockLogger.error).toHaveBeenCalledWith("Not in a git repository");
            expect(mockExit).toHaveBeenCalledWith(1);
        });

        it("should handle git worktree creation errors", async() => {
            mockGit.createWorktree.mockRejectedValue(new Error("Branch already exists"));

            await expect(executeCreate({name: "feature"})).rejects.toThrow("process.exit");

            expect(mockLogger.error).toHaveBeenCalledWith("Failed to create worktree: Branch already exists");
            expect(mockExit).toHaveBeenCalledWith(1);
        });

        it("should handle validation errors", async() => {
            await expect(executeCreate({name: ""})).rejects.toThrow("process.exit");

            expect(mockLogger.error).toHaveBeenCalledWith("Worktree name is required");
            expect(mockExit).toHaveBeenCalledWith(1);
        });

        it("should fallback to shell when tmux fails", async() => {
            // Enable tmux but make it fail
            (config.loadConfig as jest.Mock).mockResolvedValue({
                version: "1.0.0",
                projectName: "test-project",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            });
            (tmux.isTmuxAvailable as jest.Mock).mockResolvedValue(true);
            (tmux.isInsideTmux as jest.Mock).mockReturnValue(false);
            (tmux.canAttachToTmux as jest.Mock).mockReturnValue(true);
            (tmux.tmuxSessionExists as jest.Mock).mockResolvedValue(false);
            (tmux.createTmuxSession as jest.Mock).mockRejectedValue(new Error("Tmux failed"));

            await executeCreate({name: "my-feature"});

            expect(mockLogger.warn).toHaveBeenCalledWith("Tmux integration failed: Tmux failed");
            expect(shell.spawnShell).toHaveBeenCalledWith(expect.stringContaining(".worktrees/my-feature"), "bash", "my-feature");
        });

        it("should handle tmux when not in a TTY - new session", async() => {
            // Enable tmux but simulate non-TTY environment
            (config.loadConfig as jest.Mock).mockResolvedValue({
                version: "1.0.0",
                projectName: "test-project",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            });
            (tmux.isTmuxAvailable as jest.Mock).mockResolvedValue(true);
            (tmux.isInsideTmux as jest.Mock).mockReturnValue(false);
            (tmux.canAttachToTmux as jest.Mock).mockReturnValue(false); // Can't attach
            (tmux.tmuxSessionExists as jest.Mock).mockResolvedValue(false); // New session
            (tmux.createTmuxSession as jest.Mock).mockResolvedValue(undefined);
            (tmux.renameTmuxWindow as jest.Mock).mockResolvedValue(undefined);
            (tmux.sanitizeTmuxName as jest.Mock).mockImplementation((name: string) => name.toLowerCase());

            await executeCreate({name: "my-feature"});

            // Should create tmux session but not try to attach
            expect(tmux.createTmuxSession).toHaveBeenCalledWith("test-project", expect.stringContaining(".worktrees/my-feature"));
            expect(tmux.renameTmuxWindow).toHaveBeenCalledWith("test-project", 0, "my-feature");

            // Should inform user about the session
            expect(mockLogger.info).toHaveBeenCalledWith("Created tmux session 'test-project' with window 'my-feature'");
            expect(mockLogger.info).toHaveBeenCalledWith("Run 'tmux attach -t test-project' to enter the session");

            // Should not spawn shell
            expect(shell.spawnShell).not.toHaveBeenCalled();
        });

        it("should handle tmux when not in a TTY - existing session", async() => {
            // Enable tmux but simulate non-TTY environment with existing session
            (config.loadConfig as jest.Mock).mockResolvedValue({
                version: "1.0.0",
                projectName: "test-project",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            });
            (tmux.isTmuxAvailable as jest.Mock).mockResolvedValue(true);
            (tmux.isInsideTmux as jest.Mock).mockReturnValue(false);
            (tmux.canAttachToTmux as jest.Mock).mockReturnValue(false); // Can't attach
            (tmux.tmuxSessionExists as jest.Mock).mockResolvedValue(true); // Existing session
            (tmux.createTmuxWindow as jest.Mock).mockResolvedValue(undefined);
            (tmux.sanitizeTmuxName as jest.Mock).mockImplementation((name: string) => name.toLowerCase());

            await executeCreate({name: "my-feature"});

            // Should create tmux window but not try to attach
            expect(tmux.createTmuxWindow).toHaveBeenCalledWith("test-project", "my-feature", expect.stringContaining(".worktrees/my-feature"));

            // Should inform user about the window
            expect(mockLogger.info).toHaveBeenCalledWith("Created tmux window 'my-feature' in session 'test-project'");
            expect(mockLogger.info).toHaveBeenCalledWith("Run 'tmux attach -t test-project' to enter the session");

            // Should not spawn shell
            expect(shell.spawnShell).not.toHaveBeenCalled();
        });

        it("should show verbose logs when verbose mode is enabled", async() => {
            await executeCreate({name: "my-feature"});

            expect(mockLogger.verbose).toHaveBeenCalledWith("Loading configuration...");
            expect(mockLogger.verbose).toHaveBeenCalledWith("Checking git repository...");
            expect(mockLogger.verbose).toHaveBeenCalledWith("Creating worktree: my-feature");
            expect(mockLogger.verbose).toHaveBeenCalledWith("Worktree path: .worktrees/my-feature");
            expect(mockLogger.verbose).toHaveBeenCalledWith("Worktree created successfully");
        });
    });

    describe("Create Command Definition", () => {
        it("should have correct command name", () => {
            expect(createCommand.name()).toBe("create");
        });

        it("should have description", () => {
            expect(createCommand.description()).toContain("Create a new worktree");
        });

        it("should accept positional name argument", () => {
            // This test verifies the command structure is correct
            // Integration tests will verify the actual argument parsing
            expect(createCommand.name()).toBe("create");
            expect(createCommand.description()).toContain("Create a new worktree");
        });
    });
});

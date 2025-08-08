import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import * as config from "../../../src/core/config";
import * as git from "../../../src/core/git";
import {WorktreeConfig, WorktreeInfo} from "../../../src/core/types";
import {ShellManager} from "../../../src/platform/shell";
import * as tmux from "../../../src/platform/tmux";
import * as logger from "../../../src/utils/logger";

vi.mock("../../../src/core/config");
vi.mock("../../../src/core/git");
vi.mock("../../../src/platform/tmux");
vi.mock("../../../src/platform/shell");
vi.mock("../../../src/utils/logger");

// Global mocks
let mockLogger: any;
let mockGit: any;
let mockShellManager: any;
let processExitMock: any;

describe("exec command", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();

        // Mock process.exit
        processExitMock = vi.spyOn(process, "exit").mockImplementation((code?: any): never => {
            throw new Error(`Process exited with code ${String(code)}`);
        });

        // Mock logger
        mockLogger = {
            error: vi.fn(),
            info: vi.fn(),
            success: vi.fn(),
        };
        vi.mocked(logger.getLogger).mockReturnValue(mockLogger);

        // Mock Git
        mockGit = {
            listWorktrees: vi.fn(),
        };
        vi.mocked(git.createGit).mockReturnValue(mockGit);

        // Mock tmux functions
        vi.mocked(tmux.isTmuxAvailable).mockResolvedValue(true);
        vi.mocked(tmux.tmuxSessionExists).mockResolvedValue(true);
        vi.mocked(tmux.createTmuxSessionWithWindow).mockResolvedValue();
        vi.mocked(tmux.createTmuxWindowWithCommand).mockResolvedValue();
        vi.mocked(tmux.sanitizeTmuxName).mockImplementation((name) => name);
        vi.mocked(tmux.sanitizeTmuxWindowName).mockImplementation((name) => name);
        vi.mocked(tmux.isInsideTmux).mockReturnValue(false);
        vi.mocked(tmux.switchToTmuxWindow).mockResolvedValue();
        vi.mocked(tmux.canAttachToTmux).mockReturnValue(false);
        vi.mocked(tmux.attachToTmuxSession).mockResolvedValue();

        // Mock ShellManager
        mockShellManager = {
            executeInNewWindow: vi.fn(),
        };
        vi.mocked(ShellManager).mockImplementation(() => mockShellManager);
    });

    afterEach(() => {
        processExitMock.mockRestore();
    });

    describe("validation", () => {
        it("should error when no config found", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue(null);

            const result = await runCommand(["test"]);

            expect(result.code).toBe(1);
            expect(mockLogger.error).toHaveBeenCalledWith("No configuration found");
        });

        it("should error when no commands configured", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
            } as WorktreeConfig);

            const result = await runCommand(["test"]);

            expect(result.code).toBe(1);
            expect(mockLogger.error).toHaveBeenCalledWith("No commands configured");
        });

        it("should error when commands object is empty", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {},
            } as WorktreeConfig);

            const result = await runCommand(["test"]);

            expect(result.code).toBe(1);
            expect(mockLogger.error).toHaveBeenCalledWith("No commands configured");
        });

        it("should error when command not found", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    test: "npm test",
                    build: "npm run build",
                },
            } as WorktreeConfig);

            const result = await runCommand(["nonexistent"]);

            expect(result.code).toBe(1);
            expect(mockLogger.error).toHaveBeenCalledWith("Command \"nonexistent\" not found in config");
            expect(mockLogger.info).toHaveBeenCalledWith("Hint: Available commands: test, build");
        });

        it("should error when worktree not found", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    test: "npm test",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/feature", branch: "feature", commit: "def", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            const result = await runCommand(["test", "-w", "nonexistent"]);

            expect(result.code).toBe(1);
            expect(mockLogger.error).toHaveBeenCalledWith("Worktree(s) not found: nonexistent");
            expect(mockLogger.info).toHaveBeenCalledWith("Hint: Available worktrees: feature");
        });

        it("should error when some worktrees not found", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    test: "npm test",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/feature-a", branch: "feature-a", commit: "def", isMain: false, isLocked: false},
                {path: "/project/.worktrees/feature-b", branch: "feature-b", commit: "ghi", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            const result = await runCommand(["test", "-w", "feature-a,nonexistent,feature-x"]);

            expect(result.code).toBe(1);
            expect(mockLogger.error).toHaveBeenCalledWith("Worktree(s) not found: nonexistent, feature-x");
            expect(mockLogger.info).toHaveBeenCalledWith("Hint: Available worktrees: feature-a, feature-b");
        });
    });

    describe("execution", () => {
        it("should execute command in all worktrees with tmux", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    test: "npm test",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/feature", branch: "feature", commit: "def", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            const result = await runCommand(["test"]);

            expect(result.code).toBe(0);
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledTimes(1);
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledWith(
                "test",
                "feature::exec",
                "/project/.worktrees/feature",
                expect.stringMatching(/npm test/),
            );
        });

        it("should execute command in specific worktree by name", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    build: "npm run build",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/feature", branch: "feature", commit: "def", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            const result = await runCommand(["build", "-w", "feature"]);

            expect(result.code).toBe(0);
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledTimes(1);
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledWith(
                "test",
                "feature::exec",
                "/project/.worktrees/feature",
                expect.stringMatching(/npm run build/),
            );
        });

        it("should execute command in specific worktree by branch", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    lint: "npm run lint",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/my-feature", branch: "feature/test", commit: "def", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            const result = await runCommand(["lint", "-w", "feature/test"]);

            expect(result.code).toBe(0);
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledTimes(1);
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledWith(
                "test",
                "my-feature::exec",
                "/project/.worktrees/my-feature",
                expect.stringMatching(/npm run lint/),
            );
        });

        it("should execute command in multiple specific worktrees", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    test: "npm test",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/feature-a", branch: "feature-a", commit: "def", isMain: false, isLocked: false},
                {path: "/project/.worktrees/feature-b", branch: "feature-b", commit: "ghi", isMain: false, isLocked: false},
                {path: "/project/.worktrees/feature-c", branch: "feature-c", commit: "jkl", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            const result = await runCommand(["test", "-w", "feature-a,feature-c"]);

            expect(result.code).toBe(0);
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledTimes(2);

            // Should execute in feature-a
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledWith(
                "test",
                "feature-a::exec",
                "/project/.worktrees/feature-a",
                expect.stringMatching(/npm test/),
            );

            // Should execute in feature-c
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledWith(
                "test",
                "feature-c::exec",
                "/project/.worktrees/feature-c",
                expect.stringMatching(/npm test/),
            );

            // Should NOT execute in feature-b
            expect(tmux.createTmuxWindowWithCommand).not.toHaveBeenCalledWith(
                "test",
                "feature-b::test",
                "/project/.worktrees/feature-b",
                expect.any(String),
            );
        });

        it("should execute command without tmux", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false,
                commands: {
                    dev: "npm run dev",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/dev", branch: "dev", commit: "def", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            const result = await runCommand(["dev"]);

            expect(result.code).toBe(0);
            expect(mockShellManager.executeInNewWindow).toHaveBeenCalledTimes(1);
            expect(mockShellManager.executeInNewWindow).toHaveBeenCalledWith("npm run dev", "/project/.worktrees/dev", "dev::exec");

            // Check environment variables were set
            expect(process.env.WTT_WORKTREE_NAME).toBe("dev");
            expect(process.env.WTT_WORKTREE_PATH).toBe("/project/.worktrees/dev");
            expect(process.env.WTT_IS_MAIN).toBe("false");
        });

        it("should handle execution failures gracefully", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    test: "npm test",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/feature", branch: "feature", commit: "def", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            // Make the execution fail
            vi.mocked(tmux.createTmuxWindowWithCommand)
                .mockRejectedValueOnce(new Error("Tmux error"));

            const result = await runCommand(["test"]);

            expect(result.code).toBe(1);
            expect(mockLogger.error).toHaveBeenCalledWith("1 command(s) failed to start");
        });

        it("should show message when no child worktrees exist", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    test: "npm test",
                },
            } as WorktreeConfig);

            // Only main worktree exists
            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
            ] as WorktreeInfo[]);

            const result = await runCommand(["test"]);

            expect(result.code).toBe(0);
            expect(tmux.createTmuxWindowWithCommand).not.toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith("No worktrees found. Create worktrees with 'wtt create <branch-name>'");
        });

        it("should create tmux session if it doesn't exist", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    test: "npm test",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/feature", branch: "feature", commit: "def", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            // Mock that session doesn't exist
            vi.mocked(tmux.tmuxSessionExists).mockResolvedValue(false);
            vi.mocked(tmux.getTmuxWindowCount).mockResolvedValue(1);

            const result = await runCommand(["test"]);

            expect(result.code).toBe(0);
            // Should create session with first window
            expect(tmux.createTmuxSessionWithWindow).toHaveBeenCalledWith(
                "test",
                "feature::exec",
                "/project/.worktrees/feature",
                expect.stringMatching(/npm test/),
            );
            // Should not call createTmuxWindowWithCommand since first window is created with session
            expect(tmux.createTmuxWindowWithCommand).not.toHaveBeenCalled();
        });

        it("should switch to first window when inside tmux", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    build: "npm run build",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/feature-a", branch: "feature-a", commit: "def", isMain: false, isLocked: false},
                {path: "/project/.worktrees/feature-b", branch: "feature-b", commit: "ghi", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            // Mock that we're inside tmux
            vi.mocked(tmux.isInsideTmux).mockReturnValue(true);

            const result = await runCommand(["build"]);

            expect(result.code).toBe(0);

            // Should create windows for both worktrees
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledTimes(2);

            // Should switch to the first window
            expect(tmux.switchToTmuxWindow).toHaveBeenCalledWith("test", "feature-a::exec");
        });

        it("should not switch windows when not inside tmux", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    build: "npm run build",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/feature-a", branch: "feature-a", commit: "def", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            // Mock that we're NOT inside tmux
            vi.mocked(tmux.isInsideTmux).mockReturnValue(false);

            const result = await runCommand(["build"]);

            expect(result.code).toBe(0);

            // Should NOT switch windows
            expect(tmux.switchToTmuxWindow).not.toHaveBeenCalled();
        });

        it("should attach to tmux session when not inside tmux but can attach", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    test: "npm test",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/feature-a", branch: "feature-a", commit: "def", isMain: false, isLocked: false},
                {path: "/project/.worktrees/feature-b", branch: "feature-b", commit: "ghi", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            // Mock that we're NOT inside tmux but CAN attach
            vi.mocked(tmux.isInsideTmux).mockReturnValue(false);
            vi.mocked(tmux.canAttachToTmux).mockReturnValue(true);
            vi.mocked(tmux.attachToTmuxSession).mockResolvedValue();

            const result = await runCommand(["test"]);

            expect(result.code).toBe(0);

            // Should attach to the session with the first window
            expect(tmux.attachToTmuxSession).toHaveBeenCalledWith("test", "feature-a::exec");
        });

        it("should not attach when cannot attach to tmux", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    test: "npm test",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/feature-a", branch: "feature-a", commit: "def", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            // Mock that we're NOT inside tmux and CANNOT attach
            vi.mocked(tmux.isInsideTmux).mockReturnValue(false);
            vi.mocked(tmux.canAttachToTmux).mockReturnValue(false);

            const result = await runCommand(["test"]);

            expect(result.code).toBe(0);

            // Should NOT try to attach
            expect(tmux.attachToTmuxSession).not.toHaveBeenCalled();
        });
    });

    describe("options", () => {
        it("should respect verbose flag", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    test: "npm test",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
            ] as WorktreeInfo[]);

            await runCommand(["test", "--verbose"]);

            expect(vi.mocked(logger.getLogger)).toHaveBeenCalledWith(expect.objectContaining({verbose: true}));
        });

        it("should respect quiet flag", async() => {
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: true,
                commands: {
                    test: "npm test",
                },
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
            ] as WorktreeInfo[]);

            await runCommand(["test", "--quiet"]);

            // Check the actual call arguments
            const mockGetLogger = vi.mocked(logger.getLogger);
            expect(mockGetLogger).toHaveBeenCalled();

            const actualArgs = mockGetLogger.mock.calls[0][0];
            expect(actualArgs.quiet).toBe(true);
            // Don't check for absence of verbose, just that quiet is true
        });
    });

    describe("-- separator handling", () => {
        it("correctly detects -- only after exec command", async() => {
            // Set up config without any predefined commands to test inline command parsing
            vi.mocked(config.loadConfig).mockResolvedValue({
                version: "1.0.0",
                projectName: "test",
                mainBranch: "main",
                baseDir: ".worktrees",
                tmux: false,
                // No commands defined - this forces the parser to treat it as inline command
            } as WorktreeConfig);

            mockGit.listWorktrees.mockResolvedValue([
                {path: "/project", branch: "main", commit: "abc", isMain: true, isLocked: false},
                {path: "/project/.worktrees/feature-a", branch: "feature-a", commit: "def", isMain: false, isLocked: false},
            ] as WorktreeInfo[]);

            // Mock process.argv to simulate edge cases
            const originalArgv = process.argv;
            
            try {
                // Test case 1: -- appears before exec (should NOT be detected as inline command)
                process.argv = ['node', 'wtt', '--worktrees=--', 'exec', 'ls'];
                
                // This should fail because 'ls' is not a predefined command
                const result1 = await runCommand(["ls"]);
                expect(result1.code).toBe(1);
                expect(mockLogger.error).toHaveBeenCalledWith(
                    expect.stringContaining("No commands configured")
                );
                
                // Clear mocks
                vi.clearAllMocks();
                
                // Test case 2: -- appears after exec (should be detected as inline command)
                process.argv = ['node', 'wtt', 'exec', '--', 'ls'];
                
                // This should succeed because it's recognized as an inline command
                const result2 = await runCommand(["ls"]);
                expect(result2.code).toBe(0);
                
                // The key is that it doesn't throw "No commands configured"
                expect(mockLogger.error).not.toHaveBeenCalledWith(
                    expect.stringContaining("No commands configured")
                );
            } finally {
                process.argv = originalArgv;
            }
        });
    });
});

// Helper function to run the command
async function runCommand(args: string[]): Promise<{code: number}> {
    const {execCommand} = await import("../../../src/commands/exec");

    try {
        await execCommand.parseAsync(["node", "wtt", ... args]);
        return {code: 0};
    } catch(error: any) {
        // Check if error is due to process.exit
        if (error.message?.startsWith("Process exited with code")) {
            const match = error.message.match(/Process exited with code (\d+)/);
            return {code: parseInt(match?.[1] ?? "1", 10)};
        }

        return {code: 1};
    }
}

import {beforeEach, describe, expect, it, Mock, vi} from "vitest";

import {BaseCommand, CommandContext, CommandOptions} from "../../../src/commands/base.js";
import {loadConfig} from "../../../src/core/config.js";
import {createGit} from "../../../src/core/git.js";
import {WorktreeConfig} from "../../../src/core/types.js";
import {handleCommandError} from "../../../src/utils/error-handler.js";
import {ConfigError, GitError} from "../../../src/utils/errors.js";
import {getLogger} from "../../../src/utils/logger.js";

vi.mock("../../../src/core/config.js");
vi.mock("../../../src/core/git.js");
vi.mock("../../../src/utils/error-handler.js");
vi.mock("../../../src/utils/logger.js");

class TestCommand extends BaseCommand {
    public requiresConfigValue = true;
    public requiresGitRepoValue = true;
    public requiresCommitsValue = false;
    public validateOptionsCalled = false;
    public executeCommandCalled = false;
    public lastOptions?: CommandOptions;
    public lastContext?: CommandContext;

    protected validateOptions(options: CommandOptions): void {
        this.validateOptionsCalled = true;
        this.lastOptions = options;
    }

    protected async executeCommand(options: CommandOptions, context: CommandContext): Promise<void> {
        this.executeCommandCalled = true;
        this.lastOptions = options;
        this.lastContext = context;
    }

    protected requiresConfig(): boolean {
        return this.requiresConfigValue;
    }

    protected requiresGitRepo(): boolean {
        return this.requiresGitRepoValue;
    }

    protected requiresCommits(): boolean {
        return this.requiresCommitsValue;
    }
}

describe("BaseCommand", () => {
    let mockLogger: any;
    let mockGit: any;
    let mockConfig: WorktreeConfig;
    let testCommand: TestCommand;

    beforeEach(() => {
        vi.clearAllMocks();

        mockLogger = {
            verbose: vi.fn(),
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
        };

        mockGit = {
            isGitRepository: vi.fn().mockResolvedValue(true),
            hasCommits: vi.fn().mockResolvedValue(true),
        };

        mockConfig = {
            defaultBranch: "main",
            defaultRemote: "origin",
            autoSync: false,
            worktreePrefix: "wt-",
        };

        (getLogger as Mock).mockReturnValue(mockLogger);
        (createGit as Mock).mockReturnValue(mockGit);
        (loadConfig as Mock).mockResolvedValue(mockConfig);

        testCommand = new TestCommand();
    });

    describe("execute", () => {
        it("should execute successfully with all requirements met", async() => {
            const options: CommandOptions = {verbose: true};

            await testCommand.execute(options);

            expect(testCommand.validateOptionsCalled).toBe(true);
            expect(testCommand.executeCommandCalled).toBe(true);
            expect(testCommand.lastOptions).toBe(options);
            expect(testCommand.lastContext).toMatchObject({
                logger: mockLogger,
                config: mockConfig,
                git: mockGit,
            });
        });

        it("should work without requiring config", async() => {
            testCommand.requiresConfigValue = false;
            const options: CommandOptions = {};

            await testCommand.execute(options);

            expect(loadConfig).not.toHaveBeenCalled();
            expect(testCommand.executeCommandCalled).toBe(true);
            expect(testCommand.lastContext?.config).toBeNull();
        });

        it("should work without requiring git repo", async() => {
            testCommand.requiresGitRepoValue = false;
            const options: CommandOptions = {};

            await testCommand.execute(options);

            expect(mockGit.isGitRepository).not.toHaveBeenCalled();
            expect(testCommand.executeCommandCalled).toBe(true);
        });

        it("should throw ConfigError when config is required but not found", async() => {
            (loadConfig as Mock).mockResolvedValue(null);
            const options: CommandOptions = {};

            await testCommand.execute(options);

            expect(handleCommandError).toHaveBeenCalledWith(
                expect.any(ConfigError),
                mockLogger,
            );
            expect(testCommand.executeCommandCalled).toBe(false);
        });

        it("should throw GitError when git repo is required but not found", async() => {
            mockGit.isGitRepository.mockResolvedValue(false);
            const options: CommandOptions = {};

            await testCommand.execute(options);

            expect(handleCommandError).toHaveBeenCalledWith(
                expect.any(GitError),
                mockLogger,
            );
            expect(testCommand.executeCommandCalled).toBe(false);
        });

        it("should check for commits when required", async() => {
            testCommand.requiresCommitsValue = true;
            const options: CommandOptions = {};

            await testCommand.execute(options);

            expect(mockGit.hasCommits).toHaveBeenCalled();
            expect(testCommand.executeCommandCalled).toBe(true);
        });

        it("should throw GitError when commits are required but not found", async() => {
            testCommand.requiresCommitsValue = true;
            mockGit.hasCommits.mockResolvedValue(false);
            const options: CommandOptions = {};

            await testCommand.execute(options);

            expect(handleCommandError).toHaveBeenCalledWith(
                expect.any(GitError),
                mockLogger,
            );
            expect(testCommand.executeCommandCalled).toBe(false);
        });

        it("should not check for commits when not requiring git repo", async() => {
            testCommand.requiresGitRepoValue = false;
            testCommand.requiresCommitsValue = true;
            const options: CommandOptions = {};

            await testCommand.execute(options);

            expect(mockGit.hasCommits).not.toHaveBeenCalled();
            expect(testCommand.executeCommandCalled).toBe(true);
        });

        it("should handle errors from executeCommand", async() => {
            const error = new Error("Command failed");
            testCommand.executeCommand = vi.fn().mockRejectedValue(error);
            const options: CommandOptions = {};

            await testCommand.execute(options);

            expect(handleCommandError).toHaveBeenCalledWith(error, mockLogger);
        });

        it("should handle errors from validateOptions", async() => {
            const error = new Error("Validation failed");
            testCommand.validateOptions = vi.fn().mockImplementation(() => {
                throw error;
            });
            const options: CommandOptions = {};

            await testCommand.execute(options);

            expect(handleCommandError).toHaveBeenCalledWith(error, mockLogger);
            expect(testCommand.executeCommandCalled).toBe(false);
        });

        it("should pass quiet option to logger", async() => {
            const options: CommandOptions = {quiet: true};

            await testCommand.execute(options);

            expect(getLogger).toHaveBeenCalledWith(options);
            expect(testCommand.executeCommandCalled).toBe(true);
        });
    });
});

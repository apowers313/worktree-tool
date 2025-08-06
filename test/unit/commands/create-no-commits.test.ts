import {executeCreate} from "../../../src/commands/create";
import * as config from "../../../src/core/config";
import * as git from "../../../src/core/git";
import * as logger from "../../../src/utils/logger";

// Mock all dependencies
vi.mock("../../../src/core/git");
vi.mock("../../../src/core/config");
vi.mock("../../../src/utils/logger");

describe("Create Command - No Commits", () => {
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
            warn: vi.fn(),
            getLevel: vi.fn().mockReturnValue("normal"),
        };
        vi.mocked(logger.getLogger).mockReturnValue(mockLogger);

        // Mock config
        vi.mocked(config.loadConfig).mockResolvedValue({
            version: "1.0.0",
            projectName: "test-project",
            mainBranch: "main",
            baseDir: ".worktrees",
            tmux: false,
        });

        // Mock git
        mockGit = {
            isGitRepository: vi.fn().mockResolvedValue(true),
            hasCommits: vi.fn().mockResolvedValue(false),
            createWorktree: vi.fn(),
        };
        vi.mocked(git.createGit).mockReturnValue(mockGit);

        // Mock process.exit
        mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
            throw new Error("process.exit");
        });
    });

    afterEach(() => {
        mockExit.mockRestore();
    });

    it("should fail with friendly error when no commits exist", async() => {
        await expect(executeCreate({name: "feature"})).rejects.toThrow("process.exit");

        expect(mockLogger.error).toHaveBeenCalledWith(
            "No commits found. Please make at least one commit before creating worktrees.",
        );
        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("should check for commits before attempting to create worktree", async() => {
        await expect(executeCreate({name: "feature"})).rejects.toThrow("process.exit");

        // Verify it checked for commits
        expect(mockGit.hasCommits).toHaveBeenCalled();

        // Verify it didn't try to create worktree
        expect(mockGit.createWorktree).not.toHaveBeenCalled();
    });

    it("should handle git error with HEAD message gracefully", async() => {
    // Mock hasCommits to return true but createWorktree fails with HEAD error
        mockGit.hasCommits.mockResolvedValue(true);
        mockGit.createWorktree.mockRejectedValue(
            new Error("fatal: Not a valid object name: 'HEAD'."),
        );

        await expect(executeCreate({name: "feature"})).rejects.toThrow("process.exit");

        expect(mockLogger.error).toHaveBeenCalledWith(
            "No commits found. Please make at least one commit before creating worktrees.",
        );
    });
});

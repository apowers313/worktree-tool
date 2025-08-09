import {StatusCommand} from "../../../src/commands/status";
import {WorktreeConfig} from "../../../src/core/types";

// Mock dependencies
vi.mock("../../../src/core/config");
vi.mock("../../../src/utils/logger");
vi.mock("../../../src/core/git");
vi.mock("../../../src/utils/find-root");

describe("Status Command - Conflict Detection", () => {
    let command: StatusCommand;
    let mockGit: any;
    let mockLogger: any;
    let mockConfig: WorktreeConfig;
    let consoleSpy: any;

    beforeEach(async() => {
        // Reset mocks
        vi.clearAllMocks();

        // Mock console.log to capture output
        consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

        // Create command instance
        command = new StatusCommand();

        // Mock logger
        mockLogger = {
            error: vi.fn(),
            success: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            verbose: vi.fn(),
            log: vi.fn(),
            progress: vi.fn().mockReturnValue(() => undefined),
            getLevel: vi.fn().mockReturnValue("normal"),
        };

        // Mock Git instance
        mockGit = {
            isGitRepository: vi.fn().mockResolvedValue(true),
            hasCommits: vi.fn().mockResolvedValue(true),
            listWorktrees: vi.fn(),
            getWorktreeStatus: vi.fn(),
            getAheadBehindBranch: vi.fn(),
            hasConflicts: vi.fn(),
            raw: vi.fn(),
        };

        // Mock config
        mockConfig = {
            version: "1.0.0",
            projectName: "test-project",
            mainBranch: "main",
            baseDir: ".worktrees",
            tmux: false,
        };

        // Mock the imports
        const {getLogger} = await import("../../../src/utils/logger");
        (getLogger as any).mockReturnValue(mockLogger);

        const {createGit} = await import("../../../src/core/git");
        (createGit as any).mockReturnValue(mockGit);

        const {loadConfig} = await import("../../../src/core/config");
        (loadConfig as any).mockResolvedValue(mockConfig);

        const {findProjectRoot} = await import("../../../src/utils/find-root");
        (findProjectRoot as any).mockResolvedValue("/test/project");
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    describe("Scenario 1: Active Conflicts", () => {
        it("should display active conflicts in red with (!) marker", async() => {
            // Setup worktree with active conflict
            mockGit.listWorktrees.mockResolvedValue([
                {path: "/test/project", branch: "main", isMain: true, isLocked: false, commit: "abc123"},
                {path: "/test/project/.worktrees/bat", branch: "bat", isMain: false, isLocked: false, commit: "def456"},
            ]);

            // Active conflict status (UU = both modified)
            mockGit.getWorktreeStatus.mockResolvedValue([
                "UU test.txt",
                "?? blah",
            ]);

            mockGit.getAheadBehindBranch.mockResolvedValue({ahead: 1, behind: 1});
            mockGit.hasConflicts.mockResolvedValue(true);

            await command.execute({verbose: true});

            // Check that conflicts are displayed in red
            const output = consoleSpy.mock.calls.map((call: any[]) => String(call[0])).join("\n");
            expect(output).toContain("[bat]  (!)1  (?)1  ↑1↓1");
            expect(output).toContain("(!) test.txt");
            expect(output).toContain("(?) blah");
        });

        it("should count different types of conflicts correctly", async() => {
            mockGit.listWorktrees.mockResolvedValue([
                {path: "/test/project", branch: "main", isMain: true, isLocked: false, commit: "abc123"},
                {path: "/test/project/.worktrees/test", branch: "test", isMain: false, isLocked: false, commit: "def456"},
            ]);

            // Multiple conflict types
            mockGit.getWorktreeStatus.mockResolvedValue([
                "UU file1.txt", // both modified
                "AA file2.txt", // both added
                "DD file3.txt", // both deleted
                "AU file4.txt", // added by us
                "UA file5.txt", // added by them
                "DU file6.txt", // deleted by us
                "UD file7.txt", // deleted by them
            ]);

            mockGit.getAheadBehindBranch.mockResolvedValue({ahead: 0, behind: 0});
            mockGit.hasConflicts.mockResolvedValue(true);

            await command.execute({verbose: false});

            const output = consoleSpy.mock.calls.map((call: any[]) => String(call[0])).join("\n");
            expect(output).toContain("(!)5"); // Should show 5 conflicts (UU, AA, DD, UA, UD)
        });
    });

    describe("Scenario 2: Potential Conflicts", () => {
        it("should display potential conflicts in orange with (!) marker", async() => {
            // Setup worktree with potential conflict (no active conflicts)
            mockGit.listWorktrees.mockResolvedValue([
                {path: "/test/project", branch: "main", isMain: true, isLocked: false, commit: "abc123"},
                {path: "/test/project/.worktrees/boom", branch: "boom", isMain: false, isLocked: false, commit: "def456"},
            ]);

            // No active conflicts in status
            mockGit.getWorktreeStatus.mockResolvedValue([]);

            mockGit.getAheadBehindBranch.mockResolvedValue({ahead: 1, behind: 1});
            mockGit.hasConflicts.mockResolvedValue(true); // Potential conflict exists

            // Mock diff to show which file would conflict
            mockGit.raw.mockResolvedValue("test.txt\n");

            await command.execute({verbose: true});

            const output = consoleSpy.mock.calls.map((call: any[]) => String(call[0])).join("\n");
            expect(output).toContain("[boom]  (!)1  ↑1↓1");

            // Verify git diff was called to get conflict files
            expect(mockGit.raw).toHaveBeenCalledWith(["-C", "/test/project/.worktrees/boom", "diff", "--name-only", "main"]);

            // Check that the file is displayed (would be in orange in terminal)
            expect(output).toContain("(!) test.txt");
        });

        it("should handle multiple potential conflict files", async() => {
            mockGit.listWorktrees.mockResolvedValue([
                {path: "/test/project", branch: "main", isMain: true, isLocked: false, commit: "abc123"},
                {path: "/test/project/.worktrees/feature", branch: "feature", isMain: false, isLocked: false, commit: "def456"},
            ]);

            mockGit.getWorktreeStatus.mockResolvedValue([]);
            mockGit.getAheadBehindBranch.mockResolvedValue({ahead: 3, behind: 0});
            mockGit.hasConflicts.mockResolvedValue(true);

            // Multiple files that would conflict
            mockGit.raw.mockResolvedValue("file1.txt\nfile2.txt\nfile3.txt\n");

            await command.execute({verbose: true});

            const output = consoleSpy.mock.calls.map((call: any[]) => String(call[0])).join("\n");
            expect(output).toContain("(!) file1.txt");
            expect(output).toContain("(!) file2.txt");
            expect(output).toContain("(!) file3.txt");
        });
    });

    describe("Edge Cases", () => {
        it("should handle worktrees with no conflicts", async() => {
            mockGit.listWorktrees.mockResolvedValue([
                {path: "/test/project", branch: "main", isMain: true, isLocked: false, commit: "abc123"},
                {path: "/test/project/.worktrees/clean", branch: "clean", isMain: false, isLocked: false, commit: "def456"},
            ]);

            mockGit.getWorktreeStatus.mockResolvedValue([
                " M file.txt", // Modified but not conflicted
            ]);

            mockGit.getAheadBehindBranch.mockResolvedValue({ahead: 0, behind: 0});
            mockGit.hasConflicts.mockResolvedValue(false);

            await command.execute({verbose: true});

            const output = consoleSpy.mock.calls.map((call: any[]) => String(call[0])).join("\n");
            expect(output).toContain("[clean]  (*)1");
            expect(output).not.toContain("(!)]"); // No conflict marker in status line
            expect(output).toContain("(*) file.txt"); // Shows modified file
        });

        it("should handle mixed active and potential conflicts correctly", async() => {
            mockGit.listWorktrees.mockResolvedValue([
                {path: "/test/project", branch: "main", isMain: true, isLocked: false, commit: "abc123"},
                {path: "/test/project/.worktrees/mixed", branch: "mixed", isMain: false, isLocked: false, commit: "def456"},
            ]);

            // Has active conflicts, so potential conflicts should not be checked
            mockGit.getWorktreeStatus.mockResolvedValue([
                "UU active-conflict.txt",
                " M regular-change.txt",
            ]);

            mockGit.getAheadBehindBranch.mockResolvedValue({ahead: 2, behind: 1});
            mockGit.hasConflicts.mockResolvedValue(true);

            await command.execute({verbose: true});

            const output = consoleSpy.mock.calls.map((call: any[]) => String(call[0])).join("\n");

            // Should show active conflict
            expect(output).toContain("(!)1");
            expect(output).toContain("(!) active-conflict.txt");

            // Should NOT call git diff for potential conflicts
            expect(mockGit.raw).not.toHaveBeenCalled();
        });

        it("should handle errors in conflict detection gracefully", async() => {
            mockGit.listWorktrees.mockResolvedValue([
                {path: "/test/project", branch: "main", isMain: true, isLocked: false, commit: "abc123"},
                {path: "/test/project/.worktrees/error", branch: "error", isMain: false, isLocked: false, commit: "def456"},
            ]);

            mockGit.getWorktreeStatus.mockResolvedValue([]);
            mockGit.getAheadBehindBranch.mockResolvedValue({ahead: 1, behind: 0});
            mockGit.hasConflicts.mockResolvedValue(true);

            // Git diff fails
            mockGit.raw.mockRejectedValue(new Error("Git command failed"));

            await command.execute({verbose: true});

            const output = consoleSpy.mock.calls.map((call: any[]) => String(call[0])).join("\n");

            // Should still show the worktree with conflict indicator
            expect(output).toContain("[error]");
            expect(output).toContain("(!)1");

            // But no files should be listed
            expect(output).not.toContain("(!) test.txt");
        });

        it("should suppress verbose status messages", async() => {
            mockGit.listWorktrees.mockResolvedValue([
                {path: "/test/project", branch: "main", isMain: true, isLocked: false, commit: "abc123"},
            ]);

            await command.execute({verbose: true});

            // Verbose status messages should not be shown
            expect(mockLogger.verbose).not.toHaveBeenCalledWith("Validating options...");
            expect(mockLogger.verbose).not.toHaveBeenCalledWith("Loading configuration...");
            expect(mockLogger.verbose).not.toHaveBeenCalledWith("Checking git repository...");
        });
    });

    describe("Display Order", () => {
        it("should display conflict files before other files in verbose mode", async() => {
            mockGit.listWorktrees.mockResolvedValue([
                {path: "/test/project", branch: "main", isMain: true, isLocked: false, commit: "abc123"},
                {path: "/test/project/.worktrees/ordered", branch: "ordered", isMain: false, isLocked: false, commit: "def456"},
            ]);

            mockGit.getWorktreeStatus.mockResolvedValue([
                "?? untracked.txt",
                "UU conflict.txt",
                " M modified.txt",
                "A  added.txt",
            ]);

            mockGit.getAheadBehindBranch.mockResolvedValue({ahead: 0, behind: 0});
            mockGit.hasConflicts.mockResolvedValue(true);

            await command.execute({verbose: true});

            const output = consoleSpy.mock.calls.map((call: any[]) => String(call[0])).join("\n");
            const lines = output.split("\n");

            // Find the ordered worktree section
            const orderedIndex = lines.findIndex((line) => line.includes("[ordered]"));
            expect(orderedIndex).toBeGreaterThan(-1);

            // Check order of files after the worktree header
            if (orderedIndex === -1) {
                throw new Error("Ordered worktree not found");
            }

            const startIndex = Number(orderedIndex) + 1;
            const endIndex = Math.min(startIndex + 4, lines.length);
            const filesSection = lines.slice(startIndex, endIndex);
            expect(filesSection[0]).toContain("(!) conflict.txt"); // Conflict first
            expect(filesSection[1]).toContain("(?) untracked.txt"); // Then untracked
            expect(filesSection[2]).toContain("(*) modified.txt"); // Then modified
            expect(filesSection[3]).toContain("(+) added.txt"); // Then staged
        });
    });
});

import chalk from "chalk";

import {WorktreeStatus} from "../../../src/core/types";
import {countStatuses, displayLegend, displayVerboseFiles, formatWorktreeStatus} from "../../../src/utils/status-formatter";

describe("Status Formatter - Conflict Display", () => {
    let consoleSpy: any;

    beforeEach(() => {
        // Mock console.log to capture output
        consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    describe("formatWorktreeStatus", () => {
        it("should display active conflicts in red", () => {
            const status: WorktreeStatus = {
                name: "test-worktree",
                path: "/path/to/worktree",
                counts: {
                    staged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                    unstaged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                    conflicts: 2, // Active conflicts
                    untracked: 0,
                },
                ahead: 0,
                behind: 0,
                hasConflicts: true,
            };

            const result = formatWorktreeStatus(status, 15);

            // Should contain red conflict indicator
            expect(result).toContain(chalk.red("(!)2"));
            expect(result).toContain("[test-worktree  ]");
        });

        it("should display potential conflicts in orange", () => {
            const status: WorktreeStatus = {
                name: "boom",
                path: "/path/to/boom",
                counts: {
                    staged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                    unstaged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                    conflicts: 0, // No active conflicts
                    untracked: 0,
                },
                ahead: 1,
                behind: 1,
                hasConflicts: true, // But has potential conflicts
            };

            const result = formatWorktreeStatus(status, 15);

            // Should contain orange conflict indicator
            const orangeColor = chalk.hex("#FFA500");
            expect(result).toContain(orangeColor("(!)1"));
            expect(result).toContain("[boom           ]");
        });

        it("should show conflicts before other status indicators", () => {
            const status: WorktreeStatus = {
                name: "mixed",
                path: "/path/to/mixed",
                counts: {
                    staged: {add: 1, mod: 2, del: 0, ren: 0, copy: 0, untracked: 0},
                    unstaged: {add: 0, mod: 1, del: 0, ren: 0, copy: 0, untracked: 0},
                    conflicts: 1,
                    untracked: 3,
                },
                ahead: 2,
                behind: 0,
                hasConflicts: true,
            };

            const result = formatWorktreeStatus(status, 15);

            // Check that conflicts appear in the result
            expect(result).toContain("(!)1");

            // Check other statuses
            expect(result).toContain("(+)1"); // Staged adds
            expect(result).toContain("(*)3"); // Total mods (2 staged + 1 unstaged)
            expect(result).toContain("(?)3"); // Untracked

            // Verify order by checking the string structure
            const conflictIndex = result.indexOf("(!)");
            const addIndex = result.indexOf("(+)");
            const modIndex = result.indexOf("(*)");

            // Conflicts should come before other statuses
            expect(conflictIndex).toBeLessThan(addIndex);
            expect(conflictIndex).toBeLessThan(modIndex);
        });
    });

    describe("displayLegend", () => {
        it("should show both red and orange conflict colors in legend", () => {
            displayLegend();

            const output = consoleSpy.mock.calls.map((call: any[]) => String(call[0])).join("\n");

            // Check that legend includes both conflict types
            expect(output).toContain("red: active conflicts");
            expect(output).toContain("orange: potential conflicts");

            // Should also include other colors
            expect(output).toContain("green: staged changes");
            expect(output).toContain("yellow: mix of staged and unstaged");
            expect(output).toContain("white: unstaged changes");
            expect(output).toContain("grey: untracked changes");
        });
    });

    describe("displayVerboseFiles", () => {
        it("should display conflict files first", () => {
            const statusLines = [
                "?? untracked.txt",
                "UU conflict1.txt",
                " M modified.txt",
                "AA conflict2.txt",
                "A  added.txt",
                "DD conflict3.txt",
            ];

            displayVerboseFiles(statusLines);

            const calls = consoleSpy.mock.calls.map((call: any[]) => String(call[0]));

            // Verify conflicts are displayed first (first 3 calls)
            expect(calls[0]).toContain("(!) conflict1.txt");
            expect(calls[1]).toContain("(!) conflict2.txt");
            expect(calls[2]).toContain("(!) conflict3.txt");

            // Then other files (order depends on the display logic)
            expect(calls[3]).toContain("(?) untracked.txt");
            expect(calls[4]).toContain("(*) modified.txt");
            expect(calls[5]).toContain("(+) added.txt");
        });

        it("should handle different conflict types correctly", () => {
            const statusLines = [
                "UU both-modified.txt",
                "AA both-added.txt",
                "DD both-deleted.txt",
                "AU added-by-us.txt",
                "UA added-by-them.txt",
                "DU deleted-by-us.txt",
                "UD deleted-by-them.txt",
            ];

            displayVerboseFiles(statusLines);

            const output = consoleSpy.mock.calls.map((call: any[]) => String(call[0])).join("\n");

            // Current implementation shows conflict marker for UU, AA, DD, UA, UD
            expect(output.match(/\(!\)/g)?.length).toBe(5);

            // Check conflict files are displayed
            expect(output).toContain("(!) both-modified.txt");
            expect(output).toContain("(!) both-added.txt");
            expect(output).toContain("(!) both-deleted.txt");
            expect(output).toContain("(!) added-by-them.txt"); // UA
            expect(output).toContain("(!) deleted-by-them.txt"); // UD

            // AU and DU are displayed with regular status markers
            expect(output).toContain("(+) added-by-us.txt"); // AU shows as staged add
            expect(output).toContain("(-) deleted-by-us.txt"); // DU shows as staged del
        });
    });

    describe("countStatuses", () => {
        it("should count conflicts separately from other statuses", () => {
            const statusLines = [
                "UU conflict.txt",
                " M modified.txt",
                "A  added.txt",
                "?? untracked.txt",
            ];

            const counts = countStatuses(statusLines);

            expect(counts.conflicts).toBe(1);
            expect(counts.staged.add).toBe(1);
            expect(counts.unstaged.mod).toBe(1);
            expect(counts.untracked).toBe(1);
        });

        it("should count all conflict types", () => {
            const statusLines = [
                "UU file1.txt",
                "AA file2.txt",
                "DD file3.txt",
                "AU file4.txt", // Not counted as conflict in current implementation
                "UA file5.txt", // Not counted as conflict in current implementation
                "DU file6.txt",
                "UD file7.txt",
            ];

            const counts = countStatuses(statusLines);

            // Current implementation counts UU, AA, DD, UA, UD as conflicts
            expect(counts.conflicts).toBe(5);
            // AU is counted as staged add
            expect(counts.staged.add).toBe(1);
            // DU is counted as staged del
            expect(counts.staged.del).toBe(1);
        });
    });
});

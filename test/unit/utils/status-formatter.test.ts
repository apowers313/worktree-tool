import {describe, expect, it, vi} from "vitest";

import {WorktreeStatus} from "../../../src/core/types.js";
import {
    categorizeStatus,
    countStatuses,
    formatWorktreeStatus,
    parseStatusLine,
} from "../../../src/utils/status-formatter.js";

// Mock chalk to test color formatting
vi.mock("chalk", () => ({
    default: {
        blue: (text: string) => `[blue]${text}[/blue]`,
        green: (text: string) => `[green]${text}[/green]`,
        red: (text: string) => `[red]${text}[/red]`,
        yellow: (text: string) => `[yellow]${text}[/yellow]`,
        cyan: (text: string) => `[cyan]${text}[/cyan]`,
        magenta: (text: string) => `[magenta]${text}[/magenta]`,
        gray: (text: string) => `[gray]${text}[/gray]`,
        hex: (color: string) => (text: string) => `[hex:${color}]${text}[/hex:${color}]`,
        white: (text: string) => `[white]${text}[/white]`,
        redBright: (text: string) => `[redBright]${text}[/redBright]`,
    },
}));

describe("status-formatter", () => {
    describe("parseStatusLine", () => {
        it("should parse staged add", () => {
            const result = parseStatusLine("A  file.txt");
            expect(result).toEqual({
                stagedStatus: "A",
                unstagedStatus: null,
                path: "file.txt",
            });
        });

        it("should parse unstaged modify", () => {
            const result = parseStatusLine(" M file.txt");
            expect(result).toEqual({
                stagedStatus: null,
                unstagedStatus: "M",
                path: "file.txt",
            });
        });

        it("should parse both staged and unstaged", () => {
            const result = parseStatusLine("AM file.txt");
            expect(result).toEqual({
                stagedStatus: "A",
                unstagedStatus: "M",
                path: "file.txt",
            });
        });

        it("should parse conflict", () => {
            const result = parseStatusLine("UU file.txt");
            expect(result).toEqual({
                stagedStatus: "U",
                unstagedStatus: "U",
                path: "file.txt",
            });
        });

        it("should handle paths with spaces", () => {
            const result = parseStatusLine("A  my file.txt");
            expect(result).toEqual({
                stagedStatus: "A",
                unstagedStatus: null,
                path: "my file.txt",
            });
        });
    });

    describe("categorizeStatus", () => {
        it("should categorize add", () => {
            expect(categorizeStatus("A")).toBe("add");
        });

        it("should categorize modify", () => {
            expect(categorizeStatus("M")).toBe("mod");
        });

        it("should categorize delete", () => {
            expect(categorizeStatus("D")).toBe("del");
        });

        it("should categorize rename", () => {
            expect(categorizeStatus("R")).toBe("ren");
        });

        it("should categorize copy", () => {
            expect(categorizeStatus("C")).toBe("copy");
        });

        it("should categorize conflict", () => {
            expect(categorizeStatus("U")).toBe("conflict");
        });

        it("should return untracked for ?", () => {
            expect(categorizeStatus("?")).toBe("untracked");
        });

        it("should return null for unknown", () => {
            expect(categorizeStatus("X")).toBe(null);
        });
    });

    describe("countStatuses", () => {
        it("should count empty status", () => {
            const result = countStatuses([]);
            expect(result).toEqual({
                staged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                unstaged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                conflicts: 0,
                untracked: 0,
            });
        });

        it("should count staged changes", () => {
            const lines = [
                "A  file1.txt",
                "M  file2.txt",
                "D  file3.txt",
            ];
            const result = countStatuses(lines);
            expect(result.staged.add).toBe(1);
            expect(result.staged.mod).toBe(1);
            expect(result.staged.del).toBe(1);
            expect(result.unstaged.add).toBe(0);
        });

        it("should count unstaged changes", () => {
            const lines = [
                " M file1.txt",
                " D file2.txt",
            ];
            const result = countStatuses(lines);
            expect(result.unstaged.mod).toBe(1);
            expect(result.unstaged.del).toBe(1);
            expect(result.staged.mod).toBe(0);
        });

        it("should count mixed changes", () => {
            const lines = [
                "AM file1.txt",
                "M  file2.txt",
                " M file3.txt",
            ];
            const result = countStatuses(lines);
            expect(result.staged.add).toBe(1);
            expect(result.staged.mod).toBe(1);
            expect(result.unstaged.mod).toBe(2);
        });

        it("should count conflicts", () => {
            const lines = [
                "UU conflict1.txt",
                "AA conflict2.txt",
                "DD conflict3.txt",
                "A  normal.txt",
            ];
            const result = countStatuses(lines);
            expect(result.conflicts).toBe(3);
            expect(result.staged.add).toBe(1);
        });

        it("should ignore empty lines", () => {
            const lines = [
                "A  file1.txt",
                "",
                " M file2.txt",
                "   ",
            ];
            const result = countStatuses(lines);
            expect(result.staged.add).toBe(1);
            expect(result.unstaged.mod).toBe(1);
        });

        it("should count untracked files", () => {
            const lines = [
                "?? untracked.txt",
                "A  added.txt",
                "?? another-untracked.txt",
            ];
            const result = countStatuses(lines);
            expect(result.staged.add).toBe(1);
            expect(result.unstaged.add).toBe(0);
            expect(result.untracked).toBe(2);
        });
    });

    describe("formatWorktreeStatus", () => {
        it("should format clean worktree", () => {
            const status: WorktreeStatus = {
                name: "main",
                path: "/path/to/main",
                counts: {
                    staged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                    unstaged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                    conflicts: 0,
                    untracked: 0,
                },
                ahead: 0,
                behind: 0,
            };
            const result = formatWorktreeStatus(status, 10);
            expect(result).toBe("[main      ]  ");
        });

        it("should format status with emoji correctly", () => {
            const status: WorktreeStatus = {
                name: "feature",
                path: "/path/to/feature",
                counts: {
                    staged: {add: 3, mod: 1, del: 0, ren: 0, copy: 0},
                    unstaged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0},
                    conflicts: 0,
                },
                ahead: 1,
                behind: 0,
            };
            const result = formatWorktreeStatus(status, 10);
            expect(result).toContain("(+)3");
            expect(result).toContain("(*)1");
            expect(result).toContain("\u21911");
        });

        it("should format with proper padding", () => {
            const status: WorktreeStatus = {
                name: "short",
                path: "/path",
                counts: {
                    staged: {add: 1, mod: 0, del: 0, ren: 0, copy: 0},
                    unstaged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0},
                    conflicts: 0,
                },
                ahead: 0,
                behind: 0,
            };
            const result = formatWorktreeStatus(status, 15);
            expect(result).toContain("[short          ]");
        });

        it("should show staged and unstaged with different colors", () => {
            const status: WorktreeStatus = {
                name: "mixed",
                path: "/path",
                counts: {
                    staged: {add: 2, mod: 0, del: 0, ren: 0, copy: 0},
                    unstaged: {add: 0, mod: 3, del: 0, ren: 0, copy: 0},
                    conflicts: 0,
                },
                ahead: 0,
                behind: 0,
            };
            const result = formatWorktreeStatus(status, 5);
            expect(result).toContain("[green](+)2[/green]");
            expect(result).toContain("[white](*)3[/white]");
        });

        it("should show conflicts in yellow", () => {
            const status: WorktreeStatus = {
                name: "conflict",
                path: "/path",
                counts: {
                    staged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                    unstaged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                    conflicts: 2,
                    untracked: 0,
                },
                ahead: 0,
                behind: 0,
            };
            const result = formatWorktreeStatus(status, 8);
            expect(result).toContain("[red](!)2[/red]");
        });

        it("should show ahead/behind status vs main branch", () => {
            const status: WorktreeStatus = {
                name: "diverged",
                path: "/path",
                counts: {
                    staged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                    unstaged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                    conflicts: 0,
                    untracked: 0,
                },
                ahead: 2,
                behind: 1,
            };
            const result = formatWorktreeStatus(status, 8);
            // Should show commits ahead/behind main branch in default color
            expect(result).toContain("\u21912\u21931");
            expect(result).not.toContain("[cyan]");
        });

        it("should only show non-zero counts", () => {
            const status: WorktreeStatus = {
                name: "partial",
                path: "/path",
                counts: {
                    staged: {add: 1, mod: 0, del: 0, ren: 0, copy: 0},
                    unstaged: {add: 0, mod: 0, del: 1, ren: 0, copy: 0},
                    conflicts: 0,
                },
                ahead: 0,
                behind: 3,
            };
            const result = formatWorktreeStatus(status, 7);
            expect(result).toContain("[green](+)1[/green]");
            expect(result).not.toContain("(*)");
            expect(result).toContain("[white](-)1[/white]");
            expect(result).toContain("\u21933");
            expect(result).not.toContain("\u2191");
            expect(result).not.toContain("[cyan]");
        });

        it("should handle all status types", () => {
            const status: WorktreeStatus = {
                name: "all",
                path: "/path",
                counts: {
                    staged: {add: 1, mod: 2, del: 3, ren: 4, copy: 5, untracked: 0},
                    unstaged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                    conflicts: 0,
                    untracked: 0,
                },
                ahead: 0,
                behind: 0,
            };
            const result = formatWorktreeStatus(status, 3);
            expect(result).toContain("[green](+)1[/green]");
            expect(result).toContain("[green](*)2[/green]");
            expect(result).toContain("[green](-)3[/green]");
            expect(result).toContain("[green](\u2192)4[/green]");
            expect(result).toContain("[green](\u00bb)5[/green]");
        });

        it("should show untracked files in magenta", () => {
            const status: WorktreeStatus = {
                name: "untracked",
                path: "/path",
                counts: {
                    staged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                    unstaged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
                    conflicts: 0,
                    untracked: 3,
                },
                ahead: 0,
                behind: 0,
            };
            const result = formatWorktreeStatus(status, 9);
            expect(result).toContain("[gray](?)3[/gray]");
        });
    });
});


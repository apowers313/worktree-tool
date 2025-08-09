import chalk from "chalk";

import {StatusCounts, WorktreeStatus} from "../core/types.js";

// Status symbols - easy to change between emoji and text symbols
const STATUS_SYMBOLS = {
    add: "(+)",
    mod: "(*)",
    del: "(-)",
    ren: "(\u2192)", // → arrow
    copy: "(\u00bb)", // » double chevron
    conflict: "(!)",
    untracked: "(?)",
};

// Commit status arrows (vs main branch)
const COMMIT_ARROWS = {
    ahead: "\u2191", // ↑ up arrow
    behind: "\u2193", // ↓ down arrow
};

// Color constants
const STAGED_COLOR = chalk.green;
const MIXED_COLOR = chalk.yellow;
const UNSTAGED_COLOR = chalk.white;
const UNTRACKED_COLOR = chalk.gray;
const CONFLICT_COLOR = chalk.red;
const DEFAULT_COLOR = (text: string): string => text;

/**
 * Format a worktree status into a colorful string for display
 */
export function formatWorktreeStatus(status: WorktreeStatus, maxNameLength: number): string {
    const paddedName = status.name.padEnd(maxNameLength);
    const coloredName = DEFAULT_COLOR(`[${paddedName}]`);

    const statusParts: string[] = [];

    // Conflicts first (red)
    if (status.counts.conflicts > 0) {
        statusParts.push(CONFLICT_COLOR(`${STATUS_SYMBOLS.conflict}${String(status.counts.conflicts)}`));
    }

    // Check for each file type - determine if staged only, unstaged only, or mixed
    const fileTypes: {symbol: string, stagedCount: number, unstagedCount: number}[] = [
        {symbol: STATUS_SYMBOLS.add, stagedCount: status.counts.staged.add, unstagedCount: status.counts.unstaged.add},
        {symbol: STATUS_SYMBOLS.mod, stagedCount: status.counts.staged.mod, unstagedCount: status.counts.unstaged.mod},
        {symbol: STATUS_SYMBOLS.del, stagedCount: status.counts.staged.del, unstagedCount: status.counts.unstaged.del},
        {symbol: STATUS_SYMBOLS.ren, stagedCount: status.counts.staged.ren, unstagedCount: 0},
        {symbol: STATUS_SYMBOLS.copy, stagedCount: status.counts.staged.copy, unstagedCount: 0},
    ];

    for (const fileType of fileTypes) {
        const totalCount = fileType.stagedCount + fileType.unstagedCount;
        if (totalCount > 0) {
            let color;
            if (fileType.stagedCount > 0 && fileType.unstagedCount > 0) {
                // Mixed staged and unstaged
                color = MIXED_COLOR;
            } else if (fileType.stagedCount > 0) {
                // Only staged
                color = STAGED_COLOR;
            } else {
                // Only unstaged
                color = UNSTAGED_COLOR;
            }

            statusParts.push(color(`${fileType.symbol}${String(totalCount)}`));
        }
    }

    // Untracked files (grey)
    if (status.counts.untracked > 0) {
        statusParts.push(UNTRACKED_COLOR(`${STATUS_SYMBOLS.untracked}${String(status.counts.untracked)}`));
    }

    // Commit status vs main branch (default color)
    if (status.ahead > 0 && status.behind > 0) {
        statusParts.push(DEFAULT_COLOR(`${COMMIT_ARROWS.ahead}${String(status.ahead)}${COMMIT_ARROWS.behind}${String(status.behind)}`));
    } else if (status.ahead > 0) {
        statusParts.push(DEFAULT_COLOR(`${COMMIT_ARROWS.ahead}${String(status.ahead)}`));
    } else if (status.behind > 0) {
        statusParts.push(DEFAULT_COLOR(`${COMMIT_ARROWS.behind}${String(status.behind)}`));
    }

    return `${coloredName}  ${statusParts.join("  ")}`;
}

/**
 * Parse a single line from git status --porcelain output
 */
export function parseStatusLine(line: string): {stagedStatus: string | null, unstagedStatus: string | null, path: string} {
    const stagedStatus = !line.startsWith(" ") ? line[0] ?? null : null;
    const unstagedStatus = line[1] !== " " ? line[1] ?? null : null;
    const path = line.substring(3);
    return {stagedStatus, unstagedStatus, path};
}

/**
 * Map git status codes to our categories
 */
export function categorizeStatus(statusCode: string): keyof StatusCounts | "conflict" | "untracked" | null {
    switch (statusCode) {
        case "A": return "add";
        case "M": return "mod";
        case "D": return "del";
        case "R": return "ren";
        case "C": return "copy";
        case "U": return "conflict";
        case "?": return "untracked";
        default: return null;
    }
}

/**
 * Display the legend for status symbols
 */
export function displayLegend(): void {
    // eslint-disable-next-line no-console
    console.log("\nLegend:");
    // Symbols section
    // eslint-disable-next-line no-console
    console.log(`  ${STATUS_SYMBOLS.add} Added files`);
    // eslint-disable-next-line no-console
    console.log(`  ${STATUS_SYMBOLS.mod} Modified files`);
    // eslint-disable-next-line no-console
    console.log(`  ${STATUS_SYMBOLS.del} Deleted files`);
    // eslint-disable-next-line no-console
    console.log(`  ${STATUS_SYMBOLS.ren} Renamed files`);
    // eslint-disable-next-line no-console
    console.log(`  ${STATUS_SYMBOLS.copy} Copied files`);
    // eslint-disable-next-line no-console
    console.log(`  ${STATUS_SYMBOLS.conflict} Conflicts`);
    // eslint-disable-next-line no-console
    console.log(`  ${STATUS_SYMBOLS.untracked} Untracked files`);
    // eslint-disable-next-line no-console
    console.log(`  ${COMMIT_ARROWS.ahead}N Commits ahead of main`);
    // eslint-disable-next-line no-console
    console.log(`  ${COMMIT_ARROWS.behind}N Commits behind main`);
    // eslint-disable-next-line no-console
    console.log("");
    // Colors section
    // eslint-disable-next-line no-console
    console.log(`  ${STAGED_COLOR("green")}: staged changes`);
    // eslint-disable-next-line no-console
    console.log(`  ${MIXED_COLOR("yellow")}: mix of staged and unstaged changes`);
    // eslint-disable-next-line no-console
    console.log(`  ${UNSTAGED_COLOR("white")}: unstaged changes`);
    // eslint-disable-next-line no-console
    console.log(`  ${UNTRACKED_COLOR("grey")}: untracked changes`);
    // eslint-disable-next-line no-console
    console.log(`  ${CONFLICT_COLOR("red")}: conflicts\n`);
}

/**
 * Format and display verbose file listing
 */
export function displayVerboseFiles(lines: string[]): void {
    // Sort lines to put conflicts first
    const sortedLines = [... lines].sort((a, b) => {
        const {stagedStatus: aStaged, unstagedStatus: aUnstaged} = parseStatusLine(a);
        const {stagedStatus: bStaged, unstagedStatus: bUnstaged} = parseStatusLine(b);

        const aIsConflict = aStaged === "U" || (aStaged === "A" && aUnstaged === "A") ||
                           (aStaged === "D" && aUnstaged === "D");
        const bIsConflict = bStaged === "U" || (bStaged === "A" && bUnstaged === "A") ||
                           (bStaged === "D" && bUnstaged === "D");

        if (aIsConflict && !bIsConflict) {
            return -1;
        }

        if (!aIsConflict && bIsConflict) {
            return 1;
        }

        return 0;
    });

    for (const line of sortedLines) {
        if (!line.trim()) {
            continue;
        }

        const {stagedStatus, unstagedStatus, path} = parseStatusLine(line);

        // Handle different file states
        if (stagedStatus === "?" && unstagedStatus === "?") {
            // Untracked files (grey)
            // eslint-disable-next-line no-console
            console.log(`${UNTRACKED_COLOR(STATUS_SYMBOLS.untracked)} ${path}`);
        } else if (stagedStatus === "U" || (stagedStatus === "A" && unstagedStatus === "A") ||
                   (stagedStatus === "D" && unstagedStatus === "D")) {
            // Conflicts (red)
            // eslint-disable-next-line no-console
            console.log(`${CONFLICT_COLOR(STATUS_SYMBOLS.conflict)} ${path}`);
        } else if (stagedStatus && stagedStatus !== " ") {
            // Staged changes (green)
            const category = categorizeStatus(stagedStatus);
            if (category && category !== "conflict" && category !== "untracked") {
                const symbol = STATUS_SYMBOLS[category];
                // eslint-disable-next-line no-console
                console.log(`${STAGED_COLOR(symbol)} ${path}`);
            }
        } else if (unstagedStatus && unstagedStatus !== " ") {
            // Unstaged changes (gray)
            const category = categorizeStatus(unstagedStatus);
            if (category && category !== "conflict" && category !== "untracked") {
                const symbol = STATUS_SYMBOLS[category];
                // eslint-disable-next-line no-console
                console.log(`${UNSTAGED_COLOR(symbol)} ${path}`);
            }
        }
    }
}

/**
 * Count statuses from porcelain output lines
 */
export function countStatuses(lines: string[]): WorktreeStatus["counts"] {
    const counts = {
        staged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
        unstaged: {add: 0, mod: 0, del: 0, ren: 0, copy: 0, untracked: 0},
        conflicts: 0,
        untracked: 0,
    };

    for (const line of lines) {
        if (!line.trim()) {
            continue;
        }

        const {stagedStatus, unstagedStatus} = parseStatusLine(line);

        // Check for conflicts (UU, AA, DD)
        if (stagedStatus === "U" || (stagedStatus === "A" && unstagedStatus === "A") ||
            (stagedStatus === "D" && unstagedStatus === "D")) {
            counts.conflicts++;
            continue;
        }

        // Handle untracked files specially (they appear as "?? filename")
        if (stagedStatus === "?" && unstagedStatus === "?") {
            counts.untracked++;
            continue;
        }

        // Count staged changes
        if (stagedStatus) {
            const category = categorizeStatus(stagedStatus);
            if (category && category !== "conflict" && category !== "untracked") {
                counts.staged[category]++;
            }
        }

        // Count unstaged changes
        if (unstagedStatus) {
            const category = categorizeStatus(unstagedStatus);
            if (category && category !== "conflict" && category !== "untracked") {
                counts.unstaged[category]++;
            }
        }
    }

    return counts;
}


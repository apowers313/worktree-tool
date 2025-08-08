import {SpyInstance, vi} from "vitest";

import {CommandContext} from "../../src/commands/base";
import {Git} from "../../src/core/git";
import {WorktreeConfig} from "../../src/core/types";
import {Logger} from "../../src/utils/logger";

export function createMockLogger(overrides?: Partial<Logger>): Logger {
    return {
        verbose: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        log: vi.fn(),
        progress: vi.fn().mockReturnValue(vi.fn()),
        getLevel: vi.fn().mockReturnValue("normal"),
        ... overrides,
    };
}

export function createMockGit(overrides?: Partial<Git>): Git {
    return {
        isGitRepository: vi.fn().mockResolvedValue(true),
        hasCommits: vi.fn().mockResolvedValue(true),
        createWorktree: vi.fn().mockResolvedValue(undefined),
        getMainBranch: vi.fn().mockResolvedValue("main"),
        listWorktrees: vi.fn().mockResolvedValue([]),
        getRepoRoot: vi.fn().mockResolvedValue("/repo"),
        branchExists: vi.fn().mockResolvedValue(false),
        getWorktreeByName: vi.fn().mockResolvedValue(null),
        getMainWorktree: vi.fn().mockResolvedValue({
            path: "/repo",
            branch: "refs/heads/main",
            isMain: true,
            isLocked: false,
            commit: "abc123",
        }),
        hasUntrackedFiles: vi.fn().mockResolvedValue(false),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
        hasStagedChanges: vi.fn().mockResolvedValue(false),
        hasUnmergedCommits: vi.fn().mockResolvedValue(false),
        hasStashedChanges: vi.fn().mockResolvedValue(false),
        hasSubmoduleModifications: vi.fn().mockResolvedValue(false),
        removeWorktree: vi.fn().mockResolvedValue(undefined),
        ... overrides,
    } as unknown as Git;
}

export function mockProcessExit(): SpyInstance {
    return vi.spyOn(process, "exit").mockImplementation((code?: any): never => {
        throw new ProcessExitError(code ?? 1);
    });
}

export class ProcessExitError extends Error {
    constructor(public code: number) {
        super(`Process exited with code ${String(code)}`);
        this.name = "ProcessExitError";
    }
}

export function createMockContext(overrides?: Partial<CommandContext>): CommandContext {
    return {
        logger: createMockLogger(),
        git: createMockGit(),
        config: {
            baseDir: ".worktrees",
            projectName: "test-project",
            tmux: false,
        } as WorktreeConfig,
        ... overrides,
    };
}

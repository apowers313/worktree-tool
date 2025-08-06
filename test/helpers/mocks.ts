import {SpyInstance, vi} from "vitest";

import {Git} from "../../src/core/git";
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

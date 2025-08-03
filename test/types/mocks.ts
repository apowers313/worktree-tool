// Mock type definitions for tests

export interface MockLogger {
    verbose: jest.Mock;
    info: jest.Mock;
    success: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
    log: jest.Mock;
    progress: jest.Mock;
    getLevel: jest.Mock;
}

export interface MockGit {
    isGitRepository: jest.Mock;
    hasCommits: jest.Mock;
    createWorktree: jest.Mock;
    getMainBranch: jest.Mock;
    listWorktrees: jest.Mock;
    getRepoRoot: jest.Mock;
    branchExists: jest.Mock;
}

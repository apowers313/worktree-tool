// Mock type definitions for tests

export interface MockLogger {
    verbose: any;
    info: any;
    success: any;
    error: any;
    warn: any;
    log: any;
    progress: any;
    getLevel: any;
}

export interface MockGit {
    isGitRepository: any;
    hasCommits: any;
    createWorktree: any;
    getMainBranch: any;
    listWorktrees: any;
    getRepoRoot: any;
    branchExists: any;
}

import {promises as fs} from "fs";
import * as path from "path";
import {SimpleGit, simpleGit} from "simple-git";

import {TestSandbox} from "./sandbox";

// Re-export sandbox utilities for convenience
export {
    createIsolatedTestRepo,
    createIsolatedTestRepoWithBranches,
    createIsolatedTestRepoWithCommit,
    TestSandbox,
    withTestSandbox} from "./sandbox";

/**
 * Create a test git repository
 * @deprecated Use createTestRepoInSandbox with TestSandbox instead
 */
export async function createTestRepo(dir: string): Promise<SimpleGit> {
    const git = simpleGit(dir);

    // Initialize repository
    await git.init();

    // Set user config for tests
    await git.addConfig("user.email", "test@example.com");
    await git.addConfig("user.name", "Test User");

    return git;
}

/**
 * Create a test git repository in sandbox
 */
export async function createTestRepoInSandbox(
    sandbox: TestSandbox,
    name?: string,
): Promise<SimpleGit & {path: string}> {
    const repoDir = path.join(sandbox.getWorkspacePath(), name || "repo");
    await fs.mkdir(repoDir, {recursive: true});

    const git = simpleGit(repoDir);
    await git.init();

    // Add path property for convenience
    return Object.assign(git, {path: repoDir});
}

/**
 * Create a test repository with an initial commit
 * @deprecated Use createTestRepoWithCommitInSandbox with TestSandbox instead
 */
export async function createTestRepoWithCommit(dir: string): Promise<SimpleGit> {
    const git = await createTestRepo(dir);

    // Create initial file
    const readmePath = path.join(dir, "README.md");
    await fs.writeFile(readmePath, "# Test Project\n");

    // Make initial commit
    await git.add("README.md");
    await git.commit("Initial commit");

    return git;
}

/**
 * Create a test repository with an initial commit in sandbox
 */
export async function createTestRepoWithCommitInSandbox(
    sandbox: TestSandbox,
    name?: string,
): Promise<SimpleGit & {path: string}> {
    const repoDir = path.join(sandbox.getWorkspacePath(), name || "repo");
    await fs.mkdir(repoDir, {recursive: true});

    const git = simpleGit(repoDir);
    await git.init();

    // Create initial file
    const readmePath = path.join(repoDir, "README.md");
    await fs.writeFile(readmePath, "# Test Project\n");

    // Make initial commit
    await git.add("README.md");
    await git.commit("Initial commit");

    // Add path property for convenience
    return Object.assign(git, {path: repoDir});
}

/**
 * Create a test repository with multiple branches
 * @deprecated Use createTestRepoWithBranchesInSandbox with TestSandbox instead
 */
export async function createTestRepoWithBranches(
    dir: string,
    branches: string[],
): Promise<SimpleGit> {
    const git = await createTestRepoWithCommit(dir);

    // Create additional branches
    for (const branch of branches) {
        await git.checkoutLocalBranch(branch);

        // Add a unique file to each branch
        const fileName = branch.replace(/\//g, "-"); // Replace slashes to avoid path issues
        const filePath = path.join(dir, `${fileName}.txt`);
        await fs.writeFile(filePath, `Content for ${branch} branch\n`);
        await git.add(`${fileName}.txt`);
        await git.commit(`Add ${fileName}.txt`);
    }

    // Return to main/master branch
    const mainBranch = await getDefaultBranch(git);
    await git.checkout(mainBranch);

    return git;
}

/**
 * Create a test repository with multiple branches in sandbox
 */
export async function createTestRepoWithBranchesInSandbox(
    sandbox: TestSandbox,
    branches: string[],
    name?: string,
): Promise<SimpleGit & {path: string}> {
    const git = await createTestRepoWithCommitInSandbox(sandbox, name);

    // Create additional branches
    for (const branch of branches) {
        await git.checkoutLocalBranch(branch);

        // Add a unique file to each branch
        const fileName = branch.replace(/\//g, "-"); // Replace slashes to avoid path issues
        const filePath = path.join(git.path, `${fileName}.txt`);
        await fs.writeFile(filePath, `Content for ${branch} branch\n`);
        await git.add(`${fileName}.txt`);
        await git.commit(`Add ${fileName}.txt`);
    }

    // Return to main branch (sandbox ensures it's 'main')
    await git.checkout("main");

    return git;
}

/**
 * Get the default branch name (main or master)
 */
export async function getDefaultBranch(git: SimpleGit): Promise<string> {
    try {
    // Try to get the configured default branch
        const result = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
        const match = /refs\/remotes\/origin\/(.+)/.exec(result);
        if (match?.[1]) {
            return match[1].trim();
        }
    } catch {
    // Fallback: check which exists
        const branches = await git.branchLocal();
        if (branches.all.includes("main")) {
            return "main";
        }

        if (branches.all.includes("master")) {
            return "master";
        }
    }

    // Default to 'main'
    return "main";
}

/**
 * Create a worktree in a test repository
 */
export async function createTestWorktree(
    git: SimpleGit,
    branchName: string,
    worktreePath: string,
): Promise<void> {
    // Create new branch and worktree
    await git.raw(["worktree", "add", "-b", branchName, worktreePath]);
}

/**
 * List worktrees in a test repository
 */
export async function listTestWorktrees(git: SimpleGit): Promise<string[]> {
    const output = await git.raw(["worktree", "list", "--porcelain"]);
    const worktrees: string[] = [];

    const lines = output.split("\n");
    for (const line of lines) {
        if (line.startsWith("worktree ")) {
            worktrees.push(line.substring(9));
        }
    }

    return worktrees;
}

/**
 * Remove a worktree from a test repository
 */
export async function removeTestWorktree(
    git: SimpleGit,
    worktreePath: string,
): Promise<void> {
    await git.raw(["worktree", "remove", worktreePath, "--force"]);
}

/**
 * Check if a path is inside a git repository
 */
export async function isInsideGitRepo(dir: string): Promise<boolean> {
    try {
        const git = simpleGit(dir);
        await git.revparse(["--git-dir"]);
        return true;
    } catch {
        return false;
    }
}

/**
 * Create a nested git repository (for testing edge cases)
 * @deprecated Use createNestedGitRepoInSandbox with TestSandbox instead
 */
export async function createNestedGitRepo(
    parentDir: string,
    subDir: string,
): Promise<SimpleGit> {
    const nestedPath = path.join(parentDir, subDir);
    await fs.mkdir(nestedPath, {recursive: true});

    return createTestRepoWithCommit(nestedPath);
}

/**
 * Create a nested git repository in sandbox
 */
export async function createNestedGitRepoInSandbox(
    sandbox: TestSandbox,
    parentSubPath: string,
    subDir: string,
): Promise<SimpleGit> {
    const parentPath = path.join(sandbox.getWorkspacePath(), parentSubPath);
    const nestedPath = path.join(parentPath, subDir);
    await fs.mkdir(nestedPath, {recursive: true});

    const git = simpleGit(nestedPath);
    await git.init();

    // Create initial file
    const readmePath = path.join(nestedPath, "README.md");
    await fs.writeFile(readmePath, "# Nested Test Project\n");

    // Make initial commit
    await git.add("README.md");
    await git.commit("Initial commit");

    return git;
}

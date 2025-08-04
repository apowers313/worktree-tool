import {promises as fs} from "fs";
import * as os from "os";
import * as path from "path";
import {SimpleGit, simpleGit} from "simple-git";

export interface SandboxOptions {
    // Optional git config overrides
    gitConfig?: Record<string, string>;
    // Whether to preserve sandbox after test (for debugging)
    preserveOnError?: boolean;
}

export class TestSandbox {
    private tempDir: string | null = null;
    private originalCwd: string;
    private originalEnv: NodeJS.ProcessEnv;
    private cleanupFunctions: (() => Promise<void>)[] = [];
    private options: SandboxOptions;

    constructor(options: SandboxOptions = {}) {
        this.options = options;
        this.originalCwd = process.cwd();
        this.originalEnv = {... process.env};
    }

    /**
   * Create and enter sandbox
   */
    async setup(): Promise<void> {
    // Create temporary directory
        this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wtt-test-"));

        // Set restrictive permissions (owner only)
        await fs.chmod(this.tempDir, 0o700);

        // Create subdirectories
        const workspace = path.join(this.tempDir, "workspace");
        const gnupgHome = path.join(this.tempDir, "gnupg");

        await fs.mkdir(workspace, {recursive: true});
        await fs.mkdir(gnupgHome, {recursive: true});

        // Create empty git credentials file
        const credentialsPath = path.join(this.tempDir, "git-credentials");
        await fs.writeFile(credentialsPath, "");
        await fs.chmod(credentialsPath, 0o600);

        // Create git config
        await this.createGitConfig();

        // Set up environment isolation
        this.setupEnvironment();

        // Change to workspace directory
        process.chdir(workspace);
    }

    /**
   * Create isolated git configuration
   */
    private async createGitConfig(): Promise<void> {
        if (!this.tempDir) {
            throw new Error("Sandbox not initialized");
        }

        const configPath = this.getGitConfigPath();
        const defaultConfig = {
            "user.name": "Test User",
            "user.email": "test@example.com",
            "commit.gpgsign": "false",
            "tag.gpgsign": "false",
            "init.defaultBranch": "main",
            "core.autocrlf": "false",
            "core.filemode": "true",
            "credential.helper": "",
            // Merge with user-provided config
            ... (this.options.gitConfig ?? {}),
        };

        // Build config file content
        const configSections: Record<string, Record<string, string>> = {};

        for (const [key, value] of Object.entries(defaultConfig)) {
            const parts = key.split(".");
            if (parts.length < 2) {
                continue;
            }

            const section = parts[0];
            const option = parts.slice(1).join(".");

            if (section && option) {
                configSections[section] ??= {};

                configSections[section][option] = value;
            }
        }

        // Write config file
        let configContent = "";
        for (const [section, options] of Object.entries(configSections)) {
            configContent += `[${section}]\n`;
            for (const [option, value] of Object.entries(options)) {
                configContent += `  ${option} = ${value}\n`;
            }
            configContent += "\n";
        }

        await fs.writeFile(configPath, configContent.trim());
    }

    /**
   * Set up isolated environment variables
   */
    private setupEnvironment(): void {
        if (!this.tempDir) {
            throw new Error("Sandbox not initialized");
        }

        // Override git configuration paths
        process.env.GIT_CONFIG_GLOBAL = this.getGitConfigPath();
        process.env.GIT_CONFIG_SYSTEM = "/dev/null";
        process.env.GIT_CONFIG_NOSYSTEM = "1";

        // Override HOME to prevent any other config access
        process.env.HOME = this.tempDir;

        // Disable GPG
        process.env.GNUPGHOME = path.join(this.tempDir, "gnupg");

        // Disable git prompts
        process.env.GIT_ASKPASS = "echo";
        process.env.GIT_TERMINAL_PROMPT = "0";

        // Disable SSH prompts
        process.env.SSH_ASKPASS = "echo";
        process.env.GIT_SSH_COMMAND = "ssh -o BatchMode=yes";

        // Disable tmux for tests unless explicitly testing tmux
        if (!process.env.WTT_TEST_TMUX) {
            process.env.WTT_DISABLE_TMUX = "true";
        }

        // Additional isolation for commit signing
        process.env.GPG_TTY = "";
        delete process.env.GPG_AGENT_INFO;
    }

    /**
   * Clean up and exit sandbox
   */
    async cleanup(): Promise<void> {
    // Run any registered cleanup functions
        for (const cleanupFn of this.cleanupFunctions.reverse()) {
            try {
                await cleanupFn();
            } catch(error) {
                console.warn("Cleanup function failed:", error);
            }
        }

        // Restore original working directory
        try {
            process.chdir(this.originalCwd);
        } catch(error) {
            console.warn("Failed to restore working directory:", error);
        }

        // Restore original environment
        process.env = this.originalEnv;

        // Remove temporary directory
        if (this.tempDir && !this.options.preserveOnError) {
            try {
                await fs.rm(this.tempDir, {recursive: true, force: true});
            } catch(error) {
                console.warn(`Failed to remove temp directory ${this.tempDir}:`, error);
            }
        } else if (this.tempDir && this.options.preserveOnError) {
            console.log(`Sandbox preserved at: ${this.tempDir}`);
        }
    }

    /**
   * Get temporary directory path
   */
    getTempDir(): string {
        if (!this.tempDir) {
            throw new Error("Sandbox not initialized");
        }

        return this.tempDir;
    }

    /**
   * Get git config file path
   */
    getGitConfigPath(): string {
        if (!this.tempDir) {
            throw new Error("Sandbox not initialized");
        }

        return path.join(this.tempDir, "git-config");
    }

    /**
   * Get workspace directory path
   */
    getWorkspacePath(): string {
        if (!this.tempDir) {
            throw new Error("Sandbox not initialized");
        }

        return path.join(this.tempDir, "workspace");
    }

    /**
   * Register a cleanup function to run during cleanup
   */
    registerCleanup(fn: () => Promise<void>): void {
        this.cleanupFunctions.push(fn);
    }
}

/**
 * Create an isolated test repository
 */
export async function createIsolatedTestRepo(
    sandbox: TestSandbox,
    name?: string,
): Promise<SimpleGit & {path: string}> {
    const repoDir = path.join(sandbox.getWorkspacePath(), name ?? "repo");
    await fs.mkdir(repoDir, {recursive: true});

    const git = simpleGit(repoDir);
    await git.init();

    // Add path property for convenience
    return Object.assign(git, {path: repoDir});
}

/**
 * Convenience wrapper for running tests in sandbox
 */
export async function withTestSandbox<T>(
    fn: (sandbox: TestSandbox) => Promise<T>,
    options?: SandboxOptions,
): Promise<T> {
    const sandbox = new TestSandbox(options);

    try {
        await sandbox.setup();
        return await fn(sandbox);
    } catch(error) {
    // If test failed and preserveOnError is true, update options
        if (options?.preserveOnError) {
            console.error("Test failed, preserving sandbox for debugging");
        }

        throw error;
    } finally {
        await sandbox.cleanup();
    }
}

/**
 * Create a test repository with an initial commit
 */
export async function createIsolatedTestRepoWithCommit(
    sandbox: TestSandbox,
    name?: string,
): Promise<SimpleGit & {path: string}> {
    const git = await createIsolatedTestRepo(sandbox, name);

    // Create initial file
    const readmePath = path.join(git.path, "README.md");
    await fs.writeFile(readmePath, "# Test Project\n");

    // Make initial commit
    await git.add("README.md");
    await git.commit("Initial commit");

    return git;
}

/**
 * Create a test repository with multiple branches
 */
export async function createIsolatedTestRepoWithBranches(
    sandbox: TestSandbox,
    branches: string[],
    name?: string,
): Promise<SimpleGit & {path: string}> {
    const git = await createIsolatedTestRepoWithCommit(sandbox, name);

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

    // Return to main branch
    await git.checkout("main");

    return git;
}

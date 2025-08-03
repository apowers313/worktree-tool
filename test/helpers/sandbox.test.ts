import {promises as fs} from "fs";
import * as path from "path";

import {createIsolatedTestRepo, TestSandbox, withTestSandbox} from "./sandbox";

describe("TestSandbox", () => {
    it("should create and cleanup temp directory", async() => {
        const sandbox = new TestSandbox();

        await sandbox.setup();

        // Verify temp directory exists
        const tempDir = sandbox.getTempDir();
        expect(tempDir).toBeTruthy();
        expect(tempDir).toMatch(/\/tmp\/wtt-test-/);

        const exists = await fs.access(tempDir).then(() => true).catch(() => false);
        expect(exists).toBe(true);

        // Verify workspace exists
        const workspace = sandbox.getWorkspacePath();
        const workspaceExists = await fs.access(workspace).then(() => true).catch(() => false);
        expect(workspaceExists).toBe(true);

        // Cleanup
        await sandbox.cleanup();

        // Verify temp directory is removed
        const existsAfter = await fs.access(tempDir).then(() => true).catch(() => false);
        expect(existsAfter).toBe(false);
    });

    it("should set git environment variables", async() => {
        const originalEnv = {... process.env};

        // eslint-disable-next-line @typescript-eslint/require-await
        await withTestSandbox(async(sandbox) => {
            // Check environment variables are set
            expect(process.env.GIT_CONFIG_GLOBAL).toBe(sandbox.getGitConfigPath());
            expect(process.env.GIT_CONFIG_SYSTEM).toBe("/dev/null");
            expect(process.env.GIT_CONFIG_NOSYSTEM).toBe("1");
            expect(process.env.GIT_TERMINAL_PROMPT).toBe("0");
            expect(process.env.WTT_DISABLE_TMUX).toBe("true");
        });

        // Verify environment is restored
        expect(process.env.GIT_CONFIG_GLOBAL).toBe(originalEnv.GIT_CONFIG_GLOBAL);
        expect(process.env.GIT_CONFIG_SYSTEM).toBe(originalEnv.GIT_CONFIG_SYSTEM);
    });

    it("should create git config with defaults", async() => {
        await withTestSandbox(async(sandbox) => {
            const configPath = sandbox.getGitConfigPath();
            const configContent = await fs.readFile(configPath, "utf-8");

            expect(configContent).toContain("[user]");
            expect(configContent).toContain("name = Test User");
            expect(configContent).toContain("email = test@example.com");
            expect(configContent).toContain("[commit]");
            expect(configContent).toContain("gpgsign = false");
        });
    });

    it("should create isolated git repository", async() => {
        await withTestSandbox(async(sandbox) => {
            const git = await createIsolatedTestRepo(sandbox);

            // Verify git repo was created
            expect(git.path).toBeTruthy();
            expect(git.path).toContain(sandbox.getWorkspacePath());

            // Verify it's a valid git repo
            const gitDir = path.join(git.path, ".git");
            const gitDirExists = await fs.access(gitDir).then(() => true).catch(() => false);
            expect(gitDirExists).toBe(true);

            // Verify we can run git commands
            const status = await git.status();
            expect(status.isClean()).toBe(true);
        });
    });
});

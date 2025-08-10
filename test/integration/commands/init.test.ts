import {execSync} from "child_process";
import {promises as fs} from "fs";
import * as path from "path";
import {simpleGit} from "simple-git";

import {
    createIsolatedTestRepo,
    createIsolatedTestRepoWithBranches,
    createIsolatedTestRepoWithCommit,
    withTestSandbox} from "../../helpers/git";
import {
    ensureNotInWorktree,
    execSyncWithoutTmux,
} from "../../helpers/isolation";

// Path to the compiled wtt binary
const WTT_BIN = path.resolve(__dirname, "../../../dist/index.js");

describe("Init Command Integration Tests", () => {
    // Increase timeout for integration tests
    vi.setConfig({testTimeout: 30000}); // Replace jest.setTimeout(30000);

    // Ensure tests are not running in a worktree
    beforeAll(async() => {
        await ensureNotInWorktree();
    });

    describe("Basic Initialization", () => {
        it("should fail in non-git directory", async() => {
            await withTestSandbox(async(sandbox) => {
                // Change to workspace (non-git directory)
                process.chdir(sandbox.getWorkspacePath());

                // Try to run init in a non-git directory
                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                    });
                }).toThrow();

                // Verify error message
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                    });
                } catch(error) {
                    expect((error as {stderr?: string}).stderr).toContain("Not in a git repository");
                }
            });
        });

        it("should succeed in git directory without commits", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create empty git repo
                const git = await createIsolatedTestRepo(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Run init - should succeed
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                    encoding: "utf-8",
                });

                // Verify concise success message
                expect(output).toContain("Initialized worktree project. Config: .worktree-config.json");

                // Verify config was created with detected branch
                const config = JSON.parse(
                    await fs.readFile(".worktree-config.json", "utf-8"),
                ) as {version?: string, mainBranch?: string, baseDir?: string, projectName?: string, tmux?: boolean};
                // Should be 'main' with sandbox config
                expect(config.mainBranch).toBe("main");
            });
        });

        it("should detect master branch in empty repo", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create repo with custom branch
                const repoPath = path.join(sandbox.getWorkspacePath(), "repo");
                await fs.mkdir(repoPath, {recursive: true});
                const git = simpleGit(repoPath);
                await git.init();

                // Force HEAD to point to master
                await git.raw(["symbolic-ref", "HEAD", "refs/heads/master"]);

                // Change to repo directory
                process.chdir(repoPath);

                // Run init
                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Verify detected branch
                const config = JSON.parse(
                    await fs.readFile(".worktree-config.json", "utf-8"),
                ) as {version?: string, mainBranch?: string, baseDir?: string, projectName?: string, tmux?: boolean};
                expect(config.mainBranch).toBe("master");
            });
        });

        it("should detect main branch in empty repo", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create repo - sandbox defaults to main
                const git = await createIsolatedTestRepo(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Run init
                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Verify detected branch
                const config = JSON.parse(
                    await fs.readFile(".worktree-config.json", "utf-8"),
                ) as {version?: string, mainBranch?: string, baseDir?: string, projectName?: string, tmux?: boolean};
                expect(config.mainBranch).toBe("main");
            });
        });

        it("should succeed in git directory with commits", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create git repo with commit
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Run init
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                    encoding: "utf-8",
                });

                // Verify concise success message
                expect(output).toContain("Initialized worktree project. Config: .worktree-config.json");

                // Verify config file exists
                const configPath = path.join(git.path, ".worktree-config.json");
                const configExists = await fs.access(configPath).then(() => true).catch(() => false);
                expect(configExists).toBe(true);

                // Verify config content
                const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
                expect(config.version).toBe("1.0.0");
                expect(config.baseDir).toBe(".worktrees");
                expect(config.projectName).toBeTruthy();
                expect(config.mainBranch).toBe("main"); // Sandbox defaults to main
                expect(config.commands).toEqual({});

                // Verify .gitignore
                const gitignorePath = path.join(git.path, ".gitignore");
                const gitignore = await fs.readFile(gitignorePath, "utf-8");
                expect(gitignore).toContain(".worktrees/");
            });
        });

        it("should detect main branch correctly", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create repo - sandbox already defaults to 'main'
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Run init
                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Verify detected main branch
                const config = JSON.parse(
                    await fs.readFile(".worktree-config.json", "utf-8"),
                ) as {version?: string, mainBranch?: string, baseDir?: string, projectName?: string, tmux?: boolean};
                expect(config.mainBranch).toBe("main");
            });
        });

        it("should detect master branch correctly", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create repo with 'master' branch
                const git = await createIsolatedTestRepoWithCommit(sandbox);
                await git.branch(["-M", "master"]);

                // Change to repo directory
                process.chdir(git.path);

                // Run init
                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Verify detected master branch
                const config = JSON.parse(
                    await fs.readFile(".worktree-config.json", "utf-8"),
                ) as {version?: string, mainBranch?: string, baseDir?: string, projectName?: string, tmux?: boolean};
                expect(config.mainBranch).toBe("master");
            });
        });
    });

    describe("Custom Options", () => {
        it("should accept custom project name", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Run init with custom project name
                execSyncWithoutTmux(`node "${WTT_BIN}" init --project-name "my-custom-project" --disable-tmux`, {
                    encoding: "utf-8",
                });

                // Verify custom project name
                const config = JSON.parse(
                    await fs.readFile(".worktree-config.json", "utf-8"),
                ) as {version?: string, mainBranch?: string, baseDir?: string, projectName?: string, tmux?: boolean};
                expect(config.projectName).toBe("my-custom-project");
            });
        });

        it("should accept custom base directory", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Run init with custom base dir
                execSyncWithoutTmux(`node "${WTT_BIN}" init --base-dir ".wt" --disable-tmux`, {
                    encoding: "utf-8",
                });

                // Verify custom base dir
                const config = JSON.parse(
                    await fs.readFile(".worktree-config.json", "utf-8"),
                ) as {version?: string, mainBranch?: string, baseDir?: string, projectName?: string, tmux?: boolean};
                expect(config.baseDir).toBe(".wt");

                // Verify gitignore updated with custom dir
                const gitignore = await fs.readFile(".gitignore", "utf-8");
                expect(gitignore).toContain(".wt/");
            });
        });

        it("should accept custom main branch", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithBranches(sandbox, ["develop", "feature"]);

                // Change to repo directory
                process.chdir(git.path);

                // Run init with custom main branch
                execSyncWithoutTmux(`node "${WTT_BIN}" init --main-branch develop --disable-tmux`, {
                    encoding: "utf-8",
                });

                // Verify custom main branch
                const config = JSON.parse(
                    await fs.readFile(".worktree-config.json", "utf-8"),
                ) as {version?: string, mainBranch?: string, baseDir?: string, projectName?: string, tmux?: boolean};
                expect(config.mainBranch).toBe("develop");
            });
        });

        it("should handle tmux options", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Test --enable-tmux
                execSyncWithoutTmux(`node "${WTT_BIN}" init --enable-tmux`, {
                    encoding: "utf-8",
                });

                let config = JSON.parse(
                    await fs.readFile(".worktree-config.json", "utf-8"),
                );
                expect(config.tmux).toBe(true);

                // Clean up for next test
                await fs.unlink(".worktree-config.json");

                // Test --disable-tmux
                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {
                    encoding: "utf-8",
                });

                config = JSON.parse(
                    await fs.readFile(".worktree-config.json", "utf-8"),
                );
                expect(config.tmux).toBe(false);
            });
        });
    });

    describe("Error Handling", () => {
        it("should fail when already initialized", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // First init should succeed
                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Second init should fail
                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                    });
                }).toThrow();

                // Verify error message
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                    });
                } catch(error) {
                    expect((error as {stderr?: string}).stderr).toContain("already initialized");
                }
            });
        });

        it("should reject conflicting tmux options", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Try with conflicting options
                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" init --enable-tmux --disable-tmux`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                    });
                }).toThrow();

                // Verify error message
                try {
                    execSyncWithoutTmux(`node "${WTT_BIN}" init --enable-tmux --disable-tmux`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                    });
                } catch(error) {
                    expect((error as {stderr?: string}).stderr).toContain("Cannot specify both");
                }
            });
        });

        it("should reject empty option values", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Test empty project name - gets sanitized to "project" so should succeed
                const result = execSyncWithoutTmux(`node "${WTT_BIN}" init --project-name ""`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });
                expect(result).toContain("Initialized worktree project");

                // Clean up for next test
                execSync("rm -f .worktree-config.json", {stdio: "ignore"});

                // Test empty base dir
                expect(() => {
                    execSyncWithoutTmux(`node "${WTT_BIN}" init --base-dir ""`, {
                        encoding: "utf-8",
                        stdio: "pipe",
                    });
                }).toThrow();

                // Clean up for next test
                execSync("rm -f .worktree-config.json", {stdio: "ignore"});

                // Test empty main branch - gets sanitized to "branch" so should succeed
                const result2 = execSyncWithoutTmux(`node "${WTT_BIN}" init --main-branch ""`, {
                    encoding: "utf-8",
                    stdio: "pipe",
                });
                expect(result2).toContain("Initialized worktree project");
            });
        });
    });

    describe("Self-Hosting Support", () => {
        it("should not interfere with parent wtt repository", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create parent repo with wtt config
                const parentGit = await createIsolatedTestRepoWithCommit(sandbox, "parent");
                process.chdir(parentGit.path);

                execSyncWithoutTmux(`node "${WTT_BIN}" init --project-name parent-project --disable-tmux`, {
                    encoding: "utf-8",
                });

                // Create nested repo
                const nestedDir = path.join(parentGit.path, "nested-project");
                await fs.mkdir(nestedDir, {recursive: true});

                // Create boundary marker to prevent finding parent config
                await fs.writeFile(path.join(nestedDir, ".wtt-search-boundary"), "");

                const nestedGit = simpleGit(nestedDir);
                await nestedGit.init();

                const readmePath = path.join(nestedDir, "README.md");
                await fs.writeFile(readmePath, "# Nested Project\n");
                await nestedGit.add("README.md");
                await nestedGit.commit("Initial commit");

                // Change to nested directory
                process.chdir(nestedDir);

                // Init nested repo
                execSyncWithoutTmux(`node "${WTT_BIN}" init --project-name nested-project --disable-tmux`, {
                    encoding: "utf-8",
                });

                // Verify both configs exist and are different
                const parentConfigPath = path.join(parentGit.path, ".worktree-config.json");
                const nestedConfigPath = path.join(nestedDir, ".worktree-config.json");

                const parentConfig = JSON.parse(await fs.readFile(parentConfigPath, "utf-8"));
                const nestedConfig = JSON.parse(await fs.readFile(nestedConfigPath, "utf-8"));

                expect(parentConfig.projectName).toBe("parent-project");
                expect(nestedConfig.projectName).toBe("nested-project");

                // Verify nested repo has its own gitignore
                const nestedGitignore = await fs.readFile(
                    path.join(nestedDir, ".gitignore"),
                    "utf-8",
                );
                expect(nestedGitignore).toContain(".worktrees/");
            });
        });

        it("should work when wtt is managing its own repository", async() => {
            await withTestSandbox(async(sandbox) => {
                // Simulate wtt repository
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Create package.json to make it look like wtt
                const packageJson = {
                    name: "worktree-tool",
                    version: "1.0.0",
                    bin: {
                        wtt: "./dist/index.js",
                    },
                };
                await fs.writeFile(
                    "package.json",
                    JSON.stringify(packageJson, null, 2),
                );

                // Add and commit package.json
                await git.add("package.json");
                await git.commit("Add package.json");

                // Init should work fine
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                    encoding: "utf-8",
                });

                expect(output).toContain("Initialized worktree project. Config: .worktree-config.json");

                // Verify config
                const config = JSON.parse(
                    await fs.readFile(".worktree-config.json", "utf-8"),
                ) as {version?: string, mainBranch?: string, baseDir?: string, projectName?: string, tmux?: boolean};
                expect(config.projectName).toBe("worktree-tool");
            });
        });
    });

    describe("Edge Cases", () => {
        it("should handle repositories with many branches", async() => {
            await withTestSandbox(async(sandbox) => {
                // Create repo with multiple branches
                const branches = ["develop", "feature/a", "feature/b", "hotfix/1"];
                const git = await createIsolatedTestRepoWithBranches(sandbox, branches);

                // Change to repo directory
                process.chdir(git.path);

                // Init should work
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" init`, {
                    encoding: "utf-8",
                });

                expect(output).toContain("Initialized worktree project. Config: .worktree-config.json");
            });
        });

        it("should handle special characters in project names", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Create directory with special name
                const specialName = "my-project@2.0";

                // Run init with special characters
                execSyncWithoutTmux(`node "${WTT_BIN}" init --project-name "${specialName}" --disable-tmux`, {
                    encoding: "utf-8",
                });

                // Verify project name is preserved
                const config = JSON.parse(
                    await fs.readFile(".worktree-config.json", "utf-8"),
                ) as {version?: string, mainBranch?: string, baseDir?: string, projectName?: string, tmux?: boolean};
                expect(config.projectName).toBe(specialName);
            });
        });

        it("should update existing .gitignore", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Create existing .gitignore
                const existingContent = "node_modules/\n*.log\n";
                await fs.writeFile(".gitignore", existingContent);

                // Run init
                execSyncWithoutTmux(`node "${WTT_BIN}" init --disable-tmux`, {encoding: "utf-8"});

                // Verify .gitignore preserved existing content
                const gitignore = await fs.readFile(".gitignore", "utf-8");
                expect(gitignore).toContain("node_modules/");
                expect(gitignore).toContain("*.log");
                expect(gitignore).toContain(".worktrees/");
            });
        });

        it("should show detailed output in verbose mode", async() => {
            await withTestSandbox(async(sandbox) => {
                const git = await createIsolatedTestRepoWithCommit(sandbox);

                // Change to repo directory
                process.chdir(git.path);

                // Run init with verbose flag
                const output = execSyncWithoutTmux(`node "${WTT_BIN}" init --verbose --disable-tmux`, {
                    encoding: "utf-8",
                });

                // Verify verbose output includes detailed information
                expect(output).toContain("Created .worktree-config.json");
                expect(output).toContain("Updated .gitignore");
                expect(output).toContain("Repository initialized with:");
                expect(output).toContain("Project name:");
                expect(output).toContain("Main branch:");
                expect(output).toContain("Worktree dir:");
                expect(output).toContain("Tmux support:");

                // Should still include concise message
                expect(output).toContain("Initialized worktree project. Config: .worktree-config.json");
            });
        });
    });
});

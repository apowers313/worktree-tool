import {execSync} from "child_process";
import {join} from "path";
import {describe, expect, it} from "vitest";

describe("help command integration", () => {
    const cliPath = join(__dirname, "../../dist/index.js");

    function runCommand(args: string): string {
        try {
            return execSync(`node ${cliPath} ${args}`, {
                encoding: "utf8",
                stdio: "pipe",
            });
        } catch(error: any) {
            // execSync throws on non-zero exit, but we want the output
            // Combine stdout and stderr for error cases
            const stdout = (error.stdout as string) || "";
            const stderr = (error.stderr as string) || "";
            return stdout + stderr;
        }
    }

    describe("general help", () => {
        it("should show help with 'wtt help'", () => {
            const output = runCommand("help");

            expect(output).toContain("wtt - Git worktree management tool");
            expect(output).toContain("Usage: wtt <command> [options]");
            expect(output).toContain("Commands:");
            expect(output).toContain("init");
            expect(output).toContain("create");
            expect(output).toContain("exec");
            expect(output).toContain("status");
            expect(output).toContain("remove");
            expect(output).toContain("merge");
            expect(output).toContain("help");
            expect(output).toContain("Examples:");
        });

        it("should show help with 'wtt --help'", () => {
            const output = runCommand("--help");

            expect(output).toContain("Usage: wtt [options] [command]");
            expect(output).toContain("Git worktree management tool");
            expect(output).toContain("Options:");
            expect(output).toContain("-V, --version");
            expect(output).toContain("-v, --verbose");
            expect(output).toContain("-q, --quiet");
            expect(output).toContain("-h, --help");
            expect(output).toContain("Commands:");
        });
    });

    describe("command-specific help", () => {
        it("should show help for init command", () => {
            const output = runCommand("help init");

            expect(output).toContain("Usage: wtt init [options]");
            expect(output).toContain("Initialize a repository for worktree management");
            expect(output).toContain("Options:");
            expect(output).toContain("--project-name");
            expect(output).toContain("--base-dir");
            expect(output).toContain("--main-branch");
            expect(output).toContain("--enable-tmux");
            expect(output).toContain("--disable-tmux");
        });

        it("should show help for create command", () => {
            const output = runCommand("help create");

            expect(output).toContain("Usage: wtt create [options] <name>");
            expect(output).toContain("Create a new worktree for a feature branch");
            expect(output).toContain("Arguments:");
            expect(output).toContain("name");
            expect(output).toContain("Options:");
            expect(output).toContain("-h, --help");
        });

        it("should show help for status command", () => {
            const output = runCommand("help status");

            expect(output).toContain("Usage: wtt status [options]");
            expect(output).toContain("Show git status across all worktrees");
            expect(output).toContain("Options:");
            expect(output).toContain("-w, --worktrees");
            expect(output).toContain("-v, --verbose");
        });

        it("should show help for remove command", () => {
            const output = runCommand("help remove");

            expect(output).toContain("Usage: wtt remove [options] [worktrees...]");
            expect(output).toContain("Remove git worktrees with safety checks");
            expect(output).toContain("Arguments:");
            expect(output).toContain("worktrees");
            expect(output).toContain("Options:");
            expect(output).toContain("-f, --force");
            expect(output).toContain("--prune");
        });

        it("should show help for merge command", () => {
            const output = runCommand("help merge");

            expect(output).toContain("Usage: wtt merge [options] [worktree]");
            expect(output).toContain("Merge worktree changes back to main branch");
            expect(output).toContain("Arguments:");
            expect(output).toContain("worktree");
            expect(output).toContain("Options:");
            expect(output).toContain("-u, --update");
            expect(output).toContain("--no-fetch");
            expect(output).toContain("-f, --force");
        });

        it("should show help for exec command", () => {
            const output = runCommand("help exec");

            expect(output).toContain("Usage: wtt exec [options] [command] [args...]");
            expect(output).toContain("Execute a command in one or more worktrees");
            expect(output).toContain("Arguments:");
            expect(output).toContain("command");
            expect(output).toContain("args");
            expect(output).toContain("Options:");
            expect(output).toContain("-w, --worktrees");
            expect(output).toContain("--mode");
        });
    });

    describe("error handling", () => {
        it("should show error for unknown command", () => {
            const output = runCommand("help unknown");

            expect(output).toContain("Unknown command: unknown");
            expect(output).toContain("Run 'wtt help' to see available commands");
        });
    });

    describe("help output formatting", () => {
        it("should have consistent formatting for all commands", () => {
            const output = runCommand("help");

            // Find the Commands: section
            const commandsSection = output.split("Commands:")[1]?.split("Examples:")[0];
            expect(commandsSection).toBeDefined();

            // Check that command descriptions are properly aligned
            const commandLines = commandsSection
                .split("\n")
                .filter((line) => line.trim() && line.startsWith("  "));

            // Should have 7 commands
            expect(commandLines.length).toBe(7);

            // Verify each command line has proper structure
            commandLines.forEach((line) => {
                // Each line should have:  command         description
                expect(line).toMatch(/^ {2}\w+\s+\w+/);
            });
        });

        it("should show examples with consistent formatting", () => {
            const output = runCommand("help");

            // Check that examples are properly formatted
            expect(output).toMatch(/wtt init\s+# Initialize with auto-detected settings/);
            expect(output).toMatch(/wtt create feature-xyz\s+# Create worktree for feature-xyz/);
            expect(output).toMatch(/wtt status\s+# Show status of all worktrees/);
            expect(output).toMatch(/wtt merge\s+# Merge current worktree to main/);
        });
    });
});

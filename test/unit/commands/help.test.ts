import chalk from "chalk";
import {Command} from "commander";
import {vi} from "vitest";

import {createHelpCommand, executeHelp} from "../../../src/commands/help";

describe("help command", () => {
    let consoleLogSpy: any;
    let consoleErrorSpy: any;
    let processExitSpy: any;

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, "log").mockImplementation();
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation();
        processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
            throw new Error("process.exit was called");
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("executeHelp", () => {
        it("should show general help when no command is specified", () => {
            executeHelp();

            expect(consoleLogSpy).toHaveBeenCalledWith(chalk.bold("wtt - Git worktree management tool"));
            expect(consoleLogSpy).toHaveBeenCalledWith("Usage: wtt <command> [options]");
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Commands:"));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("init"));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("create"));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("exec"));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("status"));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("remove"));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("merge"));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("help"));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Examples:"));
        });

        it("should show all command descriptions in help", () => {
            executeHelp();

            // Verify each command has its description
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("init         Initialize a worktree project in the current repository"),
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("create       Create a new worktree and open it in a shell or tmux window"),
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("exec         Execute a predefined command in one or more worktrees"),
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("status       Show git status across all worktrees"),
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("remove       Remove git worktrees with safety checks"),
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("merge        Merge worktree changes back to main branch"),
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("help         Display help information"),
            );
        });

        it("should show examples for all commands", () => {
            executeHelp();

            // Verify examples are shown
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("wtt init                     # Initialize with auto-detected settings"),
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("wtt create feature-xyz       # Create worktree for feature-xyz"),
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("wtt exec test                # Run 'test' command in all worktrees"),
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("wtt status                   # Show status of all worktrees"),
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("wtt remove feature-xyz       # Remove a worktree"),
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("wtt merge                    # Merge current worktree to main"),
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("wtt help init               # Show help for init command"),
            );
        });

        it("should show command-specific help when valid command is specified", () => {
            const program = new Command();
            const initCommand = new Command("init")
                .description("Initialize worktree project")
                .option("--project-name <name>", "Project name");
            program.addCommand(initCommand);

            const helpInfoSpy = vi.spyOn(initCommand, "helpInformation").mockReturnValue("Init command help");

            executeHelp("init", program);

            expect(helpInfoSpy).toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledWith("Init command help");
        });

        it("should show error for unknown command", () => {
            const program = new Command();

            expect(() => {
                executeHelp("unknown", program);
            }).toThrow("process.exit was called");

            expect(consoleErrorSpy).toHaveBeenCalledWith(chalk.red("Unknown command: unknown"));
            expect(consoleLogSpy).toHaveBeenCalledWith("Run 'wtt help' to see available commands");
            expect(processExitSpy).toHaveBeenCalledWith(1);
        });

        describe("command-specific help", () => {
            let program: Command;

            beforeEach(() => {
                program = new Command();
            });

            it("should show help for init command", () => {
                const initCommand = new Command("init")
                    .description("Initialize a worktree project")
                    .option("--project-name <name>", "Project name");
                program.addCommand(initCommand);

                const helpInfoSpy = vi.spyOn(initCommand, "helpInformation")
                    .mockReturnValue("Init command help information");

                executeHelp("init", program);

                expect(helpInfoSpy).toHaveBeenCalled();
                expect(consoleLogSpy).toHaveBeenCalledWith("Init command help information");
            });

            it("should show help for create command", () => {
                const createCommand = new Command("create")
                    .description("Create a new worktree")
                    .argument("<branch>", "Branch name");
                program.addCommand(createCommand);

                const helpInfoSpy = vi.spyOn(createCommand, "helpInformation")
                    .mockReturnValue("Create command help information");

                executeHelp("create", program);

                expect(helpInfoSpy).toHaveBeenCalled();
                expect(consoleLogSpy).toHaveBeenCalledWith("Create command help information");
            });

            it("should show help for status command", () => {
                const statusCommand = new Command("status")
                    .description("Show git status across all worktrees")
                    .option("-v, --verbose", "Show detailed output");
                program.addCommand(statusCommand);

                const helpInfoSpy = vi.spyOn(statusCommand, "helpInformation")
                    .mockReturnValue("Status command help information");

                executeHelp("status", program);

                expect(helpInfoSpy).toHaveBeenCalled();
                expect(consoleLogSpy).toHaveBeenCalledWith("Status command help information");
            });

            it("should show help for remove command", () => {
                const removeCommand = new Command("remove")
                    .description("Remove git worktrees")
                    .option("-f, --force", "Force removal");
                program.addCommand(removeCommand);

                const helpInfoSpy = vi.spyOn(removeCommand, "helpInformation")
                    .mockReturnValue("Remove command help information");

                executeHelp("remove", program);

                expect(helpInfoSpy).toHaveBeenCalled();
                expect(consoleLogSpy).toHaveBeenCalledWith("Remove command help information");
            });

            it("should show help for merge command", () => {
                const mergeCommand = new Command("merge")
                    .description("Merge worktree changes")
                    .option("-u, --update", "Update mode");
                program.addCommand(mergeCommand);

                const helpInfoSpy = vi.spyOn(mergeCommand, "helpInformation")
                    .mockReturnValue("Merge command help information");

                executeHelp("merge", program);

                expect(helpInfoSpy).toHaveBeenCalled();
                expect(consoleLogSpy).toHaveBeenCalledWith("Merge command help information");
            });

            it("should show help for exec command", () => {
                const execCommand = new Command("exec")
                    .description("Execute commands in worktrees")
                    .argument("[command]", "Command to execute");
                program.addCommand(execCommand);

                const helpInfoSpy = vi.spyOn(execCommand, "helpInformation")
                    .mockReturnValue("Exec command help information");

                executeHelp("exec", program);

                expect(helpInfoSpy).toHaveBeenCalled();
                expect(consoleLogSpy).toHaveBeenCalledWith("Exec command help information");
            });
        });
    });

    describe("createHelpCommand", () => {
        it("should create help command with correct configuration", () => {
            const program = new Command();
            const helpCommand = createHelpCommand(program);

            expect(helpCommand.name()).toBe("help");
            expect(helpCommand.description()).toBe("Display help information");
            expect(helpCommand.registeredArguments).toHaveLength(1);
            expect(helpCommand.registeredArguments[0]?.name()).toBe("command");
        });
    });
});

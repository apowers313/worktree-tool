import chalk from "chalk";
import {Command} from "commander";

import {createHelpCommand, executeHelp} from "../../../src/commands/help";

describe("help command", () => {
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let processExitSpy: jest.SpyInstance;

    beforeEach(() => {
        consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
        consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
        processExitSpy = jest.spyOn(process, "exit").mockImplementation(() => {
            throw new Error("process.exit was called");
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("executeHelp", () => {
        it("should show general help when no command is specified", () => {
            executeHelp();

            expect(consoleLogSpy).toHaveBeenCalledWith(chalk.bold("wtt - Git worktree management tool"));
            expect(consoleLogSpy).toHaveBeenCalledWith("Usage: wtt <command> [options]");
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Commands:"));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("init"));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("create"));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("help"));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Examples:"));
        });

        it("should show command-specific help when valid command is specified", () => {
            const program = new Command();
            const initCommand = new Command("init")
                .description("Initialize worktree project")
                .option("--project-name <name>", "Project name");
            program.addCommand(initCommand);

            const helpInfoSpy = jest.spyOn(initCommand, "helpInformation").mockReturnValue("Init command help");

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

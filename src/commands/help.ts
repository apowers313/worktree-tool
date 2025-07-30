import chalk from "chalk";
import {Command} from "commander";

/**
 * Execute the help command
 */
export async function executeHelp(commandName?: string, program?: Command): Promise<void> {
    if (commandName && program) {
        const command = program.commands.find((cmd) => cmd.name() === commandName);
        if (command) {
            console.log(command.helpInformation());
        } else {
            console.error(chalk.red(`Unknown command: ${commandName}`));
            console.log("Run 'wtt help' to see available commands");
            process.exit(1);
        }
    } else {
        showGeneralHelp();
    }
}

function showGeneralHelp(): void {
    console.log(chalk.bold("wtt - Git worktree management tool"));
    console.log();
    console.log("Usage: wtt <command> [options]");
    console.log();
    console.log("Commands:");
    console.log("  init         Initialize a worktree project in the current repository");
    console.log("  create       Create a new worktree and open it in a shell or tmux window");
    console.log("  help         Display help information");
    console.log();
    console.log("Examples:");
    console.log("  wtt init                     # Initialize with auto-detected settings");
    console.log("  wtt init --project-name=myapp --disable-tmux");
    console.log("  wtt create feature-xyz       # Create worktree for feature-xyz");
    console.log("  wtt help init               # Show help for init command");
    console.log();
    console.log("Run 'wtt help <command>' for more information on a specific command.");
}

/**
 * Create the help command
 */
export function createHelpCommand(program: Command): Command {
    return new Command("help")
        .argument("[command]", "Command to show help for")
        .description("Display help information")
        .action((commandName?: string) => executeHelp(commandName, program));
}

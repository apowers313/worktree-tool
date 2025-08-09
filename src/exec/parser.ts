import {WorktreeConfig} from "../core/types.js";
import {WorktreeToolError} from "../utils/errors.js";

export interface ParsedCommand {
    type: "predefined" | "inline";
    command: string;
    args: string[];
    mode: "window" | "inline" | "background" | "exit";
    commandName?: string; // For predefined commands
}

export interface ExecOptions {
    worktrees?: string;
    verbose?: boolean;
    quiet?: boolean;
    mode?: "window" | "inline" | "background" | "exit";
}

export function parseExecCommand(
    args: string[],
    config: WorktreeConfig,
    options: ExecOptions,
): ParsedCommand {
    // Find the -- separator
    const separatorIndex = args.indexOf("--");

    if (separatorIndex === -1) {
        // No separator, must be predefined command
        const commandName = args[0];

        if (!commandName) {
            throw new WorktreeToolError(
                "No command specified",
                "Usage: wtt exec <command> or wtt exec -- <command>",
            );
        }

        // Validate commands exist
        if (!config.commands || Object.keys(config.commands).length === 0) {
            throw new WorktreeToolError(
                "No commands configured",
                "Add commands to .worktree-config.json under the \"commands\" key",
            );
        }

        // Check if command exists
        const commandConfig = config.commands[commandName];
        if (!commandConfig) {
            const available = Object.keys(config.commands).join(", ");
            throw new WorktreeToolError(
                `Command "${commandName}" not found in config`,
                `Available commands: ${available}`,
            );
        }

        // Parse predefined command
        if (typeof commandConfig === "string") {
            return {
                type: "predefined",
                command: commandConfig,
                args: args.slice(1),
                mode: options.mode ?? "window",
                commandName: commandName,
            };
        }

        return {
            type: "predefined",
            command: commandConfig.command,
            args: args.slice(1),
            mode: options.mode ?? commandConfig.mode ?? "window",
            commandName: commandName,
        };
    }

    // Has separator, inline command
    const inlineArgs = args.slice(separatorIndex + 1);
    if (inlineArgs.length === 0) {
        throw new WorktreeToolError(
            "No command specified after --",
            "Usage: wtt exec -- <command> [args...]",
        );
    }

    return {
        type: "inline",
        command: inlineArgs[0] ?? "",
        args: inlineArgs.slice(1),
        mode: options.mode ?? "window",
    };
}

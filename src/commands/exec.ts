import {Command, Option} from "commander";
import path from "path";

import {loadConfig} from "../core/config.js";
import {createGit} from "../core/git.js";
import {WorktreeConfig, WorktreeInfo} from "../core/types.js";
import {ExecutionContext} from "../exec/modes/base.js";
import {createExecutionMode} from "../exec/modes/factory.js";
import {type ParsedCommand, parseExecCommand} from "../exec/parser.js";
import {RefreshManager} from "../exec/refresh-manager.js";
import {
    attachToTmuxSession,
    canAttachToTmux,
    isInsideTmux,
    sanitizeTmuxName,
    switchToTmuxWindow,
} from "../platform/tmux.js";
import {getErrorMessage, handleCommandError} from "../utils/error-handler.js";
import {WorktreeToolError} from "../utils/errors.js";
import {getProjectRoot} from "../utils/find-root.js";
import {getLogger} from "../utils/logger.js";
import {portManager} from "../utils/port-manager.js";

interface ExecCommandOptions {
    verbose?: boolean;
    quiet?: boolean;
    worktrees?: string;
    mode?: "window" | "inline" | "background" | "exit";
    refresh?: boolean;
}

export const execCommand = new Command("exec")
    .description("Execute a command in one or more worktrees")
    .argument("[command]", "Command name to execute (or use -- for inline commands)")
    .argument("[args...]", "Arguments for the command")
    .option("-w, --worktrees <worktrees>", "Comma-separated list of worktrees")
    .addOption(
        new Option("--mode <mode>", "Execution mode")
            .choices(["window", "inline", "background", "exit"]),
    )
    .option("--refresh", "Ensure autoRun commands are running and re-sort windows")
    .option("-v, --verbose", "Show verbose output")
    .option("-q, --quiet", "Suppress output")
    .allowUnknownOption()
    .action(async(commandName: string | undefined, args: string[], options: ExecCommandOptions) => {
        try {
            const logger = getLogger(options);

            // Load config
            const config = await loadConfig();

            if (!config) {
                throw new WorktreeToolError(
                    "No configuration found",
                    "Run \"wtt init\" to initialize a configuration",
                );
            }

            // Check if -- was used in the original command line after 'exec'
            // Commander.js strips -- but we need to know if it was there
            const execIndex = process.argv.indexOf("exec");
            const hasDoubleDashAfterExec = execIndex >= 0 &&
                process.argv.slice(execIndex + 1).includes("--");

            // Build the args array for the parser
            let allArgs: string[];
            if (hasDoubleDashAfterExec && commandName) {
                // If -- was used after exec, reconstruct it for the parser
                allArgs = ["--", commandName, ... args];
            } else if (commandName) {
                allArgs = [commandName, ... args];
            } else {
                allArgs = args;
            }

            // Parse command early if not refreshing to validate it exists
            let parsedCommand: ParsedCommand | undefined;
            if (!options.refresh) {
                parsedCommand = parseExecCommand(allArgs, config, options);
            }

            // Get project root and worktrees first
            const projectRoot = await getProjectRoot();
            const git = createGit(projectRoot);
            const allWorktrees = await git.listWorktrees();

            // Filter out the main worktree - we only want to run commands in child worktrees
            const worktrees = allWorktrees.filter((w) => !w.isMain);

            // Check if there are any child worktrees
            if (worktrees.length === 0) {
                logger.info("No worktrees found. Create worktrees with 'wtt create <branch-name>'");
                return;
            }

            // Handle refresh option
            if (options.refresh) {
                const refreshManager = new RefreshManager(config, logger);

                // If specific worktrees provided via args, use those
                let refreshTargets = worktrees;
                if (commandName || args.length > 0) {
                    // Parse worktree names from command/args
                    const requestedNames = [commandName, ... args].filter(Boolean);
                    refreshTargets = worktrees.filter((w) =>
                        requestedNames.includes(path.basename(w.path)) ||
                        requestedNames.includes(w.branch),
                    );
                }

                await refreshManager.refreshWorktrees(refreshTargets);
                return; // Exit after refresh
            }

            // Parse command was already done above if not refreshing
            if (!parsedCommand) {
                throw new Error("Command parsing failed");
            }

            // Filter to specific worktrees if requested
            let targetWorktrees = worktrees;
            if (options.worktrees) {
                const requestedWorktrees = options.worktrees.split(",").map((w) => w.trim());
                targetWorktrees = [];
                const notFound: string[] = [];

                for (const name of requestedWorktrees) {
                    const worktree = worktrees.find((w: WorktreeInfo) =>
                        path.basename(w.path) === name ||
                        w.branch === name,
                    );

                    if (worktree) {
                        targetWorktrees.push(worktree);
                    } else {
                        notFound.push(name);
                    }
                }

                if (notFound.length > 0) {
                    const available = worktrees.map((w: WorktreeInfo) => path.basename(w.path)).join(", ");
                    throw new WorktreeToolError(
                        `Worktree(s) not found: ${notFound.join(", ")}`,
                        `Available worktrees: ${available}`,
                    );
                }
            }

            // Create execution contexts
            const contexts: ExecutionContext[] = targetWorktrees.map((worktree) => ({
                worktreeName: path.basename(worktree.path),
                worktreePath: worktree.path,
                command: parsedCommand.command,
                args: parsedCommand.args,
                env: {},
            }));

            // Allocate ports if configured
            if (config.availablePorts && parsedCommand.commandName) {
                const portRange = portManager.parseRange(config.availablePorts);

                for (const context of contexts) {
                    const cmdConfig = config.commands?.[parsedCommand.commandName];
                    if (cmdConfig && typeof cmdConfig === "object" && cmdConfig.numPorts && cmdConfig.numPorts > 0) {
                        try {
                            const ports = await portManager.findAvailablePorts(
                                portRange.start,
                                portRange.end,
                                cmdConfig.numPorts,
                            );

                            context.ports = ports;
                            // Set environment variables
                            ports.forEach((port, index) => {
                                context.env[`WTT_PORT${String(index + 1)}`] = port.toString();
                            });
                        } catch(error) {
                            logger.warn(`Port allocation failed for ${context.worktreeName}: ${getErrorMessage(error)}`);
                        }
                    }
                }
            }

            // Log verbose info about execution
            if (options.verbose && parsedCommand.commandName) {
                logger.verbose(`Executing '${parsedCommand.commandName}'`);
            }

            // Execute using the appropriate mode
            const executionMode = createExecutionMode(parsedCommand.mode, config, logger);
            await executionMode.execute(contexts);

            // Handle post-execution tmux attachment if in window mode
            if (parsedCommand.mode === "window" && config.tmux) {
                await handleTmuxAttachment(config, targetWorktrees, parsedCommand.command, logger);
            }
        } catch(error) {
            handleCommandError(error, getLogger(options));
        }
    });

async function handleTmuxAttachment(
    config: WorktreeConfig,
    worktrees: WorktreeInfo[],
    _command: string,
    logger: ReturnType<typeof getLogger>,
): Promise<void> {
    if (worktrees.length === 0) {
        return;
    }

    const sessionName = sanitizeTmuxName(config.projectName);
    const firstWorktree = worktrees[0];
    if (!firstWorktree) {
        return;
    }

    const firstWorktreeName = path.basename(firstWorktree.path);
    const firstWindowName = `${firstWorktreeName}::exec`;

    if (isInsideTmux()) {
        // If inside tmux, switch to the first window
        try {
            await switchToTmuxWindow(sessionName, firstWindowName);
        } catch(error) {
            // Don't fail the command if switching fails, just log it
            logger.verbose(`Could not switch to first window: ${getErrorMessage(error)}`);
        }
    } else if (canAttachToTmux()) {
        // If not inside tmux but can attach, attach to the session
        try {
            await attachToTmuxSession(sessionName, firstWindowName);
        } catch(error) {
            // Don't fail the command if attachment fails, just log it
            logger.verbose(`Could not attach to tmux session: ${getErrorMessage(error)}`);
        }
    }
}

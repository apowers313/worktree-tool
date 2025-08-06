import {Command} from "commander";
import path from "path";

import {loadConfig} from "../core/config.js";
import {ENV_VARS} from "../core/constants.js";
import {createGit} from "../core/git.js";
import {WorktreeConfig, WorktreeInfo} from "../core/types.js";
import {ShellManager} from "../platform/shell.js";
import {
    attachToTmuxSession,
    canAttachToTmux,
    createTmuxSessionWithWindow,
    createTmuxWindowWithCommand,
    isInsideTmux,
    isTmuxAvailable,
    sanitizeTmuxName,
    sanitizeTmuxWindowName,
    switchToTmuxWindow,
    tmuxSessionExists,
} from "../platform/tmux.js";
import {getErrorMessage, handleCommandError} from "../utils/error-handler.js";
import {WorktreeToolError} from "../utils/errors.js";
import {getLogger, Logger} from "../utils/logger.js";

interface ExecOptions {
    verbose?: boolean;
    quiet?: boolean;
}

export const execCommand = new Command("exec")
    .description("Execute a predefined command in one or more worktrees")
    .argument("<command>", "Command name to execute")
    .argument("[worktrees...]", "Specific worktrees to run command in (defaults to all)")
    .option("-v, --verbose", "Show verbose output")
    .option("-q, --quiet", "Suppress output")
    .action(async(commandName: string, worktreeNames: string[], options: ExecOptions) => {
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

            // Validate commands exist
            if (!config.commands || Object.keys(config.commands).length === 0) {
                throw new WorktreeToolError(
                    "No commands configured",
                    "Add commands to .worktree-config.json under the \"commands\" key",
                );
            }

            // Validate command exists
            const command = config.commands[commandName];
            if (!command) {
                const available = Object.keys(config.commands).join(", ");
                throw new WorktreeToolError(
                    `Command "${commandName}" not found`,
                    `Available commands: ${available}`,
                );
            }

            // Get worktrees
            const git = createGit();
            const allWorktrees = await git.listWorktrees();

            // Filter out the main worktree - we only want to run commands in child worktrees
            const worktrees = allWorktrees.filter((w) => !w.isMain);

            // Check if there are any child worktrees
            if (worktrees.length === 0) {
                logger.info("No worktrees found. Create worktrees with 'wtt create <branch-name>'");
                return;
            }

            // Filter to specific worktrees if requested
            let targetWorktrees = worktrees;
            if (worktreeNames.length > 0) {
                targetWorktrees = [];
                const notFound: string[] = [];

                for (const name of worktreeNames) {
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

            // Execute command
            await executeCommand(commandName, command, targetWorktrees, config, logger);
        } catch(error) {
            handleCommandError(error, getLogger(options));
        }
    });

async function executeCommand(
    commandName: string,
    command: string,
    worktrees: WorktreeInfo[],
    config: WorktreeConfig,
    logger: Logger,
): Promise<void> {
    logger.info(`Executing '${commandName}' in ${String(worktrees.length)} worktree${worktrees.length > 1 ? "s" : ""}...`);

    let failureCount = 0;
    let firstWindowName: string | undefined;

    // Check if tmux is available and session exists
    const hasTmux = await isTmuxAvailable();
    const sessionName = sanitizeTmuxName(config.projectName);
    const sessionExists = config.tmux && hasTmux ? await tmuxSessionExists(sessionName) : false;

    // Execute in each worktree
    for (let i = 0; i < worktrees.length; i++) {
        const worktree = worktrees[i];
        if (!worktree) {
            continue; // Skip if undefined (shouldn't happen but TypeScript wants this)
        }

        // Since we filter out main worktrees, we always use the directory name
        const worktreeName = path.basename(worktree.path);
        const windowName = `${worktreeName}::${commandName}`;

        try {
            if (config.tmux && hasTmux) {
                await executeTmux(worktree, command, windowName, config, i === 0 && !sessionExists);

                // Remember the first window name for switching
                if (i === 0) {
                    firstWindowName = windowName;
                }
            } else {
                await executeShell(worktree, command, windowName);
            }

            logger.success(`Starting in ${worktreeName}: ${command}`);
        } catch(error) {
            logger.error(`Failed to start in ${worktreeName}: ${getErrorMessage(error)}`);
            failureCount++;
        }
    }

    if (failureCount === 0) {
        logger.info("All commands started. Check individual windows for output.");

        // Handle tmux window switching/attachment
        if (config.tmux && hasTmux && firstWindowName) {
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
    } else {
        logger.error(`${String(failureCount)} command(s) failed to start.`);
        process.exit(failureCount);
    }
}

async function executeTmux(
    worktree: WorktreeInfo,
    command: string,
    windowName: string,
    config: WorktreeConfig,
    isFirstWindow: boolean,
): Promise<void> {
    // Use the project name as the session name, same as create command
    const sessionName = sanitizeTmuxName(config.projectName);
    const sanitizedWindowName = sanitizeTmuxWindowName(windowName);

    // Create environment variables
    const worktreeName = path.basename(worktree.path);
    const envVars = {
        [ENV_VARS.WORKTREE_NAME]: worktreeName,
        [ENV_VARS.WORKTREE_PATH]: worktree.path,
        [ENV_VARS.IS_MAIN]: "false", // Always false since we filter out main worktrees
    };

    // Build the command with environment variables
    const envCommands = Object.entries(envVars)
        .map(([key, value]) => `export ${key}="${value}"`)
        .join("; ");

    // Create the full command to run in the shell
    // Add `exec bash` at the end to keep the window open after the command finishes
    const fullCommand = `${envCommands}; clear; echo "Running: ${command}"; echo; ${command}; exec bash`;

    if (isFirstWindow) {
        // Create session with the first window directly to avoid an extra default window
        await createTmuxSessionWithWindow(
            sessionName,
            sanitizedWindowName,
            worktree.path,
            fullCommand,
        );
    } else {
        // Add window to existing session
        await createTmuxWindowWithCommand(
            sessionName,
            sanitizedWindowName,
            worktree.path,
            fullCommand,
        );
    }
}

async function executeShell(
    worktree: WorktreeInfo,
    command: string,
    windowName: string,
): Promise<void> {
    const shell = new ShellManager();

    // Set environment variables
    const worktreeName = path.basename(worktree.path);
    process.env[ENV_VARS.WORKTREE_NAME] = worktreeName;
    process.env[ENV_VARS.WORKTREE_PATH] = worktree.path;
    process.env[ENV_VARS.IS_MAIN] = "false"; // Always false since we filter out main worktrees

    // Execute in new shell
    await shell.executeInNewWindow(command, worktree.path, windowName);
}

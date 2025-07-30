import {execFile} from "child_process";
import {Command} from "commander";
import path from "path";
import {promisify} from "util";

import {loadConfig} from "../core/config";
import {createGit} from "../core/git";
import {CreateOptions} from "../core/types";
import {detectPlatform} from "../platform/detector";
import {spawnShell} from "../platform/shell";
import {
    canAttachToTmux,
    createTmuxSession,
    createTmuxWindow,
    isInsideTmux,
    isTmuxAvailable,
    renameTmuxWindow,
    sanitizeTmuxName,
    switchToTmuxWindow,
    tmuxSessionExists} from "../platform/tmux";
import {getLogger} from "../utils/logger";

const execFileAsync = promisify(execFile);
import {ConfigError, GitError, ValidationError} from "../utils/errors";

/**
 * Sanitize worktree name for git branch compatibility
 * Git branch names cannot contain certain characters
 */
export function sanitizeWorktreeName(name: string): string {
    return name
        .trim()
    // Replace spaces with hyphens
        .replace(/\s+/g, "-")
    // Remove characters that are invalid in git branch names (including forward slash)
        .replace(/[~^:?*\[\]\\!@#$%&*()+={}|"'<>`,\/]/g, "")
    // Remove leading/trailing dots and hyphens
        .replace(/^[.-]+|[.-]+$/g, "")
    // Ensure it doesn't start with a hyphen (git doesn't like that)
        .replace(/^-+/, "")
    // Convert to lowercase for consistency
        .toLowerCase();
}

/**
 * Validate create command options
 */
export function validateCreateOptions(options: CreateOptions): void {
    if (!options.name || options.name.trim() === "") {
        throw new ValidationError("Worktree name is required");
    }

    const sanitized = sanitizeWorktreeName(options.name);
    if (sanitized === "") {
        throw new ValidationError("Worktree name contains only invalid characters");
    }

    if (sanitized.length > 100) {
        throw new ValidationError("Worktree name is too long (max 100 characters)");
    }
}

/**
 * Execute the create command
 */
export async function executeCreate(options: CreateOptions): Promise<void> {
    const logger = getLogger();

    try {
    // Validate options first
        validateCreateOptions(options);

        logger.verbose("Loading configuration...");

        // Load configuration
        const config = await loadConfig();
        if (!config) {
            throw new ConfigError("Repository not initialized. Run \"wtt init\" first");
        }

        logger.verbose("Checking git repository...");

        // Check if we're in a git repository
        const git = createGit();
        const isRepo = await git.isGitRepository();

        if (!isRepo) {
            throw new GitError("Not in a git repository");
        }

        // Check if the repository has any commits
        const hasCommits = await git.hasCommits();
        if (!hasCommits) {
            throw new GitError("Cannot create worktree: No commits found. Please make at least one commit before creating worktrees.");
        }

        // Sanitize the worktree name
        const sanitizedName = sanitizeWorktreeName(options.name);
        const worktreePath = path.join(config.baseDir, sanitizedName);

        logger.verbose(`Creating worktree: ${sanitizedName}`);
        logger.verbose(`Worktree path: ${worktreePath}`);

        // Get absolute path for tmux
        const absoluteWorktreePath = path.resolve(worktreePath);

        // Create the worktree based on main branch
        try {
            await git.createWorktree(worktreePath, sanitizedName);
        } catch(error) {
            // Check if the error is about HEAD not being valid (in case our check missed it)
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes("Not a valid object name") && errorMessage.includes("HEAD")) {
                throw new GitError("Cannot create worktree: No commits found. Please make at least one commit before creating worktrees.");
            }

            throw new GitError(`Failed to create worktree: ${errorMessage}`);
        }

        logger.verbose("Worktree created successfully");

        // Show concise success message before launching shell/tmux
        logger.success(`Created worktree: ${sanitizedName}`);

        // Handle tmux or shell spawning
        if (config.tmux && await isTmuxAvailable()) {
            await handleTmuxIntegration(config.projectName, sanitizedName, absoluteWorktreePath, logger);
        } else {
            logger.info(`Opening shell in ${path.relative(process.cwd(), absoluteWorktreePath)}`);
            await handleShellSpawning(sanitizedName, absoluteWorktreePath, logger);
        }
    } catch(error) {
        if (error instanceof ValidationError ||
        error instanceof GitError ||
        error instanceof ConfigError) {
            logger.error(error.message);
        } else {
            logger.error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
        }

        process.exit(1);
    }
}

/**
 * Handle tmux integration for the new worktree
 */
async function handleTmuxIntegration(
    projectName: string,
    worktreeName: string,
    worktreePath: string,
    logger: ReturnType<typeof getLogger>,
): Promise<void> {
    try {
        const sessionName = sanitizeTmuxName(projectName);
        const windowName = sanitizeTmuxName(worktreeName);

        logger.verbose(`Setting up tmux session: ${sessionName}`);

        // Check if session exists
        const sessionExists = await tmuxSessionExists(sessionName);
        const insideTmux = isInsideTmux();

        if (!sessionExists) {
            // Create new session with first window in the worktree directory
            logger.verbose("Creating tmux session with first window...");
            await createTmuxSession(sessionName, worktreePath);

            // Rename the first window to match the worktree
            await renameTmuxWindow(sessionName, 0, windowName);

            // Handle session attachment based on environment
            if (insideTmux) {
                // If we're inside tmux, switch to the session instead
                logger.verbose("Switching to tmux session...");
                await execFileAsync("tmux", ["switch-client", "-t", sessionName]);
            } else if (canAttachToTmux()) {
                // Only attach if we're in a proper terminal
                logger.verbose("Attaching to tmux session...");
                await execFileAsync("tmux", ["attach-session", "-t", sessionName]);
            } else {
                // Can't attach, just inform the user
                logger.info(`Created tmux session '${sessionName}' with window '${windowName}'`);
                logger.info(`Run 'tmux attach -t ${sessionName}' to enter the session`);
            }
        } else {
            // Session exists, create a new window
            logger.verbose(`Creating tmux window: ${windowName}`);
            await createTmuxWindow(sessionName, windowName, worktreePath);

            // Handle window switching based on environment
            if (insideTmux) {
                logger.verbose("Switching to tmux window...");
                await switchToTmuxWindow(sessionName, windowName);
            } else if (canAttachToTmux()) {
                // Attach to session and switch to the new window
                logger.verbose("Attaching to tmux session and switching to new window...");
                await execFileAsync("tmux", ["attach-session", "-t", `${sessionName}:${windowName}`]);
            } else {
                // Can't attach, just inform the user
                logger.info(`Created tmux window '${windowName}' in session '${sessionName}'`);
                logger.info(`Run 'tmux attach -t ${sessionName}' to enter the session`);
            }
        }
    } catch(error) {
        logger.warn(`Tmux integration failed: ${error instanceof Error ? error.message : String(error)}`);
        logger.verbose("Falling back to shell spawning...");
        await handleShellSpawning(worktreeName, worktreePath, logger);
    }
}

/**
 * Handle shell spawning for the new worktree
 */
async function handleShellSpawning(
    worktreeName: string,
    worktreePath: string,
    logger: ReturnType<typeof getLogger>,
): Promise<void> {
    try {
        const platform = detectPlatform();

        logger.verbose(`Spawning ${platform.shellType} shell in ${worktreePath}`);

        // Spawn shell with custom prompt
        await spawnShell(worktreePath, platform.shellType, worktreeName);
    } catch(error) {
        logger.warn(`Failed to spawn shell: ${error instanceof Error ? error.message : String(error)}`);
        logger.info(`Worktree created at: ${worktreePath}`);
        logger.info(`You can manually navigate there with: cd ${worktreePath}`);
    }
}

/**
 * Create the create command
 */
export const createCommand = new Command("create")
    .description("Create a new worktree for a feature branch")
    .argument("<name>", "name of the worktree and branch to create")
    .action((name) => executeCreate({name}));

import {Command} from "commander";

import {
    configExists,
    getDefaultConfig,
    saveConfig,
    updateGitignore} from "../core/config";
import {createGit} from "../core/git";
import {InitOptions} from "../core/types";
import {detectPlatform} from "../platform/detector";
import {ConfigError, GitError, ValidationError} from "../utils/errors";
import {getLogger} from "../utils/logger";
import {detectProjectName} from "../utils/project";

/**
 * Validate init command options
 */
export function validateInitOptions(options: InitOptions): void {
    // Check for conflicting tmux options
    if (options.enableTmux && options.disableTmux) {
        throw new ValidationError("Cannot specify both --enable-tmux and --disable-tmux");
    }

    // Validate baseDir if provided
    if (options.baseDir !== undefined && options.baseDir.trim() === "") {
        throw new ValidationError("Base directory cannot be empty");
    }

    // Validate projectName if provided
    if (options.projectName !== undefined && options.projectName.trim() === "") {
        throw new ValidationError("Project name cannot be empty");
    }

    // Validate mainBranch if provided
    if (options.mainBranch !== undefined && options.mainBranch.trim() === "") {
        throw new ValidationError("Main branch cannot be empty");
    }
}

/**
 * Execute the init command
 */
export async function executeInit(options: InitOptions): Promise<void> {
    const logger = getLogger();

    try {
    // Validate options first
        validateInitOptions(options);

        logger.verbose("Checking if already initialized...");

        // Check if already initialized
        if (await configExists()) {
            throw new ConfigError("This repository is already initialized for wtt");
        }

        logger.verbose("Checking git repository...");

        // Check if we're in a git repository
        const git = createGit();
        const isRepo = await git.isGitRepository();

        if (!isRepo) {
            throw new GitError("Not in a git repository. Please run \"git init\" first");
        }

        logger.verbose("Detecting project configuration...");

        // Detect project name if not provided
        const projectName = options.projectName ?? await detectProjectName();
        logger.verbose(`Project name: ${projectName}`);

        // Detect main branch if not provided
        const mainBranch = options.mainBranch ?? await git.getMainBranch();
        logger.verbose(`Main branch: ${mainBranch}`);

        // Use default base directory if not provided
        const baseDir = options.baseDir ?? ".worktrees";
        logger.verbose(`Base directory: ${baseDir}`);

        // Determine tmux setting
        let tmux: boolean;
        if (options.enableTmux) {
            tmux = true;
        } else if (options.disableTmux) {
            tmux = false;
        } else {
            // Auto-detect tmux availability
            const platform = detectPlatform();
            tmux = platform.hasTmux;
            logger.verbose(`Tmux auto-detected: ${String(tmux)}`);
        }

        // Create configuration
        const config = {
            ... getDefaultConfig(projectName),
            projectName,
            mainBranch,
            baseDir,
            tmux,
        };

        logger.verbose("Saving configuration...");

        // Save configuration
        await saveConfig(config);

        // Update .gitignore
        logger.verbose("Updating .gitignore...");
        await updateGitignore(baseDir);

        // Show summary based on verbosity
        if (logger.getLevel() === "verbose") {
            logger.success("Created .worktree-config.json");
            logger.success("Updated .gitignore");
            logger.log("");
            logger.info("Repository initialized with:");
            logger.log(`  Project name: ${projectName}`);
            logger.log(`  Main branch:  ${mainBranch}`);
            logger.log(`  Worktree dir: ${baseDir}/`);
            logger.log(`  Tmux support: ${tmux ? "enabled" : "disabled"}`);
        }

        // Always show concise success message
        logger.success("Initialized worktree project. Config: .worktree-config.json");
    } catch(error) {
        if (error instanceof ValidationError ||
        error instanceof GitError ||
        error instanceof ConfigError) {
            logger.error(error.message);
        } else {
            logger.error(`Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        process.exit(1);
    }
}

/**
 * Create the init command
 */
export const initCommand = new Command("init")
    .description("Initialize a repository for worktree management")
    .option("--project-name <name>", "override project name detection")
    .option("--base-dir <dir>", "base directory for worktrees (default: .worktrees)")
    .option("--enable-tmux", "force enable tmux integration")
    .option("--disable-tmux", "force disable tmux integration")
    .option("--main-branch <branch>", "override main branch detection")
    .action(executeInit);

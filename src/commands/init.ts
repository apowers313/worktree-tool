import {Command} from "commander";

import {
    configExists,
    getDefaultConfig,
    saveConfig,
    updateGitignore} from "../core/config.js";
import {CONFIG_DEFAULTS, GIT_ERRORS} from "../core/constants.js";
import {createGit} from "../core/git.js";
import {InitOptions} from "../core/types.js";
import {detectPlatform} from "../platform/detector.js";
import {handleCommandError} from "../utils/error-handler.js";
import {ConfigError, GitError, ValidationError} from "../utils/errors.js";
import {getLogger} from "../utils/logger.js";
import {detectProjectName} from "../utils/project.js";
import {validateBranchName, validatePath, validateProjectName} from "../utils/validation.js";

/**
 * Validate init command options
 */
export function validateInitOptions(options: InitOptions): void {
    // Check for conflicting tmux options
    if (options.enableTmux && options.disableTmux) {
        throw new ValidationError("Cannot specify both --enable-tmux and --disable-tmux");
    }

    // Validate optional fields
    if (options.baseDir !== undefined) {
        validatePath(options.baseDir, "Base directory");
    }

    if (options.projectName !== undefined) {
        validateProjectName(options.projectName);
    }

    if (options.mainBranch !== undefined) {
        try {
            validateBranchName(options.mainBranch);
        } catch {
            throw new ValidationError("Main branch cannot be empty");
        }
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
            throw new GitError(`${GIT_ERRORS.NOT_A_REPO}. Please run "git init" first`);
        }

        logger.verbose("Detecting project configuration...");

        // Detect project name if not provided
        const projectName = options.projectName ?? await detectProjectName();
        logger.verbose(`Project name: ${projectName}`);

        // Detect main branch if not provided
        const mainBranch = options.mainBranch ?? await git.getMainBranch();
        logger.verbose(`Main branch: ${mainBranch}`);

        // Use default base directory if not provided
        const baseDir = options.baseDir ?? CONFIG_DEFAULTS.BASE_DIR;
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
            autoSort: true,
            availablePorts: "9000-9099",
            commands: {
                shell: "bash",
            },
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
        handleCommandError(error, logger);
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

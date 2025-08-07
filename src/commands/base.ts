import {loadConfig} from "../core/config.js";
import {GIT_ERRORS} from "../core/constants.js";
import {createGit, Git} from "../core/git.js";
import {WorktreeConfig} from "../core/types.js";
import {handleCommandError} from "../utils/error-handler.js";
import {ConfigError, GitError} from "../utils/errors.js";
import {findProjectRoot} from "../utils/find-root.js";
import {getLogger, Logger} from "../utils/logger.js";

export interface CommandContext {
    logger: Logger;
    config: WorktreeConfig | null;
    git: Git;
}

export interface CommandOptions {
    verbose?: boolean;
    quiet?: boolean;
}

export abstract class BaseCommand<TOptions extends CommandOptions = CommandOptions> {
    protected abstract validateOptions(options: TOptions): void;
    protected abstract executeCommand(options: TOptions, context: CommandContext): Promise<void>;

    protected requiresConfig(): boolean {
        return true;
    }

    protected requiresGitRepo(): boolean {
        return true;
    }

    protected requiresCommits(): boolean {
        return false;
    }

    async execute(options: TOptions): Promise<void> {
        const logger = getLogger(options);

        try {
            logger.verbose("Validating options...");
            this.validateOptions(options);

            // Find project root if we need config or git
            let projectRoot: string | null = null;
            if (this.requiresConfig() || this.requiresGitRepo()) {
                projectRoot = await findProjectRoot();
            }

            const context: CommandContext = {
                logger,
                config: null,
                git: createGit(projectRoot ?? undefined),
            };

            // Load config if required
            if (this.requiresConfig()) {
                logger.verbose("Loading configuration...");
                context.config = await loadConfig();
                if (!context.config) {
                    throw new ConfigError("Repository not initialized. Run \"wtt init\" first");
                }
            }

            // Check git repository if required
            if (this.requiresGitRepo()) {
                logger.verbose("Checking git repository...");
                const isRepo = await context.git.isGitRepository();
                if (!isRepo) {
                    throw new GitError(GIT_ERRORS.NOT_A_REPO);
                }

                // Check for commits if required
                if (this.requiresCommits()) {
                    const hasCommits = await context.git.hasCommits();
                    if (!hasCommits) {
                        throw new GitError(GIT_ERRORS.NO_COMMITS);
                    }
                }
            }

            // Execute the command
            await this.executeCommand(options, context);
        } catch(error) {
            handleCommandError(error, logger);
        }
    }
}


import {loadConfig} from "../core/config.js";
import {GIT_ERRORS} from "../core/constants.js";
import {createGit} from "../core/git.js";
import {CommandContext, CommandOptions} from "../core/types.js";
import {handleCommandError} from "../utils/error-handler.js";
import {ConfigError, GitError} from "../utils/errors.js";
import {findProjectRoot} from "../utils/find-root.js";
import {getLogger} from "../utils/logger.js";

export type {CommandContext, CommandOptions};

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

    /**
     * Whether to show verbose status messages during execution
     */
    protected showVerboseStatus(): boolean {
        return true;
    }

    async execute(options: TOptions): Promise<void> {
        const logger = getLogger(options);

        try {
            if (this.showVerboseStatus()) {
                logger.verbose("Validating options...");
            }

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
                if (this.showVerboseStatus()) {
                    logger.verbose("Loading configuration...");
                }

                context.config = await loadConfig();
                if (!context.config) {
                    throw new ConfigError("Repository not initialized. Run \"wtt init\" first");
                }
            }

            // Check git repository if required
            if (this.requiresGitRepo()) {
                if (this.showVerboseStatus()) {
                    logger.verbose("Checking git repository...");
                }

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


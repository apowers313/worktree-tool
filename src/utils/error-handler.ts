import {
    ConfigError,
    GitError,
    ValidationError,
    WorktreeToolError,
} from "./errors.js";
import {Logger} from "./logger.js";

export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function handleCommandError(error: unknown, logger: Logger): never {
    if (error instanceof ValidationError ||
      error instanceof GitError ||
      error instanceof ConfigError ||
      error instanceof WorktreeToolError) {
        logger.error(error.message);
        if ("hint" in error && error.hint) {
            logger.info(`Hint: ${error.hint}`);
        }
    } else {
        logger.error(getErrorMessage(error));
    }

    process.exit(1);
}

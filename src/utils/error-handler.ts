import {
    ConfigError,
    GitError,
    isWorktreeError,
    ValidationError,
    WorktreeToolError,
} from "./errors.js";
import {Logger} from "./logger.js";

/**
 * Extract error message from any error type
 * Consolidates error message extraction logic
 */
export function getErrorMessage(error: unknown): string {
    // Handle WorktreeError types first (most specific)
    if (isWorktreeError(error)) {
        return error.message;
    }

    // Handle standard Error types
    if (error instanceof Error) {
        return error.message;
    }

    // Handle primitives and other types
    return String(error);
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

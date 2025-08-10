import {VALIDATION} from "../core/constants.js";
import {ValidationError} from "./errors.js";
import {sanitize, sanitizeGitBranch, sanitizeWorktreeName} from "./sanitize.js";

export interface ValidationOptions {
    required?: boolean;
    maxLength?: number;
    minLength?: number;
    pattern?: RegExp;
    errorMessage?: string;
    sanitizer?: (value: string) => string;
}

/**
 * Validates and sanitizes a string according to the specified options.
 *
 * @param value - The value to validate
 * @param fieldName - The name of the field being validated (used in error messages)
 * @param options - Validation options
 * @returns The validated and processed string
 * @throws {ValidationError} When validation fails
 *
 * @example
 * ```typescript
 * validateString("test", "Username"); // "test"
 * validateString("  test  ", "Username"); // "test" (trimmed)
 * validateString(undefined, "Username"); // throws ValidationError
 * ```
 */
export function validateString(
    value: string | undefined,
    fieldName: string,
    options: ValidationOptions = {},
): string {
    const {
        required = true,
        maxLength,
        minLength = 1,
        pattern,
        errorMessage,
        sanitizer,
    } = options;

    // Check if value exists
    if (value === undefined) {
        if (required) {
            throw new ValidationError(errorMessage ?? `${fieldName} is required`);
        }

        return "";
    }

    // Apply sanitizer if provided
    const processedValue = sanitizer ? sanitizer(value) : value.trim();

    // Check empty string
    if (required && processedValue === "") {
        throw new ValidationError(errorMessage ?? `${fieldName} ${VALIDATION.EMPTY_STRING_ERROR}`);
    }

    // Check minimum length
    if (minLength && processedValue.length < minLength) {
        throw new ValidationError(
            errorMessage ?? `${fieldName} must be at least ${String(minLength)} characters`,
        );
    }

    // Check maximum length
    if (maxLength && processedValue.length > maxLength) {
        throw new ValidationError(
            errorMessage ?? `${fieldName} is too long (max ${String(maxLength)} characters)`,
        );
    }

    // Check pattern
    if (pattern && !pattern.test(processedValue)) {
        throw new ValidationError(errorMessage ?? `${fieldName} has invalid format`);
    }

    return processedValue;
}

/**
 * Validates and sanitizes a worktree name.
 *
 * @param name - The worktree name to validate
 * @returns The sanitized worktree name
 * @throws {ValidationError} When the name is invalid
 *
 * @example
 * ```typescript
 * validateWorktreeName("feature-branch"); // "feature-branch"
 * validateWorktreeName("Feature Branch!"); // "feature-branch"
 * validateWorktreeName(""); // throws ValidationError
 * ```
 */
export function validateWorktreeName(name: string): string {
    // Check for empty or whitespace-only first
    if (!name || name.trim() === "") {
        throw new ValidationError("Worktree name is required");
    }

    // Check original length before sanitization
    if (name.length > VALIDATION.MAX_WORKTREE_NAME_LENGTH) {
        throw new ValidationError(`Worktree name is too long (max ${String(VALIDATION.MAX_WORKTREE_NAME_LENGTH)} characters)`);
    }

    const sanitized = sanitizeWorktreeName(name);
    if (sanitized === "") {
        throw new ValidationError("Worktree name contains only invalid characters");
    }

    return sanitized;
}

/**
 * Validates and sanitizes a git branch name.
 *
 * @param name - The branch name to validate
 * @returns The sanitized branch name
 * @throws {ValidationError} When the name is invalid
 *
 * @example
 * ```typescript
 * validateBranchName("feature/new-ui"); // "feature/new-ui"
 * validateBranchName("feature branch"); // "feature-branch"
 * ```
 */
export function validateBranchName(name: string): string {
    return validateString(name, "Branch name", {
        maxLength: VALIDATION.MAX_BRANCH_NAME_LENGTH,
        sanitizer: sanitizeGitBranch,
    });
}

/**
 * Validates and sanitizes a project name.
 *
 * @param name - The project name to validate
 * @returns The sanitized project name
 * @throws {ValidationError} When the name is invalid
 *
 * @example
 * ```typescript
 * validateProjectName("my-project"); // "my-project"
 * validateProjectName("@myorg/package"); // "package"
 * ```
 */
export function validateProjectName(name: string): string {
    return validateString(name, "Project name", {
        sanitizer: (value) => sanitize(value, "PROJECT_NAME"),
    });
}

/**
 * Validates that a command is a non-empty string.
 *
 * @param name - The name of the command (used in error messages)
 * @param command - The command string to validate
 * @throws {ValidationError} When the command is invalid
 *
 * @example
 * ```typescript
 * validateCommand("test", "npm test"); // OK
 * validateCommand("test", ""); // throws ValidationError
 * ```
 */
export function validateCommand(name: string, command: string): void {
    if (typeof command !== "string" || command.trim() === "") {
        throw new ValidationError(`Invalid command "${name}": command must be a non-empty string`);
    }
}

/**
 * Validates that a port number is within the valid range (1-65535).
 *
 * @param port - The port number to validate
 * @param fieldName - The name of the field (used in error messages)
 * @returns The validated port number
 * @throws {ValidationError} When the port is invalid
 *
 * @example
 * ```typescript
 * validatePort(8080); // 8080
 * validatePort("3000"); // 3000
 * validatePort(0); // throws ValidationError
 * ```
 */
export function validatePort(port: number | string, fieldName = "Port"): number {
    const numPort = typeof port === "string" ? parseInt(port, 10) : port;

    if (isNaN(numPort) || numPort < 1 || numPort > 65535) {
        throw new ValidationError(`${fieldName} must be a valid port number (1-65535)`);
    }

    return numPort;
}

/**
 * Validates that a path is non-empty and doesn't contain invalid characters.
 *
 * @param path - The path to validate
 * @param fieldName - The name of the field (used in error messages)
 * @returns The validated path
 * @throws {ValidationError} When the path is invalid
 *
 * @example
 * ```typescript
 * validatePath("/path/to/file"); // "/path/to/file"
 * validatePath("  /path  "); // "/path" (trimmed)
 * validatePath(""); // throws ValidationError
 * ```
 */
export function validatePath(path: string, fieldName = "Path"): string {
    const trimmed = path.trim();

    if (trimmed === "") {
        throw new ValidationError(`${fieldName} ${VALIDATION.EMPTY_STRING_ERROR}`);
    }

    // Check for null bytes which are invalid in paths
    if (trimmed.includes("\0")) {
        throw new ValidationError(`${fieldName} contains invalid characters`);
    }

    return trimmed;
}

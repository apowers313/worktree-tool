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

export function validateBranchName(name: string): string {
    return validateString(name, "Branch name", {
        maxLength: VALIDATION.MAX_BRANCH_NAME_LENGTH,
        sanitizer: sanitizeGitBranch,
    });
}

export function validateProjectName(name: string): string {
    return validateString(name, "Project name", {
        sanitizer: (value) => sanitize(value, "PROJECT_NAME"),
    });
}

export function validateCommand(name: string, command: string): void {
    if (typeof command !== "string" || command.trim() === "") {
        throw new ValidationError(`Invalid command "${name}": command must be a non-empty string`);
    }
}

export function validatePort(port: number | string, fieldName = "Port"): number {
    const numPort = typeof port === "string" ? parseInt(port, 10) : port;

    if (isNaN(numPort) || numPort < 1 || numPort > 65535) {
        throw new ValidationError(`${fieldName} must be a valid port number (1-65535)`);
    }

    return numPort;
}

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

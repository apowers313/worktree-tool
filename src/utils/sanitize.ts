/**
 * Configuration options for string sanitization.
 */
export interface SanitizeOptions {
    /** Whether to allow spaces in the sanitized string */
    allowSpaces?: boolean;
    /** Whether to preserve uppercase characters */
    allowUppercase?: boolean;
    /** Whether to allow dots in the sanitized string */
    allowDots?: boolean;
    /** Additional special characters to allow (e.g., "-_/") */
    allowSpecialChars?: string;
    /** Maximum length of the sanitized string */
    maxLength?: number;
    /** Default value to return if the sanitized string is empty */
    defaultValue?: string;
    /** Whether to remove leading numbers from the string */
    removeLeadingNumbers?: boolean;
}

const PRESETS = {
    TMUX_SESSION: {
        allowSpaces: false,
        allowUppercase: false,
        allowDots: false,
        allowSpecialChars: "-_",
        removeLeadingNumbers: true,
        maxLength: 30,
    },
    TMUX_WINDOW: {
        allowSpaces: true,
        allowUppercase: true,
        allowDots: true,
        allowSpecialChars: "-_:",
        removeLeadingNumbers: false,
    },
    GIT_BRANCH: {
        allowSpaces: false,
        allowUppercase: true,
        allowDots: true,
        allowSpecialChars: "-_/",
        maxLength: 100,
        removeLeadingNumbers: false,
    },
    WORKTREE_NAME: {
        allowSpaces: false,
        allowUppercase: false,
        allowDots: false,
        allowSpecialChars: "-_",
        maxLength: 100,
        removeLeadingNumbers: false,
    },
    PROJECT_NAME: {
        allowSpaces: false,
        allowUppercase: true, // Preserve case
        allowDots: false,
        allowSpecialChars: "-_",
        maxLength: 50,
        removeLeadingNumbers: false,
    },
} as const;

/**
 * Sanitizes a string according to specified rules and presets.
 *
 * This function provides a flexible way to clean and normalize strings for different
 * contexts like project names, git branches, tmux sessions, etc.
 *
 * @param input - The string to sanitize
 * @param preset - Predefined sanitization preset (PROJECT_NAME, GIT_BRANCH, TMUX_SESSION, etc.)
 * @param customOptions - Additional options to override preset defaults
 * @returns The sanitized string
 *
 * @example
 * ```typescript
 * // Sanitize for project names
 * sanitize("My Project!", "PROJECT_NAME"); // "My-Project"
 *
 * // Sanitize for git branches
 * sanitize("feature/test branch", "GIT_BRANCH"); // "feature/test-branch"
 *
 * // Custom sanitization
 * sanitize("Test String", undefined, {
 *   allowSpaces: false,
 *   allowUppercase: false,
 *   maxLength: 10
 * }); // "test-strin"
 * ```
 */
export function sanitize(
    input: string,
    preset?: keyof typeof PRESETS,
    customOptions?: SanitizeOptions,
): string {
    const options: SanitizeOptions = {
        ... (preset ? PRESETS[preset] : {}),
        ... customOptions,
    };

    let result = input.trim();

    // Handle special cases for PROJECT_NAME preset
    if (preset === "PROJECT_NAME") {
        // Remove npm scope if present (e.g., @scope/package -> package)
        if (result.startsWith("@") && result.includes("/")) {
            result = result.split("/")[1] ?? result;
        } else if (result.startsWith("@")) {
            result = result.substring(1);
        }
    }

    // Special handling for GIT_BRANCH preset
    if (preset === "GIT_BRANCH") {
        // Replace spaces with hyphens first
        result = result.replace(/\s+/g, "-");

        // Remove specific invalid characters for git branches
        // eslint-disable-next-line no-control-regex, no-useless-escape
        result = result.replace(/[\x00-\x1F\x7F~^:?*\[\]\\!]/g, "");

        // Remove leading dots
        result = result.replace(/^\.+/, "");

        // Remove trailing dots
        result = result.replace(/\.+$/, "");

        // Replace '..' with '-'
        result = result.replace(/\.\.+/g, "-");

        // Remove .lock suffix if present
        result = result.replace(/\.lock$/, "");

        // Replace multiple consecutive hyphens with single hyphen
        result = result.replace(/-+/g, "-");

        // Remove leading/trailing hyphens
        result = result.replace(/^-+|-+$/g, "");

        // If empty after sanitization, use default
        if (!result || result === "@") {
            return "branch";
        }

        return result;
    }

    // Convert to lowercase if needed
    if (!options.allowUppercase) {
        result = result.toLowerCase();
    }

    // Replace spaces
    if (!options.allowSpaces) {
        result = result.replace(/\s+/g, "-");
    }

    // Build regex for allowed characters
    const allowedChars = [
        "a-zA-Z0-9",
        options.allowDots ? "." : "",
        options.allowSpaces ? " " : "",
        options.allowSpecialChars ?? "",
    ].filter(Boolean).join("");

    // Remove disallowed characters
    const regex = new RegExp(`[^${allowedChars}]`, "g");
    result = result.replace(regex, "-");

    // Remove leading numbers if needed
    if (options.removeLeadingNumbers) {
        result = result.replace(/^[0-9]+/, "");
    }

    // Replace multiple consecutive hyphens with single hyphen
    result = result.replace(/-+/g, "-");

    // Remove leading/trailing dots and hyphens
    result = result.replace(/^[.-]+|[.-]+$/g, "");

    // Apply max length
    if (options.maxLength && result.length > options.maxLength) {
        result = result.substring(0, options.maxLength);
    }

    // Handle empty result with preset-specific defaults
    if (result === "") {
        if (preset === "PROJECT_NAME") {
            return "project";
        } else if (options.defaultValue) {
            return options.defaultValue;
        }
    }

    // For PROJECT_NAME preset, prefix with 'p-' if it starts with a number
    if (preset === "PROJECT_NAME" && /^\d/.test(result)) {
        result = `p-${result}`;
    }

    return result;
}

/**
 * Sanitizes a string for use as a tmux session name.
 *
 * @param name - The session name to sanitize
 * @returns A sanitized session name suitable for tmux
 *
 * @example
 * ```typescript
 * sanitizeTmuxSession("My Project"); // "my-project"
 * ```
 */
export const sanitizeTmuxSession = (name: string): string =>
    sanitize(name, "TMUX_SESSION");

/**
 * Sanitizes a string for use as a tmux window name.
 * Removes quotes and applies appropriate sanitization rules.
 *
 * @param name - The window name to sanitize
 * @returns A sanitized window name suitable for tmux
 *
 * @example
 * ```typescript
 * sanitizeTmuxWindow('"My Window"'); // "My Window"
 * ```
 */
export const sanitizeTmuxWindow = (name: string): string => {
    // First remove quotes specifically, then apply general sanitization
    const withoutQuotes = name.replace(/['"]/g, "");
    return sanitize(withoutQuotes, "TMUX_WINDOW");
};

/**
 * Sanitizes a string for use as a git branch name.
 *
 * @param name - The branch name to sanitize
 * @returns A sanitized branch name that follows git naming conventions
 *
 * @example
 * ```typescript
 * sanitizeGitBranch("feature test"); // "feature-test"
 * sanitizeGitBranch("bug#123"); // "bug#123"
 * ```
 */
export const sanitizeGitBranch = (name: string): string =>
    sanitize(name, "GIT_BRANCH");

/**
 * Sanitizes a string for use as a git worktree name.
 *
 * @param name - The worktree name to sanitize
 * @returns A sanitized worktree name
 *
 * @example
 * ```typescript
 * sanitizeWorktreeName("Feature Branch"); // "feature-branch"
 * ```
 */
export const sanitizeWorktreeName = (name: string): string =>
    sanitize(name, "WORKTREE_NAME");

/**
 * Sanitizes a string for use as a project name.
 * Handles npm scoped packages and preserves case.
 *
 * @param name - The project name to sanitize
 * @returns A sanitized project name
 *
 * @example
 * ```typescript
 * sanitizeProjectName("My Project"); // "My-Project"
 * sanitizeProjectName("@myorg/package"); // "package"
 * ```
 */
export const sanitizeProjectName = (name: string): string =>
    sanitize(name, "PROJECT_NAME");

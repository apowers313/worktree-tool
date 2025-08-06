export interface SanitizeOptions {
    allowSpaces?: boolean;
    allowUppercase?: boolean;
    allowDots?: boolean;
    allowSpecialChars?: string;
    maxLength?: number;
    defaultValue?: string;
    removeLeadingNumbers?: boolean;
}

const PRESETS = {
    TMUX_SESSION: {
        allowSpaces: false,
        allowUppercase: false,
        allowDots: false,
        allowSpecialChars: "-_",
        removeLeadingNumbers: true,
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
        maxLength: 255,
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
        allowUppercase: true, // Allow uppercase to preserve original casing
        allowDots: true,
        allowSpecialChars: "-_",
        removeLeadingNumbers: false,
    },
} as const;

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
    result = result.replace(regex, "");

    // Remove leading numbers if needed
    if (options.removeLeadingNumbers) {
        result = result.replace(/^[0-9]+/, "");
    }

    // Remove leading/trailing dots and hyphens
    result = result.replace(/^[.-]+|[.-]+$/g, "");

    // Apply max length
    if (options.maxLength && result.length > options.maxLength) {
        result = result.substring(0, options.maxLength);
    }

    // Return default value if result is empty
    if (result === "" && options.defaultValue) {
        return options.defaultValue;
    }

    return result;
}

export const sanitizeTmuxSession = (name: string): string =>
    sanitize(name, "TMUX_SESSION");

export const sanitizeTmuxWindow = (name: string): string => {
    // First remove quotes specifically, then apply general sanitization
    const withoutQuotes = name.replace(/['"]/g, "");
    return sanitize(withoutQuotes, "TMUX_WINDOW");
};

export const sanitizeGitBranch = (name: string): string =>
    sanitize(name, "GIT_BRANCH");

export const sanitizeWorktreeName = (name: string): string =>
    sanitize(name, "WORKTREE_NAME");

export const sanitizeProjectName = (name: string): string =>
    sanitize(name, "PROJECT_NAME");

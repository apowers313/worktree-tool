/**
 * Core TypeScript interfaces and types for wtt
 */

/**
 * Configuration structure for wtt
 */
export interface WorktreeConfig {
    /** Configuration version for future compatibility */
    version: string;
    /** Name of the project */
    projectName: string;
    /** Main branch name (e.g., main, master, trunk) */
    mainBranch: string;
    /** Base directory for worktrees */
    baseDir: string;
    /** Whether tmux integration is enabled */
    tmux: boolean;
}

/**
 * Platform information
 */
export interface Platform {
    /** Operating system type */
    os: "windows" | "macos" | "linux";
    /** Whether tmux is available on this system */
    hasTmux: boolean;
    /** Shell type detected or configured */
    shellType: ShellType;
}

/**
 * Supported shell types
 */
export type ShellType = "bash" | "zsh" | "powershell";

/**
 * Information about a git worktree
 */
export interface WorktreeInfo {
    /** Path to the worktree */
    path: string;
    /** Git commit hash */
    commit: string;
    /** Branch name */
    branch: string;
    /** Whether this is the main worktree */
    isMain: boolean;
    /** Whether the worktree is locked */
    isLocked: boolean;
}

/**
 * Options for the init command
 */
export interface InitOptions {
    /** Override project name detection */
    projectName?: string;
    /** Override base directory */
    baseDir?: string;
    /** Force enable tmux */
    enableTmux?: boolean;
    /** Force disable tmux */
    disableTmux?: boolean;
    /** Override main branch detection */
    mainBranch?: string;
}

/**
 * Options for the create command
 */
export interface CreateOptions {
    /** Name of the worktree to create */
    name: string;
}

/**
 * Logger verbosity levels
 */
export type LogLevel = "quiet" | "normal" | "verbose";

/**
 * Global CLI options
 */
export interface GlobalOptions {
    /** Verbosity level */
    verbose?: boolean;
    /** Suppress output */
    quiet?: boolean;
}

/**
 * Core TypeScript interfaces and types for wtt
 */

/**
 * Command configuration - can be either a simple string or an object with mode
 */
export type CommandConfig = string | {
    /** The command to execute */
    command: string;
    /** Execution mode for this command */
    mode?: "window" | "inline" | "background" | "exit";
};

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
    /** User-defined commands to execute in worktrees */
    commands?: Record<string, CommandConfig>;
    /** Auto-remove worktree after successful merge */
    autoRemove?: boolean;
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

/**
 * Counts for different file status types
 */
export interface StatusCounts {
    add: number;
    mod: number;
    del: number;
    ren: number;
    copy: number;
    untracked: number;
}

/**
 * Complete worktree status information
 */
export interface WorktreeStatus {
    name: string;
    path: string;
    counts: {
        staged: StatusCounts;
        unstaged: StatusCounts;
        conflicts: number;
        untracked: number;
    };
    ahead: number;
    behind: number;
    hasConflicts?: boolean;
}

/**
 * Options for the status command
 */
export interface StatusOptions extends GlobalOptions {
    /** Filter worktrees by name (comma-separated) */
    worktrees?: string;
    /** Show detailed file listing */
    verbose?: boolean;
}

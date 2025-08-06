export const ENV_VARS = {
    WORKTREE_NAME: "WTT_WORKTREE_NAME",
    WORKTREE_PATH: "WTT_WORKTREE_PATH",
    IS_MAIN: "WTT_IS_MAIN",
    DISABLE_TMUX: "WTT_DISABLE_TMUX",
    TEST_TMUX: "WTT_TEST_TMUX",
} as const;

export const VALIDATION = {
    MAX_WORKTREE_NAME_LENGTH: 100,
    MAX_BRANCH_NAME_LENGTH: 255,
    EMPTY_STRING_ERROR: "cannot be empty",
} as const;

export const GIT_ERRORS = {
    NO_COMMITS: "No commits found. Please make at least one commit before creating worktrees.",
    NOT_A_REPO: "Not in a git repository",
    INVALID_HEAD: "Not a valid object name",
} as const;

export const CONFIG_DEFAULTS = {
    VERSION: "1.0.0",
    BASE_DIR: ".worktrees",
    CONFIG_FILE: ".worktree-config.json",
} as const;

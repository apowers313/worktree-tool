import {
    ConfigError,
    FileSystemError,
    formatErrorMessage,
    GitError,
    isWorktreeError,
    PlatformError,
    TmuxError,
    ValidationError,
    WorktreeError,
} from "../../../src/utils/errors";

describe("Error Classes", () => {
    describe("WorktreeError", () => {
        it("should create error with message and code", () => {
            const error = new WorktreeError("Test error", "TEST_CODE");

            expect(error.message).toBe("Test error");
            expect(error.code).toBe("TEST_CODE");
            expect(error.name).toBe("WorktreeError");
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(WorktreeError);
        });

        it("should include optional details", () => {
            const details = {foo: "bar"};
            const error = new WorktreeError("Test error", "TEST_CODE", details);

            expect(error.details).toEqual(details);
        });

        it("should have proper stack trace", () => {
            const error = new WorktreeError("Test error", "TEST_CODE");

            expect(error.stack).toBeDefined();
            expect(error.stack).toContain("WorktreeError: Test error");
        });
    });

    describe("GitError", () => {
        it("should create git-specific error", () => {
            const error = new GitError("Git operation failed");

            expect(error.message).toBe("Git operation failed");
            expect(error.code).toBe("GIT_ERROR");
            expect(error.name).toBe("GitError");
            expect(error).toBeInstanceOf(GitError);
            expect(error).toBeInstanceOf(WorktreeError);
        });

        it("should include git command details", () => {
            const details = {command: "git status", exitCode: 128};
            const error = new GitError("Git command failed", details);

            expect(error.details).toEqual(details);
        });
    });

    describe("TmuxError", () => {
        it("should create tmux-specific error", () => {
            const error = new TmuxError("Tmux session creation failed");

            expect(error.message).toBe("Tmux session creation failed");
            expect(error.code).toBe("TMUX_ERROR");
            expect(error.name).toBe("TmuxError");
            expect(error).toBeInstanceOf(TmuxError);
            expect(error).toBeInstanceOf(WorktreeError);
        });
    });

    describe("ConfigError", () => {
        it("should create config-specific error", () => {
            const error = new ConfigError("Invalid configuration");

            expect(error.message).toBe("Invalid configuration");
            expect(error.code).toBe("CONFIG_ERROR");
            expect(error.name).toBe("ConfigError");
            expect(error).toBeInstanceOf(ConfigError);
            expect(error).toBeInstanceOf(WorktreeError);
        });
    });

    describe("FileSystemError", () => {
        it("should create filesystem-specific error", () => {
            const error = new FileSystemError("Cannot write file");

            expect(error.message).toBe("Cannot write file");
            expect(error.code).toBe("FS_ERROR");
            expect(error.name).toBe("FileSystemError");
            expect(error).toBeInstanceOf(FileSystemError);
            expect(error).toBeInstanceOf(WorktreeError);
        });
    });

    describe("ValidationError", () => {
        it("should create validation-specific error", () => {
            const error = new ValidationError("Invalid worktree name");

            expect(error.message).toBe("Invalid worktree name");
            expect(error.code).toBe("VALIDATION_ERROR");
            expect(error.name).toBe("ValidationError");
            expect(error).toBeInstanceOf(ValidationError);
            expect(error).toBeInstanceOf(WorktreeError);
        });
    });

    describe("PlatformError", () => {
        it("should create platform-specific error", () => {
            const error = new PlatformError("Unsupported platform");

            expect(error.message).toBe("Unsupported platform");
            expect(error.code).toBe("PLATFORM_ERROR");
            expect(error.name).toBe("PlatformError");
            expect(error).toBeInstanceOf(PlatformError);
            expect(error).toBeInstanceOf(WorktreeError);
        });
    });

    describe("isWorktreeError", () => {
        it("should return true for WorktreeError instances", () => {
            expect(isWorktreeError(new WorktreeError("Test", "TEST"))).toBe(true);
            expect(isWorktreeError(new GitError("Test"))).toBe(true);
            expect(isWorktreeError(new TmuxError("Test"))).toBe(true);
            expect(isWorktreeError(new ConfigError("Test"))).toBe(true);
            expect(isWorktreeError(new FileSystemError("Test"))).toBe(true);
            expect(isWorktreeError(new ValidationError("Test"))).toBe(true);
            expect(isWorktreeError(new PlatformError("Test"))).toBe(true);
        });

        it("should return false for other errors", () => {
            expect(isWorktreeError(new Error("Test"))).toBe(false);
            expect(isWorktreeError(new TypeError("Test"))).toBe(false);
            expect(isWorktreeError("Not an error")).toBe(false);
            expect(isWorktreeError(null)).toBe(false);
            expect(isWorktreeError(undefined)).toBe(false);
        });
    });

    describe("formatErrorMessage", () => {
        it("should format WorktreeError message", () => {
            const error = new GitError("Git failed");
            expect(formatErrorMessage(error)).toBe("Git failed");
        });

        it("should format regular Error message", () => {
            const error = new Error("Regular error");
            expect(formatErrorMessage(error)).toBe("Regular error");
        });

        it("should convert non-Error to string", () => {
            expect(formatErrorMessage("String error")).toBe("String error");
            expect(formatErrorMessage(123)).toBe("123");
            expect(formatErrorMessage(null)).toBe("null");
            expect(formatErrorMessage(undefined)).toBe("undefined");
        });

        it("should handle objects", () => {
            const obj = {toString: () => "Custom toString"};
            expect(formatErrorMessage(obj)).toBe("Custom toString");
        });
    });
});

import {beforeEach, describe, expect, it, vi} from "vitest";

import {
    getErrorMessage,
    handleCommandError,
} from "../../../src/utils/error-handler.js";
import {
    ConfigError,
    GitError,
    ValidationError,
    WorktreeToolError,
} from "../../../src/utils/errors.js";

describe("error-handler", () => {
    describe("getErrorMessage", () => {
        it("should extract message from WorktreeError types", () => {
            const gitError = new GitError("Git operation failed");
            const configError = new ConfigError("Config invalid");
            const validationError = new ValidationError("Invalid input");
            const toolError = new WorktreeToolError("Tool error");

            expect(getErrorMessage(gitError)).toBe("Git operation failed");
            expect(getErrorMessage(configError)).toBe("Config invalid");
            expect(getErrorMessage(validationError)).toBe("Invalid input");
            expect(getErrorMessage(toolError)).toBe("Tool error");
        });

        it("should extract message from regular Error", () => {
            const error = new Error("Regular error");
            expect(getErrorMessage(error)).toBe("Regular error");
        });

        it("should handle Error subclasses", () => {
            class CustomError extends Error {}

            const error = new CustomError("Custom error");
            expect(getErrorMessage(error)).toBe("Custom error");
        });

        it("should convert string to string", () => {
            expect(getErrorMessage("String error")).toBe("String error");
        });

        it("should convert numbers to string", () => {
            expect(getErrorMessage(123)).toBe("123");
            expect(getErrorMessage(0)).toBe("0");
            expect(getErrorMessage(-1)).toBe("-1");
        });

        it("should handle null and undefined", () => {
            expect(getErrorMessage(null)).toBe("null");
            expect(getErrorMessage(undefined)).toBe("undefined");
        });

        it("should handle boolean values", () => {
            expect(getErrorMessage(true)).toBe("true");
            expect(getErrorMessage(false)).toBe("false");
        });

        it("should handle objects with toString", () => {
            const obj = {
                toString: () => "Custom toString",
            };
            expect(getErrorMessage(obj)).toBe("Custom toString");
        });

        it("should handle plain objects", () => {
            const obj = {key: "value"};
            expect(getErrorMessage(obj)).toBe("[object Object]");
        });

        it("should handle arrays", () => {
            expect(getErrorMessage([1, 2, 3])).toBe("1,2,3");
            expect(getErrorMessage([])).toBe("");
        });
    });

    describe("handleCommandError", () => {
        let mockLogger: any;
        let mockExit: any;

        beforeEach(() => {
            mockLogger = {
                error: vi.fn(),
                info: vi.fn(),
            };
            mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
                throw new Error("process.exit called");
            });
        });

        it("should handle WorktreeToolError with hint", () => {
            const error = new WorktreeToolError("Invalid name", "Use alphanumeric characters");

            expect(() => handleCommandError(error, mockLogger)).toThrow("process.exit called");
            expect(mockLogger.error).toHaveBeenCalledWith("Invalid name");
            expect(mockLogger.info).toHaveBeenCalledWith("Hint: Use alphanumeric characters");
            expect(mockExit).toHaveBeenCalledWith(1);
        });

        it("should handle WorktreeError types without hint", () => {
            const error = new GitError("Git failed");

            expect(() => handleCommandError(error, mockLogger)).toThrow("process.exit called");
            expect(mockLogger.error).toHaveBeenCalledWith("Git failed");
            expect(mockLogger.info).not.toHaveBeenCalled();
            expect(mockExit).toHaveBeenCalledWith(1);
        });

        it("should handle regular errors", () => {
            const error = new Error("Regular error");

            expect(() => handleCommandError(error, mockLogger)).toThrow("process.exit called");
            expect(mockLogger.error).toHaveBeenCalledWith("Regular error");
            expect(mockLogger.info).not.toHaveBeenCalled();
            expect(mockExit).toHaveBeenCalledWith(1);
        });

        it("should handle non-Error types", () => {
            expect(() => handleCommandError("String error", mockLogger)).toThrow("process.exit called");
            expect(mockLogger.error).toHaveBeenCalledWith("String error");

            expect(() => handleCommandError(123, mockLogger)).toThrow("process.exit called");
            expect(mockLogger.error).toHaveBeenCalledWith("123");
        });
    });
});

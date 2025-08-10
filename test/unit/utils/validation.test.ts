import {describe, expect, it} from "vitest";

import {VALIDATION} from "../../../src/core/constants.js";
import {ValidationError} from "../../../src/utils/errors.js";
import {
    validateBranchName,
    validateCommand,
    validatePath,
    validatePort,
    validateProjectName,
    validateString,
    validateWorktreeName,
    ValidationOptions,
} from "../../../src/utils/validation.js";

describe("validation utilities", () => {
    describe("validateString", () => {
        it("should validate a normal string", () => {
            const result = validateString("test", "Test field");
            expect(result).toBe("test");
        });

        it("should trim whitespace", () => {
            const result = validateString("  test  ", "Test field");
            expect(result).toBe("test");
        });

        it("should throw for undefined when required", () => {
            expect(() => {
                validateString(undefined, "Test field");
            }).toThrow(ValidationError);
            expect(() => {
                validateString(undefined, "Test field");
            }).toThrow("Test field is required");
        });

        it("should return empty string for undefined when not required", () => {
            const result = validateString(undefined, "Test field", {required: false});
            expect(result).toBe("");
        });

        it("should throw for empty string when required", () => {
            expect(() => {
                validateString("", "Test field");
            }).toThrow(ValidationError);
            expect(() => {
                validateString("", "Test field");
            }).toThrow("Test field cannot be empty");
        });

        it("should throw for whitespace-only string when required", () => {
            expect(() => {
                validateString("   ", "Test field");
            }).toThrow(ValidationError);
            expect(() => {
                validateString("   ", "Test field");
            }).toThrow("Test field cannot be empty");
        });

        it("should validate minimum length", () => {
            expect(() => {
                validateString("ab", "Test field", {minLength: 3});
            }).toThrow(ValidationError);
            expect(() => {
                validateString("ab", "Test field", {minLength: 3});
            }).toThrow("Test field must be at least 3 characters");
        });

        it("should validate maximum length", () => {
            expect(() => {
                validateString("toolong", "Test field", {maxLength: 5});
            }).toThrow(ValidationError);
            expect(() => {
                validateString("toolong", "Test field", {maxLength: 5});
            }).toThrow("Test field is too long (max 5 characters)");
        });

        it("should validate pattern", () => {
            const pattern = /^[a-z]+$/;
            expect(() => {
                validateString("Test123", "Test field", {pattern});
            }).toThrow(ValidationError);
            expect(() => {
                validateString("Test123", "Test field", {pattern});
            }).toThrow("Test field has invalid format");
        });

        it("should use custom error message", () => {
            expect(() => {
                validateString(undefined, "Test field", {errorMessage: "Custom error"});
            }).toThrow("Custom error");
        });

        it("should apply sanitizer", () => {
            const sanitizer = (value: string) => value.toLowerCase();
            const result = validateString("TEST", "Test field", {sanitizer});
            expect(result).toBe("test");
        });

        it("should work with all options combined", () => {
            const options: ValidationOptions = {
                required: true,
                minLength: 2,
                maxLength: 10,
                pattern: /^[a-z]+$/,
                sanitizer: (value) => value.toLowerCase(),
            };

            const result = validateString("TEST", "Test field", options);
            expect(result).toBe("test");
        });
    });

    describe("validateWorktreeName", () => {
        it("should validate a normal worktree name", () => {
            const result = validateWorktreeName("feature-branch");
            expect(result).toBe("feature-branch");
        });

        it("should throw for empty name", () => {
            expect(() => {
                validateWorktreeName("");
            }).toThrow("Worktree name is required");
        });

        it("should throw for whitespace-only name", () => {
            expect(() => {
                validateWorktreeName("   ");
            }).toThrow("Worktree name is required");
        });

        it("should throw for undefined name", () => {
            expect(() => {
                validateWorktreeName(undefined as any);
            }).toThrow("Worktree name is required");
        });

        it("should throw for name that's too long", () => {
            const longName = "a".repeat(VALIDATION.MAX_WORKTREE_NAME_LENGTH + 1);
            expect(() => {
                validateWorktreeName(longName);
            }).toThrow(`Worktree name is too long (max ${String(VALIDATION.MAX_WORKTREE_NAME_LENGTH)} characters)`);
        });

        it("should throw for name with only invalid characters", () => {
            expect(() => {
                validateWorktreeName("!!!@#$");
            }).toThrow("Worktree name contains only invalid characters");
        });

        it("should sanitize and return valid name", () => {
            const result = validateWorktreeName("Feature Branch!");
            expect(result).toBe("feature-branch");
        });
    });

    describe("validateBranchName", () => {
        it("should validate a normal branch name", () => {
            const result = validateBranchName("feature/new-ui");
            expect(result).toBe("feature/new-ui");
        });

        it("should handle empty branch name with default", () => {
            // Empty branch names get sanitized to "branch"
            const result = validateBranchName("");
            expect(result).toBe("branch");
        });

        it("should throw for branch name that's too long", () => {
            const longName = "a".repeat(VALIDATION.MAX_BRANCH_NAME_LENGTH + 1);
            expect(() => {
                validateBranchName(longName);
            }).toThrow(`Branch name is too long (max ${String(VALIDATION.MAX_BRANCH_NAME_LENGTH)} characters)`);
        });

        it("should sanitize branch name", () => {
            const result = validateBranchName("feature branch");
            expect(result).toBe("feature-branch");
        });
    });

    describe("validateProjectName", () => {
        it("should validate a normal project name", () => {
            const result = validateProjectName("my-project");
            expect(result).toBe("my-project");
        });

        it("should sanitize project name", () => {
            const result = validateProjectName("My Project!");
            expect(result).toBe("My-Project");
        });

        it("should handle empty project name with default", () => {
            const result = validateProjectName("");
            expect(result).toBe("project");
        });

        it("should handle npm scoped packages", () => {
            const result = validateProjectName("@myorg/package");
            expect(result).toBe("package");
        });
    });

    describe("validateCommand", () => {
        it("should validate a normal command", () => {
            expect(() => {
                validateCommand("test", "npm test");
            }).not.toThrow();
        });

        it("should throw for empty command", () => {
            expect(() => {
                validateCommand("test", "");
            }).toThrow("Invalid command \"test\": command must be a non-empty string");
        });

        it("should throw for whitespace-only command", () => {
            expect(() => {
                validateCommand("test", "   ");
            }).toThrow("Invalid command \"test\": command must be a non-empty string");
        });

        it("should throw for non-string command", () => {
            expect(() => {
                validateCommand("test", 123 as any);
            }).toThrow("Invalid command \"test\": command must be a non-empty string");
        });

        it("should throw for null command", () => {
            expect(() => {
                validateCommand("test", null as any);
            }).toThrow("Invalid command \"test\": command must be a non-empty string");
        });
    });

    describe("validatePort", () => {
        it("should validate a valid port number", () => {
            const result = validatePort(8080);
            expect(result).toBe(8080);
        });

        it("should validate a valid port string", () => {
            const result = validatePort("3000");
            expect(result).toBe(3000);
        });

        it("should throw for port 0", () => {
            expect(() => {
                validatePort(0);
            }).toThrow("Port must be a valid port number (1-65535)");
        });

        it("should throw for port above 65535", () => {
            expect(() => {
                validatePort(65536);
            }).toThrow("Port must be a valid port number (1-65535)");
        });

        it("should throw for negative port", () => {
            expect(() => {
                validatePort(-1);
            }).toThrow("Port must be a valid port number (1-65535)");
        });

        it("should throw for non-numeric string", () => {
            expect(() => {
                validatePort("abc");
            }).toThrow("Port must be a valid port number (1-65535)");
        });

        it("should throw for NaN", () => {
            expect(() => {
                validatePort(NaN);
            }).toThrow("Port must be a valid port number (1-65535)");
        });

        it("should use custom field name", () => {
            expect(() => {
                validatePort(0, "Custom port");
            }).toThrow("Custom port must be a valid port number (1-65535)");
        });

        it("should validate edge case ports", () => {
            expect(validatePort(1)).toBe(1);
            expect(validatePort(65535)).toBe(65535);
        });
    });

    describe("validatePath", () => {
        it("should validate a normal path", () => {
            const result = validatePath("/path/to/file");
            expect(result).toBe("/path/to/file");
        });

        it("should trim whitespace from path", () => {
            const result = validatePath("  /path/to/file  ");
            expect(result).toBe("/path/to/file");
        });

        it("should throw for empty path", () => {
            expect(() => {
                validatePath("");
            }).toThrow("Path cannot be empty");
        });

        it("should throw for whitespace-only path", () => {
            expect(() => {
                validatePath("   ");
            }).toThrow("Path cannot be empty");
        });

        it("should throw for path with null bytes", () => {
            expect(() => {
                validatePath("/path/with\0null");
            }).toThrow("Path contains invalid characters");
        });

        it("should use custom field name", () => {
            expect(() => {
                validatePath("", "Custom path");
            }).toThrow("Custom path cannot be empty");
        });

        it("should validate relative paths", () => {
            const result = validatePath("./relative/path");
            expect(result).toBe("./relative/path");
        });

        it("should validate Windows-style paths", () => {
            const result = validatePath("C:\\Windows\\System32");
            expect(result).toBe("C:\\Windows\\System32");
        });
    });
});

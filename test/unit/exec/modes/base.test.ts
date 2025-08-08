import {describe, expect, it} from "vitest";

import {ExecutionContext, ExecutionMode} from "../../../../src/exec/modes/base";

// Create a concrete implementation for testing
class TestExecutionMode extends ExecutionMode {
    async execute(_contexts: ExecutionContext[]): Promise<void> {
        // No-op for testing
    }

    // Expose protected method for testing
    public testGetEnvironment(context: ExecutionContext): Record<string, string> {
        return this.getEnvironment(context);
    }
}

describe("ExecutionMode base class", () => {
    describe("getEnvironment", () => {
        it("should include WTT environment variables", () => {
            const mode = new TestExecutionMode();
            const context: ExecutionContext = {
                worktreeName: "feature-branch",
                worktreePath: "/project/.worktrees/feature-branch",
                command: "npm",
                args: ["test"],
                env: {},
            };

            const env = mode.testGetEnvironment(context);

            expect(env.WTT_WORKTREE_NAME).toBe("feature-branch");
            expect(env.WTT_WORKTREE_PATH).toBe("/project/.worktrees/feature-branch");
            expect(env.WTT_IS_MAIN).toBe("false");
        });

        it("should set WTT_IS_MAIN to true for main worktree", () => {
            const mode = new TestExecutionMode();
            const context: ExecutionContext = {
                worktreeName: "main",
                worktreePath: "/project",
                command: "npm",
                args: ["test"],
                env: {},
            };

            const env = mode.testGetEnvironment(context);

            expect(env.WTT_IS_MAIN).toBe("true");
        });

        it("should merge custom environment variables", () => {
            const mode = new TestExecutionMode();
            const context: ExecutionContext = {
                worktreeName: "feature",
                worktreePath: "/project/.worktrees/feature",
                command: "npm",
                args: ["test"],
                env: {
                    CUSTOM_VAR: "custom_value",
                    NODE_ENV: "test",
                },
            };

            const env = mode.testGetEnvironment(context);

            expect(env.CUSTOM_VAR).toBe("custom_value");
            expect(env.NODE_ENV).toBe("test");
            expect(env.WTT_WORKTREE_NAME).toBe("feature");
        });

        it("should inherit process environment variables", () => {
            const mode = new TestExecutionMode();
            const context: ExecutionContext = {
                worktreeName: "feature",
                worktreePath: "/project/.worktrees/feature",
                command: "npm",
                args: ["test"],
                env: {},
            };

            const env = mode.testGetEnvironment(context);

            // Should have at least PATH from process.env
            expect(env.PATH).toBeDefined();
        });
    });
});

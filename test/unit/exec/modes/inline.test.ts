import {spawn} from "child_process";
import {beforeEach, describe, expect, it, Mock, vi} from "vitest";

import {ExecutionContext} from "../../../../src/exec/modes/base.js";
import {InlineMode} from "../../../../src/exec/modes/inline.js";
import {getLogger} from "../../../../src/utils/logger.js";

// Mock child_process
vi.mock("child_process", () => ({
    spawn: vi.fn(),
}));

// Mock logger
vi.mock("../../../../src/utils/logger.js", () => ({
    getLogger: vi.fn(),
}));

describe("InlineMode", () => {
    let inlineMode: InlineMode;
    let mockLogger: {
        info: Mock;
        error: Mock;
        warn: Mock;
        success: Mock;
        verbose: Mock;
    };
    let mockSpawn: Mock;

    beforeEach(() => {
        vi.clearAllMocks();

        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            success: vi.fn(),
            verbose: vi.fn(),
        };

        (getLogger as Mock).mockReturnValue(mockLogger);
        mockSpawn = vi.mocked(spawn);

        inlineMode = new InlineMode(mockLogger);
    });

    const createMockContext = (name = "test-worktree"): ExecutionContext => ({
        worktreeName: name,
        worktreePath: `/path/to/${name}`,
        command: "npm",
        args: ["test"],
        env: {},
    });

    const createMockProcess = () => {
        const mockProc = {
            stdout: {on: vi.fn()},
            stderr: {on: vi.fn()},
            on: vi.fn(),
        };
        return mockProc;
    };

    describe("execute", () => {
        it("should execute commands in parallel and succeed", async() => {
            const contexts = [
                createMockContext("worktree1"),
                createMockContext("worktree2"),
            ];

            const mockProc1 = createMockProcess();
            const mockProc2 = createMockProcess();

            mockSpawn
                .mockReturnValueOnce(mockProc1 as any)
                .mockReturnValueOnce(mockProc2 as any);

            // Set up successful execution
            mockProc1.on.mockImplementation((event, callback) => {
                if (event === "close") {
                    // Simulate successful completion
                    setTimeout(() => callback(0), 0);
                }

                return mockProc1;
            });

            mockProc2.on.mockImplementation((event, callback) => {
                if (event === "close") {
                    // Simulate successful completion
                    setTimeout(() => callback(0), 0);
                }

                return mockProc2;
            });

            await inlineMode.execute(contexts);

            expect(mockLogger.info).toHaveBeenCalledWith("Executing command in 2 worktree(s) (inline mode)...");
            expect(mockSpawn).toHaveBeenCalledTimes(2);
            expect(mockSpawn).toHaveBeenCalledWith("npm", ["test"], {
                cwd: "/path/to/worktree1",
                env: expect.any(Object),
                shell: true,
            });
        });

        it("should handle command failures", async() => {
            const contexts = [createMockContext("failing-worktree")];
            const mockProc = createMockProcess();

            mockSpawn.mockReturnValue(mockProc as any);

            mockProc.on.mockImplementation((event, callback) => {
                if (event === "close") {
                    // Simulate command failure
                    setTimeout(() => callback(1), 0);
                }

                return mockProc;
            });

            await expect(inlineMode.execute(contexts)).rejects.toThrow("1 command(s) failed");
            expect(mockSpawn).toHaveBeenCalledTimes(1);
        });

        it("should handle spawn errors", async() => {
            const contexts = [createMockContext("error-worktree")];
            const mockProc = createMockProcess();

            mockSpawn.mockReturnValue(mockProc as any);

            mockProc.on.mockImplementation((event, callback) => {
                if (event === "error") {
                    // Simulate spawn error
                    setTimeout(() => callback(new Error("ENOENT: command not found")), 0);
                }

                return mockProc;
            });

            await expect(inlineMode.execute(contexts)).rejects.toThrow("1 command(s) failed");
            expect(mockLogger.error).toHaveBeenCalledWith("[error-worktree] Failed to start command: ENOENT: command not found");
        });

        it("should handle mixed success and failure", async() => {
            const contexts = [
                createMockContext("success-worktree"),
                createMockContext("fail-worktree"),
            ];

            const mockProc1 = createMockProcess();
            const mockProc2 = createMockProcess();

            mockSpawn
                .mockReturnValueOnce(mockProc1 as any)
                .mockReturnValueOnce(mockProc2 as any);

            mockProc1.on.mockImplementation((event, callback) => {
                if (event === "close") {
                    setTimeout(() => callback(0), 0); // Success
                }

                return mockProc1;
            });

            mockProc2.on.mockImplementation((event, callback) => {
                if (event === "close") {
                    setTimeout(() => callback(1), 0); // Failure
                }

                return mockProc2;
            });

            await expect(inlineMode.execute(contexts)).rejects.toThrow("1 command(s) failed");
        });

        it("should display stdout output", async() => {
            const contexts = [createMockContext("output-worktree")];
            const mockProc = createMockProcess();

            mockSpawn.mockReturnValue(mockProc as any);

            let stdoutCallback: (data: Buffer) => void;
            mockProc.stdout.on.mockImplementation((event, callback) => {
                if (event === "data") {
                    stdoutCallback = callback;
                }

                return mockProc.stdout;
            });

            mockProc.on.mockImplementation((event, callback) => {
                if (event === "close") {
                    // Simulate output before close
                    stdoutCallback(Buffer.from("test output\n"));
                    setTimeout(() => callback(0), 0);
                }

                return mockProc;
            });

            await inlineMode.execute(contexts);

            expect(mockLogger.info).toHaveBeenCalledWith("\n[output-worktree] Output:");
            expect(mockLogger.info).toHaveBeenCalledWith("test output\n");
        });

        it("should display stderr output", async() => {
            const contexts = [createMockContext("error-output-worktree")];
            const mockProc = createMockProcess();

            mockSpawn.mockReturnValue(mockProc as any);

            let stderrCallback: (data: Buffer) => void;
            mockProc.stderr.on.mockImplementation((event, callback) => {
                if (event === "data") {
                    stderrCallback = callback;
                }

                return mockProc.stderr;
            });

            mockProc.on.mockImplementation((event, callback) => {
                if (event === "close") {
                    // Simulate error output before close
                    stderrCallback(Buffer.from("test error\n"));
                    setTimeout(() => callback(0), 0);
                }

                return mockProc;
            });

            await inlineMode.execute(contexts);

            expect(mockLogger.error).toHaveBeenCalledWith("[error-output-worktree] Errors:");
            expect(mockLogger.error).toHaveBeenCalledWith("test error\n");
        });

        it("should pass correct environment variables", async() => {
            const contexts = [createMockContext("env-worktree")];
            contexts[0].env = {
                CUSTOM_VAR: "test-value",
                NODE_ENV: "test",
            };

            const mockProc = createMockProcess();
            mockSpawn.mockReturnValue(mockProc as any);

            mockProc.on.mockImplementation((event, callback) => {
                if (event === "close") {
                    setTimeout(() => callback(0), 0);
                }

                return mockProc;
            });

            await inlineMode.execute(contexts);

            expect(mockSpawn).toHaveBeenCalledWith("npm", ["test"], {
                cwd: "/path/to/env-worktree",
                env: expect.objectContaining({
                    CUSTOM_VAR: "test-value",
                    NODE_ENV: "test",
                }),
                shell: true,
            });
        });
    });
});

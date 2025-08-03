import {execFile} from "child_process";

import {
    canAttachToTmux,
    createTmuxSession,
    createTmuxWindow,
    isInsideTmux,
    isTmuxAvailable,
    killTmuxSession,
    listTmuxSessions,
    sanitizeTmuxName,
    switchToTmuxWindow,
    tmuxSessionExists} from "../../../src/platform/tmux";
import {PlatformError} from "../../../src/utils/errors";

// Mock child_process
jest.mock("child_process");
const mockExecFile = execFile as jest.MockedFunction<typeof execFile>;

// Mock util.promisify to return a proper async function
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/prefer-promise-reject-errors */
jest.mock("util", () => ({
    ... jest.requireActual("util"),
    promisify: (fn: any) => {
        if (fn === execFile) {
            return async(... args: any[]) => {
                return new Promise((resolve, reject) => {
                    fn(... args, (err: any, stdout: any, stderr: any) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({stdout, stderr});
                        }
                    });
                });
            };
        }

        return jest.requireActual("util").promisify(fn);
    },
}));
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/prefer-promise-reject-errors */

describe("Tmux Operations", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("sanitizeTmuxName", () => {
        it("should replace spaces with hyphens", () => {
            expect(sanitizeTmuxName("my feature branch")).toBe("my-feature-branch");
        });

        it("should remove special characters", () => {
            expect(sanitizeTmuxName("feature@#$%^&*()!")).toBe("feature");
        });

        it("should preserve hyphens and underscores", () => {
            expect(sanitizeTmuxName("my-feature_branch")).toBe("my-feature_branch");
        });

        it("should convert to lowercase", () => {
            expect(sanitizeTmuxName("MyFeatureBranch")).toBe("myfeaturebranch");
        });

        it("should handle complex names", () => {
            expect(sanitizeTmuxName("Feature/Add New Button!")).toBe("featureadd-new-button");
        });

        it("should handle multiple spaces", () => {
            expect(sanitizeTmuxName("my   feature   branch")).toBe("my-feature-branch");
        });
    });

    describe("isInsideTmux", () => {
        const originalEnv = process.env;

        afterEach(() => {
            process.env = originalEnv;
        });

        it("should return true when TMUX environment variable is set", () => {
            process.env = {... originalEnv, TMUX: "/tmp/tmux-1000/default,12345,0"};
            expect(isInsideTmux()).toBe(true);
        });

        it("should return false when TMUX environment variable is not set", () => {
            process.env = {... originalEnv};
            delete process.env.TMUX;
            expect(isInsideTmux()).toBe(false);
        });
    });

    describe("canAttachToTmux", () => {
        let originalIsTTY: boolean | undefined;

        beforeEach(() => {
            originalIsTTY = process.stdout.isTTY;
        });

        afterEach(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
            (process.stdout as any).isTTY = originalIsTTY;
        });

        it("should return true when stdout is a TTY", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
            (process.stdout as any).isTTY = true;
            expect(canAttachToTmux()).toBe(true);
        });

        it("should return false when stdout is not a TTY", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
            (process.stdout as any).isTTY = false;
            expect(canAttachToTmux()).toBe(false);
        });

        it("should return false when isTTY is undefined", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
            (process.stdout as any).isTTY = undefined;
            expect(canAttachToTmux()).toBe(false);
        });
    });

    describe("isTmuxAvailable", () => {
        const originalEnv = process.env;

        afterEach(() => {
            process.env = originalEnv;
        });

        it("should return true when tmux is available", async() => {
            process.env = {... originalEnv};
            delete process.env.WTT_DISABLE_TMUX;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(null, "tmux 3.2a", "");
                }

                return {} as any;
            });

            const result = await isTmuxAvailable();

            expect(result).toBe(true);
        });

        it("should return false when tmux is not available", async() => {
            process.env = {... originalEnv};
            delete process.env.WTT_DISABLE_TMUX;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(new Error("Command not found"), "", "");
                }

                return {} as any;
            });

            const result = await isTmuxAvailable();

            expect(result).toBe(false);
        });

        it("should return false when WTT_DISABLE_TMUX is set", async() => {
            process.env = {... originalEnv, WTT_DISABLE_TMUX: "true"};

            const result = await isTmuxAvailable();

            expect(result).toBe(false);
            expect(mockExecFile).not.toHaveBeenCalled();
        });
    });

    describe("tmuxSessionExists", () => {
        it("should return true when session exists", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(null, "", "");
                }

                return {} as any;
            });

            const result = await tmuxSessionExists("test-session");

            expect(result).toBe(true);
        });

        it("should return false when session does not exist", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(new Error("Session not found"), "", "");
                }

                return {} as any;
            });

            const result = await tmuxSessionExists("test-session");

            expect(result).toBe(false);
        });
    });

    describe("createTmuxSession", () => {
        it("should create session with sanitized name", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(null, "", "");
                }

                return {} as any;
            });

            await createTmuxSession("My Project Session");

            expect(mockExecFile).toHaveBeenCalledWith("tmux", ["new-session", "-d", "-s", "my-project-session"], expect.any(Function));
        });

        it("should create session with start directory when provided", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(null, "", "");
                }

                return {} as any;
            });

            await createTmuxSession("test-session", "/path/to/worktree");

            expect(mockExecFile).toHaveBeenCalledWith("tmux", ["new-session", "-d", "-s", "test-session", "-c", "/path/to/worktree"], expect.any(Function));
        });

        it("should throw PlatformError on failure", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(new Error("Failed to create session"), "", "");
                }

                return {} as any;
            });

            await expect(createTmuxSession("test-session")).rejects.toThrow(PlatformError);
            await expect(createTmuxSession("test-session")).rejects.toThrow("Failed to create tmux session");
        });
    });

    describe("createTmuxWindow", () => {
        it("should create window with sanitized names", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(null, "", "");
                }

                return {} as any;
            });

            await createTmuxWindow("My Session", "My Window", "/test/dir");

            expect(mockExecFile).toHaveBeenCalledWith("tmux", [
                "new-window",
                "-t",
                "my-session",
                "-n",
                "my-window",
                "-c",
                "/test/dir",
            ], expect.any(Function));
        });

        it("should throw PlatformError on failure", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(new Error("Failed to create window"), "", "");
                }

                return {} as any;
            });

            await expect(createTmuxWindow("session", "window", "/dir")).rejects.toThrow(PlatformError);
            await expect(createTmuxWindow("session", "window", "/dir")).rejects.toThrow("Failed to create tmux window");
        });
    });

    describe("switchToTmuxWindow", () => {
        it("should switch to window with sanitized names", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(null, "", "");
                }

                return {} as any;
            });

            await switchToTmuxWindow("My Session", "My Window");

            expect(mockExecFile).toHaveBeenCalledWith("tmux", ["select-window", "-t", "my-session:my-window"], expect.any(Function));
        });

        it("should try to attach session if select-window fails", async() => {
            let callCount = 0;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callCount++;
                    if (callCount === 1) {
                        // First call (select-window) fails

                        callback(new Error("Window not found"), "", "");
                    } else {
                        // Second call (attach-session) succeeds

                        callback(null, "", "");
                    }
                }

                return {} as any;
            });

            await switchToTmuxWindow("My Session", "My Window");

            expect(mockExecFile).toHaveBeenCalledTimes(2);
            expect(mockExecFile).toHaveBeenNthCalledWith(1, "tmux", ["select-window", "-t", "my-session:my-window"], expect.any(Function));
            expect(mockExecFile).toHaveBeenNthCalledWith(2, "tmux", ["attach-session", "-t", "my-session"], expect.any(Function));
        });

        it("should throw PlatformError when both attempts fail", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(new Error("Failed"), "", "");
                }

                return {} as any;
            });

            await expect(switchToTmuxWindow("session", "window")).rejects.toThrow(PlatformError);
            await expect(switchToTmuxWindow("session", "window")).rejects.toThrow("Failed to switch to tmux window");
        });
    });

    describe("listTmuxSessions", () => {
        it("should return list of session names", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(null, "session1\nsession2\nsession3\n", "");
                }

                return {} as any;
            });

            const result = await listTmuxSessions();

            expect(result).toEqual(["session1", "session2", "session3"]);
        });

        it("should return empty array when no sessions exist", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(new Error("No sessions"), "", "");
                }

                return {} as any;
            });

            const result = await listTmuxSessions();

            expect(result).toEqual([]);
        });

        it("should filter out empty lines", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(null, "session1\n\nsession2\n", "");
                }

                return {} as any;
            });

            const result = await listTmuxSessions();

            expect(result).toEqual(["session1", "session2"]);
        });
    });

    describe("killTmuxSession", () => {
        it("should kill session with sanitized name", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(null, "", "");
                }

                return {} as any;
            });

            await killTmuxSession("My Session");

            expect(mockExecFile).toHaveBeenCalledWith("tmux", ["kill-session", "-t", "my-session"], expect.any(Function));
        });

        it("should throw PlatformError on failure", async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
                if (typeof callback === "function") {
                    callback(new Error("Session not found"), "", "");
                }

                return {} as any;
            });

            await expect(killTmuxSession("test-session")).rejects.toThrow(PlatformError);
            await expect(killTmuxSession("test-session")).rejects.toThrow("Failed to kill tmux session");
        });
    });
});

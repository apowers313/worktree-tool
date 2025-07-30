import {spawn} from "child_process";
import {EventEmitter} from "events";
import {promises as fs} from "fs";

import {ShellType} from "../../../src/core/types";
import {
    getShellArgs,
    getShellCommand,
    isShellAvailable,
    setShellPrompt,
    spawnShell} from "../../../src/platform/shell";
import {PlatformError} from "../../../src/utils/errors";

// Mock child_process and fs
jest.mock("child_process");
jest.mock("fs", () => ({
    promises: {
        writeFile: jest.fn(),
        unlink: jest.fn(),
    },
}));
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
const mockUnlink = fs.unlink as jest.MockedFunction<typeof fs.unlink>;

describe("Shell Operations", () => {
    let mockChild: EventEmitter & {
        on: jest.Mock;
        stdio?: string;
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockChild = new EventEmitter() as any;
        mockChild.on = jest.fn((event, callback) => {
            EventEmitter.prototype.on.call(mockChild, event, callback);
            return mockChild;
        });

        mockSpawn.mockReturnValue(mockChild as any);
        mockWriteFile.mockResolvedValue(undefined);
        mockUnlink.mockResolvedValue(undefined);
    });

    describe("getShellCommand", () => {
        it("should return correct command for bash", () => {
            expect(getShellCommand("bash")).toBe("bash");
        });

        it("should return correct command for zsh", () => {
            expect(getShellCommand("zsh")).toBe("zsh");
        });

        it("should return correct command for powershell", () => {
            expect(getShellCommand("powershell")).toBe("powershell");
        });

        it("should return correct command for cmd", () => {
            expect(getShellCommand("cmd")).toBe("cmd");
        });

        it("should throw error for unsupported shell type", () => {
            expect(() => getShellCommand("fish" as ShellType)).toThrow(PlatformError);
            expect(() => getShellCommand("fish" as ShellType)).toThrow("Unsupported shell type: fish");
        });
    });

    describe("getShellArgs", () => {
        it("should return interactive args for bash", () => {
            expect(getShellArgs("bash")).toEqual(["-i"]);
        });

        it("should return interactive args for zsh", () => {
            expect(getShellArgs("zsh")).toEqual(["-i"]);
        });

        it("should return NoExit args for powershell", () => {
            expect(getShellArgs("powershell")).toEqual(["-NoExit"]);
        });

        it("should return /K args for cmd", () => {
            expect(getShellArgs("cmd")).toEqual(["/K"]);
        });

        it("should throw error for unsupported shell type", () => {
            expect(() => getShellArgs("fish" as ShellType)).toThrow(PlatformError);
        });
    });

    describe("setShellPrompt", () => {
        it("should set PS1 for bash", () => {
            const result = setShellPrompt("bash", "my-feature");
            expect(result).toEqual(["export PS1=\"[my-feature] > \""]);
        });

        it("should set PROMPT for zsh", () => {
            const result = setShellPrompt("zsh", "my-feature");
            expect(result).toEqual(["export PROMPT=\"[my-feature] > \""]);
        });

        it("should set prompt function for powershell", () => {
            const result = setShellPrompt("powershell", "my-feature");
            expect(result).toEqual(["function prompt { \"[my-feature] > \" }"]);
        });

        it("should set prompt command for cmd", () => {
            const result = setShellPrompt("cmd", "my-feature");
            expect(result).toEqual(["prompt [my-feature] > "]);
        });

        it("should handle worktree names with spaces", () => {
            const result = setShellPrompt("bash", "my feature branch");
            expect(result).toEqual(["export PS1=\"[my feature branch] > \""]);
        });

        it("should throw error for unsupported shell type", () => {
            expect(() => setShellPrompt("fish" as ShellType, "test")).toThrow(PlatformError);
        });
    });

    describe("spawnShell", () => {
        it("should spawn bash shell with correct arguments", async() => {
            // Mock successful spawn
            setTimeout(() => mockChild.emit("exit", 0), 10);

            const promise = spawnShell("/test/dir", "bash", "my-feature");

            // Wait for the promise to resolve
            await promise;

            // Check that spawn was called with bash and --rcfile arguments
            expect(mockSpawn).toHaveBeenCalledWith("bash",
                expect.arrayContaining(["--rcfile", expect.stringMatching(/wtt-bashrc-\d+/)]),
                {
                    stdio: "inherit",
                    cwd: "/test/dir",
                    env: expect.any(Object),
                    detached: false,
                },
            );

            // Check that a temporary file was created
            expect(mockWriteFile).toHaveBeenCalledWith(
                expect.stringMatching(/wtt-bashrc-\d+/),
                expect.stringContaining("[my-feature] > "),
            );
        });

        it("should spawn zsh shell with correct arguments", async() => {
            setTimeout(() => mockChild.emit("exit", 0), 10);

            const promise = spawnShell("/test/dir", "zsh", "my-feature");

            await promise;

            expect(mockSpawn).toHaveBeenCalledWith("zsh", ["-i"], {
                stdio: "inherit",
                cwd: "/test/dir",
                env: expect.objectContaining({
                    PROMPT: "[my-feature] > ",
                }),
                detached: false,
            });
        });

        it("should spawn powershell with correct arguments", async() => {
            setTimeout(() => mockChild.emit("exit", 0), 10);

            const promise = spawnShell("/test/dir", "powershell", "my-feature");

            await promise;

            expect(mockSpawn).toHaveBeenCalledWith("powershell", [
                "-NoExit",
                "-Command",
                "function prompt { \"[my-feature] > \" }",
            ], {
                stdio: "inherit",
                cwd: "/test/dir",
                env: expect.any(Object),
                detached: false,
            });
        });

        it("should spawn cmd with correct arguments", async() => {
            setTimeout(() => mockChild.emit("exit", 0), 10);

            const promise = spawnShell("/test/dir", "cmd", "my-feature");

            await promise;

            expect(mockSpawn).toHaveBeenCalledWith("cmd", [
                "/K",
                "prompt [my-feature] > ",
            ], {
                stdio: "inherit",
                cwd: "/test/dir",
                env: expect.any(Object),
                detached: false,
            });
        });

        it("should reject on spawn error", async() => {
            setTimeout(() => mockChild.emit("error", new Error("Command not found")), 10);

            await expect(spawnShell("/test/dir", "bash", "my-feature")).rejects.toThrow(PlatformError);
        });

        it("should reject on non-zero exit code", async() => {
            setTimeout(() => mockChild.emit("exit", 1), 10);

            await expect(spawnShell("/test/dir", "bash", "my-feature")).rejects.toThrow(PlatformError);
        });

        it("should resolve on successful exit", async() => {
            setTimeout(() => mockChild.emit("exit", 0), 10);

            await expect(spawnShell("/test/dir", "bash", "my-feature")).resolves.toBeUndefined();
        });

        it("should resolve on null exit code", async() => {
            setTimeout(() => mockChild.emit("exit", null), 10);

            await expect(spawnShell("/test/dir", "bash", "my-feature")).resolves.toBeUndefined();
        });
    });

    describe("isShellAvailable", () => {
        it("should return true when shell is available", async() => {
            setTimeout(() => mockChild.emit("exit", 0), 10);

            const result = await isShellAvailable("bash");

            expect(result).toBe(true);
            expect(mockSpawn).toHaveBeenCalledWith("bash", ["--version"], {
                stdio: "ignore",
            });
        });

        it("should return false when shell command fails", async() => {
            setTimeout(() => mockChild.emit("exit", 1), 10);

            const result = await isShellAvailable("bash");

            expect(result).toBe(false);
        });

        it("should return false when spawn throws error", async() => {
            setTimeout(() => mockChild.emit("error", new Error("Command not found")), 10);

            const result = await isShellAvailable("bash");

            expect(result).toBe(false);
        });

        it("should handle spawn exceptions", async() => {
            mockSpawn.mockImplementation(() => {
                throw new Error("Spawn failed");
            });

            const result = await isShellAvailable("bash");

            expect(result).toBe(false);
        });
    });
});

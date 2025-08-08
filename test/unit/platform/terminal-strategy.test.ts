import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

// Use vi.hoisted to ensure mocks are created before imports
const {mockExecAsync} = vi.hoisted(() => {
    return {
        mockExecAsync: vi.fn(),
    };
});

// Mock the util module to return our mock
vi.mock("util", () => ({
    promisify: () => mockExecAsync,
}));

// Import modules after mocking
import {
    GnomeTerminalStrategy,
    ITermStrategy,
    KonsoleStrategy,
    MacTerminalStrategy,
    TerminalManager,
    TerminalStrategy,
    WindowsTerminalStrategy,
    XtermStrategy,
} from "../../../src/platform/terminal-strategy.js";
import {PlatformError} from "../../../src/utils/errors.js";

describe("terminal-strategy", () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
        vi.clearAllMocks();
        mockExecAsync.mockReset();
    });

    afterEach(() => {
        Object.defineProperty(process, "platform", {
            value: originalPlatform,
            writable: true,
        });
    });

    describe("GnomeTerminalStrategy", () => {
        let strategy: GnomeTerminalStrategy;

        beforeEach(() => {
            strategy = new GnomeTerminalStrategy();
        });

        it("should return true when on Linux and gnome-terminal exists", async() => {
            Object.defineProperty(process, "platform", {
                value: "linux",
                writable: true,
            });
            mockExecAsync.mockResolvedValue({stdout: "", stderr: ""});

            const result = await strategy.canHandle();

            expect(result).toBe(true);
            expect(mockExecAsync).toHaveBeenCalledWith("which", ["gnome-terminal"]);
        });

        it("should return false when not on Linux", async() => {
            Object.defineProperty(process, "platform", {
                value: "darwin",
                writable: true,
            });

            const result = await strategy.canHandle();

            expect(result).toBe(false);
            expect(mockExecAsync).not.toHaveBeenCalled();
        });

        it("should return false when gnome-terminal does not exist", async() => {
            Object.defineProperty(process, "platform", {
                value: "linux",
                writable: true,
            });
            mockExecAsync.mockRejectedValue(new Error("Command not found"));

            const result = await strategy.canHandle();

            expect(result).toBe(false);
        });

        it("should open window with correct arguments", async() => {
            mockExecAsync.mockResolvedValue({stdout: "", stderr: ""});

            await strategy.openWindow("npm start", "/home/user/project", "My Project");

            expect(mockExecAsync).toHaveBeenCalledWith("gnome-terminal", [
                "--title=My Project",
                "--",
                "bash",
                "-c",
                "cd /home/user/project && npm start; exec bash",
            ]);
        });
    });

    describe("KonsoleStrategy", () => {
        let strategy: KonsoleStrategy;

        beforeEach(() => {
            strategy = new KonsoleStrategy();
        });

        it("should return true when on Linux and konsole exists", async() => {
            Object.defineProperty(process, "platform", {
                value: "linux",
                writable: true,
            });
            mockExecAsync.mockResolvedValue({stdout: "", stderr: ""});

            const result = await strategy.canHandle();

            expect(result).toBe(true);
            expect(mockExecAsync).toHaveBeenCalledWith("which", ["konsole"]);
        });

        it("should open window with correct arguments", async() => {
            mockExecAsync.mockResolvedValue({stdout: "", stderr: ""});

            await strategy.openWindow("npm test", "/home/user/project", "Test Window");

            expect(mockExecAsync).toHaveBeenCalledWith("konsole", [
                "--new-tab",
                "--title=Test Window",
                "-e",
                "bash",
                "-c",
                "cd /home/user/project && npm test; exec bash",
            ]);
        });
    });

    describe("XtermStrategy", () => {
        let strategy: XtermStrategy;

        beforeEach(() => {
            strategy = new XtermStrategy();
        });

        it("should return true when on Linux and xterm exists", async() => {
            Object.defineProperty(process, "platform", {
                value: "linux",
                writable: true,
            });
            mockExecAsync.mockResolvedValue({stdout: "", stderr: ""});

            const result = await strategy.canHandle();

            expect(result).toBe(true);
            expect(mockExecAsync).toHaveBeenCalledWith("which", ["xterm"]);
        });

        it("should open window with correct arguments", async() => {
            mockExecAsync.mockResolvedValue({stdout: "", stderr: ""});

            await strategy.openWindow("npm run dev", "/home/user/project", "Dev Server");

            expect(mockExecAsync).toHaveBeenCalledWith("xterm", [
                "-title",
                "Dev Server",
                "-e",
                "bash",
                "-c",
                "cd /home/user/project && npm run dev; exec bash",
            ]);
        });
    });

    describe("MacTerminalStrategy", () => {
        let strategy: MacTerminalStrategy;

        beforeEach(() => {
            strategy = new MacTerminalStrategy();
        });

        it("should return true when on macOS", async() => {
            Object.defineProperty(process, "platform", {
                value: "darwin",
                writable: true,
            });

            const result = await strategy.canHandle();

            expect(result).toBe(true);
        });

        it("should return false when not on macOS", async() => {
            Object.defineProperty(process, "platform", {
                value: "linux",
                writable: true,
            });

            const result = await strategy.canHandle();

            expect(result).toBe(false);
        });

        it("should open window with AppleScript", async() => {
            mockExecAsync.mockResolvedValue({stdout: "", stderr: ""});

            await strategy.openWindow("npm start", "/Users/user/project", "My App");

            expect(mockExecAsync).toHaveBeenCalledWith(
                "osascript",
                expect.arrayContaining(["-e", expect.stringContaining("tell application \"Terminal\"")]),
                expect.any(Object),
            );
            const callArgs = mockExecAsync.mock.calls[0];
            expect(callArgs[1][1]).toContain("cd /Users/user/project && npm start");
        });
    });

    describe("ITermStrategy", () => {
        let strategy: ITermStrategy;

        beforeEach(() => {
            strategy = new ITermStrategy();
        });

        it("should return false when not on macOS", async() => {
            Object.defineProperty(process, "platform", {
                value: "linux",
                writable: true,
            });

            const result = await strategy.canHandle();

            expect(result).toBe(false);
        });

        it("should return true when on macOS and iTerm2 exists", async() => {
            Object.defineProperty(process, "platform", {
                value: "darwin",
                writable: true,
            });
            mockExecAsync.mockResolvedValue({stdout: "", stderr: ""});

            const result = await strategy.canHandle();

            expect(result).toBe(true);
            expect(mockExecAsync).toHaveBeenCalledWith(
                "osascript",
                ["-e", "tell application \"System Events\" to exists application process \"iTerm2\""],
                expect.any(Object),
            );
        });

        it("should return false when iTerm2 does not exist", async() => {
            Object.defineProperty(process, "platform", {
                value: "darwin",
                writable: true,
            });
            mockExecAsync.mockRejectedValue(new Error("Not found"));

            const result = await strategy.canHandle();

            expect(result).toBe(false);
        });

        it("should open window with AppleScript", async() => {
            mockExecAsync.mockResolvedValue({stdout: "", stderr: ""});

            await strategy.openWindow("npm test", "/Users/user/project", "Test Suite");

            expect(mockExecAsync).toHaveBeenCalledWith(
                "osascript",
                expect.arrayContaining(["-e", expect.stringContaining("tell application \"iTerm2\"")]),
                expect.any(Object),
            );
            const callArgs = mockExecAsync.mock.calls[0];
            expect(callArgs[1][1]).toContain("cd /Users/user/project && npm test");
        });
    });

    describe("WindowsTerminalStrategy", () => {
        let strategy: WindowsTerminalStrategy;

        beforeEach(() => {
            strategy = new WindowsTerminalStrategy();
        });

        it("should return true when on Windows", async() => {
            Object.defineProperty(process, "platform", {
                value: "win32",
                writable: true,
            });

            const result = await strategy.canHandle();

            expect(result).toBe(true);
        });

        it("should return false when not on Windows", async() => {
            Object.defineProperty(process, "platform", {
                value: "linux",
                writable: true,
            });

            const result = await strategy.canHandle();

            expect(result).toBe(false);
        });

        it("should try Windows Terminal first", async() => {
            mockExecAsync.mockResolvedValue({stdout: "", stderr: ""});

            await strategy.openWindow("npm start", "C:\\Users\\user\\project", "My App");

            expect(mockExecAsync).toHaveBeenCalledWith("wt", [
                "-w",
                "0",
                "new-tab",
                "--title",
                "My App",
                "-d",
                "C:\\Users\\user\\project",
                "cmd",
                "/k",
                "npm start",
            ]);
        });

        it("should fall back to cmd.exe when Windows Terminal fails", async() => {
            mockExecAsync
                .mockRejectedValueOnce(new Error("wt not found"))
                .mockResolvedValueOnce({stdout: "", stderr: ""});

            await strategy.openWindow("npm start", "C:\\Users\\user\\project", "My App");

            expect(mockExecAsync).toHaveBeenCalledTimes(2);
            expect(mockExecAsync).toHaveBeenLastCalledWith("cmd", [
                "/c",
                "start",
                "My App",
                "/d",
                "C:\\Users\\user\\project",
                "cmd",
                "/k",
                "npm start",
            ]);
        });
    });

    describe("TerminalManager", () => {
        let manager: TerminalManager;

        beforeEach(() => {
            manager = new TerminalManager();
        });

        it("should use the first available strategy", async() => {
            const mockStrategy: TerminalStrategy = {
                canHandle: vi.fn().mockResolvedValue(true),
                openWindow: vi.fn().mockResolvedValue(undefined),
            };

            manager.addStrategy(mockStrategy);

            await manager.openWindow("npm start", "/path", "Title");

            expect(mockStrategy.canHandle).toHaveBeenCalled();
            expect(mockStrategy.openWindow).toHaveBeenCalledWith("npm start", "/path", "Title");
        });

        it("should try next strategy if first one fails", async() => {
            const failingStrategy: TerminalStrategy = {
                canHandle: vi.fn().mockResolvedValue(true),
                openWindow: vi.fn().mockRejectedValue(new Error("Failed")),
            };

            const workingStrategy: TerminalStrategy = {
                canHandle: vi.fn().mockResolvedValue(true),
                openWindow: vi.fn().mockResolvedValue(undefined),
            };

            manager.addStrategy(workingStrategy);
            manager.addStrategy(failingStrategy);

            await manager.openWindow("npm start", "/path", "Title");

            expect(failingStrategy.openWindow).toHaveBeenCalled();
            expect(workingStrategy.openWindow).toHaveBeenCalled();
        });

        it("should throw PlatformError when no strategy can handle", async() => {
            // Override all strategies to return false
            const manager = new TerminalManager();
            manager.strategies = [{
                canHandle: vi.fn().mockResolvedValue(false),
                openWindow: vi.fn(),
            }];

            await expect(manager.openWindow("npm start", "/path", "Title")).rejects.toThrow(PlatformError);
        });

        it("should add custom strategies at the beginning", () => {
            const customStrategy: TerminalStrategy = {
                canHandle: vi.fn().mockResolvedValue(true),
                openWindow: vi.fn(),
            };

            const initialLength = manager.strategies.length;
            manager.addStrategy(customStrategy);

            expect(manager.strategies.length).toBe(initialLength + 1);
            expect(manager.strategies[0]).toBe(customStrategy);
        });
    });
});

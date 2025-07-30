import {execSync} from "child_process";

import {
    checkTmuxAvailable,
    detectPlatform,
    detectShell,
    getPathSeparator,
    getShellPath,
    isCI} from "../../../src/platform/detector";
import {PlatformError} from "../../../src/utils/errors";

// Mock child_process
jest.mock("child_process");

describe("Platform Detector", () => {
    const originalPlatform = process.platform;
    const originalEnv = process.env;

    beforeEach(() => {
    // Reset mocks
        jest.clearAllMocks();

        // Reset process.env
        process.env = {... originalEnv};
    });

    afterEach(() => {
    // Restore original values
        Object.defineProperty(process, "platform", {
            value: originalPlatform,
        });
        process.env = originalEnv;
    });

    describe("detectPlatform", () => {
        it("should detect Windows platform", () => {
            Object.defineProperty(process, "platform", {
                value: "win32",
            });
            process.env.COMSPEC = "C:\\Windows\\System32\\cmd.exe";
            delete process.env.SHELL;
            delete process.env.PSModulePath;

            const platform = detectPlatform();

            expect(platform.os).toBe("windows");
            expect(platform.hasTmux).toBe(false);
            expect(platform.shellType).toBe("cmd");
        });

        it("should detect macOS platform", () => {
            Object.defineProperty(process, "platform", {
                value: "darwin",
            });
            process.env.SHELL = "/bin/zsh";
            (execSync as jest.Mock).mockImplementation(() => {});

            const platform = detectPlatform();

            expect(platform.os).toBe("macos");
            expect(platform.shellType).toBe("zsh");
        });

        it("should detect Linux platform", () => {
            Object.defineProperty(process, "platform", {
                value: "linux",
            });
            process.env.SHELL = "/bin/bash";
            (execSync as jest.Mock).mockImplementation(() => {
                throw new Error("tmux not found");
            });

            const platform = detectPlatform();

            expect(platform.os).toBe("linux");
            expect(platform.hasTmux).toBe(false);
            expect(platform.shellType).toBe("bash");
        });

        it("should throw error for unsupported platform", () => {
            Object.defineProperty(process, "platform", {
                value: "freebsd",
            });

            expect(() => detectPlatform()).toThrow(PlatformError);
            expect(() => detectPlatform()).toThrow("Unsupported platform: freebsd");
        });
    });

    describe("checkTmuxAvailable", () => {
        it("should return false on Windows", async() => {
            Object.defineProperty(process, "platform", {
                value: "win32",
            });

            const result = await checkTmuxAvailable();

            expect(result).toBe(false);
            expect(execSync).not.toHaveBeenCalled();
        });

        it("should return true when tmux is found", async() => {
            // Save and clear the env variable
            const originalEnv = process.env.WTT_DISABLE_TMUX;
            delete process.env.WTT_DISABLE_TMUX;

            Object.defineProperty(process, "platform", {
                value: "linux",
            });
            (execSync as jest.Mock).mockImplementation(() => {});

            const result = await checkTmuxAvailable();

            expect(result).toBe(true);
            expect(execSync).toHaveBeenCalledWith("which tmux", {stdio: "ignore"});

            // Restore env variable
            if (originalEnv !== undefined) {
                process.env.WTT_DISABLE_TMUX = originalEnv;
            }
        });

        it("should return false when tmux is not found", async() => {
            Object.defineProperty(process, "platform", {
                value: "linux",
            });
            (execSync as jest.Mock).mockImplementation(() => {
                throw new Error("Command not found");
            });

            const result = await checkTmuxAvailable();

            expect(result).toBe(false);
        });
    });

    describe("detectShell", () => {
        it("should detect zsh", () => {
            process.env.SHELL = "/usr/bin/zsh";

            const shell = detectShell();

            expect(shell).toBe("zsh");
        });

        it("should detect bash", () => {
            process.env.SHELL = "/bin/bash";

            const shell = detectShell();

            expect(shell).toBe("bash");
        });

        it("should detect PowerShell on Windows", () => {
            Object.defineProperty(process, "platform", {
                value: "win32",
            });
            process.env.COMSPEC = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
            delete process.env.SHELL;

            const shell = detectShell();

            expect(shell).toBe("powershell");
        });

        it("should detect PowerShell by PSModulePath", () => {
            Object.defineProperty(process, "platform", {
                value: "win32",
            });
            process.env.PSModulePath = "C:\\Program Files\\WindowsPowerShell\\Modules";
            process.env.COMSPEC = "C:\\Windows\\System32\\cmd.exe";
            delete process.env.SHELL;

            const shell = detectShell();

            expect(shell).toBe("powershell");
        });

        it("should detect cmd on Windows", () => {
            Object.defineProperty(process, "platform", {
                value: "win32",
            });
            process.env.COMSPEC = "C:\\Windows\\System32\\cmd.exe";
            delete process.env.SHELL;
            delete process.env.PSModulePath;

            const shell = detectShell();

            expect(shell).toBe("cmd");
        });

        it("should default to zsh on macOS", () => {
            Object.defineProperty(process, "platform", {
                value: "darwin",
            });
            delete process.env.SHELL;

            const shell = detectShell();

            expect(shell).toBe("zsh");
        });

        it("should default to bash on Linux", () => {
            Object.defineProperty(process, "platform", {
                value: "linux",
            });
            delete process.env.SHELL;

            const shell = detectShell();

            expect(shell).toBe("bash");
        });
    });

    describe("getShellPath", () => {
        it("should return bash path for Unix", () => {
            Object.defineProperty(process, "platform", {
                value: "linux",
            });

            const path = getShellPath("bash");

            expect(path).toBe("/bin/bash");
        });

        it("should return bash.exe for Windows", () => {
            Object.defineProperty(process, "platform", {
                value: "win32",
            });

            const path = getShellPath("bash");

            expect(path).toBe("bash.exe");
        });

        it("should return zsh path", () => {
            const path = getShellPath("zsh");

            expect(path).toBe("/bin/zsh");
        });

        it("should return powershell.exe", () => {
            const path = getShellPath("powershell");

            expect(path).toBe("powershell.exe");
        });

        it("should return cmd.exe", () => {
            const path = getShellPath("cmd");

            expect(path).toBe("cmd.exe");
        });

        it("should throw error for unknown shell", () => {
            expect(() => getShellPath("fish" as any)).toThrow(PlatformError);
            expect(() => getShellPath("fish" as any)).toThrow("Unknown shell type: fish");
        });
    });

    describe("isCI", () => {
        it("should detect CI environment variable", () => {
            process.env.CI = "true";

            expect(isCI()).toBe(true);
        });

        it("should detect GitHub Actions", () => {
            process.env.GITHUB_ACTIONS = "true";

            expect(isCI()).toBe(true);
        });

        it("should detect GitLab CI", () => {
            process.env.GITLAB_CI = "true";

            expect(isCI()).toBe(true);
        });

        it("should detect CircleCI", () => {
            process.env.CIRCLECI = "true";

            expect(isCI()).toBe(true);
        });

        it("should detect Travis CI", () => {
            process.env.TRAVIS = "true";

            expect(isCI()).toBe(true);
        });

        it("should detect Jenkins", () => {
            process.env.JENKINS_URL = "http://jenkins.example.com";

            expect(isCI()).toBe(true);
        });

        it("should detect TeamCity", () => {
            process.env.TEAMCITY_VERSION = "2021.1";

            expect(isCI()).toBe(true);
        });

        it("should return false when not in CI", () => {
            // Clear all CI env vars
            delete process.env.CI;
            delete process.env.CONTINUOUS_INTEGRATION;
            delete process.env.GITHUB_ACTIONS;
            delete process.env.GITLAB_CI;
            delete process.env.CIRCLECI;
            delete process.env.TRAVIS;
            delete process.env.JENKINS_URL;
            delete process.env.TEAMCITY_VERSION;

            expect(isCI()).toBe(false);
        });
    });

    describe("getPathSeparator", () => {
        it("should return semicolon for Windows", () => {
            Object.defineProperty(process, "platform", {
                value: "win32",
            });

            expect(getPathSeparator()).toBe(";");
        });

        it("should return colon for Unix-like systems", () => {
            Object.defineProperty(process, "platform", {
                value: "linux",
            });

            expect(getPathSeparator()).toBe(":");
        });
    });
});

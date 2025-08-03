import {execSync} from "child_process";

import {Platform, ShellType} from "../core/types";
import {PlatformError} from "../utils/errors";

/**
 * Detect the current platform information
 */
export function detectPlatform(): Platform {
    const os = detectOS();
    const hasTmux = checkTmuxAvailableSync();
    const shellType = detectShell();

    return {
        os,
        hasTmux,
        shellType,
    };
}

/**
 * Detect the operating system
 */
function detectOS(): "windows" | "macos" | "linux" {
    const {platform} = process;

    switch (platform) {
        case "win32":
            return "windows";
        case "darwin":
            return "macos";
        case "linux":
            return "linux";
        default:
            throw new PlatformError(`Unsupported platform: ${platform}`);
    }
}

/**
 * Check if tmux is available on the system
 */
export function checkTmuxAvailable(): boolean {
    // Check for test environment variable to disable tmux
    if (process.env.WTT_DISABLE_TMUX === "true") {
        return false;
    }

    // Windows doesn't have tmux
    if (process.platform === "win32") {
        return false;
    }

    try {
        execSync("which tmux", {stdio: "ignore"});
        return true;
    } catch {
        return false;
    }
}

/**
 * Synchronous version of tmux check for platform detection
 */
function checkTmuxAvailableSync(): boolean {
    // Check for test environment variable to disable tmux
    if (process.env.WTT_DISABLE_TMUX === "true") {
        return false;
    }

    // Windows doesn't have tmux
    if (process.platform === "win32") {
        return false;
    }

    try {
        execSync("which tmux", {stdio: "ignore"});
        return true;
    } catch {
        return false;
    }
}

/**
 * Detect the current shell type
 */
export function detectShell(): ShellType {
    // Check environment variables
    const shell = process.env.SHELL ?? "";

    // Unix-like shell detection
    if (shell.includes("zsh")) {
        return "zsh";
    }

    if (shell.includes("bash")) {
        return "bash";
    }

    // Windows shell detection
    if (process.platform === "win32") {
        // Default to PowerShell on Windows
        return "powershell";
    }

    // Default fallbacks
    if (process.platform === "darwin") {
    // macOS defaults to zsh since Catalina
        return "zsh";
    }

    // Linux and others default to bash
    return "bash";
}

/**
 * Get the shell executable path
 */
export function getShellPath(shellType: ShellType): string {
    switch (shellType) {
        case "bash":
            return process.platform === "win32" ? "bash.exe" : "/bin/bash";
        case "zsh":
            return "/bin/zsh";
        case "powershell":
            return "powershell.exe";
        default:
            throw new PlatformError(`Unknown shell type: ${shellType as string}`);
    }
}

/**
 * Check if running inside a CI environment
 */
export function isCI(): boolean {
    return !!(
        process.env.CI ??
    process.env.CONTINUOUS_INTEGRATION ??
    process.env.GITHUB_ACTIONS ??
    process.env.GITLAB_CI ??
    process.env.CIRCLECI ??
    process.env.TRAVIS ??
    process.env.JENKINS_URL ??
    process.env.TEAMCITY_VERSION
    );
}

/**
 * Get platform-specific path separator
 */
export function getPathSeparator(): string {
    return process.platform === "win32" ? ";" : ":";
}


import {promises as fs} from "fs";
import * as path from "path";

import {ConfigError, FileSystemError} from "../utils/errors.js";
import {WorktreeConfig} from "./types.js";

const CONFIG_FILENAME = ".worktree-config.json";
const CONFIG_VERSION = "1.0.0";

/**
 * Load the worktree configuration from the current directory
 * @returns The configuration or null if not found
 */
export async function loadConfig(): Promise<WorktreeConfig | null> {
    try {
        const configPath = path.join(process.cwd(), CONFIG_FILENAME);
        const content = await fs.readFile(configPath, "utf-8");
        const data: unknown = JSON.parse(content);

        if (!validateConfig(data)) {
            throw new ConfigError("Invalid configuration format");
        }

        return data;
    } catch(error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            // Config file doesn't exist, which is okay
            return null;
        }

        if (error instanceof ConfigError) {
            throw error;
        }

        if (error instanceof SyntaxError) {
            throw new ConfigError("Invalid JSON in configuration file", error);
        }

        throw new FileSystemError(
            `Failed to read configuration: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/**
 * Save the worktree configuration to the current directory
 * @param config The configuration to save
 */
export async function saveConfig(config: WorktreeConfig): Promise<void> {
    try {
        const configPath = path.join(process.cwd(), CONFIG_FILENAME);
        const content = JSON.stringify(config, null, 2);
        await fs.writeFile(configPath, content, "utf-8");
    } catch(error) {
        throw new FileSystemError(
            `Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/**
 * Get the default configuration for a project
 * @param projectName The name of the project
 * @returns Default configuration
 */
export function getDefaultConfig(projectName: string): WorktreeConfig {
    return {
        version: CONFIG_VERSION,
        projectName,
        mainBranch: "main",
        baseDir: ".worktrees",
        tmux: true,
    };
}

/**
 * Validate that an unknown object is a valid WorktreeConfig
 * @param config The object to validate
 * @returns True if valid, false otherwise
 */
export function validateConfig(config: unknown): config is WorktreeConfig {
    if (!config || typeof config !== "object") {
        return false;
    }

    const obj = config as Record<string, unknown>;

    // Check required fields
    if (typeof obj.version !== "string") {
        return false;
    }

    if (typeof obj.projectName !== "string" || obj.projectName.trim() === "") {
        return false;
    }

    if (typeof obj.mainBranch !== "string" || obj.mainBranch.trim() === "") {
        return false;
    }

    if (typeof obj.baseDir !== "string" || obj.baseDir.trim() === "") {
        return false;
    }

    if (typeof obj.tmux !== "boolean") {
        return false;
    }

    return true;
}

/**
 * Check if a configuration already exists in the current directory
 */
export async function configExists(): Promise<boolean> {
    try {
        const configPath = path.join(process.cwd(), CONFIG_FILENAME);
        await fs.access(configPath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Update the .gitignore file to ignore the worktrees directory
 * @param baseDir The base directory for worktrees
 */
export async function updateGitignore(baseDir: string): Promise<void> {
    try {
        const gitignorePath = path.join(process.cwd(), ".gitignore");
        let content = "";

        try {
            content = await fs.readFile(gitignorePath, "utf-8");
        } catch(error) {
            if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") {
                throw error;
            }
            // File doesn't exist, we'll create it
        }

        // Check if the baseDir is already in .gitignore
        const lines = content.split("\n");
        const baseDirPattern = `${baseDir}/`;

        if (!lines.some((line) => line.trim() === baseDirPattern || line.trim() === baseDir)) {
            // Add baseDir to .gitignore
            if (content && !content.endsWith("\n")) {
                content += "\n";
            }

            // Add a comment if this is the first wtt entry
            if (!content.includes("wtt")) {
                content += "\n# wtt worktrees\n";
            }

            content += `${baseDirPattern}\n`;

            await fs.writeFile(gitignorePath, content, "utf-8");
        }
    } catch(error) {
        throw new FileSystemError(
            `Failed to update .gitignore: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

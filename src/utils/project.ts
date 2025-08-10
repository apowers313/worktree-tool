import {promises as fs} from "fs";
import * as path from "path";

import {sanitize} from "./sanitize.js";

/**
 * Detect the project name from the current directory
 * Tries package.json first, then falls back to directory name
 * @param dir The directory to check (defaults to current directory)
 * @returns The detected project name
 */
export async function detectProjectName(dir: string = process.cwd()): Promise<string> {
    // First try to find package.json
    const packageJsonPath = await findPackageJson(dir);

    if (packageJsonPath) {
        try {
            const content = await fs.readFile(packageJsonPath, "utf-8");
            const packageData = JSON.parse(content) as {name?: unknown};

            if (packageData.name && typeof packageData.name === "string") {
                return sanitize(packageData.name, "PROJECT_NAME");
            }
        } catch {
            // Ignore errors reading/parsing package.json
            // We'll fall back to directory name
        }
    }

    // Fall back to directory name
    const dirName = path.basename(dir);
    return sanitize(dirName, "PROJECT_NAME");
}

/**
 * Find package.json in the given directory or its parents
 * @param dir The directory to start searching from
 * @returns The path to package.json or null if not found
 */
export async function findPackageJson(dir: string): Promise<string | null> {
    let currentDir = path.resolve(dir);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
        const packageJsonPath = path.join(currentDir, "package.json");

        try {
            await fs.access(packageJsonPath);
            return packageJsonPath;
        } catch {
            // File doesn't exist, continue searching
        }

        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            // We've reached the root
            break;
        }

        currentDir = parentDir;
    }

    return null;
}

/**
 * Check if a name is valid for git branches
 * @param name The name to check
 * @returns True if valid, false otherwise
 */
export function isValidGitBranchName(name: string): boolean {
    // Git branch name rules:
    // - Cannot start with '.' or end with '.'
    // - Cannot contain '..'
    // - Cannot contain ASCII control characters
    // - Cannot contain ' ', '~', '^', ':', '?', '*', '[', '\\'
    // - Cannot end with '.lock'
    // - Cannot be '@'

    if (!name || name === "@") {
        return false;
    }

    if (name.startsWith(".") || name.endsWith(".")) {
        return false;
    }

    if (name.includes("..")) {
        return false;
    }

    if (name.endsWith(".lock")) {
        return false;
    }

    // Check for invalid characters
    // eslint-disable-next-line no-control-regex, no-useless-escape
    const invalidChars = /[\x00-\x1F\x7F ~^:?*\[\\]/;
    if (invalidChars.test(name)) {
        return false;
    }

    return true;
}


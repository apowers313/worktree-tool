import {promises as fs} from "fs";
import * as path from "path";

const CONFIG_FILENAME = ".worktree-config.json";

/**
 * Find the project root directory by looking for .worktree-config.json
 * Walks up the directory tree from the given starting directory
 * @param startDir The directory to start searching from (defaults to cwd)
 * @returns The project root directory path or null if not found
 */
export async function findProjectRoot(startDir?: string): Promise<string | null> {
    let currentDir = startDir ?? process.cwd();
    const {root} = path.parse(currentDir);

    while (currentDir !== root) {
        try {
            const configPath = path.join(currentDir, CONFIG_FILENAME);
            await fs.access(configPath);
            // Config file exists, this is the project root
            return currentDir;
        } catch {
            // Config not found in this directory, move up
            currentDir = path.dirname(currentDir);
        }
    }

    // Check the root directory as well
    try {
        const configPath = path.join(root, CONFIG_FILENAME);
        await fs.access(configPath);
        return root;
    } catch {
        // Not found anywhere
        return null;
    }
}

/**
 * Get the project root directory or throw an error if not found
 * @param startDir The directory to start searching from (defaults to cwd)
 * @returns The project root directory path
 * @throws Error if project root is not found
 */
export async function getProjectRoot(startDir?: string): Promise<string> {
    const root = await findProjectRoot(startDir);
    if (!root) {
        throw new Error("Not in a worktree project. Run \"wtt init\" first");
    }

    return root;
}

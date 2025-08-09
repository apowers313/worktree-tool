import {ConflictDetectionResult} from "../../types/conflicts.js";
import {getGitVersion, supportsModernMergeTree} from "../../utils/git-version.js";
import {detectActiveConflicts} from "./active.js";
import {detectPotentialConflictsLegacy} from "./potential-legacy.js";
import {detectPotentialConflictsModern} from "./potential-modern.js";

let cachedGitVersion: {major: number, minor: number, patch: number} | null = null;

// For testing purposes
export function clearGitVersionCache(): void {
    cachedGitVersion = null;
}

export async function detectConflicts(
    worktreePath: string,
    targetBranch = "main",
): Promise<ConflictDetectionResult> {
    const results: ConflictDetectionResult = {};

    // Detect active conflicts
    const activeConflicts = await detectActiveConflicts(worktreePath);
    if (activeConflicts) {
        results.active = activeConflicts;
    }

    // Detect potential conflicts
    try {
        // Get git version (cached)
        cachedGitVersion ??= await getGitVersion();

        const potentialConflicts = supportsModernMergeTree(cachedGitVersion) ?
            await detectPotentialConflictsModern(worktreePath, targetBranch) :
            await detectPotentialConflictsLegacy(worktreePath, targetBranch);

        if (potentialConflicts) {
            results.potential = potentialConflicts;
        }
    } catch {
        // If potential conflict detection fails, still return active conflicts
    }

    return results;
}

// Export all sub-modules for testing
export {detectActiveConflicts} from "./active.js";
export {detectPotentialConflictsLegacy} from "./potential-legacy.js";
export {detectPotentialConflictsModern} from "./potential-modern.js";

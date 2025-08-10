import simpleGit from "simple-git";

import {ConflictDetails, ConflictInfo} from "../../core/types.js";

export async function detectActiveConflicts(worktreePath: string): Promise<ConflictInfo | null> {
    try {
        const git = simpleGit(worktreePath);
        const status = await git.status();

        const files: string[] = [];
        const details: ConflictDetails = {
            bothModified: 0,
            bothAdded: 0,
            bothDeleted: 0,
            addedByUs: 0,
            addedByThem: 0,
            deletedByUs: 0,
            deletedByThem: 0,
        };

        // Parse conflicted files
        for (const file of status.conflicted) {
            files.push(file);

            // Get detailed status for each file
            const fileStatus = await git.raw(["status", "--porcelain=v1", "--", file]);
            const statusCode = fileStatus.substring(0, 2);

            switch (statusCode) {
                case "UU":
                    details.bothModified++;
                    break;
                case "AA":
                    details.bothAdded++;
                    break;
                case "DD":
                    details.bothDeleted++;
                    break;
                case "AU":
                    details.addedByUs++;
                    break;
                case "UA":
                    details.addedByThem++;
                    break;
                case "DU":
                    details.deletedByUs++;
                    break;
                case "UD":
                    details.deletedByThem++;
                    break;
                default:
                    // Unknown conflict type, skip
                    break;
            }
        }

        if (files.length === 0) {
            return null;
        }

        return {
            type: "active",
            files,
            count: files.length,
            details,
        };
    } catch {
        // If there's an error (e.g., not a git repo), return null
        return null;
    }
}

import * as fs from "fs";
import * as path from "path";
import simpleGit from "simple-git";

export async function createMergeConflict(
    repoPath: string,
    type: "both-modified" | "both-added" | "mixed",
): Promise<void> {
    const git = simpleGit(repoPath);

    switch (type) {
        default:
        case "both-modified": {
            // Create a file on main branch
            const filePath = path.join(repoPath, "conflict.txt");
            fs.writeFileSync(filePath, "Original content\n");
            await git.add(filePath);
            await git.commit("Add conflict.txt");

            // Create a branch and modify the file
            await git.checkoutLocalBranch("feature");
            fs.writeFileSync(filePath, "Feature branch content\n");
            await git.add(filePath);
            await git.commit("Modify conflict.txt in feature");

            // Go back to main and modify the same file differently
            await git.checkout("main");
            fs.writeFileSync(filePath, "Main branch content\n");
            await git.add(filePath);
            await git.commit("Modify conflict.txt in main");

            // Try to merge - this will create a conflict
            try {
                await git.merge(["feature"]);
            } catch {
                // Expected - merge will fail with conflict
            }
            break;
        }

        case "both-added": {
            // Create a branch
            await git.checkoutLocalBranch("feature");

            // Add a file in feature branch
            const filePath = path.join(repoPath, "both-added.txt");
            fs.writeFileSync(filePath, "Feature content\n");
            await git.add(filePath);
            await git.commit("Add both-added.txt in feature");

            // Go back to main and add the same file with different content
            await git.checkout("main");
            fs.writeFileSync(filePath, "Main content\n");
            await git.add(filePath);
            await git.commit("Add both-added.txt in main");

            // Try to merge - this will create a conflict
            try {
                await git.merge(["feature"]);
            } catch {
                // Expected - merge will fail with conflict
            }
            break;
        }

        case "mixed": {
            // Create multiple files with different conflict types
            await createMergeConflict(repoPath, "both-modified");

            // Add another file that will have a different conflict type
            const deletePath = path.join(repoPath, "delete-conflict.txt");

            // Create and commit file on current branch (main with existing conflict)
            fs.writeFileSync(deletePath, "To be deleted\n");
            await git.add(deletePath);
            await git.commit("Add file to be deleted");

            // Create another branch from main
            await git.checkoutLocalBranch("delete-branch");
            fs.unlinkSync(deletePath);
            await git.add(deletePath);
            await git.commit("Delete file in delete-branch");

            // Go back to main and modify the file
            await git.checkout("main");
            fs.writeFileSync(deletePath, "Modified in main\n");
            await git.add(deletePath);
            await git.commit("Modify file in main");

            // Try to merge - this will add to existing conflicts
            try {
                await git.merge(["delete-branch"]);
            } catch {
                // Expected - merge will fail with conflict
            }
            break;
        }
    }
}

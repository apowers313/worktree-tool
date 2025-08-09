import simpleGit from "simple-git";

export interface GitVersion {
    major: number;
    minor: number;
    patch: number;
}

export async function getGitVersion(): Promise<GitVersion> {
    const git = simpleGit();
    const versionString = await git.raw(["--version"]);
    const versionMatch = /git version (\d+)\.(\d+)\.(\d+)/.exec(versionString);

    if (!versionMatch) {
        throw new Error("Unable to parse git version");
    }

    return {
        major: parseInt(versionMatch[1] ?? "0", 10),
        minor: parseInt(versionMatch[2] ?? "0", 10),
        patch: parseInt(versionMatch[3] ?? "0", 10),
    };
}

export function supportsModernMergeTree(version: GitVersion): boolean {
    return version.major > 2 || (version.major === 2 && version.minor >= 38);
}

import {promises as fs} from "fs";
import * as os from "os";
import * as path from "path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import {findProjectRoot, getProjectRoot} from "../../../src/utils/find-root.js";

describe("findProjectRoot", () => {
    let tempDir: string;
    let originalCwd: string;

    beforeEach(async() => {
        originalCwd = process.cwd();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wtt-find-root-test-"));
    });

    afterEach(async() => {
        process.chdir(originalCwd);
        await fs.rm(tempDir, {recursive: true, force: true});
    });

    it("should find config in current directory", async() => {
        const configPath = path.join(tempDir, ".worktree-config.json");
        await fs.writeFile(configPath, "{}");

        process.chdir(tempDir);
        const root = await findProjectRoot();

        expect(root).toBe(await fs.realpath(tempDir));
    });

    it("should find config in parent directory", async() => {
        const subDir = path.join(tempDir, "sub", "dir");
        await fs.mkdir(subDir, {recursive: true});

        const configPath = path.join(tempDir, ".worktree-config.json");
        await fs.writeFile(configPath, "{}");

        process.chdir(subDir);
        const root = await findProjectRoot();

        expect(root).toBe(await fs.realpath(tempDir));
    });

    it("should return null if no config found", async() => {
        process.chdir(tempDir);
        const root = await findProjectRoot();

        expect(root).toBeNull();
    });

    it("should stop at boundary marker", async() => {
        // Create structure: tempDir/boundary/project/sub
        const boundaryDir = path.join(tempDir, "boundary");
        const projectDir = path.join(boundaryDir, "project");
        const subDir = path.join(projectDir, "sub");

        await fs.mkdir(subDir, {recursive: true});

        // Add config in tempDir (should not be found)
        await fs.writeFile(path.join(tempDir, ".worktree-config.json"), "{}");

        // Add boundary marker
        await fs.writeFile(path.join(boundaryDir, ".wtt-search-boundary"), "");

        // Add config in project dir (should be found)
        await fs.writeFile(path.join(projectDir, ".worktree-config.json"), "{}");

        process.chdir(subDir);
        const root = await findProjectRoot();

        expect(root).toBe(await fs.realpath(projectDir));
    });

    it("should stop searching at boundary marker even without config below", async() => {
        // Create structure: tempDir/boundary/project/sub
        const boundaryDir = path.join(tempDir, "boundary");
        const projectDir = path.join(boundaryDir, "project");
        const subDir = path.join(projectDir, "sub");

        await fs.mkdir(subDir, {recursive: true});

        // Add config in tempDir (should not be found)
        await fs.writeFile(path.join(tempDir, ".worktree-config.json"), "{}");

        // Add boundary marker
        await fs.writeFile(path.join(boundaryDir, ".wtt-search-boundary"), "");

        process.chdir(subDir);
        const root = await findProjectRoot();

        expect(root).toBeNull();
    });
});

describe("getProjectRoot", () => {
    let tempDir: string;
    let originalCwd: string;

    beforeEach(async() => {
        originalCwd = process.cwd();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wtt-get-root-test-"));
    });

    afterEach(async() => {
        process.chdir(originalCwd);
        await fs.rm(tempDir, {recursive: true, force: true});
    });

    it("should return root when config exists", async() => {
        const configPath = path.join(tempDir, ".worktree-config.json");
        await fs.writeFile(configPath, "{}");

        process.chdir(tempDir);
        const root = await getProjectRoot();

        expect(root).toBe(await fs.realpath(tempDir));
    });

    it("should throw when no config found", async() => {
        process.chdir(tempDir);

        await expect(getProjectRoot()).rejects.toThrow("Not in a worktree project");
    });
});

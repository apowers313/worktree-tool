import {execFile} from "child_process";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {closeTmuxWindowsForWorktree, getTmuxWindowsForWorktree} from "../../../src/platform/tmux-cleanup";

// Mock child_process
vi.mock("child_process", () => ({
    execFile: vi.fn(),
}));

describe("Tmux Cleanup", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    describe("getTmuxWindowsForWorktree", () => {
        it("should find matching windows", async() => {
            const mockOutput = "feature-1:@0\nmain:@1\nfeature-1:@2\n";
            vi.mocked(execFile).mockImplementation((cmd, args, cb: any) => {
                cb(null, {stdout: mockOutput, stderr: ""});
            });

            const windows = await getTmuxWindowsForWorktree("project", "feature-1");

            expect(windows).toEqual(["@0", "@2"]);
            expect(execFile).toHaveBeenCalledWith("tmux", [
                "list-windows",
                "-t",
                "project",
                "-F",
                "#{window_name}:#{window_id}",
            ], expect.any(Function));
        });

        it("should return empty array when no matching windows", async() => {
            const mockOutput = "main:@0\nother:@1\n";
            vi.mocked(execFile).mockImplementation((cmd, args, cb: any) => {
                cb(null, {stdout: mockOutput, stderr: ""});
            });

            const windows = await getTmuxWindowsForWorktree("project", "feature-1");

            expect(windows).toEqual([]);
        });

        it("should return empty array when tmux command fails", async() => {
            vi.mocked(execFile).mockImplementation((cmd, args, cb: any) => {
                cb(new Error("no session"), null);
            });

            const windows = await getTmuxWindowsForWorktree("project", "feature-1");

            expect(windows).toEqual([]);
        });

        it("should handle empty output", async() => {
            vi.mocked(execFile).mockImplementation((cmd, args, cb: any) => {
                cb(null, {stdout: "", stderr: ""});
            });

            const windows = await getTmuxWindowsForWorktree("project", "feature-1");

            expect(windows).toEqual([]);
        });

        it("should sanitize session and window names", async() => {
            const mockOutput = "featurebranch:@0\n";
            vi.mocked(execFile).mockImplementation((cmd, args, cb: any) => {
                cb(null, {stdout: mockOutput, stderr: ""});
            });

            const windows = await getTmuxWindowsForWorktree("my-project", "feature/branch");

            expect(windows).toEqual(["@0"]);
            expect(execFile).toHaveBeenCalledWith("tmux", [
                "list-windows",
                "-t",
                "my-project",
                "-F",
                "#{window_name}:#{window_id}",
            ], expect.any(Function));
        });
    });

    describe("closeTmuxWindowsForWorktree", () => {
        it("should close all matching windows", async() => {
            // Mock getTmuxWindowsForWorktree
            const mockOutput = "feature-1:@0\nmain:@1\nfeature-1:@2\n";
            vi.mocked(execFile).mockImplementation((cmd, args, cb: any) => {
                if (args[0] === "list-windows") {
                    cb(null, {stdout: mockOutput, stderr: ""});
                } else {
                    cb(null, {stdout: "", stderr: ""});
                }
            });

            await closeTmuxWindowsForWorktree("project", "feature-1");

            expect(execFile).toHaveBeenCalledWith("tmux", ["kill-window", "-t", "@0"], expect.any(Function));
            expect(execFile).toHaveBeenCalledWith("tmux", ["kill-window", "-t", "@2"], expect.any(Function));
        });

        it("should continue if window kill fails", async() => {
            const mockOutput = "feature-1:@0\nfeature-1:@2\n";
            vi.mocked(execFile).mockImplementation((cmd, args, cb: any) => {
                if (args[0] === "list-windows") {
                    cb(null, {stdout: mockOutput, stderr: ""});
                } else if (args[2] === "@0") {
                    cb(new Error("window not found"), null);
                } else {
                    cb(null, {stdout: "", stderr: ""});
                }
            });

            await closeTmuxWindowsForWorktree("project", "feature-1");

            expect(execFile).toHaveBeenCalledWith("tmux", ["kill-window", "-t", "@0"], expect.any(Function));
            expect(execFile).toHaveBeenCalledWith("tmux", ["kill-window", "-t", "@2"], expect.any(Function));
        });

        it("should handle no windows to close", async() => {
            vi.mocked(execFile).mockImplementation((cmd, args, cb: any) => {
                cb(null, {stdout: "", stderr: ""});
            });

            await closeTmuxWindowsForWorktree("project", "feature-1");

            expect(execFile).toHaveBeenCalledTimes(1); // Only list-windows
        });

        it("should not fail when getting windows throws", async() => {
            vi.mocked(execFile).mockImplementation((cmd, args, cb: any) => {
                cb(new Error("tmux error"), null);
            });

            // Should not throw
            await expect(closeTmuxWindowsForWorktree("project", "feature-1")).resolves.toBeUndefined();

            // Since getTmuxWindowsForWorktree returns empty array on error,
            // no warning is logged at the top level
            expect(execFile).toHaveBeenCalledTimes(1);
        });
    });
});

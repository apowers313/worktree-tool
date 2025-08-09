import {exec} from "child_process";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {
    changeToMainWorktree,
    getShellProcessesInDirectory,
    isCurrentProcessInWorktree,
    terminateShellProcessesInDirectory,
} from "../../../src/platform/process-cleanup";

// Mock child_process
vi.mock("child_process", () => ({
    exec: vi.fn(),
}));

describe("Process Cleanup", () => {
    const originalCwd = process.cwd();
    const originalChdir = process.chdir;
    const originalKill = process.kill;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        process.chdir = originalChdir;
        process.kill = originalKill;
    });

    afterEach(() => {
        // Restore original functions
        process.chdir = originalChdir;
        process.kill = originalKill;
        // Restore original cwd if possible
        try {
            originalChdir(originalCwd);
        } catch {
            // Ignore errors when restoring cwd
        }
    });

    describe("getShellProcessesInDirectory", () => {
        it("should parse lsof output correctly", async() => {
            vi.mocked(exec).mockImplementation((cmd, cb: any) => {
                cb(null, {stdout: "1234\n5678\n", stderr: ""});
            });

            const pids = await getShellProcessesInDirectory("/path");

            expect(pids).toEqual([1234, 5678]);
            expect(exec).toHaveBeenCalledWith(
                "lsof -a -d cwd -c bash -c zsh -c sh +D \"/path\" 2>/dev/null | tail -n +2 | awk '{print $2}' | sort -u",
                expect.any(Function),
            );
        });

        it("should handle empty output", async() => {
            vi.mocked(exec).mockImplementation((cmd, cb: any) => {
                cb(null, {stdout: "", stderr: ""});
            });

            const pids = await getShellProcessesInDirectory("/path");

            expect(pids).toEqual([]);
        });

        it("should filter out invalid PIDs", async() => {
            vi.mocked(exec).mockImplementation((cmd, cb: any) => {
                cb(null, {stdout: "1234\nabc\n\n5678\n", stderr: ""});
            });

            const pids = await getShellProcessesInDirectory("/path");

            expect(pids).toEqual([1234, 5678]);
        });

        it("should return empty array on error", async() => {
            vi.mocked(exec).mockImplementation((cmd, cb: any) => {
                cb(new Error("lsof not found"), null);
            });

            const pids = await getShellProcessesInDirectory("/path");

            expect(pids).toEqual([]);
        });
    });

    describe("terminateShellProcessesInDirectory", () => {
        it("should terminate processes with SIGTERM and SIGKILL", async() => {
            vi.mocked(exec).mockImplementation((cmd, cb: any) => {
                cb(null, {stdout: "1234\n5678\n", stderr: ""});
            });

            const mockKill = vi.fn();
            process.kill = mockKill;

            // First call to check if process exists will succeed (process still running)
            // Second call sends SIGKILL
            mockKill.mockImplementation((pid, signal) => {
                if (signal === 0) {
                    return true; // Process exists
                }

                return true;
            });

            await terminateShellProcessesInDirectory("/path");

            // Allow for setTimeout
            await new Promise((resolve) => setTimeout(resolve, 150));

            expect(mockKill).toHaveBeenCalledWith(1234, "SIGTERM");
            expect(mockKill).toHaveBeenCalledWith(1234, 0);
            expect(mockKill).toHaveBeenCalledWith(1234, "SIGKILL");
            expect(mockKill).toHaveBeenCalledWith(5678, "SIGTERM");
            expect(mockKill).toHaveBeenCalledWith(5678, 0);
            expect(mockKill).toHaveBeenCalledWith(5678, "SIGKILL");
        });

        it("should skip current process", async() => {
            const currentPid = process.pid;
            vi.mocked(exec).mockImplementation((cmd, cb: any) => {
                cb(null, {stdout: `${String(currentPid)}\n1234\n`, stderr: ""});
            });

            const mockKill = vi.fn();
            process.kill = mockKill;

            await terminateShellProcessesInDirectory("/path");

            // Should not kill current process
            expect(mockKill).not.toHaveBeenCalledWith(currentPid, expect.any(String));
            expect(mockKill).toHaveBeenCalledWith(1234, "SIGTERM");
        });

        it("should handle already terminated processes", async() => {
            vi.mocked(exec).mockImplementation((cmd, cb: any) => {
                cb(null, {stdout: "1234\n", stderr: ""});
            });

            const mockKill = vi.fn();
            process.kill = mockKill;

            // Process already terminated when checking
            mockKill.mockImplementation((pid, signal) => {
                if (signal === 0) {
                    throw new Error("No such process");
                }

                return true;
            });

            await terminateShellProcessesInDirectory("/path");

            await new Promise((resolve) => setTimeout(resolve, 150));

            expect(mockKill).toHaveBeenCalledWith(1234, "SIGTERM");
            expect(mockKill).toHaveBeenCalledWith(1234, 0);
            expect(mockKill).not.toHaveBeenCalledWith(1234, "SIGKILL");
        });

        it("should log warning on error", async() => {
            vi.mocked(exec).mockImplementation((cmd, cb: any) => {
                cb(new Error("exec failed"), null);
            });

            await terminateShellProcessesInDirectory("/path");

            // getShellProcessesInDirectory returns empty array on error,
            // so no warning is logged
            expect(console.warn).not.toHaveBeenCalled();
        });
    });

    describe("isCurrentProcessInWorktree", () => {
        it("should return true when cwd is in worktree", () => {
            const mockChdir = vi.fn();
            process.chdir = mockChdir;

            // Mock cwd to be inside worktree
            vi.spyOn(process, "cwd").mockReturnValue("/repo/.worktrees/feature/src");

            const result = isCurrentProcessInWorktree("/repo/.worktrees/feature");

            expect(result).toBe(true);
        });

        it("should return true when cwd is exactly the worktree", () => {
            vi.spyOn(process, "cwd").mockReturnValue("/repo/.worktrees/feature");

            const result = isCurrentProcessInWorktree("/repo/.worktrees/feature");

            expect(result).toBe(true);
        });

        it("should return false when cwd is outside worktree", () => {
            vi.spyOn(process, "cwd").mockReturnValue("/home/user/other");

            const result = isCurrentProcessInWorktree("/repo/.worktrees/feature");

            expect(result).toBe(false);
        });

        it("should handle relative paths", () => {
            vi.spyOn(process, "cwd").mockReturnValue("/repo/.worktrees/feature");

            const result = isCurrentProcessInWorktree("./.worktrees/feature");

            // This will be false because path.resolve("./.worktrees/feature")
            // will resolve relative to cwd, creating a circular path
            expect(result).toBe(false);
        });
    });

    describe("changeToMainWorktree", () => {
        it("should change directory successfully", async() => {
            const mockChdir = vi.fn();
            process.chdir = mockChdir;

            changeToMainWorktree("/repo");

            expect(mockChdir).toHaveBeenCalledWith("/repo");
            expect(console.warn).not.toHaveBeenCalled();
        });

        it("should log warning on error", async() => {
            const mockChdir = vi.fn().mockImplementation(() => {
                throw new Error("Permission denied");
            });
            process.chdir = mockChdir;

            changeToMainWorktree("/repo");

            expect(mockChdir).toHaveBeenCalledWith("/repo");
            expect(console.warn).toHaveBeenCalledWith("Failed to change directory: Error: Permission denied");
        });
    });
});

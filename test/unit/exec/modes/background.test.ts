import {spawn} from "child_process";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {WorktreeConfig} from "../../../../src/core/types";
import {BackgroundMode} from "../../../../src/exec/modes/background";
import {ExecutionContext} from "../../../../src/exec/modes/base";
import * as tmux from "../../../../src/platform/tmux";
import {getLogger} from "../../../../src/utils/logger";

vi.mock("child_process");
vi.mock("../../../../src/platform/tmux");
vi.mock("../../../../src/utils/logger");

describe("BackgroundMode", () => {
    let mockLogger: any;
    let config: WorktreeConfig;
    let mode: BackgroundMode;

    beforeEach(() => {
        vi.clearAllMocks();

        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            success: vi.fn(),
        };
        vi.mocked(getLogger).mockReturnValue(mockLogger);

        config = {
            version: "1.0.0",
            projectName: "test-project",
            mainBranch: "main",
            baseDir: ".worktrees",
            tmux: true,
        };

        mode = new BackgroundMode(config, mockLogger);
    });

    describe("execute", () => {
        it("should create tmux windows without switching when tmux is available", async() => {
            vi.mocked(tmux.isTmuxAvailable).mockResolvedValue(true);
            vi.mocked(tmux.tmuxSessionExists).mockResolvedValue(true);
            vi.mocked(tmux.sanitizeTmuxName).mockImplementation((name) => name);
            vi.mocked(tmux.sanitizeTmuxWindowName).mockImplementation((name) => name);

            const contexts: ExecutionContext[] = [
                {
                    worktreeName: "feature-a",
                    worktreePath: "/project/.worktrees/feature-a",
                    command: "npm",
                    args: ["run", "dev"],
                    env: {},
                },
                {
                    worktreeName: "feature-b",
                    worktreePath: "/project/.worktrees/feature-b",
                    command: "npm",
                    args: ["run", "dev"],
                    env: {},
                },
            ];

            await mode.execute(contexts);

            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledTimes(2);
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledWith(
                "test-project",
                "feature-a::bg",
                "/project/.worktrees/feature-a",
                expect.stringContaining("npm run dev"),
            );
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledWith(
                "test-project",
                "feature-b::bg",
                "/project/.worktrees/feature-b",
                expect.stringContaining("npm run dev"),
            );
            expect(mockLogger.info).toHaveBeenCalledWith("Starting 2 background process(es)...");
            expect(mockLogger.info).toHaveBeenCalledWith("All background processes started. They will continue running in the background.");
        });

        it("should spawn detached processes when tmux is not available", async() => {
            vi.mocked(tmux.isTmuxAvailable).mockResolvedValue(false);
            const mockProc = {
                unref: vi.fn(),
            };
            vi.mocked(spawn).mockReturnValue(mockProc as any);

            const contexts: ExecutionContext[] = [
                {
                    worktreeName: "feature",
                    worktreePath: "/project/.worktrees/feature",
                    command: "npm",
                    args: ["run", "dev"],
                    env: {},
                },
            ];

            await mode.execute(contexts);

            expect(spawn).toHaveBeenCalledWith(
                "npm run dev",
                [],
                expect.objectContaining({
                    cwd: "/project/.worktrees/feature",
                    detached: true,
                    stdio: "ignore",
                    shell: true,
                }),
            );
            expect(mockProc.unref).toHaveBeenCalled();
        });

        it("should create session if it doesn't exist", async() => {
            vi.mocked(tmux.isTmuxAvailable).mockResolvedValue(true);
            vi.mocked(tmux.tmuxSessionExists).mockResolvedValue(false);
            vi.mocked(tmux.sanitizeTmuxName).mockImplementation((name) => name);
            vi.mocked(tmux.sanitizeTmuxWindowName).mockImplementation((name) => name);

            const contexts: ExecutionContext[] = [
                {
                    worktreeName: "feature",
                    worktreePath: "/project/.worktrees/feature",
                    command: "npm",
                    args: ["start"],
                    env: {},
                },
            ];

            await mode.execute(contexts);

            expect(tmux.createTmuxSessionWithWindow).toHaveBeenCalledWith(
                "test-project",
                "feature::bg",
                "/project/.worktrees/feature",
                expect.stringContaining("npm start"),
            );
            expect(tmux.createTmuxWindowWithCommand).not.toHaveBeenCalled();
        });

        it("should handle failures gracefully", async() => {
            vi.mocked(tmux.isTmuxAvailable).mockResolvedValue(true);
            vi.mocked(tmux.tmuxSessionExists).mockResolvedValue(true);
            vi.mocked(tmux.sanitizeTmuxName).mockImplementation((name) => name);
            vi.mocked(tmux.sanitizeTmuxWindowName).mockImplementation((name) => name);
            vi.mocked(tmux.createTmuxWindowWithCommand).mockRejectedValueOnce(new Error("Tmux error"));

            const contexts: ExecutionContext[] = [
                {
                    worktreeName: "feature",
                    worktreePath: "/project/.worktrees/feature",
                    command: "npm",
                    args: ["test"],
                    env: {},
                },
            ];

            await expect(mode.execute(contexts)).rejects.toThrow("1 background process(es) failed to start");
            expect(mockLogger.error).toHaveBeenCalledWith("Failed to start background process in feature: Tmux error");
        });
    });
});

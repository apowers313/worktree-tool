import {execSync} from "child_process";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {WorktreeConfig} from "../../../../src/core/types";
import {ExecutionContext} from "../../../../src/exec/modes/base";
import {ExitMode} from "../../../../src/exec/modes/exit";
import * as tmux from "../../../../src/platform/tmux";
import {getLogger} from "../../../../src/utils/logger";

vi.mock("child_process");
vi.mock("../../../../src/platform/tmux");
vi.mock("../../../../src/utils/logger");

describe("ExitMode", () => {
    let mockLogger: any;
    let config: WorktreeConfig;
    let mode: ExitMode;

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

        mode = new ExitMode(config, mockLogger);
    });

    describe("execute", () => {
        it("should create tmux windows that exit after completion", async() => {
            vi.mocked(tmux.isTmuxAvailable).mockResolvedValue(true);
            vi.mocked(tmux.tmuxSessionExists).mockResolvedValue(true);
            vi.mocked(tmux.sanitizeTmuxName).mockImplementation((name) => name);
            vi.mocked(tmux.sanitizeTmuxWindowName).mockImplementation((name) => name);

            const contexts: ExecutionContext[] = [
                {
                    worktreeName: "feature-a",
                    worktreePath: "/project/.worktrees/feature-a",
                    command: "echo",
                    args: ["Hello"],
                    env: {},
                },
                {
                    worktreeName: "feature-b",
                    worktreePath: "/project/.worktrees/feature-b",
                    command: "echo",
                    args: ["World"],
                    env: {},
                },
            ];

            await mode.execute(contexts);

            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledTimes(2);
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledWith(
                "test-project",
                "feature-a::tmp",
                "/project/.worktrees/feature-a",
                expect.stringContaining("echo Hello"),
            );
            expect(tmux.createTmuxWindowWithCommand).toHaveBeenCalledWith(
                "test-project",
                "feature-b::tmp",
                "/project/.worktrees/feature-b",
                expect.stringContaining("echo World"),
            );
            // Verify exit command is included
            const {calls} = vi.mocked(tmux.createTmuxWindowWithCommand).mock;
            expect(calls[0]?.[3]).toContain("exit");
            expect(calls[1]?.[3]).toContain("exit");
        });

        it("should run commands synchronously when tmux is not available", async() => {
            vi.mocked(tmux.isTmuxAvailable).mockResolvedValue(false);
            vi.mocked(execSync).mockImplementation(() => Buffer.from(""));

            const contexts: ExecutionContext[] = [
                {
                    worktreeName: "feature",
                    worktreePath: "/project/.worktrees/feature",
                    command: "echo",
                    args: ["test"],
                    env: {},
                },
            ];

            await mode.execute(contexts);

            expect(execSync).toHaveBeenCalledWith(
                "echo test",
                expect.objectContaining({
                    cwd: "/project/.worktrees/feature",
                    stdio: "inherit",
                }),
            );
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
                    args: ["test"],
                    env: {},
                },
            ];

            await mode.execute(contexts);

            expect(tmux.createTmuxSessionWithWindow).toHaveBeenCalledWith(
                "test-project",
                "feature::tmp",
                "/project/.worktrees/feature",
                expect.stringContaining("npm test"),
            );
            expect(tmux.createTmuxWindowWithCommand).not.toHaveBeenCalled();
        });

        it("should handle command failures gracefully", async() => {
            vi.mocked(tmux.isTmuxAvailable).mockResolvedValue(false);
            vi.mocked(execSync).mockImplementation(() => {
                throw new Error("Command failed");
            });

            const contexts: ExecutionContext[] = [
                {
                    worktreeName: "feature",
                    worktreePath: "/project/.worktrees/feature",
                    command: "false",
                    args: [],
                    env: {},
                },
            ];

            await expect(mode.execute(contexts)).rejects.toThrow("1 command(s) failed");
            expect(mockLogger.error).toHaveBeenCalledWith("Failed in feature: Command failed with exit code");
        });

        it("should handle tmux failures gracefully", async() => {
            vi.mocked(tmux.isTmuxAvailable).mockResolvedValue(true);
            vi.mocked(tmux.tmuxSessionExists).mockResolvedValue(true);
            vi.mocked(tmux.sanitizeTmuxName).mockImplementation((name) => name);
            vi.mocked(tmux.sanitizeTmuxWindowName).mockImplementation((name) => name);
            vi.mocked(tmux.createTmuxWindowWithCommand).mockRejectedValueOnce(new Error("Tmux error"));

            const contexts: ExecutionContext[] = [
                {
                    worktreeName: "feature",
                    worktreePath: "/project/.worktrees/feature",
                    command: "echo",
                    args: ["test"],
                    env: {},
                },
            ];

            await expect(mode.execute(contexts)).rejects.toThrow("1 command(s) failed");
            expect(mockLogger.error).toHaveBeenCalledWith("Failed in feature: Tmux error");
        });
    });
});

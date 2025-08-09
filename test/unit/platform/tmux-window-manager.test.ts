import {describe, expect, it, vi} from "vitest";

import {TmuxWindowManager} from "../../../src/platform/tmux-window-manager.js";
import * as tmuxWrapper from "../../../src/platform/tmux-wrapper.js";

vi.mock("../../../src/platform/tmux-wrapper.js");

describe("TmuxWindowManager", () => {
    const manager = new TmuxWindowManager();

    describe("getWindowList", () => {
        it("should parse window list correctly", async() => {
            vi.mocked(tmuxWrapper.executeTmuxCommand).mockResolvedValue(
                "0:window1:1\n1:window2:0\n2:window3:0",
            );

            const windows = await manager.getWindowList("test-session");

            expect(windows).toEqual([
                {index: 0, name: "window1", active: true},
                {index: 1, name: "window2", active: false},
                {index: 2, name: "window3", active: false},
            ]);
        });

        it("should return empty array on error", async() => {
            vi.mocked(tmuxWrapper.executeTmuxCommand).mockRejectedValue(new Error("tmux error"));

            const windows = await manager.getWindowList("test-session");

            expect(windows).toEqual([]);
        });

        it("should handle empty output", async() => {
            vi.mocked(tmuxWrapper.executeTmuxCommand).mockResolvedValue("");

            const windows = await manager.getWindowList("test-session");

            expect(windows).toEqual([]);
        });

        it("should handle malformed lines", async() => {
            vi.mocked(tmuxWrapper.executeTmuxCommand).mockResolvedValue(
                "0:window1:1\nmalformed\n2::0",
            );

            const windows = await manager.getWindowList("test-session");

            expect(windows).toEqual([
                {index: 0, name: "window1", active: true},
                {index: 0, name: "", active: false}, // malformed line
                {index: 2, name: "", active: false}, // empty name
            ]);
        });
    });

    describe("sortWindowsAlphabetically", () => {
        it("should sort windows alphabetically", async() => {
            vi.mocked(tmuxWrapper.executeTmuxCommand).mockResolvedValue(
                "0:c-window:0\n1:a-window:0\n2:b-window:0",
            );

            await manager.sortWindowsAlphabetically("test-session");

            // Should move windows to temp positions first
            expect(vi.mocked(tmuxWrapper.executeTmuxCommandVoid)).toHaveBeenCalledWith(
                ["move-window", "-s", "test-session:0", "-t", "test-session:1000"],
                expect.any(String),
            );
            expect(vi.mocked(tmuxWrapper.executeTmuxCommandVoid)).toHaveBeenCalledWith(
                ["move-window", "-s", "test-session:1", "-t", "test-session:1001"],
                expect.any(String),
            );
            expect(vi.mocked(tmuxWrapper.executeTmuxCommandVoid)).toHaveBeenCalledWith(
                ["move-window", "-s", "test-session:2", "-t", "test-session:1002"],
                expect.any(String),
            );

            // Then move to final positions
            expect(vi.mocked(tmuxWrapper.executeTmuxCommandVoid)).toHaveBeenCalledWith(
                ["move-window", "-s", "test-session:1001", "-t", "test-session:0"],
                expect.any(String),
            );
            expect(vi.mocked(tmuxWrapper.executeTmuxCommandVoid)).toHaveBeenCalledWith(
                ["move-window", "-s", "test-session:1002", "-t", "test-session:1"],
                expect.any(String),
            );
            expect(vi.mocked(tmuxWrapper.executeTmuxCommandVoid)).toHaveBeenCalledWith(
                ["move-window", "-s", "test-session:1000", "-t", "test-session:2"],
                expect.any(String),
            );
        });

        it("should skip sorting if already sorted", async() => {
            vi.mocked(tmuxWrapper.executeTmuxCommand).mockResolvedValue(
                "0:a-window:0\n1:b-window:0\n2:c-window:0",
            );
            vi.mocked(tmuxWrapper.executeTmuxCommandVoid).mockClear();

            await manager.sortWindowsAlphabetically("test-session");

            expect(vi.mocked(tmuxWrapper.executeTmuxCommandVoid)).not.toHaveBeenCalled();
        });
    });

    describe("isCommandRunning", () => {
        it("should return true if window exists", async() => {
            vi.mocked(tmuxWrapper.executeTmuxCommand).mockResolvedValue(
                "0:window1:0\n1:target-window:0\n2:window3:0",
            );

            const result = await manager.isCommandRunning("test-session", "target-window");

            expect(result).toBe(true);
        });

        it("should return false if window does not exist", async() => {
            vi.mocked(tmuxWrapper.executeTmuxCommand).mockResolvedValue(
                "0:window1:0\n1:window2:0\n2:window3:0",
            );

            const result = await manager.isCommandRunning("test-session", "non-existent");

            expect(result).toBe(false);
        });

        it("should return false on error", async() => {
            vi.mocked(tmuxWrapper.executeTmuxCommand).mockRejectedValue(new Error("tmux error"));

            const result = await manager.isCommandRunning("test-session", "any-window");

            expect(result).toBe(false);
        });
    });
});

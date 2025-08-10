import {beforeEach, describe, expect, it, vi} from "vitest";

import {WorktreeConfig} from "../../../src/core/types";
import {parseExecCommand} from "../../../src/exec/parser";
import * as detector from "../../../src/platform/detector";
import {WorktreeToolError} from "../../../src/utils/errors";

vi.mock("../../../src/platform/detector");

describe("parseExecCommand", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Mock isCI to always return false in tests
        vi.mocked(detector.isCI).mockReturnValue(false);
    });

    describe("predefined commands", () => {
        it("parses predefined string command", () => {
            const config: Partial<WorktreeConfig> = {
                commands: {build: "npm run build"},
            };
            const result = parseExecCommand(["build"], config as WorktreeConfig, {});

            expect(result).toEqual({
                type: "predefined",
                command: "npm run build",
                args: [],
                mode: "window",
                commandName: "build",
            });
        });

        it("parses predefined string command with arguments", () => {
            const config: Partial<WorktreeConfig> = {
                commands: {test: "npm test"},
            };
            const result = parseExecCommand(["test", "--watch", "--coverage"], config as WorktreeConfig, {});

            expect(result).toEqual({
                type: "predefined",
                command: "npm test",
                args: ["--watch", "--coverage"],
                mode: "window",
                commandName: "test",
            });
        });

        it("parses predefined object command with mode", () => {
            const config: Partial<WorktreeConfig> = {
                commands: {
                    test: {command: "npm test", mode: "exit"},
                },
            };
            const result = parseExecCommand(["test"], config as WorktreeConfig, {});

            expect(result).toEqual({
                type: "predefined",
                command: "npm test",
                args: [],
                mode: "exit",
                commandName: "test",
            });
        });

        it("parses predefined object command without mode", () => {
            const config: Partial<WorktreeConfig> = {
                commands: {
                    build: {command: "npm run build"},
                },
            };
            const result = parseExecCommand(["build"], config as WorktreeConfig, {});

            expect(result).toEqual({
                type: "predefined",
                command: "npm run build",
                args: [],
                mode: "window",
                commandName: "build",
            });
        });

        it("CLI option overrides config mode", () => {
            const config: Partial<WorktreeConfig> = {
                commands: {
                    test: {command: "npm test", mode: "exit"},
                },
            };
            const result = parseExecCommand(["test"], config as WorktreeConfig, {mode: "inline"});

            expect(result.mode).toBe("inline");
        });

        it("throws when command not found", () => {
            const config: Partial<WorktreeConfig> = {
                commands: {
                    build: "npm run build",
                    test: "npm test",
                },
            };

            expect(() => parseExecCommand(["nonexistent"], config as WorktreeConfig, {}))
                .toThrow(WorktreeToolError);
            expect(() => parseExecCommand(["nonexistent"], config as WorktreeConfig, {}))
                .toThrow("Command \"nonexistent\" not found");
        });

        it("throws when no commands configured", () => {
            const config: Partial<WorktreeConfig> = {
                commands: {},
            };

            expect(() => parseExecCommand(["test"], config as WorktreeConfig, {}))
                .toThrow(WorktreeToolError);
            expect(() => parseExecCommand(["test"], config as WorktreeConfig, {}))
                .toThrow("No commands configured");
        });

        it("throws when no command specified", () => {
            const config: Partial<WorktreeConfig> = {
                commands: {test: "npm test"},
            };

            expect(() => parseExecCommand([], config as WorktreeConfig, {}))
                .toThrow(WorktreeToolError);
            expect(() => parseExecCommand([], config as WorktreeConfig, {}))
                .toThrow("No command specified");
        });
    });

    describe("inline commands", () => {
        it("parses inline command", () => {
            const result = parseExecCommand(["--", "npm", "install"], {} as WorktreeConfig, {});

            expect(result).toEqual({
                type: "inline",
                command: "npm",
                args: ["install"],
                mode: "window",
            });
        });

        it("parses inline command with multiple arguments", () => {
            const result = parseExecCommand(["--", "git", "commit", "-m", "test message"], {} as WorktreeConfig, {});

            expect(result).toEqual({
                type: "inline",
                command: "git",
                args: ["commit", "-m", "test message"],
                mode: "window",
            });
        });

        it("parses inline command with mode option", () => {
            const result = parseExecCommand(["--", "echo", "hello"], {} as WorktreeConfig, {mode: "inline"});

            expect(result).toEqual({
                type: "inline",
                command: "echo",
                args: ["hello"],
                mode: "inline",
            });
        });

        it("throws when no command after separator", () => {
            expect(() => parseExecCommand(["--"], {} as WorktreeConfig, {}))
                .toThrow(WorktreeToolError);
            expect(() => parseExecCommand(["--"], {} as WorktreeConfig, {}))
                .toThrow("No command specified after --");
        });

        it("handles -- in the middle of args correctly", () => {
            const config: Partial<WorktreeConfig> = {
                commands: {test: "npm test"},
            };

            // This should parse as inline command, not predefined
            const result = parseExecCommand(["test", "--", "extra", "args"], config as WorktreeConfig, {});

            expect(result).toEqual({
                type: "inline",
                command: "extra",
                args: ["args"],
                mode: "window",
            });
        });
    });

    describe("mode handling", () => {
        it("defaults to window mode when not specified", () => {
            const config: Partial<WorktreeConfig> = {
                commands: {test: "npm test"},
            };

            const result1 = parseExecCommand(["test"], config as WorktreeConfig, {});
            expect(result1.mode).toBe("window");

            const result2 = parseExecCommand(["--", "echo", "test"], {} as WorktreeConfig, {});
            expect(result2.mode).toBe("window");
        });

        it("respects mode precedence: CLI > config > default", () => {
            const config: Partial<WorktreeConfig> = {
                commands: {
                    test1: {command: "npm test", mode: "exit"},
                    test2: {command: "npm test", mode: "background"},
                },
            };

            // CLI overrides config
            const result1 = parseExecCommand(["test1"], config as WorktreeConfig, {mode: "inline"});
            expect(result1.mode).toBe("inline");

            // Config mode used when no CLI option
            const result2 = parseExecCommand(["test2"], config as WorktreeConfig, {});
            expect(result2.mode).toBe("background");

            // Default when neither specified
            const result3 = parseExecCommand(["--", "echo"], {} as WorktreeConfig, {});
            expect(result3.mode).toBe("window");
        });
    });
});

import {describe, expect, it} from "vitest";

import {WorktreeConfig} from "../../../../src/core/types";
import {BackgroundMode} from "../../../../src/exec/modes/background";
import {ExitMode} from "../../../../src/exec/modes/exit";
import {createExecutionMode} from "../../../../src/exec/modes/factory";
import {InlineMode} from "../../../../src/exec/modes/inline";
import {WindowMode} from "../../../../src/exec/modes/window";
import {WorktreeToolError} from "../../../../src/utils/errors";
import {getLogger} from "../../../../src/utils/logger";

describe("createExecutionMode", () => {
    const config: WorktreeConfig = {
        version: "1.0.0",
        projectName: "test-project",
        mainBranch: "main",
        baseDir: ".worktrees",
        tmux: true,
    };

    const logger = getLogger({});

    it("should create WindowMode for window mode", () => {
        const mode = createExecutionMode("window", config, logger);
        expect(mode).toBeInstanceOf(WindowMode);
    });

    it("should create InlineMode for inline mode", () => {
        const mode = createExecutionMode("inline", config, logger);
        expect(mode).toBeInstanceOf(InlineMode);
    });

    it("should create BackgroundMode for background mode", () => {
        const mode = createExecutionMode("background", config, logger);
        expect(mode).toBeInstanceOf(BackgroundMode);
    });

    it("should create ExitMode for exit mode", () => {
        const mode = createExecutionMode("exit", config, logger);
        expect(mode).toBeInstanceOf(ExitMode);
    });

    it("should throw error for invalid mode", () => {
        expect(() => createExecutionMode("invalid" as any, config, logger))
            .toThrow(WorktreeToolError);
        expect(() => createExecutionMode("invalid" as any, config, logger))
            .toThrow("Unknown execution mode: invalid");
    });
});

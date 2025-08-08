import {WorktreeConfig} from "../../core/types.js";
import {WorktreeToolError} from "../../utils/errors.js";
import {getLogger} from "../../utils/logger.js";
import {BackgroundMode} from "./background.js";
import {ExecutionMode} from "./base.js";
import {ExitMode} from "./exit.js";
import {InlineMode} from "./inline.js";
import {WindowMode} from "./window.js";

export function createExecutionMode(
    mode: "window" | "inline" | "background" | "exit",
    config: WorktreeConfig,
    logger: ReturnType<typeof getLogger>,
): ExecutionMode {
    switch (mode) {
        case "window":
            return new WindowMode(config, logger);
        case "inline":
            return new InlineMode(logger);
        case "background":
            return new BackgroundMode(config, logger);
        case "exit":
            return new ExitMode(config, logger);
        default:
            throw new WorktreeToolError(
                `Unknown execution mode: ${mode as string}`,
                "Valid modes are: window, inline, background, exit",
            );
    }
}

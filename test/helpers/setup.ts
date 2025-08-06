import {afterEach, beforeEach, vi} from "vitest";

import * as config from "../../src/core/config";
import * as git from "../../src/core/git";
import {WorktreeConfig} from "../../src/core/types";
import * as logger from "../../src/utils/logger";
import {createMockGit, createMockLogger, mockProcessExit} from "./mocks";

export interface CommandTestMocks {
    logger: ReturnType<typeof createMockLogger>;
    git: ReturnType<typeof createMockGit>;
    exitSpy: ReturnType<typeof mockProcessExit>;
    config: {
        loadConfig: typeof vi.fn;
        configExists: typeof vi.fn;
        saveConfig: typeof vi.fn;
        updateGitignore: typeof vi.fn;
        getDefaultConfig: typeof vi.fn;
    };
}

export function setupCommandTest(): CommandTestMocks {
    const mocks: CommandTestMocks = {
        logger: createMockLogger(),
        git: createMockGit(),
        exitSpy: mockProcessExit(),
        config: {
            loadConfig: vi.fn(),
            configExists: vi.fn(),
            saveConfig: vi.fn(),
            updateGitignore: vi.fn(),
            getDefaultConfig: vi.fn(),
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(logger.getLogger).mockReturnValue(mocks.logger);
        vi.mocked(git.createGit).mockReturnValue(mocks.git);
        vi.mocked(config.loadConfig).mockImplementation(mocks.config.loadConfig);
        vi.mocked(config.configExists).mockImplementation(mocks.config.configExists);
        vi.mocked(config.saveConfig).mockImplementation(mocks.config.saveConfig);
        vi.mocked(config.updateGitignore).mockImplementation(mocks.config.updateGitignore);
        vi.mocked(config.getDefaultConfig).mockImplementation(mocks.config.getDefaultConfig);
    });

    afterEach(() => {
        mocks.exitSpy.mockRestore();
    });

    return mocks;
}

export function createTestConfig(overrides?: Partial<WorktreeConfig>): WorktreeConfig {
    return {
        version: "1.0.0",
        projectName: "test-project",
        mainBranch: "main",
        baseDir: ".worktrees",
        tmux: false,
        commands: {},
        ... overrides,
    };
}

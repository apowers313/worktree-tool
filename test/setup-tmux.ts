import {vi} from "vitest";

// Test setup file for tmux tests
// This file runs before tmux integration tests

// Enable tmux for these tests
process.env.WTT_TEST_TMUX = "true";
delete process.env.WTT_DISABLE_TMUX;

// Ensure tests run in isolation
beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
});

// Suppress console output during tests unless explicitly needed
const originalConsole = {... console};

beforeAll(() => {
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
    console.info = vi.fn();
});

afterAll(() => {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
});

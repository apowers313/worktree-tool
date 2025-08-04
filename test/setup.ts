// Test setup file for Vitest
// This file runs before each test suite

import {vi} from "vitest";

// Disable tmux during all tests to prevent session leaks
process.env.WTT_DISABLE_TMUX = "true";

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

// Export test console for tests that need to verify console output
export const testConsole = {
    getLogCalls: () => (console.log as any).mock.calls,
    getErrorCalls: () => (console.error as any).mock.calls,
    getWarnCalls: () => (console.warn as any).mock.calls,
    getInfoCalls: () => (console.info as any).mock.calls,
};

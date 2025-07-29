// Test setup file for Jest
// This file runs before each test suite

// Ensure tests run in isolation
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

// Suppress console output during tests unless explicitly needed
const originalConsole = { ...console };

beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
});

afterAll(() => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
});

// Export test console for tests that need to verify console output
export const testConsole = {
  getLogCalls: () => (console.log as jest.Mock).mock.calls,
  getErrorCalls: () => (console.error as jest.Mock).mock.calls,
  getWarnCalls: () => (console.warn as jest.Mock).mock.calls,
  getInfoCalls: () => (console.info as jest.Mock).mock.calls,
};
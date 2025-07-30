// Test setup file for tmux tests
// This file runs before tmux integration tests

// Enable tmux for these tests
process.env['WTT_TEST_TMUX'] = 'true';
delete process.env['WTT_DISABLE_TMUX'];

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
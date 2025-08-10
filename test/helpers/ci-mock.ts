import {vi} from "vitest";

import * as detector from "../../src/platform/detector";

/**
 * Mock CI detection for tests
 *
 * By default, unit tests should run with isCI() returning false
 * to ensure consistent behavior regardless of the test environment.
 *
 * This prevents CI-specific behavior (like defaulting to exit mode)
 * from affecting test expectations.
 */
export function mockCIDetection(isCI = false): void {
    vi.mocked(detector.isCI).mockReturnValue(isCI);
}

/**
 * Setup standard test environment mocks
 *
 * Call this in beforeEach() to ensure consistent test behavior
 */
export function setupTestEnvironment(): void {
    // Always mock isCI to false for unit tests
    mockCIDetection(false);
}

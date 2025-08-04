import {Command} from "commander";
import {vi} from "vitest";

import {createProgram} from "../../../src/cli/program";

// Mock fs module
vi.mock("fs", () => ({
    readFileSync: vi.fn(() => JSON.stringify({
        name: "worktree-tool",
        version: "0.1.0",
        description: "Test package",
    })),
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        verbose: vi.fn(),
    })),
}));

describe("CLI Program", () => {
    let program: Command;

    beforeEach(() => {
        program = createProgram();
    });

    describe("Program Configuration", () => {
        it("should have correct name", () => {
            expect(program.name()).toBe("wtt");
        });

        it("should have description", () => {
            expect(program.description()).toContain("Git worktree management tool");
        });

        it("should have version from package.json", () => {
            expect(program.version()).toBe("0.1.0");
        });

        it("should have verbose option", () => {
            const verboseOption = program.options.find((opt) => opt.flags === "-v, --verbose");
            expect(verboseOption).toBeDefined();
            expect(verboseOption?.description).toContain("verbose");
        });

        it("should have quiet option", () => {
            const quietOption = program.options.find((opt) => opt.flags === "-q, --quiet");
            expect(quietOption).toBeDefined();
            expect(quietOption?.description).toContain("suppress output");
        });
    });

    describe("Help Output", () => {
        it("should show wtt as command name in help", () => {
            const helpInfo = program.helpInformation();
            expect(helpInfo).toContain("wtt");
        });

        it("should include global options in help", () => {
            const helpInfo = program.helpInformation();
            expect(helpInfo).toContain("--verbose");
            expect(helpInfo).toContain("--quiet");
        });
    });

    describe("Version Output", () => {
        it("should output version", () => {
            // Capture output
            const output: string[] = [];
            const originalWrite = process.stdout.write;
            process.stdout.write = vi.fn((str: string) => {
                output.push(str);
                return true;
            }) as any;

            try {
                program.exitOverride(); // Prevent process.exit
                program.parse(["node", "wtt", "--version"]);
            } catch {
                // Commander throws for --version, which is expected
            }

            process.stdout.write = originalWrite;

            expect(output.join("")).toContain("0.1.0");
        });
    });

    describe("Program Execution", () => {
        it("should parse arguments without errors", () => {
            // Create a fresh program instance for this test
            const testProgram = createProgram();
            testProgram.exitOverride(); // Prevent process.exit

            // Parsing with no arguments should not throw
            expect(() => {
                testProgram.parse(["node", "wtt"]);
            }).not.toThrow();

            // The program should be properly configured
            expect(testProgram.name()).toBe("wtt");
        });
    });
});

import chalk from "chalk";

import {getLogger, Logger} from "../../../src/utils/logger";

// Force chalk to use colors in tests
chalk.level = 1;

describe("Logger", () => {
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let stdoutWriteSpy: jest.SpyInstance;

    beforeEach(() => {
        consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
        consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
        consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
        stdoutWriteSpy = jest.spyOn(process.stdout, "write").mockImplementation(() => true);

        // Clear singleton instance
        (global as any).loggerInstance = undefined;
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        stdoutWriteSpy.mockRestore();
    });

    describe("Log Levels", () => {
        it("should default to normal level", () => {
            const logger = new Logger();
            expect(logger.getLevel()).toBe("normal");
        });

        it("should set quiet level when quiet option is true", () => {
            const logger = new Logger({quiet: true});
            expect(logger.getLevel()).toBe("quiet");
        });

        it("should set verbose level when verbose option is true", () => {
            const logger = new Logger({verbose: true});
            expect(logger.getLevel()).toBe("verbose");
        });

        it("should prefer quiet over verbose if both are set", () => {
            const logger = new Logger({quiet: true, verbose: true});
            expect(logger.getLevel()).toBe("quiet");
        });
    });

    describe("Error Messages", () => {
        it("should always show error messages", () => {
            const logger = new Logger({quiet: true});
            logger.error("Test error");

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining("✗ Test error"),
            );
        });

        it("should show error messages with red color", () => {
            const logger = new Logger();
            logger.error("Test error");

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                chalk.red("✗ Test error"),
            );
        });
    });

    describe("Success Messages", () => {
        it("should show success messages in normal mode", () => {
            const logger = new Logger();
            logger.success("Test success");

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("✓ Test success"),
            );
        });

        it("should show success messages in verbose mode", () => {
            const logger = new Logger({verbose: true});
            logger.success("Test success");

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("✓ Test success"),
            );
        });

        it("should not show success messages in quiet mode", () => {
            const logger = new Logger({quiet: true});
            logger.success("Test success");

            expect(consoleLogSpy).not.toHaveBeenCalled();
        });
    });

    describe("Info Messages", () => {
        it("should show info messages in normal mode", () => {
            const logger = new Logger();
            logger.info("Test info");

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("ℹ Test info"),
            );
        });

        it("should not show info messages in quiet mode", () => {
            const logger = new Logger({quiet: true});
            logger.info("Test info");

            expect(consoleLogSpy).not.toHaveBeenCalled();
        });
    });

    describe("Warning Messages", () => {
        it("should show warning messages in normal mode", () => {
            const logger = new Logger();
            logger.warn("Test warning");

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining("⚠ Test warning"),
            );
        });

        it("should not show warning messages in quiet mode", () => {
            const logger = new Logger({quiet: true});
            logger.warn("Test warning");

            expect(consoleWarnSpy).not.toHaveBeenCalled();
        });
    });

    describe("Verbose Messages", () => {
        it("should not show verbose messages in normal mode", () => {
            const logger = new Logger();
            logger.verbose("Test verbose");

            expect(consoleLogSpy).not.toHaveBeenCalled();
        });

        it("should show verbose messages in verbose mode", () => {
            const logger = new Logger({verbose: true});
            logger.verbose("Test verbose");

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("• Test verbose"),
            );
        });

        it("should not show verbose messages in quiet mode", () => {
            const logger = new Logger({quiet: true});
            logger.verbose("Test verbose");

            expect(consoleLogSpy).not.toHaveBeenCalled();
        });
    });

    describe("Plain Log Messages", () => {
        it("should show log messages in normal mode", () => {
            const logger = new Logger();
            logger.log("Test log");

            expect(consoleLogSpy).toHaveBeenCalledWith("Test log");
        });

        it("should not show log messages in quiet mode", () => {
            const logger = new Logger({quiet: true});
            logger.log("Test log");

            expect(consoleLogSpy).not.toHaveBeenCalled();
        });
    });

    describe("Progress Indicator", () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it("should show progress indicator in normal mode", () => {
            const logger = new Logger();
            const stop = logger.progress("Testing progress");

            jest.advanceTimersByTime(80);

            expect(stdoutWriteSpy).toHaveBeenCalledWith(
                expect.stringContaining("Testing progress"),
            );

            stop();
        });

        it("should not show progress indicator in quiet mode", () => {
            const logger = new Logger({quiet: true});
            const stop = logger.progress("Testing progress");

            jest.advanceTimersByTime(80);

            expect(stdoutWriteSpy).not.toHaveBeenCalled();

            stop();
        });

        it("should clear progress indicator when stopped", () => {
            const logger = new Logger();
            const stop = logger.progress("Testing");

            stop();

            // Should write spaces to clear the line
            expect(stdoutWriteSpy).toHaveBeenCalledWith(
                expect.stringMatching(/\r +\r/),
            );
        });
    });

    describe("Singleton Instance", () => {
        it("should return the same instance when called multiple times", () => {
            const logger1 = getLogger();
            const logger2 = getLogger();

            expect(logger1).toBe(logger2);
        });

        it("should create new instance when options are provided", () => {
            const logger1 = getLogger();
            const logger2 = getLogger({verbose: true});

            expect(logger1).not.toBe(logger2);
            expect(logger2.getLevel()).toBe("verbose");
        });
    });
});

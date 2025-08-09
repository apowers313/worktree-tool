import net from "net";
import {describe, expect, it} from "vitest";

import {portManager} from "../../../src/utils/port-manager.js";

describe("PortManager", () => {
    describe("parseRange", () => {
        it("should parse valid range", () => {
            const range = portManager.parseRange("9000-9099");
            expect(range).toEqual({start: 9000, end: 9099});
        });

        it("should throw on invalid range", () => {
            expect(() => portManager.parseRange("invalid")).toThrow("Invalid port range format");
        });

        it("should throw on missing dash", () => {
            expect(() => portManager.parseRange("90009099")).toThrow("Invalid port range format");
        });

        it("should throw on non-numeric values", () => {
            expect(() => portManager.parseRange("abc-def")).toThrow("Invalid port range format");
        });
    });

    describe("isPortAvailable", () => {
        it("should detect available port", async() => {
            // Port 0 lets the OS assign an available port
            const available = await portManager.isPortAvailable(0);
            expect(available).toBe(true);
        });

        it("should handle port check correctly", async() => {
            // Create a server to occupy a port
            const server = await new Promise<net.Server>((resolve) => {
                const s = net.createServer();
                s.listen(0, () => {
                    resolve(s);
                });
            });

            const address = server.address();
            const port = typeof address === "object" && address !== null ? address.port : 0;

            // Port should be unavailable
            const available = await portManager.isPortAvailable(port);
            expect(available).toBe(false);

            // Clean up
            await new Promise((resolve) => server.close(resolve));
        });
    });

    describe("findAvailablePorts", () => {
        it("should find requested number of ports", async() => {
            const ports = await portManager.findAvailablePorts(50000, 50010, 3);
            expect(ports).toHaveLength(3);
            expect(ports.every((p) => p >= 50000 && p <= 50010)).toBe(true);
        });

        it("should throw when not enough ports available", async() => {
            await expect(
                portManager.findAvailablePorts(50000, 50001, 5),
            ).rejects.toThrow("Could not find 5 available ports in range 50000-50001");
        });
    });
});

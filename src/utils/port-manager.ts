import net from "net";

export interface PortRange {
    start: number;
    end: number;
}

export class PortManager {
    parseRange(range: string): PortRange {
        const match = /^(\d+)-(\d+)$/.exec(range);
        if (!match?.[1] || !match[2]) {
            throw new Error(`Invalid port range format: ${range}`);
        }

        return {
            start: parseInt(match[1]),
            end: parseInt(match[2]),
        };
    }

    async isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();

            server.once("error", () => {
                resolve(false);
            });

            server.once("listening", () => {
                server.close();
                resolve(true);
            });

            server.listen(port);
        });
    }

    async findAvailablePorts(start: number, end: number, count: number): Promise<number[]> {
        const available: number[] = [];

        for (let port = start; port <= end && available.length < count; port++) {
            if (await this.isPortAvailable(port)) {
                available.push(port);
            }
        }

        if (available.length < count) {
            throw new Error(`Could not find ${String(count)} available ports in range ${String(start)}-${String(end)}`);
        }

        return available;
    }
}

export const portManager = new PortManager();

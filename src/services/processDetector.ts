/**
 * Process detector for Antigravity Language Server.
 * Finds running instances, extracts CSRF tokens, and discovers listening ports.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { ConnectionInfo } from '../types';
import { ConnectClient } from './connectClient';

const execFileAsync = promisify(execFile);

export class ProcessDetector {
    private cachedConnection: ConnectionInfo | null = null;
    private cacheExpiry = 0;
    private readonly CACHE_TTL_MS = 30_000;
    private connectClient = new ConnectClient();

    /** Invalidate the cached connection (e.g. on manual refresh) */
    invalidateCache(): void {
        this.cachedConnection = null;
        this.cacheExpiry = 0;
    }

    /**
     * Detect a running Antigravity Language Server and return connection info.
     * Returns null if no server is found.
     */
    async detect(): Promise<ConnectionInfo | null> {
        // Return cache if fresh
        if (this.cachedConnection && Date.now() < this.cacheExpiry) {
            return this.cachedConnection;
        }

        try {
            // Step 1: Find the language server process
            const processInfo = await this.findProcess();
            if (!processInfo) {
                this.cachedConnection = null;
                return null;
            }

            // Step 2: Discover listening ports
            const ports = await this.discoverPorts(processInfo.pid);
            if (ports.length === 0) {
                return null;
            }

            // Step 3: Probe ports to find the Connect API endpoint
            const connection = await this.probeAndConnect(
                ports,
                processInfo.pid,
                processInfo.csrfToken
            );

            this.cachedConnection = connection;
            if (connection) {
                this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;
            }
            return connection;
        } catch {
            this.cachedConnection = null;
            return null;
        }
    }

    /**
     * Find the Antigravity language server process via `ps aux`.
     */
    private async findProcess(): Promise<{ pid: number; csrfToken: string } | null> {
        try {
            // Use execFile to avoid shell injection, though ps doesn't take user input here
            const { stdout } = await execFileAsync('ps', ['aux'], { timeout: 5000 });
            const lines = stdout.split('\n');

            for (const line of lines) {
                const lower = line.toLowerCase();
                if (
                    lower.includes('antigravity') &&
                    (lower.includes('language-server') ||
                        lower.includes('lsp') ||
                        lower.includes('server'))
                ) {
                    const parsed = this.parseProcessLine(line);
                    if (parsed) {
                        return parsed;
                    }
                }
            }
        } catch {
            // ps failed — not fatal
        }
        return null;
    }

    /**
     * Parse a `ps aux` line to extract PID and --csrf_token.
     */
    private parseProcessLine(line: string): { pid: number; csrfToken: string } | null {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 11) { return null; }

        const pid = parseInt(parts[1], 10);
        if (isNaN(pid)) { return null; }

        const commandLine = parts.slice(10).join(' ');
        const csrfToken = this.extractArg(commandLine, '--csrf_token');

        if (!csrfToken) { return null; }

        return { pid, csrfToken };
    }

    /**
     * Extract a named argument value from a command line string.
     * Handles `--key value` and `--key=value` formats.
     */
    private extractArg(commandLine: string, key: string): string | null {
        // --key=value
        const eqPattern = new RegExp(`${key}=(\\S+)`);
        const eqMatch = commandLine.match(eqPattern);
        if (eqMatch) { return eqMatch[1]; }

        // --key value
        const idx = commandLine.indexOf(key);
        if (idx === -1) { return null; }
        const after = commandLine.substring(idx + key.length).trim();
        const value = after.split(/\s/)[0];
        return value || null;
    }

    /**
     * Discover listening TCP ports for a given PID using `lsof` (macOS/Linux).
     */
    private async discoverPorts(pid: number): Promise<number[]> {
        if (!Number.isInteger(pid) || pid <= 0) {
            return [];
        }

        try {
            const { stdout } = await execFileAsync(
                'lsof',
                ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', String(pid)],
                { timeout: 5000 }
            );

            const ports: number[] = [];
            for (const line of stdout.split('\n')) {
                const match = line.match(/:(\d+)\s+\(LISTEN\)/);
                if (match) {
                    const port = parseInt(match[1], 10);
                    if (!isNaN(port) && !ports.includes(port)) {
                        ports.push(port);
                    }
                }
            }
            return ports;
        } catch {
            return [];
        }
    }

    /**
     * Probe each discovered port (HTTPS first) to find the Connect API.
     */
    private async probeAndConnect(
        ports: number[],
        pid: number,
        csrfToken: string
    ): Promise<ConnectionInfo | null> {
        // Try HTTPS first on all ports, then HTTP
        for (const port of ports) {
            const httpsUrl = `https://127.0.0.1:${port}`;
            const ok = await this.connectClient.probe(httpsUrl, csrfToken);
            if (ok) {
                return { port, authToken: csrfToken, pid, isHttps: true };
            }
        }
        for (const port of ports) {
            const httpUrl = `http://127.0.0.1:${port}`;
            const ok = await this.connectClient.probe(httpUrl, csrfToken);
            if (ok) {
                return { port, authToken: csrfToken, pid, isHttps: false };
            }
        }
        return null;
    }
}

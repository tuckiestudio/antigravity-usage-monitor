/**
 * Connect RPC client for the Antigravity Language Server.
 * Fetches real-time quota/usage data via the local Connect API.
 */

import * as https from 'https';
import * as http from 'http';

/** Raw model from the Connect RPC response */
interface ConnectModel {
    modelOrAlias?: { model?: string };
    label?: string;
    displayName?: string;
    quotaInfo?: {
        remainingFraction?: number;
        resetTime?: string;
    };
    isExhausted?: boolean;
}

/** Raw user status from the Connect RPC response */
interface ConnectUserStatus {
    email?: string;
    isAuthenticated?: boolean;
    planStatus?: {
        availablePromptCredits?: number;
        planInfo?: {
            monthlyPromptCredits?: number;
            planName?: string;
        };
    };
    cascadeModelConfigData?: {
        clientModelConfigs?: ConnectModel[];
    };
}

/** Parsed model quota from Connect RPC */
export interface ParsedModelQuota {
    modelId: string;
    label: string;
    remainingFraction: number;
    resetTime?: string;
    timeUntilResetMs?: number;
    isExhausted: boolean;
}

/** Parsed quota snapshot from Connect RPC */
export interface ParsedQuotaData {
    email?: string;
    models: ParsedModelQuota[];
    promptCredits?: {
        used: number;
        limit: number;
        remaining: number;
    };
    tierName?: string;
}

export class ConnectClient {
    /**
     * Fetch user status (quota data) from the local Language Server.
     */
    async getUserStatus(
        baseUrl: string,
        csrfToken: string
    ): Promise<ParsedQuotaData> {
        const endpoint = '/exa.language_server_pb.LanguageServerService/GetUserStatus';

        const body = JSON.stringify({
            metadata: {
                ideName: 'antigravity',
                extensionName: 'antigravity',
                locale: 'en',
            },
        });

        const raw = await this.request(baseUrl, endpoint, body, csrfToken);
        return this.parseResponse(raw);
    }

    /**
     * Probe a port to check if the Connect API is available.
     * Returns true if the port responds to a Connect RPC probe.
     */
    async probe(baseUrl: string, csrfToken?: string): Promise<boolean> {
        const endpoint = '/exa.language_server_pb.LanguageServerService/GetUnleashData';
        const body = JSON.stringify({ wrapper_data: {} });

        try {
            await this.request(baseUrl, endpoint, body, csrfToken, 2000);
            return true;
        } catch {
            return false;
        }
    }

    private request(
        baseUrl: string,
        path: string,
        body: string,
        csrfToken?: string,
        timeout = 5000
    ): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const url = new URL(path, baseUrl);
            const isHttps = baseUrl.startsWith('https://');

            // SAFETY: Only used for localhost connections to the Language Server's self-signed cert
            if (!url.hostname.match(/^(127\.0\.0\.1|localhost|::1)$/)) {
                reject(new Error('Refusing non-localhost connection'));
                return;
            }

            const headers: Record<string, string> = {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
            };

            if (csrfToken) {
                headers['X-Codeium-Csrf-Token'] = csrfToken;
            }

            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'POST',
                headers,
                timeout,
                rejectUnauthorized: false, // Language server uses self-signed certs
            };

            const protocol = isHttps ? https : http;

            const req = protocol.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        } catch {
                            reject(new Error('Invalid JSON response'));
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timed out'));
            });

            req.write(body);
            req.end();
        });
    }

    private parseResponse(raw: unknown): ParsedQuotaData {
        const result: ParsedQuotaData = { models: [] };

        if (typeof raw !== 'object' || raw === null) {
            return result;
        }

        const data = raw as Record<string, unknown>;
        const userStatus = (data.userStatus as Record<string, unknown>) || data;

        // Email
        if (typeof userStatus.email === 'string') {
            result.email = userStatus.email;
        }

        // Prompt credits
        const planStatus = userStatus.planStatus as Record<string, unknown> | undefined;
        if (planStatus) {
            const available = planStatus.availablePromptCredits;
            const planInfo = planStatus.planInfo as Record<string, unknown> | undefined;
            const monthly = planInfo?.monthlyPromptCredits;

            if (typeof available === 'number' && typeof monthly === 'number') {
                result.promptCredits = {
                    used: monthly - available,
                    limit: monthly,
                    remaining: available,
                };
            }

            if (typeof planInfo?.planName === 'string') {
                result.tierName = planInfo.planName;
            }
        }

        // Models
        const cascadeData = userStatus.cascadeModelConfigData as Record<string, unknown> | undefined;
        const clientModelConfigs = cascadeData?.clientModelConfigs;

        if (Array.isArray(clientModelConfigs)) {
            result.models = clientModelConfigs
                .map((m) => this.parseModel(m))
                .filter((m) => m !== null) as ParsedModelQuota[];
        }

        return result;
    }

    private parseModel(model: unknown): ParsedModelQuota | null {
        if (typeof model !== 'object' || model === null) {
            return null;
        }

        const m = model as ConnectModel;
        const modelId = m.modelOrAlias?.model || 'unknown';
        const label = m.label || m.displayName || modelId;
        const quotaInfo = m.quotaInfo;
        const remainingFraction = typeof quotaInfo?.remainingFraction === 'number'
            ? quotaInfo.remainingFraction
            : 1.0;
        const resetTime = quotaInfo?.resetTime;

        let timeUntilResetMs: number | undefined;
        if (resetTime) {
            try {
                const diff = new Date(resetTime).getTime() - Date.now();
                timeUntilResetMs = diff > 0 ? diff : undefined;
            } catch { /* ignore */ }
        }

        return {
            modelId,
            label,
            remainingFraction,
            resetTime,
            timeUntilResetMs,
            isExhausted: m.isExhausted ?? (remainingFraction === 0),
        };
    }
}

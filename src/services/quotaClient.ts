/**
 * Quota client — fetches quota data from the local Antigravity Language Server
 * or falls back to mock data for development.
 */

import { ConnectionInfo, ExtensionConfig, ModelQuota, QuotaSnapshot, QuotaStatus, SubscriptionTier, PromptCredits } from '../types';
import { ConnectClient, ParsedQuotaData } from './connectClient';
import { getQuotaStatus } from '../utils/formatting';

export class QuotaClient {
    private connectClient = new ConnectClient();

    /**
     * Fetch quota data. Tries the live Language Server first, falls back to mock.
     */
    async fetchQuota(
        connection: ConnectionInfo | null,
        config: ExtensionConfig
    ): Promise<QuotaSnapshot> {
        // Mock data shortcut
        if (config.enableMockData) {
            return this.getMockSnapshot(config);
        }

        // No connection — disconnected
        if (!connection) {
            return this.getDisconnectedSnapshot();
        }

        // Query the live Language Server
        try {
            const protocol = connection.isHttps ? 'https' : 'http';
            const baseUrl = `${protocol}://127.0.0.1:${connection.port}`;
            const data = await this.connectClient.getUserStatus(baseUrl, connection.authToken);
            return this.mapToSnapshot(data, config);
        } catch (error) {
            console.error('[Antigravity Usage Monitor] Connect RPC error:', error);
            return this.getDisconnectedSnapshot();
        }
    }

    /**
     * Map the parsed Connect RPC response to our QuotaSnapshot format.
     */
    private mapToSnapshot(data: ParsedQuotaData, config: ExtensionConfig): QuotaSnapshot {
        const models: ModelQuota[] = data.models.map((m) => {
            const usedFraction = 1 - m.remainingFraction;
            const percentUsed = Math.round(usedFraction * 100);
            // We don't get absolute used/limit from the API, just fractions.
            // Use 100 as a normalized limit so progress bars work.
            const limit = 100;
            const used = percentUsed;

            return {
                modelId: m.modelId,
                modelName: m.label,
                used,
                limit,
                percentUsed,
                resetTimestamp: m.resetTime ? new Date(m.resetTime).getTime() : 0,
                remainingFraction: m.remainingFraction,
                isExhausted: m.isExhausted,
            };
        });

        // Overall usage: average of all models
        const overallPercent = models.length > 0
            ? Math.round(models.reduce((sum, m) => sum + m.percentUsed, 0) / models.length)
            : 0;

        const status = getQuotaStatus(overallPercent, config.warningThreshold, config.criticalThreshold);

        // Determine subscription tier
        let tier = SubscriptionTier.UNKNOWN;
        if (data.tierName) {
            if (data.tierName.includes('Ultra')) { tier = SubscriptionTier.ULTRA; }
            else if (data.tierName.includes('Pro')) { tier = SubscriptionTier.PRO; }
            else if (data.tierName.includes('Free')) { tier = SubscriptionTier.FREE; }
        }

        let promptCredits: PromptCredits | undefined;
        if (data.promptCredits) {
            promptCredits = data.promptCredits;
        }

        return {
            models,
            overallPercent,
            status,
            lastUpdated: Date.now(),
            subscriptionTier: tier,
            promptCredits,
            email: data.email,
            source: 'local',
        };
    }

    /**
     * Return a disconnected snapshot when no Language Server is found.
     */
    private getDisconnectedSnapshot(): QuotaSnapshot {
        return {
            models: [],
            overallPercent: 0,
            status: QuotaStatus.DISCONNECTED,
            lastUpdated: Date.now(),
            subscriptionTier: SubscriptionTier.UNKNOWN,
            source: 'disconnected',
        };
    }

    /**
     * Return realistic mock data for development & testing.
     */
    private getMockSnapshot(config: ExtensionConfig): QuotaSnapshot {
        const now = Date.now();
        const resetIn2h = now + 2 * 60 * 60 * 1000;
        const resetIn4h = now + 4 * 60 * 60 * 1000;

        const models: ModelQuota[] = [
            {
                modelId: 'gemini-3-pro-high',
                modelName: 'Gemini 3 Pro (High)',
                used: 37,
                limit: 100,
                percentUsed: 37,
                resetTimestamp: resetIn4h,
                remainingFraction: 0.63,
            },
            {
                modelId: 'gemini-3-pro-low',
                modelName: 'Gemini 3 Pro (Low)',
                used: 12,
                limit: 100,
                percentUsed: 12,
                resetTimestamp: resetIn4h,
                remainingFraction: 0.88,
            },
            {
                modelId: 'gemini-3-flash',
                modelName: 'Gemini 3 Flash',
                used: 5,
                limit: 100,
                percentUsed: 5,
                resetTimestamp: resetIn4h,
                remainingFraction: 0.95,
            },
            {
                modelId: 'claude-sonnet-4.5',
                modelName: 'Claude Sonnet 4.5',
                used: 62,
                limit: 100,
                percentUsed: 62,
                resetTimestamp: resetIn2h,
                remainingFraction: 0.38,
            },
            {
                modelId: 'claude-sonnet-4.5-thinking',
                modelName: 'Claude Sonnet 4.5 (Thinking)',
                used: 78,
                limit: 100,
                percentUsed: 78,
                resetTimestamp: resetIn2h,
                remainingFraction: 0.22,
            },
            {
                modelId: 'claude-opus-4.5-thinking',
                modelName: 'Claude Opus 4.5 (Thinking)',
                used: 91,
                limit: 100,
                percentUsed: 91,
                resetTimestamp: resetIn2h,
                remainingFraction: 0.09,
                isExhausted: false,
            },
            {
                modelId: 'claude-opus-4.6-thinking',
                modelName: 'Claude Opus 4.6 (Thinking)',
                used: 45,
                limit: 100,
                percentUsed: 45,
                resetTimestamp: resetIn2h,
                remainingFraction: 0.55,
            },
            {
                modelId: 'gpt-oss-120b',
                modelName: 'GPT-OSS 120B (Medium)',
                used: 20,
                limit: 100,
                percentUsed: 20,
                resetTimestamp: resetIn4h,
                remainingFraction: 0.80,
            },
        ];

        const overallPercent = Math.round(
            models.reduce((sum, m) => sum + m.percentUsed, 0) / models.length
        );

        return {
            models,
            overallPercent,
            status: getQuotaStatus(overallPercent, config.warningThreshold, config.criticalThreshold),
            lastUpdated: now,
            subscriptionTier: SubscriptionTier.PRO,
            promptCredits: { used: 250, limit: 500, remaining: 250 },
            email: 'user@example.com',
            source: 'mock',
        };
    }
}

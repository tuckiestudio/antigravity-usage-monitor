/**
 * Type definitions for Antigravity Usage Monitor
 */

/** Per-model quota information */
export interface ModelQuota {
    modelId: string;
    modelName: string;
    used: number;
    limit: number;
    percentUsed: number;
    resetTimestamp: number; // Unix timestamp in milliseconds
    /** Fraction of quota remaining (0.0–1.0), from Connect RPC */
    remainingFraction?: number;
    /** Whether the model is fully exhausted */
    isExhausted?: boolean;
}

/** Prompt credits (account-level usage) */
export interface PromptCredits {
    used: number;
    limit: number;
    remaining: number;
}

/** Overall quota status levels */
export enum QuotaStatus {
    HEALTHY = 'healthy',
    WARNING = 'warning',
    CRITICAL = 'critical',
    UNKNOWN = 'unknown',
    DISCONNECTED = 'disconnected',
}

/** Connection details for the local Antigravity instance */
export interface ConnectionInfo {
    port: number;
    authToken: string;
    pid: number;
    /** Whether the connection uses HTTPS */
    isHttps: boolean;
}

/** Extension configuration from user settings */
export interface ExtensionConfig {
    pollingInterval: number;
    warningThreshold: number;
    criticalThreshold: number;
    enableNotifications: boolean;
    enableMockData: boolean;
}

/** Aggregated quota snapshot */
export interface QuotaSnapshot {
    models: ModelQuota[];
    overallPercent: number;
    status: QuotaStatus;
    lastUpdated: number;
    subscriptionTier: SubscriptionTier;
    /** Account-level prompt credits */
    promptCredits?: PromptCredits;
    /** Email of the authenticated user */
    email?: string;
    /** Data source: 'local' | 'mock' | 'disconnected' */
    source?: string;
}

/** Antigravity subscription tiers */
export enum SubscriptionTier {
    FREE = 'Free',
    PRO = 'Google AI Pro',
    ULTRA = 'Google AI Ultra',
    UNKNOWN = 'Unknown',
}

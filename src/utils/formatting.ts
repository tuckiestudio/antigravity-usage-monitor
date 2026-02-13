/**
 * Formatting utilities for Antigravity Usage Monitor
 */

import { QuotaStatus } from '../types';

/**
 * Formats a Unix timestamp as a human-readable countdown string.
 * E.g. "2h 15m", "4d 2h", "45m", "< 1m"
 */
export function formatTimeRemaining(resetTimestamp: number): string {
    const now = Date.now();
    const diffMs = resetTimestamp - now;

    if (diffMs <= 0) {
        return 'now';
    }

    const totalMinutes = Math.floor(diffMs / 60_000);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);

    const remainingHours = totalHours % 24;
    const remainingMinutes = totalMinutes % 60;

    if (totalDays > 0) {
        return `${totalDays}d ${remainingHours}h`;
    }
    if (totalHours > 0) {
        return `${totalHours}h ${remainingMinutes}m`;
    }
    if (totalMinutes > 0) {
        return `${totalMinutes}m`;
    }
    return '< 1m';
}

/**
 * Builds an emoji-based progress bar for use in Markdown tooltips.
 * Uses color-coded blocks: 🟩 (green ≤50%), 🟨 (yellow 51-79%), 🟥 (red ≥80%)
 */
export function buildProgressBar(percent: number, length: number = 10): string {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;

    let block: string;
    if (percent >= 80) {
        block = '🟥';
    } else if (percent >= 50) {
        block = '🟨';
    } else {
        block = '🟩';
    }

    return block.repeat(filled) + '⬜'.repeat(empty);
}

/**
 * Determines the QuotaStatus based on the usage percentage and configured thresholds.
 */
export function getQuotaStatus(
    percent: number,
    warningThreshold: number,
    criticalThreshold: number
): QuotaStatus {
    if (percent >= criticalThreshold) {
        return QuotaStatus.CRITICAL;
    }
    if (percent >= warningThreshold) {
        return QuotaStatus.WARNING;
    }
    return QuotaStatus.HEALTHY;
}

/**
 * Returns a status bar icon string based on the quota status.
 */
export function getStatusIcon(status: QuotaStatus): string {
    switch (status) {
        case QuotaStatus.CRITICAL:
            return '$(warning)';
        case QuotaStatus.WARNING:
            return '$(pulse)';
        case QuotaStatus.HEALTHY:
            return '$(rocket)';
        case QuotaStatus.DISCONNECTED:
            return '$(debug-disconnect)';
        case QuotaStatus.UNKNOWN:
        default:
            return '$(question)';
    }
}

/**
 * Formats a percentage for display, clamped to 0-100.
 */
export function formatPercent(percent: number): string {
    return `${Math.min(100, Math.max(0, Math.round(percent)))}%`;
}

/**
 * Returns "Xs ago" or "Xm ago" string for the last update time.
 */
export function formatLastUpdated(timestamp: number): string {
    const diffMs = Date.now() - timestamp;
    const diffSeconds = Math.floor(diffMs / 1000);

    if (diffSeconds < 60) {
        return `${diffSeconds}s ago`;
    }
    const diffMinutes = Math.floor(diffSeconds / 60);
    return `${diffMinutes}m ago`;
}

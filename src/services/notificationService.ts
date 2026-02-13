/**
 * Notification Service
 *
 * Fires VS Code notifications when quota usage exceeds configured thresholds.
 * Tracks which notifications have been shown to avoid spamming the user.
 */

import * as vscode from 'vscode';
import { ModelQuota, QuotaSnapshot, QuotaStatus, ExtensionConfig } from '../types';
import { formatPercent } from '../utils/formatting';

export class NotificationService {
    /** Tracks which models have already triggered a warning notification */
    private warningNotified = new Set<string>();
    /** Tracks which models have already triggered a critical notification */
    private criticalNotified = new Set<string>();
    /** Tracks if the overall critical notification has been shown */
    private overallCriticalNotified = false;

    /**
     * Checks the quota snapshot and fires notifications if thresholds are exceeded.
     */
    checkAndNotify(snapshot: QuotaSnapshot, config: ExtensionConfig): void {
        if (!config.enableNotifications) {
            return;
        }

        if (snapshot.status === QuotaStatus.DISCONNECTED || snapshot.status === QuotaStatus.UNKNOWN) {
            return;
        }

        // Check each model individually
        for (const model of snapshot.models) {
            this.checkModelThresholds(model, config);
        }

        // Check overall status
        if (snapshot.status === QuotaStatus.CRITICAL && !this.overallCriticalNotified) {
            this.overallCriticalNotified = true;
            vscode.window.showErrorMessage(
                `$(warning) Antigravity quota critically high! Overall usage at ${formatPercent(snapshot.overallPercent)}. ` +
                `Consider pausing heavy agent tasks.`,
                'View Details',
                'Dismiss'
            ).then((action) => {
                if (action === 'View Details') {
                    vscode.commands.executeCommand('antigravity-usage.showUsagePanel');
                }
            });
        }
    }

    /**
     * Checks individual model thresholds and notifies if exceeded.
     */
    private checkModelThresholds(model: ModelQuota, config: ExtensionConfig): void {
        // Critical threshold
        if (model.percentUsed >= config.criticalThreshold && !this.criticalNotified.has(model.modelId)) {
            this.criticalNotified.add(model.modelId);
            vscode.window.showWarningMessage(
                `$(alert) ${model.modelName} quota at ${formatPercent(model.percentUsed)}! ` +
                `Approaching limit.`,
                'View Details'
            ).then((action) => {
                if (action === 'View Details') {
                    vscode.commands.executeCommand('antigravity-usage.showUsagePanel');
                }
            });
        }
        // Warning threshold (only if not already at critical)
        else if (
            model.percentUsed >= config.warningThreshold &&
            !this.warningNotified.has(model.modelId)
        ) {
            this.warningNotified.add(model.modelId);
            vscode.window.showInformationMessage(
                `$(info) ${model.modelName} quota at ${formatPercent(model.percentUsed)}. ` +
                `Usage is getting high.`
            );
        }
    }

    /**
     * Resets notification tracking. Called when quotas refresh (reset time passes).
     */
    resetNotifications(): void {
        this.warningNotified.clear();
        this.criticalNotified.clear();
        this.overallCriticalNotified = false;
    }

    /**
     * Resets tracking for a specific model (e.g., when its quota resets).
     */
    resetModelNotifications(modelId: string): void {
        this.warningNotified.delete(modelId);
        this.criticalNotified.delete(modelId);
    }
}

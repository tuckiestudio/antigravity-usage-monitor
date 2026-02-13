/**
 * Status Bar Manager
 *
 * Manages the VS Code StatusBarItem that displays usage information
 * in the bottom bar. Builds rich MarkdownString tooltips for hover.
 */

import * as vscode from 'vscode';
import { QuotaSnapshot, QuotaStatus, ModelQuota } from '../types';
import {
    buildProgressBar,
    formatTimeRemaining,
    formatPercent,
    formatLastUpdated,
    getStatusIcon,
} from '../utils/formatting';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            'antigravity-usage',
            vscode.StatusBarAlignment.Right,
            50 // Priority — position in the right-side group
        );

        this.statusBarItem.name = 'Antigravity Usage Monitor';
        this.statusBarItem.command = 'antigravity-usage.showUsagePanel';

        // Show initial loading state
        this.statusBarItem.text = '$(loading~spin) AG';
        this.statusBarItem.tooltip = 'Antigravity Usage Monitor — Loading...';
        this.statusBarItem.show();
    }

    /**
     * Updates the status bar item with the latest quota snapshot.
     */
    update(snapshot: QuotaSnapshot): void {
        this.updateText(snapshot);
        this.updateBackgroundColor(snapshot);
        this.updateTooltip(snapshot);
    }

    /**
     * Updates the status bar text with icon and percentage.
     */
    private updateText(snapshot: QuotaSnapshot): void {
        const icon = getStatusIcon(snapshot.status);

        if (snapshot.status === QuotaStatus.DISCONNECTED) {
            this.statusBarItem.text = `${icon} AG --`;
        } else if (snapshot.status === QuotaStatus.UNKNOWN) {
            this.statusBarItem.text = `${icon} AG ?`;
        } else {
            this.statusBarItem.text = `${icon} AG ${formatPercent(snapshot.overallPercent)}`;
        }
    }

    /**
     * Sets the background color based on quota status.
     */
    private updateBackgroundColor(snapshot: QuotaSnapshot): void {
        switch (snapshot.status) {
            case QuotaStatus.CRITICAL:
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;
            case QuotaStatus.WARNING:
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            default:
                this.statusBarItem.backgroundColor = undefined;
                break;
        }
    }

    /**
     * Builds a rich MarkdownString tooltip with per-model breakdown.
     */
    private updateTooltip(snapshot: QuotaSnapshot): void {
        const md = new vscode.MarkdownString('', true);
        md.isTrusted = true;
        md.supportHtml = true;

        if (snapshot.status === QuotaStatus.DISCONNECTED) {
            md.appendMarkdown('### $(debug-disconnect) Antigravity Usage Monitor\n\n');
            md.appendMarkdown('⚠️ **No Antigravity instance detected**\n\n');
            md.appendMarkdown('_Make sure Antigravity is running, or enable_\n');
            md.appendMarkdown('_mock data in settings for testing._\n');
            this.statusBarItem.tooltip = md;
            return;
        }

        // Header
        md.appendMarkdown('### $(rocket) Antigravity Usage Monitor\n\n');

        // Subscription tier + email
        const tierParts: string[] = [];
        if (snapshot.subscriptionTier && snapshot.subscriptionTier !== 'Unknown') {
            tierParts.push(`**Tier:** ${snapshot.subscriptionTier}`);
        }
        if (snapshot.email) {
            tierParts.push(`**Account:** ${snapshot.email}`);
        }
        if (tierParts.length > 0) {
            md.appendMarkdown(tierParts.join(' · ') + '\n\n');
        }

        // Prompt credits
        if (snapshot.promptCredits) {
            const pc = snapshot.promptCredits;
            const pcPct = pc.limit > 0 ? Math.round((pc.used / pc.limit) * 100) : 0;
            const pcBar = buildProgressBar(pcPct, 10);
            md.appendMarkdown(`**Prompt Credits:** ${pcBar} ${pc.remaining}/${pc.limit} remaining\n\n`);
        }

        // Overall status bar
        const overallBar = buildProgressBar(snapshot.overallPercent, 12);
        md.appendMarkdown(`**Overall:** ${overallBar} ${formatPercent(snapshot.overallPercent)}\n\n`);

        // Separator
        md.appendMarkdown('---\n\n');

        // Per-model breakdown table
        if (snapshot.models.length > 0) {
            md.appendMarkdown('| Model | Usage | Reset |\n');
            md.appendMarkdown('|:------|:------|------:|\n');

            for (const model of snapshot.models) {
                const bar = buildProgressBar(model.percentUsed, 8);
                const timeStr = formatTimeRemaining(model.resetTimestamp);
                const pctStr = model.isExhausted ? '🚫' : formatPercent(model.percentUsed);
                md.appendMarkdown(`| ${model.modelName} | ${bar} ${pctStr} | ${timeStr} |\n`);
            }

            md.appendMarkdown('\n');
        } else {
            md.appendMarkdown('_No model data available_\n\n');
        }

        // Footer with source indicator
        md.appendMarkdown('---\n\n');
        const sourceLabel = snapshot.source === 'local' ? '🟢 Live' : snapshot.source === 'mock' ? '🟡 Mock' : '⚪ --';
        md.appendMarkdown(
            `$(clock) _Updated ${formatLastUpdated(snapshot.lastUpdated)}_ · _${sourceLabel}_ · _Click for details_`
        );

        this.statusBarItem.tooltip = md;
    }

    /**
     * Dispose the status bar item.
     */
    dispose(): void {
        this.statusBarItem.dispose();
    }
}

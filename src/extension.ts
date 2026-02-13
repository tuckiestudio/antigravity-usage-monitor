/**
 * Antigravity Usage Monitor — Extension Entry Point
 *
 * Coordinates the process detector, quota client, notification service,
 * and UI components to provide real-time AI model usage monitoring.
 */

import * as vscode from 'vscode';
import { ProcessDetector } from './services/processDetector';
import { QuotaClient } from './services/quotaClient';
import { NotificationService } from './services/notificationService';
import { StatusBarManager } from './ui/statusBarManager';
import { UsageWebview } from './ui/usageWebview';
import { ExtensionConfig, QuotaSnapshot } from './types';

let pollingTimer: NodeJS.Timeout | undefined;
let statusBarManager: StatusBarManager | undefined;
let usageWebview: UsageWebview | undefined;
let processDetector: ProcessDetector;
let quotaClient: QuotaClient;
let notificationService: NotificationService;
let latestSnapshot: QuotaSnapshot | undefined;
let outputChannel: vscode.OutputChannel;

/**
 * Called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext): void {
    // Initialize output channel first
    outputChannel = vscode.window.createOutputChannel('Antigravity Usage Monitor');
    outputChannel.appendLine('Antigravity Usage Monitor activated');
    context.subscriptions.push(outputChannel);

    // Initialize services
    processDetector = new ProcessDetector();
    quotaClient = new QuotaClient();
    notificationService = new NotificationService();

    // Initialize UI
    statusBarManager = new StatusBarManager();
    usageWebview = new UsageWebview();

    // Handle mock/live toggle from webview
    usageWebview.onToggleMock(async (enabled) => {
        outputChannel?.appendLine(`Toggle mock data: ${enabled}`);
        await vscode.workspace.getConfiguration('antigravity-usage')
            .update('enableMockData', enabled, vscode.ConfigurationTarget.Global);
        processDetector.invalidateCache();
        await pollQuota();
    });

    // Register commands
    const showPanelCommand = vscode.commands.registerCommand(
        'antigravity-usage.showUsagePanel',
        () => {
            if (latestSnapshot) {
                usageWebview?.show(latestSnapshot);
            } else {
                vscode.window.showInformationMessage(
                    'Antigravity Usage Monitor: No data available yet. Waiting for first poll...'
                );
            }
        }
    );

    const refreshCommand = vscode.commands.registerCommand(
        'antigravity-usage.refreshQuota',
        async () => {
            processDetector.invalidateCache();
            await pollQuota();
            vscode.window.showInformationMessage('Antigravity Usage Monitor: Quota refreshed.');
        }
    );

    // Watch for configuration changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('antigravity-usage')) {
            restartPolling();
        }
    });

    // Register disposables
    context.subscriptions.push(
        showPanelCommand,
        refreshCommand,
        configWatcher,
        { dispose: () => stopPolling() },
        { dispose: () => statusBarManager?.dispose() },
        { dispose: () => usageWebview?.dispose() }
    );

    // Start polling immediately
    startPolling();
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
    stopPolling();
    statusBarManager?.dispose();
    usageWebview?.dispose();
}

/**
 * Reads the extension configuration from VS Code settings.
 */
function getConfig(): ExtensionConfig {
    const cfg = vscode.workspace.getConfiguration('antigravity-usage');
    return {
        pollingInterval: cfg.get<number>('pollingInterval', 30),
        warningThreshold: cfg.get<number>('warningThreshold', 70),
        criticalThreshold: cfg.get<number>('criticalThreshold', 90),
        enableNotifications: cfg.get<boolean>('enableNotifications', true),
        enableMockData: cfg.get<boolean>('enableMockData', false),
    };
}

/**
 * Performs a single poll: detect process → fetch quota → update UI → check notifications.
 */
async function pollQuota(): Promise<void> {
    const config = getConfig();
    outputChannel?.appendLine(`Polling quota... (Mock: ${config.enableMockData})`);

    try {
        let connection = null;

        // Step 1: Detect Antigravity process (skip if mock)
        if (!config.enableMockData) {
            connection = await processDetector.detect();
            if (connection) {
                outputChannel?.appendLine(`Connected to Antigravity on port ${connection.port}`);
            } else {
                outputChannel?.appendLine('No Antigravity process found.');
            }
        } else {
            outputChannel?.appendLine('Using mock data.');
        }

        // Step 2: Fetch quota data
        const snapshot = await quotaClient.fetchQuota(connection, config);
        latestSnapshot = snapshot;
        outputChannel?.appendLine(`Got ${snapshot.models.length} models (source: ${snapshot.source || 'unknown'}, status: ${snapshot.status})`);

        // Step 3: Update status bar
        statusBarManager?.update(snapshot);

        // Step 4: Update webview if open
        if (usageWebview) {
            usageWebview.updateContent(snapshot);
        }

        // Step 5: Check notification thresholds
        notificationService.checkAndNotify(snapshot, config);

        // Step 6: Check if any model quotas have reset
        checkForQuotaResets(snapshot);
    } catch (error) {
        console.error('[Antigravity Usage Monitor] Poll error:', error);
        outputChannel?.appendLine(`Poll Error: ${error}`);
    }
}

/**
 * Checks if any model quotas have recently reset and clears notification tracking.
 */
function checkForQuotaResets(snapshot: QuotaSnapshot): void {
    const now = Date.now();
    for (const model of snapshot.models) {
        // If the reset timestamp has passed, the quota was refreshed
        if (model.resetTimestamp <= now && model.percentUsed < 10) {
            notificationService.resetModelNotifications(model.modelId);
        }
    }
}

/**
 * Starts the polling timer.
 */
function startPolling(): void {
    const config = getConfig();
    const intervalMs = config.pollingInterval * 1000;

    // Initial poll
    pollQuota();

    // Set up recurring timer
    pollingTimer = setInterval(() => {
        pollQuota();
    }, intervalMs);
}

/**
 * Stops the polling timer.
 */
function stopPolling(): void {
    if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = undefined;
    }
}

/**
 * Restarts polling with updated configuration.
 */
function restartPolling(): void {
    stopPolling();
    startPolling();
}

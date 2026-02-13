/**
 * Usage Webview Panel
 *
 * Opens a detailed webview dashboard when the user clicks the status bar item.
 * Displays per-model charts, reset countdowns, and historical trends.
 */

import * as vscode from 'vscode';
import { QuotaSnapshot, QuotaStatus, ModelQuota } from '../types';
import { formatTimeRemaining, formatPercent } from '../utils/formatting';

export class UsageWebview {
  private panel: vscode.WebviewPanel | undefined;
  private lastSnapshot: QuotaSnapshot | undefined;
  private onToggleMockCallback?: (enabled: boolean) => void;

  /**
   * Register a callback for when the user toggles mock/live data.
   */
  onToggleMock(callback: (enabled: boolean) => void): void {
    this.onToggleMockCallback = callback;
  }

  /**
   * Opens or reveals the webview panel with the given quota data.
   */
  show(snapshot: QuotaSnapshot): void {
    this.lastSnapshot = snapshot;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.updateContent(snapshot);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'antigravityUsage',
      'Antigravity Usage Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage((message) => {
      if (message.command === 'toggleMock') {
        this.onToggleMockCallback?.(message.enabled);
      }
    });

    this.updateContent(snapshot);
  }

  /**
   * Updates the webview content with fresh quota data.
   */
  updateContent(snapshot: QuotaSnapshot): void {
    this.lastSnapshot = snapshot;
    if (!this.panel) { return; }
    this.panel.webview.html = this.buildHtml(snapshot);
  }

  /**
   * Builds the full HTML content for the webview dashboard.
   */
  private buildHtml(snapshot: QuotaSnapshot): string {
    const modelsHtml = snapshot.models.map((model) => this.buildModelCard(model)).join('\n');
    const statusClass = snapshot.status === QuotaStatus.DISCONNECTED ? 'disconnected' : snapshot.status;
    const overallPct = formatPercent(snapshot.overallPercent);
    const tierBadge = snapshot.subscriptionTier !== 'Unknown'
      ? `<span class="tier-badge">${this.escapeHtml(snapshot.subscriptionTier)}</span>`
      : '';

    // Build prompt credits card HTML
    let promptCreditsHtml = '';
    if (snapshot.promptCredits && snapshot.promptCredits.limit > 0) {
      const pc = snapshot.promptCredits;
      const pcPct = Math.round((pc.used / pc.limit) * 100);
      const pcClass = pcPct >= 90 ? 'critical' : pcPct >= 70 ? 'warning' : 'healthy';
      promptCreditsHtml = `
            <div class="credits-card">
              <div class="credits-header">
                <span class="credits-label">Prompt Credits</span>
                <span class="credits-value ${pcClass}">${pc.remaining} / ${pc.limit}</span>
              </div>
              <div class="model-bar">
                <div class="model-bar-fill ${pcClass}" style="width: ${Math.min(100, pcPct)}%"></div>
              </div>
            </div>
            `;
    }

    // Header details
    const emailHtml = snapshot.email ? `<div class="header-email">${this.escapeHtml(snapshot.email)}</div>` : '';
    const isMock = snapshot.source === 'mock';
    const toggleChecked = isMock ? 'checked' : '';

    return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Antigravity Usage Dashboard</title>
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-card: #1c2128;
      --bg-card-hover: #21262d;
      --border: #30363d;
      --text-primary: #e6edf3;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --accent-green: #3fb950;
      --accent-yellow: #d29922;
      --accent-red: #f85149;
      --accent-blue: #58a6ff;
      --accent-purple: #bc8cff;
      --glow-green: rgba(63, 185, 80, 0.15);
      --glow-yellow: rgba(210, 153, 34, 0.15);
      --glow-red: rgba(248, 81, 73, 0.15);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans',
        Helvetica, Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: 24px;
      line-height: 1.6;
    }

    .dashboard {
      max-width: 800px;
      margin: 0 auto;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .header h1 {
      font-size: 24px;
      font-weight: 600;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header-icon {
      font-size: 32px;
    }

    .tier-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      background: linear-gradient(135deg, var(--accent-purple), var(--accent-blue));
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Overall Usage Card */
    .overall-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      position: relative;
      overflow: hidden;
    }

    .overall-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent-green), var(--accent-yellow), var(--accent-red));
    }

    .overall-card.critical::before {
      background: var(--accent-red);
      box-shadow: 0 0 20px var(--glow-red);
    }

    .overall-card.warning::before {
      background: var(--accent-yellow);
      box-shadow: 0 0 20px var(--glow-yellow);
    }

    .overall-label {
      font-size: 14px;
      color: var(--text-secondary);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .overall-value {
      font-size: 48px;
      font-weight: 700;
      margin-bottom: 12px;
    }

    .overall-value.healthy { color: var(--accent-green); }
    .overall-value.warning { color: var(--accent-yellow); }
    .overall-value.critical { color: var(--accent-red); }
    .overall-value.disconnected { color: var(--text-muted); }

    .overall-bar {
      width: 100%;
      height: 8px;
      background: var(--bg-card);
      border-radius: 4px;
      overflow: hidden;
    }

    .overall-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.5s ease, background-color 0.3s ease;
    }

    .overall-bar-fill.healthy { background: var(--accent-green); }
    .overall-bar-fill.warning { background: var(--accent-yellow); }
    .overall-bar-fill.critical { background: var(--accent-red); }

    /* Model Cards Grid */
    .models-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .model-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
      transition: all 0.2s ease;
    }

    .model-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--accent-blue);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .model-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .model-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .model-percent {
      font-size: 20px;
      font-weight: 700;
    }

    .model-percent.healthy { color: var(--accent-green); }
    .model-percent.warning { color: var(--accent-yellow); }
    .model-percent.critical { color: var(--accent-red); }

    .model-bar {
      width: 100%;
      height: 6px;
      background: var(--bg-primary);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 12px;
    }

    .model-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.5s ease;
    }

    .model-bar-fill.healthy {
      background: linear-gradient(90deg, #2ea043, #3fb950);
    }
    .model-bar-fill.warning {
      background: linear-gradient(90deg, #9e6a03, #d29922);
    }
    .model-bar-fill.critical {
      background: linear-gradient(90deg, #da3633, #f85149);
    }

    .model-details {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .model-detail-label {
      color: var(--text-muted);
    }

    .reset-timer {
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--accent-blue);
      font-weight: 500;
    }

    .reset-timer::before {
      content: '⏱';
    }

    /* Footer */
    .footer {
      text-align: center;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 12px;
    }

    /* Disconnected State */
    .disconnected-message {
      text-align: center;
      padding: 48px 24px;
      color: var(--text-secondary);
    }

    .disconnected-message .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .disconnected-message h2 {
      font-size: 20px;
      margin-bottom: 8px;
      color: var(--text-primary);
    }

    .disconnected-message p {
      max-width: 400px;
      margin: 0 auto;
    }

    /* Animations */
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    .critical .model-percent {
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .model-card {
      animation: slideIn 0.3s ease forwards;
    }

    .model-card:nth-child(1) { animation-delay: 0.05s; }
    .model-card:nth-child(2) { animation-delay: 0.1s; }
    .model-card:nth-child(3) { animation-delay: 0.15s; }
    .model-card:nth-child(4) { animation-delay: 0.2s; }
    .model-card:nth-child(5) { animation-delay: 0.25s; }
    .model-card:nth-child(6) { animation-delay: 0.3s; }
    .model-card:nth-child(7) { animation-delay: 0.35s; }
    .model-card:nth-child(8) { animation-delay: 0.4s; }

    /* Prompt Credits Card */
    .credits-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .credits-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .credits-label {
      font-size: 13px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .credits-value {
      font-size: 16px;
      font-weight: 700;
    }
    .credits-value.healthy { color: var(--accent-green); }
    .credits-value.warning { color: var(--accent-yellow); }
    .credits-value.critical { color: var(--accent-red); }

    /* Header email + source */
    .header-email {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .header-right {
      text-align: right;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    }

    /* Toggle switch */
    .toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .toggle-label {
      font-size: 11px;
      color: var(--text-secondary);
      font-weight: 500;
      letter-spacing: 0.3px;
    }
    .toggle-label.active {
      color: var(--text-primary);
    }
    .toggle-switch {
      position: relative;
      width: 40px;
      height: 22px;
      flex-shrink: 0;
    }
    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      inset: 0;
      background: var(--accent-green);
      border-radius: 22px;
      transition: background 0.3s ease;
    }
    .toggle-slider::before {
      content: '';
      position: absolute;
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background: white;
      border-radius: 50%;
      transition: transform 0.3s ease;
    }
    .toggle-switch input:checked + .toggle-slider {
      background: var(--accent-yellow);
    }
    .toggle-switch input:checked + .toggle-slider::before {
      transform: translateX(18px);
    }

    /* Exhausted badge */
    .exhausted-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
      background: var(--accent-red);
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-left: 8px;
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <div class="header">
      <div class="header-left">
        <span class="header-icon">🚀</span>
        <div>
          <h1>Antigravity Usage Dashboard</h1>
          ${emailHtml}
        </div>
      </div>
      <div class="header-right">
        ${tierBadge}
        <div class="toggle-row">
          <span class="toggle-label ${!isMock ? 'active' : ''}">Live</span>
          <label class="toggle-switch">
            <input type="checkbox" id="mockToggle" ${toggleChecked}>
            <span class="toggle-slider"></span>
          </label>
          <span class="toggle-label ${isMock ? 'active' : ''}">Mock</span>
        </div>
      </div>
    </div>

    ${snapshot.status === QuotaStatus.DISCONNECTED
        ? `
        <div class="disconnected-message">
          <div class="icon">🔌</div>
          <h2>No Antigravity Instance Detected</h2>
          <p>Make sure Google Antigravity is running, or enable mock data in the extension settings for testing.</p>
        </div>
      `
        : `
        <div class="overall-card ${statusClass}">
          <div class="overall-label">Overall Quota Usage</div>
          <div class="overall-value ${statusClass}">${overallPct}</div>
          <div class="overall-bar">
            <div class="overall-bar-fill ${statusClass}" style="width: ${Math.min(100, snapshot.overallPercent)}%"></div>
          </div>
        </div>

        ${promptCreditsHtml}

        <div class="models-grid">
          ${modelsHtml}
        </div>
      `
      }

    <div class="footer">
      Antigravity Usage Monitor v0.1.0 · Last updated: ${new Date(snapshot.lastUpdated).toLocaleTimeString()}
    </div>
  </div>

  <script>
    // Auto-refresh countdown display
    const resetTimers = document.querySelectorAll('.reset-timer[data-reset]');

    function updateTimers() {
      const now = Date.now();
      resetTimers.forEach(timer => {
        const resetAt = parseInt(timer.getAttribute('data-reset') || '0', 10);
        const diff = resetAt - now;

        if (diff <= 0) {
          timer.textContent = 'Resetting...';
          return;
        }

        const totalMin = Math.floor(diff / 60000);
        const totalHr = Math.floor(totalMin / 60);
        const totalDays = Math.floor(totalHr / 24);
        const remHr = totalHr % 24;
        const remMin = totalMin % 60;

        if (totalDays > 0) {
          timer.textContent = totalDays + 'd ' + remHr + 'h';
        } else if (totalHr > 0) {
          timer.textContent = totalHr + 'h ' + remMin + 'm';
        } else {
          timer.textContent = totalMin + 'm';
        }
      });
    }

    updateTimers();
    setInterval(updateTimers, 30000);

    // Toggle mock/live data
    const vscode = acquireVsCodeApi();
    const mockToggle = document.getElementById('mockToggle');
    if (mockToggle) {
      mockToggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        vscode.postMessage({ command: 'toggleMock', enabled });
      });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Builds the HTML for a single model card.
   */
  private buildModelCard(model: ModelQuota): string {
    const pctStr = formatPercent(model.percentUsed);
    const resetStr = formatTimeRemaining(model.resetTimestamp);
    const barWidth = Math.min(100, model.percentUsed);

    let statusClass: string;
    if (model.isExhausted) {
      statusClass = 'critical';
    } else if (model.percentUsed >= 80) {
      statusClass = 'critical';
    } else if (model.percentUsed >= 50) {
      statusClass = 'warning';
    } else {
      statusClass = 'healthy';
    }

    const exhaustedBadge = model.isExhausted ? '<span class="exhausted-badge">Exhausted</span>' : '';

    const remainingPct = model.remainingFraction !== undefined
      ? `${Math.round(model.remainingFraction * 100)}% remaining`
      : `${formatPercent(model.percentUsed)} used`;

    return `
      <div class="model-card ${statusClass}">
        <div class="model-header">
          <span class="model-name">${this.escapeHtml(model.modelName)}${exhaustedBadge}</span>
          <span class="model-percent ${statusClass}">${pctStr}</span>
        </div>
        <div class="model-bar">
          <div class="model-bar-fill ${statusClass}" style="width: ${barWidth}%"></div>
        </div>
        <div class="model-details">
          <span>
            <span class="model-detail-label">Status:</span> ${remainingPct}
          </span>
          <span class="reset-timer" data-reset="${model.resetTimestamp}">${resetStr}</span>
        </div>
      </div>
    `;
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Disposes the webview panel if it exists.
   */
  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }
}

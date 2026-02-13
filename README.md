# Antigravity Usage Monitor

Real-time AI model quota and usage monitoring for Google Antigravity IDE.

## Features

- 🚀 **Status Bar Icon**: Shows overall usage percentage (Green < 70%, Yellow < 90%, Red >= 90%)
- 📊 **Rich Tooltip**: Hover to see per-model usage breakdown and reset countdowns
- 📈 **Dashboard**: Click the status bar icon to open a detailed usage dashboard
- 🔔 **Notifications**: Get desktop alerts when quota runs low (configurable)

## Configuration

- `antigravity-usage.pollingInterval`: How often to check quotas (default: 30s)
- `antigravity-usage.warningThreshold`: Percentage for warning indicator (default: 70%)
- `antigravity-usage.criticalThreshold`: Percentage for critical indicator (default: 90%)
- `antigravity-usage.enableNotifications`: Enable desktop alerts (default: true)
- `antigravity-usage.enableMockData`: Use sample data for testing (default: false)

## Installation

1. Install the `.vsix` file manually via the Extensions view "..." menu -> "Install from VSIX..."
2. Or use F5 debugging to run from source.

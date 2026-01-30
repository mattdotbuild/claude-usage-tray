# Claude Usage Tray

A Windows system tray app that shows your Claude.ai Pro/Max plan usage at a glance.

![Tray Icon](https://img.shields.io/badge/status-working-green)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Quick glance usage** - Shows 5-hour session % remaining right in your system tray
- **Color-coded status**:
  - 🟢 Green: >50% remaining
  - 🟡 Yellow: 20-50% remaining
  - 🔴 Red: <20% remaining
- **Detailed tooltip** - Hover to see session stats, weekly stats, and reset time
- **Multiple accounts** - Switch between different Claude accounts
- **Auto-refresh** - Configurable refresh interval (1, 5, 10, or 15 minutes)
- **Auto-updates** - Automatically notifies you when new versions are available
- **Start on login** - Optionally launch when Windows starts
- **Easy login** - Sign in via browser, no manual cookie copying

## Installation

### Download (Recommended)

Download the latest installer from [Releases](https://github.com/mattdotbuild/claude-usage-tray/releases):
- **Setup exe** - One-click installer with Start Menu & Desktop shortcuts
- **Portable exe** - No installation required, just run

### Build from Source

```bash
git clone https://github.com/mattdotbuild/claude-usage-tray.git
cd claude-usage-tray
npm install
npm start
```

To build the installer:
```bash
npm run build
```

## First Run

1. The app will open a browser window to claude.ai
2. Sign in with your Claude account
3. The app automatically captures your session - that's it!

## Usage

### Tray Icon
- Shows your 5-hour session % remaining
- Color changes based on usage level

### Hover Tooltip
- Session usage % remaining/used
- Weekly usage % remaining/used
- Time until reset (e.g., "Resets in 2h 45m")

### Right-Click Menu
- **Refresh** - Manually update usage
- **Accounts** - Switch between accounts (if multiple)
- **Settings** - Open settings window
- **Check for Updates** - Manually check for app updates
- **Exit** - Close the app

### Settings Window
- **Show remaining percentage** - Toggle between showing remaining vs used
- **Refresh interval** - How often to auto-update (1-15 minutes)
- **Start on login** - Launch automatically when Windows starts
- **Accounts** - Manage multiple Claude accounts
  - Click an account to switch to it
  - Click the name to rename it
  - Click ✕ to remove it
  - Click "Add Account" to add another

## How It Works

This app uses Claude's web API to fetch your usage data. It requires a Claude Pro or Max subscription to show meaningful data.

**API Endpoints used:**
- `GET /api/organizations` - Get your organization ID
- `GET /api/organizations/{id}/usage` - Get usage statistics

## Security

- Your session keys are stored locally in your user data folder (`%APPDATA%\claude-usage-tray`)
- Keys never leave your machine except to authenticate with claude.ai
- All connections use HTTPS
- No analytics or telemetry

## Auto Updates

The app automatically checks for updates on startup. When a new version is available:
1. You'll see a dialog asking to download
2. After downloading, you can restart to install
3. Or manually check via right-click menu → "Check for Updates"

## Disclaimer

This is an unofficial tool and is not affiliated with Anthropic. It uses undocumented APIs that may change at any time. Use at your own risk.

## License

MIT License - see [LICENSE](LICENSE)

## Contributing

PRs welcome! Please open an issue first to discuss major changes.

## Acknowledgments

Inspired by [Claude Usage Tracker](https://github.com/hamed-elfayome/Claude-Usage-Tracker) for macOS.

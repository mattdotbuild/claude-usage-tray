# Claude Usage Tray

A Windows/macOS system tray app that shows your Claude.ai Pro/Max plan usage at a glance.

![Tray Icon](https://img.shields.io/badge/status-working-green)

## Features

- **Quick glance usage** - Shows 5-hour session % remaining right in your system tray
- **Color-coded status**:
  - 🟢 Green: >50% remaining
  - 🟡 Yellow: 20-50% remaining  
  - 🔴 Red: <20% remaining
- **Detailed tooltip** - Hover to see both session and weekly stats
- **Auto-refresh** - Updates every 5 minutes
- **Easy login** - Sign in via browser, no manual cookie copying

## Installation

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/mattdotbuild/claude-usage-tray.git
cd claude-usage-tray
npm install
npm start
```

### First Run

1. The app will open a browser window to claude.ai
2. Sign in with your Claude account
3. The app automatically captures your session - that's it!

## Usage

- **Tray icon** shows your 5-hour session % remaining
- **Hover** over the icon to see detailed stats (session + weekly)
- **Right-click** for menu:
  - **Refresh** - Manually update usage
  - **Set Session Key** - Re-authenticate
  - **Exit** - Close the app

## How It Works

This app uses Claude's web API to fetch your usage data. It requires a Claude Pro or Max subscription to show meaningful data.

**API Endpoints used:**
- `GET /api/organizations` - Get your organization ID
- `GET /api/organizations/{id}/usage` - Get usage statistics

## Security

- Your session key is stored locally in your user data folder (`%APPDATA%\claude-usage-tray` on Windows)
- The key never leaves your machine except to authenticate with claude.ai
- All connections use HTTPS
- No analytics or telemetry

## Disclaimer

This is an unofficial tool and is not affiliated with Anthropic. It uses undocumented APIs that may change at any time. Use at your own risk.

## License

MIT License - see [LICENSE](LICENSE)

## Contributing

PRs welcome! Please open an issue first to discuss major changes.

## Acknowledgments

Inspired by [Claude Usage Tracker](https://github.com/hamed-elfayome/Claude-Usage-Tracker) for macOS.

const { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain, session, dialog } = require('electron');
const path = require('path');
const { createCanvas } = require('canvas');
const { autoUpdater } = require('electron-updater');


let config;
const { getUsage, sendHeartbeat } = require('./api');

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

let tray = null;
let refreshInterval = null;
let settingsWindow = null;
let appIcon = null;
// Per-account heartbeat state: Map<accountIndex, { timeout, lastSent, pending }>
let heartbeatState = new Map();

// Capture all claude.ai cookies from Electron's session as a cookie header string
async function captureAllCookies() {
  try {
    const cookies = await session.defaultSession.cookies.get({ domain: '.claude.ai' });
    const cookies2 = await session.defaultSession.cookies.get({ domain: 'claude.ai' });
    const allCookies = new Map();
    for (const c of [...cookies, ...cookies2]) {
      allCookies.set(c.name, c.value);
    }
    if (allCookies.size === 0) return null;
    return Array.from(allCookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  } catch (e) {
    console.error('Failed to capture cookies:', e.message);
    return null;
  }
}

// Save captured cookies to an account and persist to config
function saveAccountCookies(accountIndex, cookieStr) {
  const accounts = config.get('accounts') || [];
  if (accounts[accountIndex]) {
    accounts[accountIndex].allCookies = cookieStr;
    config.set('accounts', accounts);
  }
}

// Build auth for API calls using stored per-account cookies
function buildAuth(account) {
  if (account.allCookies) {
    return { cookies: account.allCookies };
  }
  return account.sessionKey;
}

// Generate app icon (matches the settings page logo)
function createAppIcon() {
  const size = 256;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Navy background with rounded corners simulation (we'll use a circle for icon)
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#1e2a45');
  gradient.addColorStop(1, '#0f1729');

  // Draw rounded square background
  const radius = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Add subtle inner glow
  const innerGlow = ctx.createRadialGradient(size * 0.3, size * 0.3, 0, size * 0.5, size * 0.5, size * 0.7);
  innerGlow.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
  innerGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = innerGlow;
  ctx.fill();

  const cx = size / 2;
  const cy = size / 2;
  const gaugeRadius = size * 0.38;
  const strokeWidth = size * 0.06;

  // Draw gauge track (background circle)
  ctx.beginPath();
  ctx.arc(cx, cy, gaugeRadius, -Math.PI * 0.75, Math.PI * 0.75);
  ctx.strokeStyle = 'rgba(148, 180, 255, 0.2)';
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Draw gauge fill (amber arc) - about 70% filled
  ctx.beginPath();
  const startAngle = -Math.PI * 0.75;
  const endAngle = startAngle + (Math.PI * 1.5 * 0.7);
  ctx.arc(cx, cy, gaugeRadius, startAngle, endAngle);

  const gaugeGradient = ctx.createLinearGradient(0, 0, size, size);
  gaugeGradient.addColorStop(0, '#f59e0b');
  gaugeGradient.addColorStop(1, '#d97706');
  ctx.strokeStyle = gaugeGradient;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Draw lightning bolt in center
  ctx.save();
  const boltScale = size / 100;
  ctx.translate(cx - 14 * boltScale, cy - 24 * boltScale);
  ctx.scale(boltScale, boltScale);

  ctx.beginPath();
  // Lightning bolt path (scaled for center)
  ctx.moveTo(20, 0);
  ctx.lineTo(0, 28);
  ctx.lineTo(14, 28);
  ctx.lineTo(8, 48);
  ctx.lineTo(28, 18);
  ctx.lineTo(16, 18);
  ctx.lineTo(20, 0);
  ctx.closePath();

  const boltGradient = ctx.createLinearGradient(0, 0, 28 * boltScale, 48 * boltScale);
  boltGradient.addColorStop(0, '#fbbf24');
  boltGradient.addColorStop(1, '#f59e0b');
  ctx.fillStyle = boltGradient;
  ctx.fill();

  ctx.restore();

  const buffer = canvas.toBuffer('image/png');
  return nativeImage.createFromBuffer(buffer);
}

// Generate tray icon with single number
function createTrayIcon(percentage, showRemaining) {
  const size = 64;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Transparent background - no box
  ctx.clearRect(0, 0, size, size);

  // Color logic depends on display mode
  let color;
  if (showRemaining) {
    if (percentage < 20) {
      color = '#ff4444';
    } else if (percentage < 50) {
      color = '#ffcc00';
    } else {
      color = '#22ff55';
    }
  } else {
    if (percentage > 80) {
      color = '#ff4444';
    } else if (percentage > 50) {
      color = '#ffcc00';
    } else {
      color = '#22ff55';
    }
  }

  // Scale font to fill the icon
  const text = String(percentage);
  const fontSize = text.length <= 2 ? 64 : 42;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${fontSize}px Arial`;

  // Draw black outline for contrast against any taskbar color
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 6;
  ctx.strokeText(text, size / 2, size / 2 + 2);

  // Draw the number
  ctx.fillStyle = color;
  ctx.fillText(text, size / 2, size / 2 + 2);

  const buffer = canvas.toBuffer('image/png');
  return nativeImage.createFromBuffer(buffer);
}

// Create error icon
function createErrorIcon() {
  const size = 64;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#0f0f1a';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#888888';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 48px Arial';
  ctx.fillText('?', size / 2, size / 2 + 2);
  
  const buffer = canvas.toBuffer('image/png');
  return nativeImage.createFromBuffer(buffer);
}

// Attempt to silently refresh an expired session key
async function refreshSessionKey(accountIndex) {
  const accounts = config.get('accounts') || [];
  const account = accounts[accountIndex];
  if (!account) return null;

  console.log(`Session refresh: attempting silent refresh for account ${accountIndex}`);

  // Open a hidden window to claude.ai - if the user's auth is still valid,
  // the server will set a fresh sessionKey cookie automatically
  const hiddenWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  try {
    await hiddenWindow.loadURL('https://claude.ai');

    // Give the page a moment to settle and set cookies
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if we landed on the login page (session truly expired)
    const currentURL = hiddenWindow.webContents.getURL();
    if (currentURL.includes('/login')) {
      console.log('Session refresh: redirected to login page, session is truly expired');
      if (!hiddenWindow.isDestroyed()) hiddenWindow.close();
      return null;
    }

    const cookies = await session.defaultSession.cookies.get({
      domain: 'claude.ai',
      name: 'sessionKey'
    });

    if (cookies.length > 0 && cookies[0].value) {
      const newKey = cookies[0].value;

      // Capture ALL cookies and validate they work
      const cookieStr = await captureAllCookies();
      const auth = cookieStr ? { cookies: cookieStr } : newKey;
      try {
        await getUsage(auth);
      } catch (e) {
        console.log('Session refresh: got cookie but API call failed -', e.message);
        if (!hiddenWindow.isDestroyed()) hiddenWindow.close();
        return null;
      }

      console.log('Session refresh: got valid new session key');
      const freshAccounts = config.get('accounts') || [];
      freshAccounts[accountIndex].sessionKey = newKey;
      if (cookieStr) freshAccounts[accountIndex].allCookies = cookieStr;
      config.set('accounts', freshAccounts);

      if (!hiddenWindow.isDestroyed()) hiddenWindow.close();
      return newKey;
    }

    console.log('Session refresh: no cookie found');
    if (!hiddenWindow.isDestroyed()) hiddenWindow.close();
    return null;
  } catch (error) {
    console.error('Session refresh: failed -', error.message);
    if (!hiddenWindow.isDestroyed()) hiddenWindow.close();
    return null;
  }
}

// Manual session refresh triggered from tray menu
async function manualRefreshSession(accountIndex) {
  const accounts = config.get('accounts') || [];
  const label = accounts[accountIndex]?.name || accounts[accountIndex]?.orgName || `Account ${accountIndex + 1}`;

  tray.setImage(createErrorIcon());
  tray.setToolTip(`Claude Usage - Refreshing session for ${label}...`);

  const newKey = await refreshSessionKey(accountIndex);
  if (newKey) {
    console.log(`Manual refresh: success for ${label}`);
    updateTray();
  } else {
    console.log(`Manual refresh: failed for ${label}, opening login window`);
    tray.setToolTip('Claude Usage - Refresh failed, opening login...');
    // Silent refresh didn't work - open visible login window to update this account
    reloginAccount(accountIndex);
  }
}

// Get active account
function getActiveAccount() {
  const accounts = config.get('accounts') || [];
  return accounts.find(a => a.active) || accounts[0];
}

// Update tray with usage data
async function updateTray() {
  const account = getActiveAccount();
  const settings = config.get('settings') || {};
  const showRemaining = settings.showRemaining !== false;

  if (!account || !account.sessionKey) {
    tray.setImage(createErrorIcon());
    tray.setToolTip('Claude Usage - No account configured');
    return;
  }

  try {
    const auth = buildAuth(account);
    const usage = await getUsage(auth);

    // Display based on user preference
    const sessionDisplay = showRemaining ? usage.session : usage.sessionUsedPct;
    const weeklyDisplay = showRemaining ? usage.weekly : usage.weeklyUsedPct;
    const label = showRemaining ? 'remaining' : 'used';

    // Format reset times
    let resetText = '';
    if (usage.fiveHourResetsAt) {
      const resetDate = new Date(usage.fiveHourResetsAt);
      const now = new Date();
      const diffMs = resetDate - now;

      if (diffMs > 0) {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
          resetText = `\nResets in ${hours}h ${minutes}m`;
        } else {
          resetText = `\nResets in ${minutes}m`;
        }
      }
    }

    const icon = createTrayIcon(sessionDisplay, showRemaining);
    tray.setImage(icon);

    let heartbeatText = '';
    if (settings.heartbeatEnabled) {
      heartbeatText = '\nHeartbeat: Active';
    }

    tray.setToolTip(`Claude Usage${account.name ? ' - ' + account.name : ''}\nSession: ${sessionDisplay}% ${label}\nWeekly: ${weeklyDisplay}% ${label}${resetText}${heartbeatText}`);
  } catch (error) {
    console.error('Failed to fetch usage:', error.message);

    if (error.message === 'SESSION_EXPIRED') {
      // Try to silently refresh the session before showing error
      const accounts = config.get('accounts') || [];
      const accountIndex = accounts.findIndex(a => a === account || (a.sessionKey === account.sessionKey && a.active));

      if (accountIndex >= 0) {
        tray.setImage(createErrorIcon());
        tray.setToolTip('Claude Usage - Refreshing session...');

        const newKey = await refreshSessionKey(accountIndex);
        if (newKey) {
          // refreshSessionKey already validated the key works via getUsage,
          // so just re-run updateTray with the fresh account data
          console.log('Session auto-refreshed successfully');
          return updateTray();
        }
      }

      tray.setImage(createErrorIcon());
      tray.setToolTip('Claude Usage - Session expired! Right-click → Refresh Session or Settings to re-login.');
    } else {
      tray.setImage(createErrorIcon());
      tray.setToolTip(`Claude Usage - Error: ${error.message}`);
    }
  }
}

// Setup refresh interval
function setupRefreshInterval() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  const settings = config.get('settings') || {};
  const minutes = settings.refreshInterval || 5;
  refreshInterval = setInterval(updateTray, minutes * 60 * 1000);
}

// Schedule heartbeats for ALL accounts
function scheduleAllHeartbeats() {
  const settings = config.get('settings') || {};
  if (!settings.heartbeatEnabled) {
    clearAllHeartbeats();
    return;
  }

  const accounts = config.get('accounts') || [];
  accounts.forEach((account, index) => {
    if (!account.sessionKey) return;
    scheduleAccountHeartbeat(index, account);
  });
}

async function scheduleAccountHeartbeat(index, account) {
  const state = heartbeatState.get(index) || { timeout: null, lastSent: null, pending: false };

  // Don't reschedule if a heartbeat is already pending
  if (state.pending) return;

  const settings = config.get('settings') || {};
  if (!settings.heartbeatEnabled) return;

  try {
    const auth = buildAuth(account);
    const usage = await getUsage(auth);
    const now = Date.now();
    const label = account.name || account.orgName || `Account ${index + 1}`;

    if (state.timeout) {
      clearTimeout(state.timeout);
      state.timeout = null;
    }

    if (!usage.fiveHourResetsAt || new Date(usage.fiveHourResetsAt).getTime() <= now) {
      // Window expired - send heartbeat soon
      const minGap = 5 * 60 * 1000;
      const delay = (state.lastSent && (now - state.lastSent < minGap))
        ? minGap
        : 30 * 1000; // 30 seconds

      console.log(`Heartbeat [${label}]: window expired, sending in ${Math.round(delay / 1000)}s`);
      state.pending = true;
      state.timeout = setTimeout(() => performAccountHeartbeat(index), delay);
    } else {
      // Window active - schedule for after it expires (+2 min buffer)
      const resetTime = new Date(usage.fiveHourResetsAt).getTime();
      const delay = resetTime - now + (2 * 60 * 1000);
      console.log(`Heartbeat [${label}]: window active, scheduling in ${Math.round(delay / 60000)}m`);
      state.timeout = setTimeout(() => performAccountHeartbeat(index), delay);
    }

    heartbeatState.set(index, state);
  } catch (error) {
    const label = account.name || account.orgName || `Account ${index + 1}`;
    console.error(`Heartbeat [${label}]: failed to check usage -`, error.message);
  }
}

async function performAccountHeartbeat(index) {
  const accounts = config.get('accounts') || [];
  const account = accounts[index];
  if (!account || !account.sessionKey) return;

  const settings = config.get('settings') || {};
  if (!settings.heartbeatEnabled) return;

  const state = heartbeatState.get(index) || { timeout: null, lastSent: null, pending: false };
  state.pending = false;
  state.timeout = null;
  const label = account.name || account.orgName || `Account ${index + 1}`;

  try {
    const auth = buildAuth(account);
    console.log(`Heartbeat [${label}]: sending ping...`);
    await sendHeartbeat(auth);
    state.lastSent = Date.now();
    console.log(`Heartbeat [${label}]: success`);
    heartbeatState.set(index, state);

    // Refresh tray if this is the active account
    if (account.active) await updateTray();

    // Schedule next heartbeat for this account
    scheduleAccountHeartbeat(index, account);
  } catch (error) {
    console.error(`Heartbeat [${label}]: failed -`, error.message);

    if (error.message === 'SESSION_EXPIRED') {
      console.log(`Heartbeat [${label}]: attempting session refresh...`);
      const newKey = await refreshSessionKey(index);
      if (newKey) {
        console.log(`Heartbeat [${label}]: session refreshed, retrying heartbeat`);
        try {
          const refreshedAuth = buildAuth(accounts[index]);
          await sendHeartbeat(refreshedAuth);
          state.lastSent = Date.now();
          console.log(`Heartbeat [${label}]: success after refresh`);
          heartbeatState.set(index, state);
          const refreshedAccounts = config.get('accounts') || [];
          if (refreshedAccounts[index]?.active) await updateTray();
          scheduleAccountHeartbeat(index, refreshedAccounts[index]);
          return;
        } catch (retryError) {
          console.error(`Heartbeat [${label}]: retry after refresh also failed -`, retryError.message);
        }
      }
    }

    heartbeatState.set(index, state);
    // Retry in 5 minutes
    state.timeout = setTimeout(() => performAccountHeartbeat(index), 5 * 60 * 1000);
    heartbeatState.set(index, state);
  }
}

function clearAllHeartbeats() {
  for (const [, state] of heartbeatState) {
    if (state.timeout) clearTimeout(state.timeout);
  }
  heartbeatState.clear();
}

// Open login window to re-authenticate an existing account (updates in place)
async function reloginAccount(accountIndex) {
  // Clear claude.ai cookies so user can log in fresh
  try {
    const cookies = await session.defaultSession.cookies.get({ domain: 'claude.ai' });
    for (const cookie of cookies) {
      const url = `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
      await session.defaultSession.cookies.remove(url, cookie.name);
    }
  } catch (e) {
    console.error('Failed to clear cookies:', e);
  }

  const loginWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'Re-authenticate Claude Account',
    icon: appIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  loginWindow.setMenu(null);
  await loginWindow.loadURL('https://claude.ai/login');

  return new Promise((resolve) => {
    let resolved = false;

    const checkForCookie = async () => {
      if (resolved || loginWindow.isDestroyed()) return false;

      try {
        const cookies = await session.defaultSession.cookies.get({
          domain: 'claude.ai',
          name: 'sessionKey'
        });

        if (cookies.length > 0 && cookies[0].value) {
          resolved = true;
          const sessionKey = cookies[0].value;

          // Update the existing account in place with sessionKey + all cookies
          const accounts = config.get('accounts') || [];
          if (accounts[accountIndex]) {
            accounts[accountIndex].sessionKey = sessionKey;
            const cookieStr = await captureAllCookies();
            if (cookieStr) accounts[accountIndex].allCookies = cookieStr;

            // Try to refresh org name using stored cookies
            try {
              const auth = buildAuth(accounts[accountIndex]);
              const usage = await getUsage(auth);
              if (usage.raw && usage.raw.organization_name) {
                accounts[accountIndex].orgName = usage.raw.organization_name;
              }
            } catch (e) {
              console.error('reloginAccount: failed to get org info:', e.message);
            }

            config.set('accounts', accounts);
            console.log(`reloginAccount: updated account ${accountIndex} (${accounts[accountIndex].name || accounts[accountIndex].orgName})`);
          }

          if (!loginWindow.isDestroyed()) loginWindow.close();

          if (settingsWindow && !settingsWindow.isDestroyed()) {
            settingsWindow.webContents.send('accounts-updated', config.get('accounts') || []);
          }

          updateTray();
          resolve(sessionKey);
          return true;
        }
      } catch (e) {}
      return false;
    };

    loginWindow.webContents.on('did-navigate', () => setTimeout(checkForCookie, 1000));
    loginWindow.webContents.on('did-navigate-in-page', () => setTimeout(checkForCookie, 1000));

    const interval = setInterval(checkForCookie, 2000);

    loginWindow.on('closed', () => {
      clearInterval(interval);
      if (!resolved) resolve(null);
    });
  });
}

// Open login window for adding account
async function addAccount() {
  // Clear claude.ai cookies so user can log into a different account
  try {
    const cookies = await session.defaultSession.cookies.get({ domain: 'claude.ai' });
    for (const cookie of cookies) {
      const url = `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
      await session.defaultSession.cookies.remove(url, cookie.name);
    }
  } catch (e) {
    console.error('Failed to clear cookies:', e);
  }
  
  const loginWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'Sign in to Claude',
    icon: appIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  loginWindow.setMenu(null);
  await loginWindow.loadURL('https://claude.ai/login');
  
  return new Promise((resolve) => {
    let resolved = false;
    
    const checkForCookie = async () => {
      if (resolved || loginWindow.isDestroyed()) return false;
      
      try {
        const cookies = await session.defaultSession.cookies.get({ 
          domain: 'claude.ai', 
          name: 'sessionKey' 
        });
        
        if (cookies.length > 0 && cookies[0].value) {
          resolved = true;
          const sessionKey = cookies[0].value;
          
          // Capture all cookies for this account
          const cookieStr = await captureAllCookies();

          // Get org info for account name
          let orgName = 'Claude Account';
          try {
            const { getUsage } = require('./api');
            const auth = cookieStr ? { cookies: cookieStr } : sessionKey;
            const usage = await getUsage(auth);
            if (usage.raw && usage.raw.organization_name) {
              orgName = usage.raw.organization_name;
            }
          } catch (e) {
            console.error('addAccount: failed to get org info:', e.message);
          }

          // Add to accounts
          const accounts = config.get('accounts') || [];

          // Deactivate all other accounts
          accounts.forEach(a => a.active = false);

          // Add new account
          accounts.push({
            sessionKey,
            allCookies: cookieStr,
            name: '',
            orgName,
            active: true,
            addedAt: new Date().toISOString()
          });
          
          config.set('accounts', accounts);
          
          if (!loginWindow.isDestroyed()) loginWindow.close();
          
          // Notify settings window if open
          if (settingsWindow && !settingsWindow.isDestroyed()) {
            settingsWindow.webContents.send('accounts-updated', accounts);
          }
          
          updateTray();
          resolve(sessionKey);
          return true;
        }
      } catch (e) {}
      return false;
    };
    
    loginWindow.webContents.on('did-navigate', () => setTimeout(checkForCookie, 1000));
    loginWindow.webContents.on('did-navigate-in-page', () => setTimeout(checkForCookie, 1000));
    
    const interval = setInterval(checkForCookie, 2000);
    
    loginWindow.on('closed', () => {
      clearInterval(interval);
      if (!resolved) resolve(null);
    });
  });
}

// Open settings window
function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  
  settingsWindow = new BrowserWindow({
    width: 480,
    height: 600,
    resizable: false,
    title: 'Claude Usage - Settings',
    icon: appIcon,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  settingsWindow.setMenu(null);
  settingsWindow.loadFile('settings.html');
  
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// IPC Handlers
function setupIPC() {
  ipcMain.handle('get-settings', () => {
    return {
      showRemaining: config.get('settings')?.showRemaining !== false,
      refreshInterval: config.get('settings')?.refreshInterval || 5,
      startOnLogin: app.getLoginItemSettings().openAtLogin,
      heartbeatEnabled: config.get('settings')?.heartbeatEnabled || false,
      accounts: config.get('accounts') || []
    };
  });
  
  ipcMain.on('update-setting', (event, { key, value }) => {
    // Handle start on login separately (uses Electron API, not config)
    if (key === 'startOnLogin') {
      app.setLoginItemSettings({
        openAtLogin: value,
        path: app.getPath('exe')
      });
      return;
    }

    const settings = config.get('settings') || {};
    settings[key] = value;
    config.set('settings', settings);

    if (key === 'refreshInterval') {
      setupRefreshInterval();
    }

    if (key === 'heartbeatEnabled') {
      if (value) {
        scheduleAllHeartbeats();
      } else {
        clearAllHeartbeats();
      }
      updateTray();
    }

    // Refresh display immediately when changing display mode
    if (key === 'showRemaining') {
      updateTray();
    }
  });
  
  ipcMain.on('add-account', () => {
    addAccount();
  });
  
  ipcMain.on('set-active-account', (event, index) => {
    const accounts = config.get('accounts') || [];
    accounts.forEach((a, i) => a.active = (i === index));
    config.set('accounts', accounts);

    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('accounts-updated', accounts);
    }

    // Refresh context menu to show correct active account
    tray.setContextMenu(buildContextMenu());
    updateTray();
  });
  
  ipcMain.on('remove-account', (event, index) => {
    let accounts = config.get('accounts') || [];
    const wasActive = accounts[index]?.active;
    accounts.splice(index, 1);
    
    // If removed account was active, activate first remaining
    if (wasActive && accounts.length > 0) {
      accounts[0].active = true;
    }
    
    config.set('accounts', accounts);
    
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('accounts-updated', accounts);
    }
    
    updateTray();
  });
  
  ipcMain.on('rename-account', (event, { index, name }) => {
    const accounts = config.get('accounts') || [];
    if (accounts[index]) {
      accounts[index].name = name;
      config.set('accounts', accounts);

      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('accounts-updated', accounts);
      }

      updateTray();
    }
  });

}

// Build context menu
function buildContextMenu() {
  const account = getActiveAccount();
  const accounts = config.get('accounts') || [];
  
  const menuItems = [
    {
      label: 'Refresh',
      click: updateTray
    },
    {
      label: 'Refresh Session',
      click: async () => {
        const accounts = config.get('accounts') || [];
        const activeIndex = accounts.findIndex(a => a.active);
        if (activeIndex < 0 && accounts.length > 0) {
          // fallback to first account
          await manualRefreshSession(0);
        } else if (activeIndex >= 0) {
          await manualRefreshSession(activeIndex);
        }
      }
    },
    { type: 'separator' }
  ];
  
  // Show accounts submenu if multiple
  if (accounts.length > 1) {
    menuItems.push({
      label: 'Accounts',
      submenu: accounts.map((acc, i) => ({
        label: acc.name || acc.orgName || `Account ${i + 1}`,
        type: 'radio',
        checked: acc.active,
        click: () => {
          // Fetch fresh accounts from config to avoid stale data
          const freshAccounts = config.get('accounts') || [];
          freshAccounts.forEach((a, j) => a.active = (j === i));
          config.set('accounts', freshAccounts);

          // Notify settings window if open
          if (settingsWindow && !settingsWindow.isDestroyed()) {
            settingsWindow.webContents.send('accounts-updated', freshAccounts);
          }

          // Refresh context menu to show correct active account
          tray.setContextMenu(buildContextMenu());
          updateTray();
        }
      }))
    });
  }
  
  menuItems.push(
    {
      label: 'Settings',
      click: openSettings
    },
    { type: 'separator' }
  );

  // Only show update option in packaged app
  if (app.isPackaged) {
    menuItems.push({
      label: 'Check for Updates',
      click: () => {
        autoUpdater.checkForUpdates().then(result => {
          if (!result || !result.updateInfo || result.updateInfo.version === app.getVersion()) {
            dialog.showMessageBox({
              type: 'info',
              title: 'No Updates',
              message: `You're running the latest version (${app.getVersion()}).`,
              buttons: ['OK']
            });
          }
        }).catch(err => {
          dialog.showMessageBox({
            type: 'error',
            title: 'Update Check Failed',
            message: 'Could not check for updates. Please try again later.',
            buttons: ['OK']
          });
        });
      }
    });
  }

  menuItems.push(
    {
      label: 'Exit',
      click: () => app.quit()
    }
  );
  
  return Menu.buildFromTemplate(menuItems);
}

// App ready
app.whenReady().then(async () => {
  config = require('./config');
  appIcon = createAppIcon();
  setupIPC();
  
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
  
  tray = new Tray(createErrorIcon());
  tray.setToolTip('Claude Usage - Loading...');
  tray.setContextMenu(buildContextMenu());
  
  // Update menu when clicked (to refresh account list)
  tray.on('right-click', () => {
    tray.setContextMenu(buildContextMenu());
  });
  
  // Check if any account exists
  const accounts = config.get('accounts') || [];
  
  // Migrate old single sessionKey to accounts array
  const oldSessionKey = config.get('sessionKey');
  if (oldSessionKey && accounts.length === 0) {
    accounts.push({
      sessionKey: oldSessionKey,
      name: '',
      orgName: 'Claude Account',
      active: true,
      addedAt: new Date().toISOString()
    });
    config.set('accounts', accounts);
    config.set('sessionKey', null);
  }
  
  if (accounts.length === 0) {
    await addAccount();
  }
  
  await updateTray();
  setupRefreshInterval();
  scheduleAllHeartbeats();

  // Setup auto-updater
  setupAutoUpdater();
});

// Auto-updater setup
function setupAutoUpdater() {
  // Don't check for updates in development
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available. Would you like to download it now?`,
      buttons: ['Download', 'Later'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded. Restart now to install?`,
      buttons: ['Restart', 'Later'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
  });

  // Check for updates on startup (after a short delay)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.error('Update check failed:', err);
    });
  }, 5000);
}

app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  clearAllHeartbeats();
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

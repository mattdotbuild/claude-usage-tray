const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getConfigPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'config.json');
}

function loadConfig() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return {};
}

function saveConfig(config) {
  try {
    const configPath = getConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

function get(key) {
  const config = loadConfig();
  return config[key];
}

function set(key, value) {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

module.exports = { get, set, loadConfig, saveConfig };

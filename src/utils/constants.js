const path = require('path');
const os = require('os');

const PORT = 3035;
const CONFIG_DIR = path.join(os.homedir(), '.project-cli');
const APPS_FILE = path.join(CONFIG_DIR, 'projects.json');
const PM2_CONFIG = path.join(CONFIG_DIR, 'ecosystem.config.js');
const APP_CONFIG = path.join(CONFIG_DIR, 'config.json');
const ECOSYSTEMS_DIR = path.join(CONFIG_DIR, 'ecosystems');
const UPLOADS_DIR = path.join(CONFIG_DIR, 'uploads');

module.exports = {
  PORT,
  CONFIG_DIR,
  APPS_FILE,
  PM2_CONFIG,
  APP_CONFIG,
  ECOSYSTEMS_DIR,
  UPLOADS_DIR
};

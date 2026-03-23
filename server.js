#!/usr/bin/env node

const http = require('http');
const express = require('express');
const fs = require('fs');
const { execSync } = require('child_process');

const { PORT, CONFIG_DIR, ECOSYSTEMS_DIR } = require('./src/utils/constants');
const { createApp } = require('./src/app');

if (process.argv.includes('end') || process.argv.includes('stop')) {
  console.log('🛑 Stopping Project CLI Dashboard...');
  try {
    const currentPid = process.pid;
    const output = execSync(`pgrep -f "node.*server.js"`, { stdio: 'pipe' }).toString();
    const pids = output.split('\n').map(p => p.trim()).filter(p => p && p != currentPid);
    if (pids.length > 0) {
      pids.forEach(pid => {
        try { process.kill(pid, 'SIGTERM'); console.log(`Stopping process ${pid}...`); } catch(e) {}
      });
      console.log('✅ Dashboard stopped.');
    } else {
      console.log('Dashboard is not running.');
    }
  } catch (e) {
    console.log('Dashboard is not running.');
  }
  process.exit(0);
}

if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
if (!fs.existsSync(ECOSYSTEMS_DIR)) fs.mkdirSync(ECOSYSTEMS_DIR, { recursive: true });

// Auto-free port 3035 before starting
if (!process.argv.includes('end') && !process.argv.includes('stop')) {
  try {
    const output = execSync(`lsof -t -i:${PORT}`, { stdio: 'pipe' }).toString().trim();
    if (output) {
      const pids = output.split('\n');
      pids.forEach(pid => {
        if (parseInt(pid) !== process.pid) {
          try { execSync(`kill -9 ${pid}`); console.log(`Freeing port ${PORT} (killed ${pid})...`); } catch(e) {}
        }
      });
    }
  } catch (e) {}
}

// Mount the application onto the server
const { server } = createApp();

// ─── Start Server ───
server.listen(PORT, () => {
  const dest = `http://localhost:${PORT}/`;
  console.log(`\n🚀 Project CLI Dashboard: ${dest}`);
  try {
    if (process.platform === 'darwin') execSync(`open ${dest}`);
    else if (process.platform === 'win32') execSync(`start ${dest}`);
    else execSync(`xdg-open ${dest}`);
  } catch {}
});

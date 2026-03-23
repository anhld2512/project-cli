const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { APPS_FILE, ECOSYSTEMS_DIR, PM2_CONFIG } = require('../utils/constants');

function pm2Available() {
  try { execSync('pm2 -v', { stdio: 'pipe' }); return true; } catch { return false; }
}

function getPm2Status() {
  if (!pm2Available()) return [];
  try { return JSON.parse(execSync('pm2 jlist', { stdio: 'pipe' }).toString()); } catch { return []; }
}

function loadApps() {
  if (!fs.existsSync(APPS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(APPS_FILE, 'utf8')); } catch { return []; }
}

// Write per-project ecosystem file — each project has its own isolated config
function writeProjectEcosystem(a) {
  const ecoFile = path.join(ECOSYSTEMS_DIR, `${a.name}.config.js`);
  
  const envObj = Object.assign({}, a.env || {});
  const otelPath = path.resolve(__dirname, '../apm-stack/instrumentation.js');
  if (fs.existsSync(otelPath)) {
    if (!envObj.NODE_OPTIONS || !envObj.NODE_OPTIONS.includes(otelPath)) {
      envObj.NODE_OPTIONS = `${envObj.NODE_OPTIONS || ''} --require ${otelPath}`.trim();
    }
  }
  const rubyOtelPath = path.resolve(__dirname, '../apm-stack/ruby_instrumentation.rb');
  if (fs.existsSync(rubyOtelPath)) {
    if (!envObj.RUBYOPT || !envObj.RUBYOPT.includes(rubyOtelPath)) {
      envObj.RUBYOPT = `${envObj.RUBYOPT || ''} -r${rubyOtelPath}`.trim();
    }
    envObj.OTEL_SERVICE_NAME = a.name;
  }
  const env = JSON.stringify(envObj);
  const script = a.script || 'npm';
  const args = a.args || 'run dev';

  let js = `module.exports = {\n  apps: [\n    {\n`;
  js += `      name: '${a.name}',\n`;
  js += `      cwd: '${a.cwd}',\n`;
  js += `      script: '${script}',\n`;
  js += `      args: ${Array.isArray(args) ? JSON.stringify(args) : `'${args}'`},\n`;
  js += `      env: ${env},\n`;
  js += `      autorestart: ${a.autorestart !== false},\n`;
  js += `      watch: ${a.watch === true},\n`;
  js += `      exec_mode: '${a.exec_mode || 'fork'}',\n`;
  js += `      instances: ${a.instances || 1}`;
  if (a.max_memory_restart) js += `,\n      max_memory_restart: '${a.max_memory_restart}'`;
  if (a.kill_timeout) js += `,\n      kill_timeout: ${parseInt(a.kill_timeout) || 3000}`;
  if (a.restart_delay) js += `,\n      restart_delay: ${parseInt(a.restart_delay) || 0}`;
  js += `\n    }\n  ]\n};\n`;
  fs.writeFileSync(ecoFile, js);
  return ecoFile;
}

function saveApps(apps) {
  fs.writeFileSync(APPS_FILE, JSON.stringify(apps, null, 2));
  apps.forEach(a => writeProjectEcosystem(a));
  
  let js = 'module.exports = {\n  apps: [\n';
  apps.forEach(a => {
    const e = Object.assign({}, a.env || {});
    const otelPath = path.resolve(__dirname, '../apm-stack/instrumentation.js');
    if (fs.existsSync(otelPath) && (!e.NODE_OPTIONS || !e.NODE_OPTIONS.includes(otelPath))) {
      e.NODE_OPTIONS = `${e.NODE_OPTIONS || ''} --require ${otelPath}`.trim();
    }
    const rubyOtelPath = path.resolve(__dirname, '../apm-stack/ruby_instrumentation.rb');
    if (fs.existsSync(rubyOtelPath) && (!e.RUBYOPT || !e.RUBYOPT.includes(rubyOtelPath))) {
      e.RUBYOPT = `${e.RUBYOPT || ''} -r${rubyOtelPath}`.trim();
      e.OTEL_SERVICE_NAME = a.name;
    }
    js += `    {\n      name: '${a.name}',\n      cwd: '${a.cwd}',\n      script: '${a.script||'npm'}',\n      args: '${a.args||'run dev'}',\n      env: ${JSON.stringify(e)},\n      autorestart: ${a.autorestart!==false},\n      watch: ${a.watch===true},\n      exec_mode: '${a.exec_mode||'fork'}',\n      instances: ${a.instances||1}`;
    if (a.max_memory_restart) js += `,\n      max_memory_restart: '${a.max_memory_restart}'`;
    if (a.kill_timeout) js += `,\n      kill_timeout: ${parseInt(a.kill_timeout)||3000}`;
    if (a.restart_delay) js += `,\n      restart_delay: ${parseInt(a.restart_delay)||0}`;
    js += `\n    },\n`;
  });
  js += '  ]\n};\n';
  fs.writeFileSync(PM2_CONFIG, js);
}

function parseEcosystemContent(content) {
  const fn = new Function('module', 'exports', content);
  const mod = { exports: {} };
  fn(mod, mod.exports);
  return mod.exports;
}

module.exports = {
  pm2Available,
  getPm2Status,
  loadApps,
  saveApps,
  writeProjectEcosystem,
  parseEcosystemContent
};

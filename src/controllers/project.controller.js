const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { pm2Available, getPm2Status, loadApps, saveApps, writeProjectEcosystem, parseEcosystemContent } = require('../services/pm2.service');
const { broadcast } = require('../services/socket.service');
const { ECOSYSTEMS_DIR, PM2_CONFIG, CONFIG_DIR } = require('../utils/constants');

function getProjects(req, res) {
  const pm2 = getPm2Status();
  res.json(loadApps().map(a => {
    const p = pm2.find(x => x.name === a.name);
    return { 
      ...a, 
      status: p?.pm2_env?.status||'stopped', 
      pid: p?.pid||null, 
      memory: p?.monit?.memory||0, 
      cpu: p?.monit?.cpu||0, 
      uptime: p?.pm2_env?.pm_uptime||0, 
      restarts: p?.pm2_env?.restart_time||0 
    };
  }));
}

function updateProject(req, res) {
  const a = req.body;
  if (!a.name || !a.cwd) return res.status(400).json({ error: 'name and cwd required' });
  const apps = loadApps();
  const i = apps.findIndex(x => x.name === a.name);
  if (i >= 0) apps[i] = { ...apps[i], ...a }; else apps.push(a);
  saveApps(apps);
  broadcast(JSON.stringify({ type: 'refresh' }));
  res.json({ success: true });
}

function deleteProject(req, res) {
  const name = req.params.name;
  saveApps(loadApps().filter(a => a.name !== name));
  const ecoFile = path.join(ECOSYSTEMS_DIR, `${name}.config.js`);
  if (fs.existsSync(ecoFile)) try { fs.unlinkSync(ecoFile); } catch {}
  try { execSync(`pm2 delete "${name}"`, { stdio: 'ignore' }); } catch {}
  broadcast(JSON.stringify({ type: 'refresh' }));
  res.json({ success: true });
}

function handleAction(req, res) {
  const { action, name } = req.body;
  if (!pm2Available()) return res.status(500).json({ error: 'PM2 not found. Install: npm install -g pm2' });
  try {
    if (action === 'start-all') {
      execSync(`pm2 start "${PM2_CONFIG}"`, { stdio: 'ignore' });
    } else if (action === 'stop-all') {
      execSync('pm2 stop all', { stdio: 'ignore' });
    } else if (action === 'start') {
      const ecoFile = path.join(ECOSYSTEMS_DIR, `${name}.config.js`);
      const apps = loadApps();
      const proj = apps.find(a => a.name === name);
      if (!proj) return res.status(404).json({ error: `Project "${name}" not found in config` });
      writeProjectEcosystem(proj);
      execSync(`pm2 start "${ecoFile}" --update-env`, { stdio: 'ignore' });
    } else if (action === 'stop') {
      execSync(`pm2 stop "${name}"`, { stdio: 'ignore' });
    } else if (action === 'restart') {
      const apps = loadApps();
      const proj = apps.find(a => a.name === name);
      if (proj) writeProjectEcosystem(proj);
      execSync(`pm2 restart "${name}" --update-env`, { stdio: 'ignore' });
    } else if (action === 'restart-all') {
      execSync('pm2 restart all', { stdio: 'ignore' });
    } else {
      return res.status(400).json({ error: `Unknown action: ${action}` });
    }
    broadcast(JSON.stringify({ type: 'refresh' }));
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
}

function resetAll(req, res) {
  if (pm2Available()) try { execSync('pm2 stop all && pm2 delete all', { stdio: 'ignore' }); } catch {}
  fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
  broadcast(JSON.stringify({ type: 'reset' }));
  setTimeout(() => process.exit(0), 500);
  res.json({ success: true });
}

// OS Config & Editor Routes
function getProjectEcosystem(req, res) {
  const ecoFile = path.join(ECOSYSTEMS_DIR, `${req.params.name}.config.js`);
  res.json({ content: fs.existsSync(ecoFile) ? fs.readFileSync(ecoFile, 'utf8') : '' });
}

function updateProjectEcosystem(req, res) {
  const name = req.params.name;
  const apps = loadApps();
  const projectIndex = apps.findIndex(a => a.name === name);
  if (projectIndex < 0) return res.status(404).json({ error: 'Project not found' });
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'No content provided' });

  const ecoFile = path.join(ECOSYSTEMS_DIR, `${name}.config.js`);
  fs.writeFileSync(ecoFile, content);

  try {
    const eco = parseEcosystemContent(content);
    if (eco && eco.apps && eco.apps.length > 0) {
      const appCfg = eco.apps.find(a => a.name === name) || eco.apps[0];
      const fields = ['script','args','cwd','env','autorestart','watch','exec_mode','instances','max_memory_restart','kill_timeout','restart_delay','env_files'];
      fields.forEach(k => { if (appCfg[k] !== undefined) apps[projectIndex][k] = appCfg[k]; });
      saveApps(apps);
      broadcast(JSON.stringify({ type: 'refresh' }));
      return res.json({ success: true, merged: true });
    }
  } catch(e) {}

  res.json({ success: true, merged: false });
}

function uploadConfig(req, res) {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'No content provided' });
  try {
    const eco = parseEcosystemContent(content);
    if (!eco || !eco.apps || !Array.isArray(eco.apps)) {
      return res.status(400).json({ error: 'Invalid format. Expected: module.exports = { apps: [...] }' });
    }
    const apps = loadApps();
    let imported = 0;
    eco.apps.forEach(appCfg => {
      if (!appCfg.name || !appCfg.cwd) return;
      const i = apps.findIndex(a => a.name === appCfg.name);
      const project = {
        name: appCfg.name, cwd: appCfg.cwd,
        script: appCfg.script || 'npm', args: appCfg.args || 'run dev',
        env: appCfg.env || {}, autorestart: appCfg.autorestart !== false,
        watch: appCfg.watch === true, exec_mode: appCfg.exec_mode || 'fork',
        instances: appCfg.instances || 1, type: 'Other', framework: 'Other',
      };
      if (appCfg.max_memory_restart) project.max_memory_restart = appCfg.max_memory_restart;
      if (appCfg.kill_timeout) project.kill_timeout = appCfg.kill_timeout;
      if (appCfg.restart_delay) project.restart_delay = appCfg.restart_delay;
      if (i >= 0) apps[i] = { ...apps[i], ...project }; else apps.push(project);
      imported++;
    });
    saveApps(apps);
    broadcast(JSON.stringify({ type: 'refresh' }));
    res.json({ success: true, imported });
  } catch(e) {
    res.status(400).json({ error: 'Parse error: ' + e.message });
  }
}

// CLI Config Tools
function getGlobalPm2Config(req, res) {
  res.json({ content: fs.existsSync(PM2_CONFIG) ? fs.readFileSync(PM2_CONFIG, 'utf8') : '' });
}

function getPm2Check(req, res) {
  res.json({ available: pm2Available() });
}

// Folder detection and configs
function detectProject(req, res) {
  const targetDir = req.query.path;
  if (!targetDir || !fs.existsSync(targetDir)) return res.json(null);
  let type = 'Other', framework = 'Other', script = 'npm', args = 'run dev', port = '', env_files = [];
  try {
    const files = fs.readdirSync(targetDir);
    if (files.includes('package.json')) {
      const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps['next']) { framework = 'Next.js'; type = 'Fullstack'; port = '3000'; }
      else if (deps['nuxt']) { framework = 'NuxtJS'; type = 'Frontend'; port = '3000'; }
      else if (deps['react-scripts']) { framework = 'React'; type = 'Frontend'; args = 'start'; port = '3000'; }
      else if (deps['vue']) { framework = 'Vue.js'; type = 'Frontend'; port = '8080'; }
      else if (deps['vite']) { framework = 'Vite'; type = 'Frontend'; port = '5173'; }
      else if (deps['@nestjs/core']) { framework = 'NestJS'; type = 'Backend'; args = 'run start:dev'; port = '3000'; }
      else if (deps['express']) { framework = 'Express'; type = 'Backend'; args = 'start'; port = '3000'; }
    } else if (files.includes('requirements.txt') || files.includes('manage.py')) {
      type = 'Backend'; script = 'python3';
      if (files.includes('manage.py')) { framework = 'Django'; args = 'manage.py runserver'; port = '8000'; }
      else { framework = 'Python'; args = 'main.py'; }
    } else if (files.includes('Gemfile')) {
      type = 'Backend'; script = 'bundle';
      const gem = fs.readFileSync(path.join(targetDir, 'Gemfile'), 'utf8');
      if (gem.includes('rails')) {
        framework = 'Rails'; args = 'exec rails s -p 3000'; port = '3000';
        const envCandidates = ['.env.development', '.env.local', '.env'];
        env_files = envCandidates.filter(f => files.includes(f));
        if (env_files.length === 0) env_files = ['.env.development']; 
      } else { framework = 'Ruby'; args = 'exec ruby main.rb'; }
    }
    res.json({ type, framework, script, args, port, env_files });
  } catch(e) { res.json(null); }
}

function scanEnvFiles(req, res) {
  const dir = req.query.path;
  if (!dir || !fs.existsSync(dir)) return res.json({ files: [] });
  try {
    const files = fs.readdirSync(dir).filter(f => /^\.env/.test(f)).sort();
    res.json({ files });
  } catch { res.json({ files: [] }); }
}

function parseEnvFile(req, res) {
  const { path: dir, file } = req.query;
  if (!dir || !file) return res.json({ vars: {} });
  try {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const vars = {};
    content.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const eq = line.indexOf('=');
      if (eq < 0) return;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (key) vars[key] = val;
    });
    res.json({ vars });
  } catch { res.json({ vars: {} }); }
}

function browse(req, res) {
  const browsePath = req.query.path || os.homedir();
  try {
    const d = fs.readdirSync(browsePath, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({ name: e.name, path: path.join(browsePath, e.name) }));
    res.json({ current: browsePath, parent: path.dirname(browsePath), dirs: d });
  } catch(e) { res.status(400).json({ error: e.message }); }
}

module.exports = {
  getProjects,
  updateProject,
  deleteProject,
  handleAction,
  resetAll,
  getProjectEcosystem,
  updateProjectEcosystem,
  uploadConfig,
  getGlobalPm2Config,
  getPm2Check,
  detectProject,
  scanEnvFiles,
  parseEnvFile,
  browse
};

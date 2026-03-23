const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { loadConfig, saveConfig, hashPwd, signJWT } = require('../utils/auth');

function isConfigured(req, res) {
  res.json({ configured: !!loadConfig() });
}

function setupInit(req, res) {
  if (loadConfig()) return res.status(409).json({ error: 'Already configured.' });
  const { username, password, orgName, cliName } = req.body;
  if (!username || !password || !orgName || !cliName) return res.status(400).json({ error: 'All fields required' });
  const { hash, salt } = hashPwd(password);
  saveConfig({ 
    username, 
    passwordHash: hash, 
    passwordSalt: salt, 
    jwtSecret: crypto.randomBytes(64).toString('hex'), 
    orgName, 
    cliName, 
    createdAt: new Date().toISOString() 
  });
  
  try {
    const pkgPath = path.join(__dirname, '../../package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      pkg.name = `@${orgName}/${cliName}`;
      pkg.bin = pkg.bin || {};
      const oldKey = Object.keys(pkg.bin).find(k => k !== 'da-ui');
      if (oldKey) delete pkg.bin[oldKey];
      pkg.bin[cliName] = './cli';
      pkg.scripts = pkg.scripts || {};
      if (oldKey && pkg.scripts[oldKey]) delete pkg.scripts[oldKey];
      pkg.scripts[cliName] = './cli';
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      execSync('npm link', { cwd: path.join(__dirname, '../../'), stdio: 'ignore' });
    }
  } catch(e) {}
  res.json({ success: true });
}

function login(req, res) {
  const { username, password } = req.body;
  const cfg = loadConfig();
  if (!cfg || username !== cfg.username || hashPwd(password, cfg.passwordSalt).hash !== cfg.passwordHash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ token: signJWT({ username }, cfg.jwtSecret) });
}

function getMe(req, res) {
  const cfg = loadConfig();
  res.json({ 
    username: cfg.username, 
    orgName: cfg.orgName, 
    cliName: cfg.cliName, 
    logoUrl: cfg.logoUrl,
    createdAt: cfg.createdAt 
  });
}

function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const cfg = loadConfig();
  if (hashPwd(currentPassword, cfg.passwordSalt).hash !== cfg.passwordHash) {
    return res.status(401).json({ error: 'Wrong current password' });
  }
  const h = hashPwd(newPassword);
  cfg.passwordHash = h.hash; 
  cfg.passwordSalt = h.salt; 
  cfg.jwtSecret = crypto.randomBytes(64).toString('hex');
  saveConfig(cfg);
  res.json({ success: true });
}

module.exports = {
  isConfigured,
  setupInit,
  login,
  getMe,
  changePassword
};

const fs = require('fs');
const crypto = require('crypto');
const { APP_CONFIG } = require('./constants');

function loadConfig() {
  if (!fs.existsSync(APP_CONFIG)) return null;
  try { return JSON.parse(fs.readFileSync(APP_CONFIG, 'utf8')); } catch { return null; }
}

function saveConfig(cfg) {
  fs.writeFileSync(APP_CONFIG, JSON.stringify(cfg, null, 2));
}

function b64url(str) { return Buffer.from(str).toString('base64url'); }

function signJWT(payload, secret, h = 168) {
  const h64 = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const b64 = b64url(JSON.stringify({ ...payload, exp: Date.now() + h * 3600000 }));
  const sig = crypto.createHmac('sha256', secret).update(h64+'.'+b64).digest('base64url');
  return h64+'.'+b64+'.'+sig;
}

function verifyJWT(token, secret) {
  if (!token) throw new Error('No token');
  const [h,b,s] = token.replace('Bearer ','').trim().split('.');
  if (!s || s !== crypto.createHmac('sha256', secret).update(h+'.'+b).digest('base64url')) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(b,'base64url').toString());
  if (payload.exp && Date.now() > payload.exp) throw new Error('Expired');
  return payload;
}

function hashPwd(pwd, salt = crypto.randomBytes(16).toString('hex')) {
  return { hash: crypto.createHmac('sha256', salt).update(pwd).digest('hex'), salt };
}

module.exports = {
  loadConfig,
  saveConfig,
  signJWT,
  verifyJWT,
  hashPwd
};

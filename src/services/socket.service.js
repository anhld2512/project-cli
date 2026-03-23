const { spawn } = require('child_process');
const { loadConfig, verifyJWT } = require('../utils/auth');
const { pm2Available } = require('./pm2.service');

let wsInstance = null;
let logProcess = null;

function setWsInstance(inst) {
  wsInstance = inst;
}

function broadcast(msg) {
  if (!wsInstance) return;
  wsInstance.getWss().clients.forEach(c => {
    if (c.readyState === 1) c.send(msg);
  });
}

function setupWebSocketRoutes(app) {
  app.ws('/', (ws, req) => {
    const token = req.query.token;
    const cfg = loadConfig();
    if (cfg) {
      try { verifyJWT(token, cfg.jwtSecret); } catch { ws.close(); return; }
    }

    const pty = spawn(process.env.SHELL || '/bin/zsh', [], { env: {...process.env, TERM:'xterm'}, stdio: ['pipe','pipe','pipe'] });
    pty.stdout.on('data', d => ws.send(JSON.stringify({ type:'terminal', data:d.toString() })));
    pty.stderr.on('data', d => ws.send(JSON.stringify({ type:'terminal', data:d.toString() })));
    pty.on('exit', () => ws.send(JSON.stringify({ type:'terminal', data:'\r\n[exited]\r\n' })));

    ws.on('message', m => {
      try {
        const msg = JSON.parse(m);
        if (msg.type === 'terminal_input') pty.stdin.write(msg.data);
        else if (msg.type === 'subscribe_project_logs') {
          if (ws.plog) { ws.plog.kill(); delete ws.plog; }
          if (msg.project) {
            ws.plog = spawn('pm2', ['logs', msg.project, '--raw', '--lines', '50'], { stdio: ['ignore','pipe','pipe'] });
            const emit = d => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'project_log', project: msg.project, data: d.toString() })); };
            ws.plog.stdout.on('data', emit);
            ws.plog.stderr.on('data', emit);
          }
        }
      } catch { try { pty.stdin.write(m); } catch {} }
    });
    ws.on('close', () => { pty.kill(); if (ws.plog) ws.plog.kill(); });

    if (!logProcess && pm2Available()) {
      logProcess = spawn('pm2', ['logs','--raw','--lines','0'], { stdio: ['ignore','pipe','pipe'] });
      const emit = d => broadcast(JSON.stringify({ type:'log', data:d.toString() }));
      logProcess.stdout.on('data', emit);
      logProcess.stderr.on('data', emit);
      logProcess.on('exit', () => { logProcess = null; });
    }
  });

  setInterval(() => broadcast(JSON.stringify({ type: 'refresh' })), 4000);
}

module.exports = {
  setWsInstance,
  broadcast,
  setupWebSocketRoutes
};

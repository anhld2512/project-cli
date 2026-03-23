const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { pm2Available } = require('../services/pm2.service');
const { broadcast } = require('../services/socket.service');

function cleanRam(req, res) {
  if (!pm2Available()) return res.status(500).json({ error: 'PM2 not found' });
  try {
    const { type } = req.body;
    if (type === 'reload') {
      execSync('pm2 reload all', { stdio: 'ignore' });
    } else if (type === 'flush') {
      execSync('pm2 flush', { stdio: 'ignore' });
    }
    broadcast(JSON.stringify({ type: 'refresh' }));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function getProcesses(req, res) {
  try {
    // macOS ps command to read all user processes
    const output = execSync('ps -axm -o pid,rss,comm').toString();
    const lines = output.split('\n').slice(1).filter(Boolean);
    const groups = {};

    lines.forEach(line => {
      const parts = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (!parts) return;
      const pid = parseInt(parts[1]);
      const rssKb = parseInt(parts[2]);
      if (rssKb === 0) return;
      let rawName = parts[3];
      const appMatch = rawName.match(/\/([^/]+)\.app\//);
      let name = appMatch ? appMatch[1] : require('path').basename(rawName.split(' ')[0]);
      
      // Filter out absolute core system binaries that should never be listed
      const ignoreList = [
        'kernel_task', 'launchd', 'WindowServer', 'Antigravity', 'mds_stores', 'mdworker_shared',
        'AppleSpell', 'com.apple.geod', 'Siri', 'suggestd', 'assistantd', 'homed', 'routined',
        'trustd', 'donotdisturbd', 'secinitd', 'screencaptureui', 'Finder', 'ContextStoreAgent',
        'UIKitSystem', 'cloudd', 'distnoted', 'ControlCenter', 'Dock', 'knowledge-agent',
        'Software Update', 'chronod', 'airportd', 'Keychain Circle Notification', 'dataaccessd',
        'remindd', 'audioaccessoryd', 'nsurlsessiond', 'itunescloudd', 'proactived', 'CursorUIViewService',
        'WindowManager', 'coreaudiod', 'loginwindow', 'SystemUIServer', 'PM2'
      ];
      
      if (pid === process.pid || ignoreList.includes(name)) return;
      
      if (!groups[name]) groups[name] = { name, rss: 0, pids: [] };
      groups[name].rss += rssKb;
      groups[name].pids.push(pid);
    });
    
    const procs = Object.values(groups).sort((a,b) => b.rss - a.rss).slice(0, 5);
    res.json(procs);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}

function killProcess(req, res) {
  try {
    const { pids } = req.body;
    if (Array.isArray(pids) && pids.length > 0) {
      execSync(`kill -9 ${pids.join(' ')}`, { stdio: 'ignore' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function getSystemInfo(req, res) {
  let usedMem = os.totalmem() - os.freemem();
  if (os.platform() === 'darwin') {
    try {
      const vmstat = execSync('vm_stat').toString();
      const psMatch = vmstat.match(/page size of (\d+) bytes/);
      const pageSize = psMatch ? parseInt(psMatch[1]) : 4096;
      const matchA = vmstat.match(/Pages active:\s+(\d+)/);
      const matchW = vmstat.match(/Pages wired down:\s+(\d+)/);
      const matchC = vmstat.match(/Pages occupied by compressor:\s+(\d+)/);
      let pages = 0;
      if (matchA) pages += parseInt(matchA[1]);
      if (matchW) pages += parseInt(matchW[1]);
      if (matchC) pages += parseInt(matchC[1]);
      if (pages > 0) usedMem = pages * pageSize;
    } catch(e) {}
  } else if (os.platform() === 'linux') {
    try {
      const meminfo = require('fs').readFileSync('/proc/meminfo', 'utf8');
      const memT = meminfo.match(/MemTotal:\s+(\d+)/);
      const memA = meminfo.match(/MemAvailable:\s+(\d+)/);
      if (memT && memA) usedMem = (parseInt(memT[1]) - parseInt(memA[1])) * 1024;
    } catch(e) {}
  }
  res.json({ 
    platform: os.platform(), 
    hostname: os.hostname(), 
    totalMem: os.totalmem(), 
    usedMem, 
    cpuCount: os.cpus().length 
  });
}

function cliTrace(req, res) {
  const data = req.body;
  if (!data || !data.project) return res.send("OK");
  broadcast(JSON.stringify({
    type: 'network_trace',
    project: data.project,
    method: data.method,
    path: data.path,
    status: data.status,
    time: data.time,
    size: data.size,
    id: "req_" + Date.now() + Math.floor(Math.random() * 1000)
  }));
  res.send('OK');
}

module.exports = {
  cleanRam,
  getProcesses,
  killProcess,
  getSystemInfo,
  cliTrace
};

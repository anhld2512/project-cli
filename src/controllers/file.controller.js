const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { UPLOADS_DIR } = require('../utils/constants');
const { loadConfig, saveConfig } = require('../utils/auth');

// Setup multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Strip accents and non-ASCII chars cleanly
    const ext = path.extname(file.originalname);
    const cleanBase = path.basename(file.originalname, ext)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accent combining marks
      .replace(/[^a-zA-Z0-9]/g, '-')  // replace non-alphanumeric with hyphen
      .replace(/-+/g, '-')             // collapse duplicate hyphens
      .replace(/^-+|-+$/g, '');        // trim hyphens
    
    cb(null, `${cleanBase || 'file'}-${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });

function handleFileUpload(req, res) {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const uploadedFiles = req.files.map(f => ({
    originalName: f.originalname,
    filename: f.filename,
    size: f.size,
    url: `/uploads/${f.filename}`,
    createdAt: new Date().toISOString()
  }));

  res.json({ success: true, data: uploadedFiles });
}

function getImages(req, res) {
  if (!fs.existsSync(UPLOADS_DIR)) {
    return res.json({ success: true, data: [] });
  }

  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    const data = files
      .filter(f => !f.startsWith('.'))
      .map(filename => {
        const filePath = path.join(UPLOADS_DIR, filename);
        const stats = fs.statSync(filePath);
        return {
          _id: filename,
          filename: filename,
          originalName: filename,
          url: `/uploads/${filename}`,
          size: stats.size,
          createdAt: stats.birthtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function deleteImage(req, res) {
  const filename = req.params.filename;
  if (!filename) return res.status(400).json({ error: 'Filename missing' });

  const filePath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      
      // If this file was the logo, remove it from config
      const cfg = loadConfig();
      if (cfg && cfg.logoUrl && cfg.logoUrl.includes(filename)) {
        cfg.logoUrl = null;
        saveConfig(cfg);
      }

      res.json({ success: true, message: 'File deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(404).json({ error: 'File not found' });
  }
}

function bulkDelete(req, res) {
  const { fileIds } = req.body;
  if (!Array.isArray(fileIds)) return res.status(400).json({ error: 'Invalid fileIds' });

  let deletedCount = 0;
  fileIds.forEach(filename => {
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        deletedCount++;
        
        // Wipe from logo config
        const cfg = loadConfig();
        if (cfg && cfg.logoUrl && cfg.logoUrl.includes(filename)) {
          cfg.logoUrl = null;
          saveConfig(cfg);
        }
      } catch (e) {}
    }
  });

  res.json({ success: true, deletedCount });
}

function updateAppSettingLogo(req, res) {
  const { logoUrl } = req.body;
  const cfg = loadConfig();
  if (!cfg) return res.status(503).json({ error: 'Not configured' });
  
  cfg.logoUrl = logoUrl;
  saveConfig(cfg);
  
  // Need broadcast to refresh clients
  const { broadcast } = require('../services/socket.service');
  broadcast(JSON.stringify({ type: 'refresh' }));

  res.json({ success: true });
}

module.exports = {
  upload: upload.array('images'),
  handleFileUpload,
  getImages,
  deleteImage,
  bulkDelete,
  updateAppSettingLogo
};

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');

const authController = require('../controllers/auth.controller');
const projectController = require('../controllers/project.controller');
const systemController = require('../controllers/system.controller');
const fileController = require('../controllers/file.controller');

// Public
router.get('/is-configured', authController.isConfigured);
router.post('/setup-init', authController.setupInit);
router.post('/login', authController.login);

// Protected Middleware
router.use('/', authMiddleware);

// Auth & User
router.get('/me', authController.getMe);
router.post('/change-password', authController.changePassword);

// System & RAM
router.post('/clean-ram', systemController.cleanRam);
router.get('/processes', systemController.getProcesses);
router.post('/kill-process', systemController.killProcess);
router.get('/system', systemController.getSystemInfo);

// PM2 Dashboard Data
router.get('/projects', projectController.getProjects);
router.post('/projects', projectController.updateProject);
router.delete('/projects/:name', projectController.deleteProject);
router.post('/action', projectController.handleAction);
router.post('/reset-all', projectController.resetAll);

// PM2 Config Tools
router.get('/pm2-check', projectController.getPm2Check);
router.get('/pm2-config', projectController.getGlobalPm2Config);
router.get('/projects/:name/ecosystem', projectController.getProjectEcosystem);
router.post('/projects/:name/ecosystem', projectController.updateProjectEcosystem);
router.post('/upload-config', projectController.uploadConfig);

// Config update (Logo)
router.post('/settings/logo', fileController.updateAppSettingLogo);

// File Management
router.get('/images', fileController.getImages);
router.post('/file/upload-images', fileController.upload, fileController.handleFileUpload);
router.delete('/file/:filename', fileController.deleteImage);
router.post('/file/bulk-delete', fileController.bulkDelete);

// Folder & Environment Scanners
router.get('/detect', projectController.detectProject);
router.get('/scan-env-files', projectController.scanEnvFiles);
router.get('/parse-env-file', projectController.parseEnvFile);
router.get('/browse', projectController.browse);

module.exports = router;

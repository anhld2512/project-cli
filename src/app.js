const express = require('express');
const expressWs = require('express-ws');
const path = require('path');

const { setWsInstance, setupWebSocketRoutes } = require('./services/socket.service');
const { cliTrace } = require('./controllers/system.controller');
const { UPLOADS_DIR } = require('./utils/constants');

const webRoutes = require('./routes/web.routes');
const apiRoutes = require('./routes/api.routes');

const http = require('http');

function createApp() {
  const app = express();
  const server = http.createServer(app);
  
  // Set up Express-WS with existing server block
  const wsInstance = expressWs(app, server);
  setWsInstance(wsInstance);

  // Middlewares
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));
  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));

  // WebSockets
  setupWebSocketRoutes(app);

  // APM TRACE RECEIVER
  app.post('/cli-trace', express.json(), cliTrace);

  // Application Routes
  app.use('/', webRoutes);
  app.use('/api', apiRoutes);

  return { app, server };
}

module.exports = { createApp };

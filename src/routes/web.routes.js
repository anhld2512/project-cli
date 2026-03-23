const express = require('express');
const router = express.Router();
const { loadConfig } = require('../utils/auth');

router.get('/', (req, res) => {
  if (!loadConfig()) return res.redirect('/setup');
  res.render('login');
});

router.get('/setup', (req, res) => {
  if (loadConfig()) return res.redirect('/');
  res.render('setup');
});

router.get('/dashboard', (req, res) => {
  if (!loadConfig()) return res.redirect('/setup');
  res.render('index');
});

module.exports = router;

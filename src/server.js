const express = require('express');
const path = require('path');

function createServer({ isPlan = false } = {}) {
  const app = express();

  // Cache parsed data
  let cachedData = null;

  app.get('/api/data', async (req, res) => {
    try {
      if (!cachedData) {
        cachedData = await require('./parser').parseAllSessions();
      }
      // Strip out raw queries to prevent massive frontend JSON payload
      const safeData = {
        ...cachedData,
        sessions: cachedData.sessions.map(s => ({ ...s, queries: [] })),
        isPlan
      };
      res.json(safeData);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/session/:id', async (req, res) => {
    try {
      if (!cachedData) {
        cachedData = await require('./parser').parseAllSessions();
      }
      const session = cachedData.sessions.find(s => s.sessionId === req.params.id);
      if (session) {
        res.json(session);
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/refresh', async (req, res) => {
    try {
      delete require.cache[require.resolve('./parser')];
      cachedData = await require('./parser').parseAllSessions();
      res.json({ ok: true, sessions: cachedData.sessions.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Serve static dashboard
  app.use(express.static(path.join(__dirname, 'public')));

  return app;
}

module.exports = { createServer };

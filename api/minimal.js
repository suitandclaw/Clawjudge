/**
 * Minimal Railway Test Server
 * Testing if basic Express works without SQLite
 */

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

console.log('[STARTUP] Minimal test server starting...');
console.log('[STARTUP] PORT:', PORT);
console.log('[STARTUP] NODE_ENV:', process.env.NODE_ENV);

app.get('/health', (req, res) => {
  console.log('[HEALTH] Health check hit at', new Date().toISOString());
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ message: 'ClawJudge API is running', version: '0.1.0' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[STARTUP] Server running on 0.0.0.0:${PORT}`);
});

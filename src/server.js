'use strict';

require('dotenv').config();
const express        = require('express');
const fs             = require('fs');
const path           = require('path');
const cron           = require('node-cron');
const { runSync }    = require('./sync');
const { sendDigest } = require('./digest');
const { getSnapshotPath } = require('./paths');

const app = express();

// ── Basic Auth ────────────────────────────────────────────────────────────────
// Username field is ignored — only the password is checked.
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="LDGR"');
    return res.status(401).send('Unauthorized');
  }
  const decoded  = Buffer.from(auth.split(' ')[1], 'base64').toString();
  const password = decoded.slice(decoded.indexOf(':') + 1);
  if (password !== process.env.DASHBOARD_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="LDGR"');
    return res.status(401).send('Unauthorized');
  }
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
});

app.get('/snapshot', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(getSnapshotPath(), 'utf8'));
    res.json(data);
  } catch (_) {
    res.json({ status: 'no data yet' });
  }
});

app.use(express.json({ limit: '2mb' }));

// Import a snapshot directly (used to push backloaded history to Railway)
app.post('/snapshot/import', (req, res) => {
  try {
    const snapshotPath = getSnapshotPath();
    const incoming = req.body;
    if (!incoming?.netWorth?.current) return res.status(400).json({ error: 'invalid snapshot' });

    // Merge history: keep all unique dates, live entries win on conflict
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    } catch (_) {}

    const merged = Object.values(
      [...(incoming.netWorth.history || []), ...(existing.netWorth?.history || [])]
        .filter(h => h.date)
        .reduce((m, h) => { if (!m[h.date]) m[h.date] = h; return m; }, {})
    ).sort((a, b) => a.date.localeCompare(b.date)).slice(-260);

    const snapshot = { ...incoming, netWorth: { ...incoming.netWorth, history: merged } };
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    const tmp = snapshotPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
    fs.renameSync(tmp, snapshotPath);
    console.log('[import] snapshot imported, history entries:', merged.length);
    res.json({ ok: true, historyEntries: merged.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/sync', async (req, res) => {
  res.json({ status: 'sync started' });
  try {
    await runSync();
    console.log('[manual] sync complete');
  } catch (e) {
    console.log('[manual] sync error:', e.message);
  }
});

// ── Cron: Sunday 13:00 UTC = 8am EST / 9am EDT ───────────────────────────────
cron.schedule('0 13 * * 0', async () => {
  console.log('[cron] sync started');
  try {
    await runSync();
    console.log('[cron] sync complete');
    await sendDigest();
    console.log('[cron] digest sent');
  } catch (e) {
    console.log('[cron] error:', e.message);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LDGR running on port ${PORT}`);
  console.log('Cron registered: 0 13 * * 0 (Sunday 8am EST / 9am EDT)');
});

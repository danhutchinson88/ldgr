'use strict';

require('dotenv').config();
const express        = require('express');
const fs             = require('fs');
const path           = require('path');
const cron           = require('node-cron');
const { runSync }    = require('./sync');
const { sendDigest } = require('./digest');
const { getSnapshotPath }  = require('./paths');
const { getPlaidClient }   = require('./plaid-client');
const { Products, CountryCode } = require('plaid');

const app = express();
app.use(express.json({ limit: '2mb' }));

const REDIRECT_URI = () => process.env.PLAID_REDIRECT_URI || 'https://ldgr.up.railway.app/oauth-return';

// ── Policy pages (public) ─────────────────────────────────────────────────────
function policyPage(title, filePath) {
  return (req, res) => {
    const text = fs.readFileSync(filePath, 'utf8');
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} — LDGR</title>
<style>body{font-family:Georgia,serif;max-width:680px;margin:60px auto;padding:0 24px;color:#1C1A14;line-height:1.7;background:#FAF7F0}h1{font-size:18px;margin-bottom:32px}p{color:#3A3528;font-size:14px;margin:0 0 16px}a{color:#1C3F6E}</style>
</head><body><h1>${title}</h1>${text.split('\n').filter(Boolean).map(l => `<p>${l}</p>`).join('')}</body></html>`);
  };
}

app.get('/about', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>About — LDGR</title>
<style>body{font-family:Georgia,serif;max-width:600px;margin:60px auto;padding:0 24px;color:#1C1A14;line-height:1.7;background:#FAF7F0}h1{font-size:20px;margin-bottom:8px}p{color:#3A3528;font-size:14px;margin:0 0 14px}a{color:#1C3F6E}ul{color:#3A3528;font-size:14px;padding-left:20px}li{margin-bottom:4px}.label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6B6454;margin:24px 0 6px}</style>
</head><body>
  <h1>LDGR</h1>
  <p>A personal finance dashboard. Single-user, password-protected.</p>
  <p class="label">Data Access</p>
  <p>Retrieves account balances, transactions, and investment holdings from linked financial institutions via the Plaid API.</p>
  <p class="label">Policies</p>
  <ul>
    <li><a href="/privacy">Privacy Policy</a></li>
    <li><a href="/data-retention">Data Retention Policy</a></li>
  </ul>
  <p class="label">Source</p>
  <p><a href="https://github.com/danhutchinson88/ldgr">github.com/danhutchinson88/ldgr</a></p>
  <p class="label">Contact</p>
  <p>Daniel Hutchinson — danhutchinson88@gmail.com</p>
</body></html>`);
});

app.get('/privacy', policyPage('Privacy Policy',
  path.join(__dirname, '..', 'PRIVACY.md')));

app.get('/data-retention', policyPage('Data Retention Policy',
  path.join(__dirname, '..', 'DATA-RETENTION.md')));

// ── Plaid OAuth + linking (public — no auth required) ─────────────────────────
// These routes are used to link institutions via Plaid Link. They are public
// because Plaid redirects the user's browser here after OAuth. Access tokens
// never leave the server — they are logged to Railway's deployment logs only.

// OAuth return: Plaid redirects here after an OAuth-based institution login.
// Creates a fresh link token server-side; the client re-initializes Link with it
// plus receivedRedirectUri so Plaid can recover the OAuth session state.
app.get('/oauth-return', async (req, res) => {
  let linkToken = '';
  try {
    const plaid = getPlaidClient();
    const { data } = await plaid.linkTokenCreate({
      user:              { client_user_id: 'ldgr-user' },
      client_name:       'LDGR',
      products:          [Products.Transactions],
      optional_products: [Products.Investments],
      country_codes:     [CountryCode.Us],
      language:          'en',
      redirect_uri:      REDIRECT_URI(),
    });
    linkToken = data.link_token;
  } catch (e) {
    const msg = e.response?.data?.error_message || e.message;
    console.error('[oauth-return] link token creation failed:', msg);
    return res.status(500).send(`<p style="font-family:Georgia,serif;padding:40px">OAuth return failed: ${msg}</p>`);
  }

  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>LDGR — Connecting</title>
<script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
<style>body{font-family:Georgia,serif;background:#FAF7F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
p{color:#1C1A14;font-size:14px}.ok{color:#285E38}.err{color:#8B1A1A}</style>
</head><body>
<p id="msg">Completing institution connection…</p>
<script>
(function() {
  const token = ${JSON.stringify(linkToken)};
  const handler = Plaid.create({
    token,
    receivedRedirectUri: window.location.href,
    onSuccess: function(publicToken, metadata) {
      document.getElementById('msg').textContent = 'Exchanging token…';
      fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token: publicToken, institution: metadata.institution }),
      }).then(function(r) { return r.json(); }).then(function(d) {
        document.getElementById('msg').className = d.ok ? 'ok' : 'err';
        document.getElementById('msg').textContent = d.ok
          ? '✓ Connected. Check Railway logs for the access token env var.'
          : 'Exchange failed — check Railway logs.';
      });
    },
    onExit: function(err) {
      if (err) {
        document.getElementById('msg').className = 'err';
        document.getElementById('msg').textContent = err.display_message || err.error_code || 'Cancelled.';
      } else {
        document.getElementById('msg').textContent = 'Cancelled.';
      }
    },
  });
  handler.open();
})();
</script></body></html>`);
});

// Exchange public_token → access_token. Logs the env var to Railway logs.
// The token is never returned to the browser.
app.post('/api/plaid/exchange-token', async (req, res) => {
  const { public_token, institution } = req.body || {};
  if (!public_token) return res.status(400).json({ ok: false, error: 'missing public_token' });
  try {
    const plaid = getPlaidClient();
    const { data } = await plaid.itemPublicTokenExchange({ public_token });
    const instId  = (institution?.institution_id || institution?.name || 'UNKNOWN').toUpperCase().replace(/\s+/g, '_');
    console.log(`[link] connected: ${institution?.name || 'unknown'}`);
    console.log(`[link] add to Railway env vars: PLAID_TOKEN_${instId}=${data.access_token}`);
    res.json({ ok: true });
  } catch (e) {
    const msg = e.response?.data?.error_message || e.message;
    console.error('[link] exchange failed:', msg);
    res.status(500).json({ ok: false, error: msg });
  }
});

// Create a link token — used by oauth-return and link-server
app.post('/api/plaid/create-link-token', async (req, res) => {
  try {
    const plaid = getPlaidClient();
    const { data } = await plaid.linkTokenCreate({
      user:              { client_user_id: 'ldgr-user' },
      client_name:       'LDGR',
      products:          [Products.Transactions],
      optional_products: [Products.Investments],
      country_codes:     [CountryCode.Us],
      language:          'en',
      redirect_uri:      REDIRECT_URI(),
    });
    res.json({ link_token: data.link_token });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// ── Basic Auth ────────────────────────────────────────────────────────────────
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

// ── Protected routes ──────────────────────────────────────────────────────────
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

// Import a snapshot directly (used to push backloaded history to Railway)
app.post('/snapshot/import', (req, res) => {
  try {
    const snapshotPath = getSnapshotPath();
    const incoming = req.body;
    if (!incoming?.netWorth?.current) return res.status(400).json({ error: 'invalid snapshot' });

    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')); } catch (_) {}

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

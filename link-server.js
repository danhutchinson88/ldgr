// ─────────────────────────────────────────────────────────────────────────────
// LDGR — link-server.js
// Run ONCE per institution to get Plaid access tokens.
// Usage: npm run link → open http://localhost:3001
//
// Institution status:
//   Goldman Sachs (Marcus) — connected (production)
//   Chase                  — pending (OAuth approval under review)
//   American Express       — pending (OAuth approval under review)
//   Fidelity               — not supported via Plaid; use config/fidelity-manual.json
//
// For OAuth institutions (Chase, Amex): Plaid will redirect the browser to
// PLAID_REDIRECT_URI after the institution login. That page re-initializes Link
// and exchanges the token automatically. Check Railway logs for the env var.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const express = require('express');
const { PlaidApi, PlaidEnvironments, Configuration, Products, CountryCode } = require('plaid');

const app = express();
app.use(express.json());

const plaid = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET':    process.env.PLAID_SECRET,
    },
  },
}));

const REDIRECT_URI = process.env.PLAID_REDIRECT_URI || 'https://ldgr.up.railway.app/oauth-return';

app.post('/api/create-link-token', async (req, res) => {
  try {
    const { data } = await plaid.linkTokenCreate({
      user:              { client_user_id: 'ldgr-user' },
      client_name:       'LDGR',
      products:          [Products.Transactions],
      optional_products: [Products.Investments],
      country_codes:     [CountryCode.Us],
      language:          'en',
      redirect_uri:      REDIRECT_URI,
    });
    res.json({ link_token: data.link_token });
  } catch (e) {
    console.error('[link] create-link-token error:', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

app.post('/api/exchange-token', async (req, res) => {
  const { public_token, label } = req.body;
  try {
    const { data } = await plaid.itemPublicTokenExchange({ public_token });
    const envKey   = `PLAID_TOKEN_${label.toUpperCase().replace(/\s+/g, '_')}`;
    console.log(`\n✓ Connected: ${label}`);
    console.log(`  Add to .env and Railway env vars:`);
    console.log(`  ${envKey}=${data.access_token}\n`);
    res.json({ success: true });
  } catch (e) {
    console.error('[link] exchange-token error:', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

app.get('/', (_, res) => res.send(`<!DOCTYPE html><html>
<head><title>LDGR — Link</title>
<script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
<style>
  body{font-family:Georgia,serif;background:#F5F0E8;color:#1C1A14;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:20px}
  h1{font-size:20px;margin:0}p{color:#6B6454;font-size:13px;margin:0}
  select,button{padding:10px 20px;border-radius:6px;font-size:13px;font-family:Georgia,serif}
  select{background:#FAF7F0;border:1px solid #D8D0BC;color:#1C1A14;width:260px}
  button{background:#1C3F6E;color:#FAF7F0;border:none;cursor:pointer;letter-spacing:.03em}
  .status{font-family:monospace;font-size:11px;color:#6B6454}.ok{color:#2A6B3C}.err{color:#8B1A1A}
  .note{font-size:11px;color:#A39882;max-width:300px;text-align:center;line-height:1.5}
</style></head>
<body>
  <h1>LDGR — Account Link</h1>
  <p>Connect each institution once. Access tokens print in your terminal.</p>
  <select id="inst">
    <option value="amex">American Express</option>
    <option value="chase">Chase</option>
    <option value="goldman_sachs">Goldman Sachs (Marcus)</option>
    <option value="other">Other</option>
  </select>
  <button onclick="go()">Connect Account</button>
  <div id="status" class="status"></div>
  <p class="note">Fidelity is not supported via Plaid. Update config/fidelity-manual.json instead.</p>
  <p class="note">OAuth institutions (Amex, Chase) will redirect to Railway to complete. Check Railway logs for the token.</p>
<script>
  async function go() {
    const label = document.getElementById("inst").value;
    const el    = document.getElementById("status");
    el.className = "status";
    el.textContent = "Creating link token...";
    let link_token;
    try {
      const r1 = await fetch("/api/create-link-token", { method: "POST" });
      const d1 = await r1.json();
      if (d1.error) throw new Error(JSON.stringify(d1.error));
      link_token = d1.link_token;
    } catch(e) { el.className="status err"; el.textContent="Error: " + e.message; return; }

    Plaid.create({
      token: link_token,
      onSuccess: async (public_token) => {
        el.textContent = "Exchanging token...";
        const r2 = await fetch("/api/exchange-token", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token, label }),
        });
        const d2 = await r2.json();
        if (d2.success) { el.className="status ok"; el.textContent="✓ " + label + " connected — check terminal for token"; }
        else            { el.className="status err"; el.textContent="Error — check terminal"; }
      },
      onExit: (err) => {
        if (err) { el.className="status err"; el.textContent = err.display_message || err.error_code; }
        else     { el.textContent = "Cancelled."; }
      },
    }).open();
  }
</script>
</body></html>`));

app.listen(3001, () => {
  console.log('\nLDGR Link Server running on port 3001');
  console.log('→ Open http://localhost:3001');
  console.log('→ Available: Amex, Chase, Goldman Sachs (Marcus)');
  console.log('→ Fidelity: not supported via Plaid — use config/fidelity-manual.json');
  console.log(`→ OAuth redirect URI: ${REDIRECT_URI}`);
  console.log('→ For OAuth institutions: token appears in Railway logs after redirect\n');
});

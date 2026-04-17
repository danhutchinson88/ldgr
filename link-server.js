// ─────────────────────────────────────────────────────────────────────────────
// LDGR — link-server.js
// Run ONCE per institution to get Plaid access tokens
// Usage: node link-server.js → open http://localhost:3001
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();
const express = require("express");
const { PlaidApi, PlaidEnvironments, Configuration, Products, CountryCode } = require("plaid");

const app   = express();
app.use(express.json());

const plaid = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET":    process.env.PLAID_SECRET,
    },
  },
}));

app.post("/api/create-link-token", async (req, res) => {
  try {
    const { data } = await plaid.linkTokenCreate({
      user:          { client_user_id: "ldgr-user" },
      client_name:   "LDGR",
      products:      [Products.Transactions, Products.Investments],
      country_codes: [CountryCode.Us],
      language:      "en",
      redirect_uri:  "https://ldgr.up.railway.app/oauth-return",
    });
    res.json({ link_token: data.link_token });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

app.post("/api/exchange-token", async (req, res) => {
  const { public_token, label } = req.body;
  try {
    const { data } = await plaid.itemPublicTokenExchange({ public_token });
    // Print to terminal — copy to .env
    console.log(`\n✓ Connected: ${label}`);
    console.log(`  Add to .env:`);
    console.log(`  PLAID_TOKEN_${label.toUpperCase()}=${data.access_token}\n`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

app.get("/", (_, res) => res.send(`<!DOCTYPE html><html>
<head><title>LDGR — Link</title>
<script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
<style>
  body{font-family:Georgia,serif;background:#F5F0E8;color:#1C1A14;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:20px}
  h1{font-size:20px;margin:0}p{color:#6B6454;font-size:13px;margin:0}
  select,button{padding:10px 20px;border-radius:6px;font-size:13px;font-family:Georgia,serif}
  select{background:#FAF7F0;border:1px solid #D8D0BC;color:#1C1A14;width:260px}
  button{background:#1C3F6E;color:#FAF7F0;border:none;cursor:pointer;letter-spacing:.03em}
  .status{font-family:monospace;font-size:11px;color:#6B6454}.ok{color:#2A6B3C}.err{color:#8B1A1A}
</style></head>
<body>
  <h1>LDGR — Account Link</h1>
  <p>Connect each institution once. Access tokens print in your terminal.</p>
  <select id="inst">
    <option value="amex">American Express</option>
    <option value="chase">Chase</option>
    <option value="fidelity">Fidelity</option>
    <option value="goldman_sachs">Goldman Sachs (Marcus)</option>
    <option value="other">Other</option>
  </select>
  <button onclick="go()">Connect Account</button>
  <div id="status" class="status"></div>
<script>
  async function go() {
    const label = document.getElementById("inst").value;
    document.getElementById("status").textContent = "Creating link token...";
    const r1 = await fetch("/api/create-link-token", { method:"POST" });
    const { link_token } = await r1.json();
    Plaid.create({
      token: link_token,
      onSuccess: async (public_token) => {
        document.getElementById("status").textContent = "Exchanging token...";
        const r2 = await fetch("/api/exchange-token", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ public_token, label }),
        });
        const d = await r2.json();
        const el = document.getElementById("status");
        if (d.success) { el.className="status ok"; el.textContent="✓ " + label + " connected — check terminal for token"; }
        else           { el.className="status err"; el.textContent="Error — check terminal"; }
      },
      onExit: (err) => { if (err) { document.getElementById("status").className="status err"; document.getElementById("status").textContent=err.display_message||err.error_code; } },
    }).open();
  }
</script>
</body></html>`));

app.listen(3001, () => {
  console.log("\nLDGR Link Server running on port 3001");
  console.log("→ Open http://localhost:3001");
  console.log("→ Connect: AmEx, Chase, Fidelity, Goldman Sachs (Marcus)");
  console.log("→ Tokens print here — copy each one to .env\n");
  console.log("Note: Chase requires OAuth (may not work in Limited Production).");
  console.log("Fidelity and Goldman Sachs work in Limited Production.\n");
});

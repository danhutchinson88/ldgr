# LDGR Setup

## What This App Is

`ldgr` is a small Node app that:

- syncs balances, transactions, and holdings from Plaid
- merges manually-maintained Fidelity data from `config/fidelity-manual.json`
- writes a snapshot to `data/snapshot.json` (or `SNAPSHOT_PATH`)
- serves a protected dashboard from `src/server.js`
- optionally sends a weekly digest email

## Prerequisites

- Node.js 18+
- A Plaid app with `Transactions` and `Investments` enabled (production access)
- A `.env` file in the repo root

## Install

```bash
npm install
```

## Create `.env`

```env
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=production

PLAID_TOKEN_GOLDMAN_SACHS=    # connected
# PLAID_TOKEN_AMEX=           # pending OAuth review
# PLAID_TOKEN_CHASE=          # pending OAuth review

PLAID_REDIRECT_URI=https://ldgr.up.railway.app/oauth-return

DASHBOARD_PASSWORD=
PORT=3000

EMAIL_FROM=
EMAIL_APP_PASSWORD=
EMAIL_TO=
```

Optional:

```env
SNAPSHOT_PATH=/absolute/path/to/snapshot.json
LDGR_URL=https://ldgr.up.railway.app   # only needed for push-snapshot.js
```

## Institution Status

| Institution | Status | Notes |
|---|---|---|
| Goldman Sachs (Marcus) | Connected | Savings account |
| American Express | Pending | OAuth review in progress with Plaid |
| Chase | Pending | OAuth review in progress with Plaid |
| Fidelity | Not supported | Use `config/fidelity-manual.json` instead |

## Fidelity Manual Data

Since Fidelity is not supported for this Plaid app, account balances and holdings
are entered manually in `config/fidelity-manual.json`. Edit the values there and
re-run sync. Manually-entered accounts and holdings are marked "manual" in the
dashboard.

## Link Accounts (OAuth flow)

For OAuth institutions (Amex, Chase), when Plaid production access is granted:

1. Start the link server:
   ```bash
   npm run link
   ```
2. Open `http://localhost:3001`
3. Select the institution and click Connect
4. Plaid will redirect your browser to `PLAID_REDIRECT_URI` (Railway) to complete the OAuth
5. The access token is logged to Railway's deployment logs
6. Copy the token from Railway logs to your `.env` and Railway env vars

For non-OAuth institutions (Goldman Sachs), the token prints in the local terminal.

## Run a Sync

```bash
npm run sync
```

Writes the latest snapshot to `data/snapshot.json`. The dashboard shows which
institutions succeeded, failed, or are manually sourced.

## Run the Dashboard

```bash
npm start
```

Open `http://localhost:3000`. Protected with HTTP Basic Auth using `DASHBOARD_PASSWORD`.

## Weekly Digest

Set `EMAIL_FROM`, `EMAIL_APP_PASSWORD`, and `EMAIL_TO`. The digest fires automatically
every Sunday at 8am ET via the server's cron schedule.

## Push Local Snapshot to Railway

After running `scripts/backload.js` to seed historical NW data:

```bash
LDGR_URL=https://ldgr.up.railway.app node scripts/push-snapshot.js
```

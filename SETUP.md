# LDGR Setup

## What This App Is
`ldgr` is a small Node app that:

- syncs balances, transactions, and holdings from Plaid
- writes a local snapshot to `data/snapshot.json` by default
- serves a protected dashboard from `src/server.js`
- optionally sends a weekly digest email

## Prerequisites

- Node.js 18+
- a Plaid app with `Transactions` and `Investments` enabled
- a `.env` file in the repo root

## Install

```bash
npm install
```

## Create `.env`

Use this as a starting point:

```env
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox

PLAID_TOKEN_AMEX=
PLAID_TOKEN_CHASE=
PLAID_TOKEN_FIDELITY=
PLAID_TOKEN_GOLDMAN_SACHS=

DASHBOARD_PASSWORD=
PORT=3000

EMAIL_FROM=
EMAIL_APP_PASSWORD=
EMAIL_TO=
```

Optional:

```env
SNAPSHOT_PATH=/absolute/path/to/snapshot.json
```

If `SNAPSHOT_PATH` is omitted, the app uses `data/snapshot.json`.

## Link Accounts

Start the linker:

```bash
node link-server.js
```

Then open:

```text
http://localhost:3001
```

Each successful connection prints an env var you can paste into `.env`, for example:

```env
PLAID_TOKEN_AMEX=access-...
```

## Run A Sync

```bash
npm run sync
```

That writes the latest snapshot to `data/snapshot.json` unless you override `SNAPSHOT_PATH`.

## Run The Dashboard

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

The dashboard is protected with HTTP Basic Auth and uses `DASHBOARD_PASSWORD`.

## Weekly Digest

If you want email digests, set:

- `EMAIL_FROM`
- `EMAIL_APP_PASSWORD`
- `EMAIL_TO`

The digest is sent by the scheduled server job after a successful weekly sync.

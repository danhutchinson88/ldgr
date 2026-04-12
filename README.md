# LDGR

A personal finance dashboard for a single user. Connects to financial institutions via Plaid, stores a weekly snapshot, and serves a password-protected web dashboard.

## What It Does

- Retrieves account balances, transactions, and investment holdings from linked institutions via the Plaid API
- Computes net worth, spending summaries, and portfolio allocation
- Serves a dashboard at `/` (password-protected)
- Sends a weekly email digest summarizing net worth, spending, and unclaimed card credits
- Maintains a rolling net worth history for trend tracking

## Who It Is For

LDGR is a single-user personal finance tool. There is no user registration, no multi-user support, and no public-facing product. It is operated by and for one individual.

## Data Access

LDGR requests the following Plaid products:

- **Transactions** — to retrieve spending history and detect income
- **Investments** — to retrieve holdings and account balances for investment accounts

Financial institutions linked: American Express, Chase, Fidelity, Goldman Sachs (Marcus).

## Architecture

| Component | Details |
|---|---|
| Runtime | Node.js 18+ |
| Server | Express (`src/server.js`) |
| Data source | Plaid API (`src/sync.js`) |
| Snapshot storage | JSON file on Railway Volume (`snapshot.json`) |
| Dashboard | Static HTML (`dashboard/index.html`) |
| Email digest | Nodemailer via Gmail SMTP (`src/digest.js`) |
| Hosting | Railway |
| Auth | HTTP Basic Auth (password-only) |

## Public Pages

These pages are available without authentication:

- `/privacy` — Privacy Policy
- `/data-retention` — Data Retention and Disposal Policy

## Setup

See [SETUP.md](SETUP.md) for installation and configuration instructions.

## Security

See [SECURITY.md](SECURITY.md) for the security overview and responsible disclosure contact.

## Contact

Daniel Hutchinson — danhutchinson88@gmail.com

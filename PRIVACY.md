# LDGR Privacy Policy

**Last updated:** April 2026

## What LDGR Is

LDGR is a single-user personal finance application. It is operated by and for one individual (the account owner). It has no user registration, no multi-user access, and no public-facing product.

## Data Collected

LDGR uses the Plaid API to retrieve the following data from linked financial institutions:

- Account balances (checking, savings, investment, credit, loan)
- Transaction history (up to 45 days)
- Investment holdings and securities

This data is retrieved solely to display a personal financial dashboard and send a weekly email summary to the account owner.

## Data Storage

All financial data is stored in a single JSON file (`snapshot.json`) on a Railway cloud volume. Railway is a third-party infrastructure provider. No external database, analytics service, or data warehouse is used. The account owner controls the Railway deployment and volume.

## Email Digest

If the email digest feature is enabled, a weekly financial summary (including net worth, spending totals, and top spending categories) is transmitted via Gmail SMTP to the configured recipient email address. That address is the account owner's own email. No financial data is sent to any other recipient.

## Data Sharing

LDGR does not sell, license, or share financial data with any third party for commercial purposes. Data flows only to:

- **Plaid** — as the API provider used to retrieve data from financial institutions
- **Railway** — as the infrastructure provider hosting the application and snapshot file
- **Gmail SMTP** — as the transport for the optional weekly digest email, sent only to the account owner

## Data Access

Only the account owner can access the dashboard. The web interface is protected by a password. No other person has access to the application or the stored data.

## Contact

Daniel Hutchinson — danhutchinson88@gmail.com

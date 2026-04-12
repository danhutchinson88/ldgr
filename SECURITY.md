# LDGR Security

## Overview

LDGR is a single-user personal finance application. The attack surface is intentionally small: one password-protected dashboard, no user accounts, no public data endpoints.

## Authentication

The web dashboard and all API endpoints (except `/privacy` and `/data-retention`) are protected by HTTP Basic Auth. Access requires a password set by the account owner via the `DASHBOARD_PASSWORD` environment variable.

## Secrets Handling

- Plaid API credentials and access tokens are stored as environment variables
- The `.env` file is gitignored and never committed to version control
- Railway environment variables are managed through the Railway dashboard and are not exposed in the codebase or repository

## Data Exposure

- Financial data is stored only in `snapshot.json` on a Railway Volume
- The `/snapshot` endpoint returns the full snapshot and is password-protected
- Logs include the digest email subject line, which contains net worth and spending totals. Logs are only accessible to the account owner via the Railway deployment dashboard

## Responsible Disclosure

If you discover a security issue with this project, please report it privately:

**Email:** danhutchinson88@gmail.com

Please include a description of the issue and steps to reproduce. This is a personal project with no formal bug bounty program.

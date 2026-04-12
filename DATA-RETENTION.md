LDGR — Data Retention and Disposal Policy
Effective: April 2026
Scope: This policy applies to all consumer financial data processed by LDGR, a single-user personal finance application.
Data Retained: Account balances, transaction history (rolling 30-day window), and net worth snapshots sourced via Plaid API.
Retention Period: Transaction data is retained for a maximum of 30 days and overwritten on each weekly sync. Net worth history is capped at 52 entries (one year). No data is retained beyond these limits.
Storage: All data is stored in a single JSON file (snapshot.json) on an encrypted Railway Volume.
Disposal: Data is disposed of automatically on each sync cycle as older records are overwritten. Full disposal is performed by deleting the Railway Volume. No data is archived, backed up externally, or shared with third parties.
Review: This policy is reviewed annually or upon any material change to the application architecture.
Owner: Daniel Hutchinson — danhutchinson88@gmail.com
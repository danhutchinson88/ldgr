# LDGR — Data Retention and Disposal Policy

**Effective:** April 2026
**Owner:** Daniel Hutchinson — danhutchinson88@gmail.com

## Scope

This policy applies to all financial data processed by LDGR, a single-user personal finance application.

## Data Retained

| Data Type | Retention Window | Notes |
|---|---|---|
| Account balances | Current snapshot only | Overwritten on each sync |
| Transaction history | Up to 45 days | Spending transactions only; overwritten on each sync |
| Investment holdings | Current snapshot only | Overwritten on each sync |
| Net worth history | Up to 260 entries | Approximately 5 years of weekly syncs; older entries are dropped |

No data is archived, exported to a secondary store, or retained beyond these limits.

## Storage

All retained data is stored in a single JSON file (`snapshot.json`) on a Railway Volume (persistent cloud disk). No external database is used.

## Disposal

- **Per sync:** The snapshot file is atomically overwritten. Data outside the retention windows above is not carried forward.
- **Full disposal:** Deleting the Railway Volume permanently removes all stored data. No residual copies exist in the application.

## Review

This policy is reviewed annually or upon any material change to the application architecture.

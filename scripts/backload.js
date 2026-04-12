// scripts/backload.js
// One-time script: prepend historical monthly net worth data from your spreadsheet.
// Safe to re-run — deduplicates by date before writing.
//
// Run: node scripts/backload.js

'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');

// Historical net worth from spreadsheet (monthly, first of each month).
// Dec '23 through Feb '25. March 2025 omitted — incomplete entry in spreadsheet.
const HISTORICAL = [
  { date: '2023-12-01', label: 'Dec \'23', value: 133680 },
  { date: '2024-01-01', label: 'Jan \'24', value: 130604 },
  { date: '2024-02-01', label: 'Feb \'24', value: 137586 },
  { date: '2024-03-01', label: 'Mar \'24', value: 144352 },
  { date: '2024-04-01', label: 'Apr \'24', value: 140427 },
  { date: '2024-05-01', label: 'May \'24', value: 155956 },
  { date: '2024-06-01', label: 'Jun \'24', value: 157759 },
  { date: '2024-07-01', label: 'Jul \'24', value: 163518 },
  { date: '2024-08-01', label: 'Aug \'24', value: 165610 },
  { date: '2024-09-01', label: 'Sep \'24', value: 170232 },
  { date: '2024-10-01', label: 'Oct \'24', value: 163451 },
  { date: '2024-11-01', label: 'Nov \'24', value: 180344 },
  { date: '2024-12-01', label: 'Dec \'24', value: 178628 },
  { date: '2025-01-01', label: 'Jan \'25', value: 185104 },
  { date: '2025-02-01', label: 'Feb \'25', value: 186419 },
];

const snapshotPath = process.env.SNAPSHOT_PATH || path.join(__dirname, '..', 'data', 'snapshot.json');

let snapshot;
try {
  snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
} catch (e) {
  console.error('No snapshot found at', snapshotPath);
  console.error('Run a sync first: node -e "require(\'dotenv\').config(); require(\'./src/sync\').runSync()"');
  process.exit(1);
}

const existing = snapshot.netWorth?.history || [];

// Merge: deduplicate by date, historical entries first, then live entries
const byDate = {};
for (const h of [...HISTORICAL, ...existing]) {
  // Live entries win if same date (Plaid data is more accurate than spreadsheet)
  if (!byDate[h.date] || h === existing.find(e => e.date === h.date)) {
    byDate[h.date] = h;
  }
}

const merged = Object.values(byDate)
  .filter(h => h.date)
  .sort((a, b) => a.date.localeCompare(b.date))
  .slice(-260);

snapshot.netWorth.history = merged;

// Re-compute velocity with the full history
const dated = merged.filter(h => h.date);
if (dated.length >= 2) {
  const first = dated[0];
  const last  = dated[dated.length - 1];
  const days  = (new Date(last.date) - new Date(first.date)) / 86400000;
  snapshot.netWorth.velocity = days >= 1 ? ((last.value - first.value) / days) * 7 : null;
}

// Atomic write
const tmp = snapshotPath + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
fs.renameSync(tmp, snapshotPath);

console.log(`Backloaded ${HISTORICAL.length} historical entries.`);
console.log(`Total history: ${merged.length} entries`);
console.log(`Range: ${merged[0].date} → ${merged[merged.length - 1].date}`);
if (snapshot.netWorth.velocity !== null) {
  const v = snapshot.netWorth.velocity;
  console.log(`Velocity: ${v >= 0 ? '+' : ''}$${Math.round(v).toLocaleString()}/week`);
}

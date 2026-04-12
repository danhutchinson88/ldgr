'use strict';

require('dotenv').config();
const fs         = require('fs');
const nodemailer = require('nodemailer');
const { getSnapshotPath } = require('./paths');

const fmt = n => '$' + Math.round(Math.abs(n)).toLocaleString('en-US');

async function sendDigest() {
  const snapshotPath = getSnapshotPath();
  const snapshot     = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const { netWorth, accounts, weekly, cards } = snapshot;

  const weekOf = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const dateShort = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Invested and cash buckets
  let invested = 0, cash = 0;
  for (const a of accounts) {
    const t = (a.type    || '').toLowerCase();
    const s = (a.subtype || '').toLowerCase();
    if (['investment', 'brokerage'].includes(t) ||
        ['401k', 'roth', 'hsa', 'roth ira', 'brokeragelink'].includes(s)) {
      invested += a.balance;
    } else if (t === 'depository') {
      cash += a.balance;
    }
  }

  // Net worth delta — date-anchored WoW (closest entry on or before 7 days ago)
  const history = netWorth.history || [];
  let deltaStr = '';
  const wowTarget = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const wowEntry  = history.filter(h => h.date && h.date <= wowTarget).pop();
  if (wowEntry) {
    const delta = netWorth.current - wowEntry.value;
    deltaStr = `  (${delta >= 0 ? '+' : '-'}${fmt(Math.abs(delta))} WoW)`;
  }

  // Top 3 spend categories
  const topStr = (weekly.topCategories || [])
    .map(c => `${c.name} ${fmt(c.amount)}`)
    .join(' · ') || 'none';

  // Unclaimed credits across all cards
  let unclaimedTotal = 0, unclaimedCardCount = 0;
  for (const card of (cards || [])) {
    let cardUnclaimed = 0;
    for (const b of (card.benefits || [])) {
      const remaining = b.value - (b.used || 0);
      if (remaining > 0) cardUnclaimed += remaining;
    }
    if (cardUnclaimed > 0) {
      unclaimedTotal += cardUnclaimed;
      unclaimedCardCount++;
    }
  }
  const creditsStr = unclaimedCardCount > 0
    ? `${fmt(unclaimedTotal)} across ${unclaimedCardCount} card${unclaimedCardCount !== 1 ? 's' : ''}`
    : 'none';

  // Income & savings rate (trailing 30d)
  const income30d   = snapshot.income?.last30d || 0;
  const spending30d = snapshot.spend30d || 0;          // pre-computed 30d window in sync.js
  const surplus     = income30d - spending30d;
  const savingsRate   = income30d > 0 ? ((surplus / income30d) * 100).toFixed(1) + '%' : 'n/a';
  const incomeStr     = income30d > 0 ? `${fmt(income30d)}  (${savingsRate} savings rate)` : 'no income detected';

  const body = [
    `LDGR — Week of ${weekOf}`,
    '',
    `Net worth:        ${fmt(netWorth.current)}${deltaStr}`,
    `Invested:         ${fmt(invested)}`,
    `Cash:             ${fmt(cash)}`,
    `Income (30d):     ${incomeStr}`,
    `Spent this week:  ${fmt(weekly.totalSpend)}`,
    `Top spend:        ${topStr}`,
    `Unclaimed credits: ${creditsStr}`,
  ].join('\n');

  const subject = `LDGR · ${dateShort} · NW ${fmt(netWorth.current)} · Spent ${fmt(weekly.totalSpend)}`;

  await nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_FROM,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  }).sendMail({
    from:    `LDGR <${process.env.EMAIL_FROM}>`,
    to:      process.env.EMAIL_TO,
    subject,
    text:    body,
  });

  console.log('[digest] sent to', process.env.EMAIL_TO);
  console.log('[digest] subject:', subject);
}

module.exports = { sendDigest };

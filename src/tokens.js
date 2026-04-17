'use strict';

const ALL_KEYS = [
  { key: 'PLAID_TOKEN_AMEX',          label: 'amex' },
  { key: 'PLAID_TOKEN_CHASE',         label: 'chase' },
  { key: 'PLAID_TOKEN_FIDELITY',      label: 'fidelity' },
  { key: 'PLAID_TOKEN_GOLDMAN_SACHS', label: 'goldmanSachs' },
];

function getTokens() {
  const tokens = {};
  for (const { key, label } of ALL_KEYS) {
    if (process.env[key]) {
      console.log(`✓  ${key} present`);
      tokens[label] = process.env[key];
    } else {
      console.log(`–  ${key} not set, skipping`);
    }
  }
  if (Object.keys(tokens).length === 0) {
    throw new Error('No Plaid tokens found. Populate .env before running.');
  }
  return tokens;
}

module.exports = { getTokens };

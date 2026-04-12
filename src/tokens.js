'use strict';

const REQUIRED_KEYS = [
  'PLAID_TOKEN_AMEX',
  'PLAID_TOKEN_CHASE',
  'PLAID_TOKEN_FIDELITY',
  'PLAID_TOKEN_GOLDMAN_SACHS',
];

function getTokens() {
  let allPresent = true;
  for (const key of REQUIRED_KEYS) {
    if (process.env[key]) {
      console.log(`✓  ${key} present`);
    } else {
      console.log(`✗  ${key} missing — aborting`);
      allPresent = false;
    }
  }
  if (!allPresent) {
    throw new Error('One or more Plaid tokens missing. Populate .env before running.');
  }
  return {
    amex:         process.env.PLAID_TOKEN_AMEX,
    chase:        process.env.PLAID_TOKEN_CHASE,
    fidelity:     process.env.PLAID_TOKEN_FIDELITY,
    goldmanSachs: process.env.PLAID_TOKEN_GOLDMAN_SACHS,
  };
}

module.exports = { getTokens };

// scripts/push-snapshot.js
// Pushes the local snapshot (including backloaded history) to the Railway instance.
// Run after backload.js to seed Railway with historical NW data.
//
// Usage: LEDGER_URL=https://your-app.up.railway.app LEDGER_PASS=yourpass node scripts/push-snapshot.js

'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

const snapshotPath = process.env.SNAPSHOT_PATH || path.join(__dirname, '..', 'data', 'snapshot.json');
const url  = process.env.LEDGER_URL;
const pass = process.env.LEDGER_PASS || process.env.DASHBOARD_PASSWORD;

if (!url) {
  console.error('Set LEDGER_URL=https://your-app.up.railway.app');
  process.exit(1);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const body     = JSON.stringify(snapshot);
const auth     = Buffer.from(':' + pass).toString('base64');
const parsed   = new URL(url + '/snapshot/import');
const lib      = parsed.protocol === 'https:' ? https : http;

const req = lib.request({
  hostname: parsed.hostname,
  port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
  path:     parsed.pathname,
  method:   'POST',
  headers: {
    'Authorization': 'Basic ' + auth,
    'Content-Type':  'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', e => { console.error('Error:', e.message); process.exit(1); });
req.write(body);
req.end();

console.log(`Pushing snapshot to ${url}`);
console.log(`History entries: ${snapshot.netWorth?.history?.length}`);

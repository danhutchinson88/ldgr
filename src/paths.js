'use strict';

const path = require('path');

function getSnapshotPath() {
  return process.env.SNAPSHOT_PATH || path.join(__dirname, '..', 'data', 'snapshot.json');
}

module.exports = { getSnapshotPath };

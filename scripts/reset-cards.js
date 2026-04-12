// scripts/reset-cards.js
// Resets all card benefit `used` values to 0.
// Run at the start of each annual benefit year.
// Usage: npm run reset-cards

'use strict';
const fs   = require('fs');
const path = require('path');

const cardsPath = path.join(__dirname, '..', 'config', 'cards.json');
const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));

for (const card of cards) {
  for (const b of (card.benefits || [])) {
    b.used = 0;
  }
}

fs.writeFileSync(cardsPath, JSON.stringify(cards, null, 2) + '\n');

console.log('Reset used values to 0 for all card benefits:');
for (const card of cards) {
  if (card.benefits?.length) {
    console.log(`  ${card.name}: ${card.benefits.length} benefit${card.benefits.length !== 1 ? 's' : ''} reset`);
  }
}

const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, '../src/constants/offlineSeed.json');
const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

console.log(`TOTAL PLAYLISTS IN SEED: ${data.playlists.length}`);
data.playlists.forEach((p, idx) => {
  console.log(`P[${idx}] ID: ${p._id} | Name: ${p.name} | Kind: ${p.kind} | CardsCount: ${p.cardIds?.length}`);
});

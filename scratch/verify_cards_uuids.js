const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, '../src/constants/offlineSeed.json');
const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

let cardsWithUuid = 0;
let cardsWithObjectId = 0;
let foldersWithUuid = 0;
let foldersWithObjectId = 0;

data.revisionCards.forEach(c => {
  if (uuidRegex.test(c._id)) cardsWithUuid++;
  else if (objectIdRegex.test(c._id)) cardsWithObjectId++;
});

data.folders.forEach(f => {
  if (uuidRegex.test(f._id)) foldersWithUuid++;
  else if (objectIdRegex.test(f._id)) foldersWithObjectId++;
});

console.log(`REVISION CARDS: UUIDs: ${cardsWithUuid} | ObjectIds: ${cardsWithObjectId} | Total: ${data.revisionCards.length}`);
console.log(`FOLDERS:        UUIDs: ${foldersWithUuid} | ObjectIds: ${foldersWithObjectId} | Total: ${data.folders.length}`);

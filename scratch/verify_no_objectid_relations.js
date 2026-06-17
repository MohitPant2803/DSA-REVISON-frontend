const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, '../src/constants/offlineSeed.json');
const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

let invalidRelations = 0;
const details = [];

data.folders.forEach((f, idx) => {
  if (f.parentFolderId) {
    if (!uuidRegex.test(f.parentFolderId)) {
      invalidRelations++;
      details.push(`Folder[${idx}] "${f.title}" parentFolderId is not a UUID: "${f.parentFolderId}"`);
    }
  }
  if (f.cardIds) {
    f.cardIds.forEach((cid, cidx) => {
      if (!uuidRegex.test(cid)) {
        invalidRelations++;
        details.push(`Folder[${idx}] "${f.title}" cardIds[${cidx}] is not a UUID: "${cid}"`);
      }
    });
  }
});

data.revisionCards.forEach((c, idx) => {
  if (c.folderId) {
    if (!uuidRegex.test(c.folderId)) {
      invalidRelations++;
      details.push(`Card[${idx}] "${c.title}" folderId is not a UUID: "${c.folderId}"`);
    }
  }
  if (c.rootFolderId) {
    if (!uuidRegex.test(c.rootFolderId)) {
      invalidRelations++;
      details.push(`Card[${idx}] "${c.title}" rootFolderId is not a UUID: "${c.rootFolderId}"`);
    }
  }
  if (c.subfolderIds) {
    c.subfolderIds.forEach((sid, sidx) => {
      if (!uuidRegex.test(sid)) {
        invalidRelations++;
        details.push(`Card[${idx}] "${c.title}" subfolderIds[${sidx}] is not a UUID: "${sid}"`);
      }
    });
  }
});

console.log(`INVALID_RELATIONAL_IDS: ${invalidRelations}`);
details.forEach(d => console.log(` - ${d}`));

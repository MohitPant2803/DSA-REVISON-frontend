const fs = require('fs');
const crypto = require('crypto');

const MIGRATION_NAMESPACE = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function parseUUID(uuidStr) {
  const hex = uuidStr.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function getDeterministicUUID(id) {
  const nsBytes = parseUUID(MIGRATION_NAMESPACE);
  const nameBytes = Buffer.from(id, 'utf8');
  const totalBytes = Buffer.concat([nsBytes, nameBytes]);
  
  const hash = crypto.createHash('sha1').update(totalBytes).digest();
  
  // Set version to 5
  hash[6] = (hash[6] & 0x0f) | 0x50;
  // Set variant to RFC4122
  hash[8] = (hash[8] & 0x3f) | 0x80;
  
  const hex = hash.toString('hex');
  return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20, 12)}`;
}

const seed = JSON.parse(fs.readFileSync('src/constants/offlineSeed.json'));
const mongoIds = ['6a16ee5ab47e808b5b7607db', '6a1655ffb129b168bb16bc74', '6a1655feb129b168bb16bc6a'];

console.log('Deterministic UUIDs for playlist cards:');
mongoIds.forEach(id => {
  const uuid = getDeterministicUUID(id);
  const match = seed.revisionCards.find(c => c._id === uuid);
  console.log('MongoID: ' + id + ' -> UUID: ' + uuid + ' | Match: ' + (match ? match.title : 'NONE'));
});

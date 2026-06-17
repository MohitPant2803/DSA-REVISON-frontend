const crypto = require('crypto');

// Let's test different namespaces and string formats
const title = "Set Matrix Zeroes";
const targetUUID = "e500c6d6-46f0-56d7-885c-56c8e5019e5b";

// Try standard namespaces
const namespaces = [
  'f47ac10b-58cc-4372-a567-0e02b2c3d479', // MIGRATION_NAMESPACE
  '6ba7b810-9dad-11d1-80b4-00c04fd430c8', // DNS namespace
  '6ba7b811-9dad-11d1-80b4-00c04fd430c8', // URL namespace
  '6ba7b812-9dad-11d1-80b4-00c04fd430c8', // OID namespace
  '6ba7b814-9dad-11d1-80b4-00c04fd430c8'  // X500 namespace
];

function parseUUID(uuidStr) {
  const hex = uuidStr.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function getDeterministicUUID(ns, name) {
  const nsBytes = parseUUID(ns);
  const nameBytes = Buffer.from(name, 'utf8');
  const totalBytes = Buffer.concat([nsBytes, nameBytes]);
  const hash = crypto.createHash('sha1').update(totalBytes).digest();
  
  hash[6] = (hash[6] & 0x0f) | 0x50; // v5
  hash[8] = (hash[8] & 0x3f) | 0x80;
  
  const hex = hash.toString('hex');
  return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20, 12)}`;
}

namespaces.forEach(ns => {
  const uuid = getDeterministicUUID(ns, title);
  console.log('Namespace: ' + ns + ' -> ' + uuid + ' | Match: ' + (uuid === targetUUID));
});

const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, '../src/constants/offlineSeed.json');
const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const roots = data.folders.filter(f => !f.parentFolderId);

console.log(`OFFLINE_SEED_ROOT_FOLDERS_COUNT: ${roots.length}`);
roots.forEach(r => {
  console.log(`Seed Root ID: ${r._id} | Title: ${r.title} | Parent: ${r.parentFolderId}`);
});

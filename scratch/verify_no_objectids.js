const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, '../src/constants/offlineSeed.json');
const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

let objectIdCount = 0;
const foundLocations = [];

function scan(obj, pathStr) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') {
    if (objectIdRegex.test(obj)) {
      objectIdCount++;
      foundLocations.push(`${pathStr}: "${obj}"`);
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      scan(item, `${pathStr}[${index}]`);
    });
  } else if (typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      scan(obj[key], `${pathStr}.${key}`);
    });
  }
}

scan(data, 'root');

console.log(`TOTAL_OBJECTIDS_FOUND: ${objectIdCount}`);
if (objectIdCount > 0) {
  console.log('Found ObjectIds at locations:');
  foundLocations.slice(0, 50).forEach(loc => console.log(` - ${loc}`));
} else {
  console.log('✅ Success: No 24-character ObjectIds found in the seed asset!');
}

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const srcHtml = fs.readFileSync(path.join(dir, 'kungsleden-gps-offline.html'), 'utf8');
const png = fs.readFileSync(path.join(dir, 'map2-labeled.png'));
const dataUri = 'data:image/png;base64,' + png.toString('base64');

// Replace the external image reference with an inline data URI.
let out = srcHtml.replace(
  /<img id="mapImg" src="map2-labeled\.png"/,
  `<img id="mapImg" src="${dataUri}"`
);

// Disable the service worker + manifest (not needed for a single offline file).
out = out.replace(/\s*<link rel="manifest"[^>]*>/, '');
out = out.replace(
  /if \('serviceWorker' in navigator[\s\S]*?register\([^;]*\);\s*\}/,
  '/* standalone: map embedded, no service worker needed */'
);

// Update the offline badge text.
out = out.replace('offline map · map.jpg', 'offline map · self-contained');

const outPath = path.join(dir, 'kungsleden-gps-standalone.html');
fs.writeFileSync(outPath, out);
console.log('Wrote', outPath, '·', (out.length / 1024).toFixed(0), 'KB');

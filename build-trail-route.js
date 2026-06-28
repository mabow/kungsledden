const fs = require('fs');
const path = require('path');

const GPX = 'C:/Users/mab/Desktop/fjallraven-classic-with-camps.gpx';
const g = fs.readFileSync(GPX, 'utf8');

const trkpts = [...g.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"/g)].map(m => [+m[1], +m[2]]);
const rtepts = [...g.matchAll(/<rtept lat="([^"]+)" lon="([^"]+)"/g)].map(m => [+m[1], +m[2]]);
const segs = (g.match(/<trkseg>/g) || []).length;

const route = trkpts.length ? trkpts : rtepts;
console.log('trkpts', trkpts.length, 'rtepts', rtepts.length, 'trksegs', segs);
if (route.length) {
  console.log('first', route[0], 'last', route[route.length - 1]);
}

// haversine metres
function hav(a, b) {
  const R = 6371000;
  const dlat = (b[0] - a[0]) * Math.PI / 180;
  const dlon = (b[1] - a[1]) * Math.PI / 180;
  const la1 = a[0] * Math.PI / 180;
  const la2 = b[0] * Math.PI / 180;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Downsample: keep points at least ~40 m apart to shrink payload while keeping shape
const MIN = 40;
const out = [];
let last = null;
for (const p of route) {
  if (!last || hav(last, p) >= MIN) {
    out.push([+p[0].toFixed(5), +p[1].toFixed(5)]);
    last = p;
  }
}
if (out.length && route.length) {
  const tail = [+route[route.length - 1][0].toFixed(5), +route[route.length - 1][1].toFixed(5)];
  if (out[out.length - 1][0] !== tail[0] || out[out.length - 1][1] !== tail[1]) out.push(tail);
}

let totalKm = 0;
for (let i = 1; i < route.length; i++) totalKm += hav(route[i - 1], route[i]);
console.log('route length km', (totalKm / 1000).toFixed(1), 'downsampled pts', out.length);

fs.writeFileSync(
  path.join(__dirname, 'trail-route.js'),
  'const TRAIL_ROUTE=' + JSON.stringify(out) + ';'
);
console.log('Wrote trail-route.js', (JSON.stringify(out).length / 1024).toFixed(1), 'KB');

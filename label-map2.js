const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const INPUT = path.join(__dirname, 'map2.png');
const OUTPUT = path.join(__dirname, 'map2-labeled.png');
const GPX = 'C:/Users/mab/Desktop/fjallraven-classic-with-camps.gpx';

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const gpx = fs.readFileSync(GPX, 'utf8');
const wpts = [...gpx.matchAll(
  /<wpt lat="([^"]+)" lon="([^"]+)">[\s\S]*?<name>([^<]*)<\/name>[\s\S]*?<type>([^<]*)<\/type>/g
)].map(m => ({
  lat: +m[1],
  lon: +m[2],
  name: m[3].replace(/^▲\s*/, '').replace(/^START ·\s*/, '').replace(/^FINISH ·\s*/, ''),
  type: m[4],
}));

const huts = wpts.filter(p => p.type === 'STF hut');
const camps = wpts.filter(p => p.type === 'scenic camp');

/** South → north · D1 = start, D2–D7 = hut stops */
const dayStops = [
  { day: 1, hut: 'Nikkaluokta', start: true },
  { day: 2, hut: 'Kebnekaise' },
  { day: 3, hut: 'Singi' },
  { day: 4, hut: 'Sälka' },
  { day: 5, hut: 'Tjäktja' },
  { day: 6, hut: 'Alesjaure', pass: true },
  { day: 7, hut: 'Abiskojaure' },
];

const noShopHuts = ['Singi', 'Tjäktja'];
const noShopTextPos = {
  Singi: { dx: 38, anchor: 'start' },
  Tjäktja: { dx: 38, anchor: 'start' },
};

const dryPassSrc = fs.readFileSync(path.join(__dirname, 'dry-pass-geo.js'), 'utf8');
const DRY_PASS_GEO = JSON.parse(dryPassSrc.match(/DRY_PASS_GEO=(\[[\s\S]*\]);/)[1]);

/** Start/finish — not on the six red hut pins; label via GPS projection */
const endpointLabels = [
  { name: 'Nikkaluokta', wptType: 'start', dx: 0, dy: -30 },
  { name: 'Abisko', wptType: 'finish', dx: 0, dy: -30 },
];

function clusterPoints(points, mergeDist, minCount) {
  const clusters = [];
  for (const p of points) {
    let found = null;
    for (const c of clusters) {
      if (Math.hypot(c.x - p.x, c.y - p.y) < mergeDist) {
        found = c;
        break;
      }
    }
    if (found) {
      found.x = (found.x * found.n + p.x) / (found.n + 1);
      found.y = (found.y * found.n + p.y) / (found.n + 1);
      found.n++;
    } else {
      clusters.push({ x: p.x, y: p.y, n: 1 });
    }
  }
  return clusters.filter(c => c.n >= minCount).map(c => ({ x: c.x, y: c.y }));
}

function buildTrailGrid(w, h, data, cell = 8) {
  const grid = new Set();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (b > 145 && r < 95 && g < 145 && b > r + 40) {
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        for (let dy = -7; dy <= 7; dy++) {
          for (let dx = -7; dx <= 7; dx++) {
            grid.add(`${cx + dx},${cy + dy}`);
          }
        }
      }
    }
  }
  return { grid, cell };
}

function nearTrail(x, y, trailGrid) {
  const cx = Math.floor(x / trailGrid.cell);
  const cy = Math.floor(y / trailGrid.cell);
  return trailGrid.grid.has(`${cx},${cy}`);
}

function detectMarkers(w, h, data, trailGrid) {
  const redHits = [];
  const greyHits = [];

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (!nearTrail(x, y, trailGrid)) continue;
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (r > 215 && g < 85 && b < 85 && r > g + 120) redHits.push({ x, y });
      else if (
        r > 120 && r < 190 &&
        g > 120 && g < 190 &&
        b > 120 && b < 190 &&
        Math.abs(r - g) < 15 &&
        Math.abs(g - b) < 15
      ) {
        greyHits.push({ x, y });
      }
    }
  }

  let red = clusterPoints(redHits, 22, 4);
  let grey = clusterPoints(greyHits, 18, 6);
  grey = grey.filter(g => !red.some(r => Math.hypot(r.x - g.x, r.y - g.y) < 35));
  grey = clusterPoints(grey, 26, 1);

  red = dedupeNearby(red, 70);
  grey = dedupeNearby(grey, 55);
  red.sort((a, b) => a.y - b.y || a.x - b.x);
  grey.sort((a, b) => a.y - b.y || a.x - b.x);

  return { red, grey };
}

function dedupeNearby(points, minDist) {
  const out = [];
  for (const p of points) {
    const hit = out.find(o => Math.hypot(o.x - p.x, o.y - p.y) < minDist);
    if (hit) {
      hit.x = (hit.x + p.x) / 2;
      hit.y = (hit.y + p.y) / 2;
    } else {
      out.push({ ...p });
    }
  }
  return out;
}

function matchByOrder(markers, waypoints) {
  const wSorted = [...waypoints].sort((a, b) => b.lat - a.lat);
  const mSorted = [...markers].sort((a, b) => a.y - b.y || a.x - b.x);
  const n = Math.min(mSorted.length, wSorted.length);
  return Array.from({ length: n }, (_, i) => ({
    name: wSorted[i].name,
    type: wSorted[i].type,
    x: mSorted[i].x,
    y: mSorted[i].y,
  }));
}

function fitAffine(pairs) {
  // [lon, lat, 1] -> x and y
  const n = pairs.length;
  const A = pairs.map(p => [p.lon, p.lat, 1]);
  const bx = pairs.map(p => p.x);
  const by = pairs.map(p => p.y);
  const wx = solveLeastSquares(A, bx);
  const wy = solveLeastSquares(A, by);
  return (lat, lon) => ({
    x: wx[0] * lon + wx[1] * lat + wx[2],
    y: wy[0] * lon + wy[1] * lat + wy[2],
  });
}

function solveLeastSquares(A, b) {
  const m = A[0].length;
  const ata = Array.from({ length: m }, () => Array(m).fill(0));
  const atb = Array(m).fill(0);
  for (let i = 0; i < A.length; i++) {
    for (let r = 0; r < m; r++) {
      atb[r] += A[i][r] * b[i];
      for (let c = 0; c < m; c++) ata[r][c] += A[i][r] * A[i][c];
    }
  }
  return gaussianSolve(ata, atb);
}

function gaussianSolve(M, b) {
  const n = b.length;
  const a = M.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const div = a[col][col] || 1e-9;
    for (let c = col; c <= n; c++) a[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
    }
  }
  return a.map(row => row[n]);
}

function assignGreyToCamps(campLabels, greyMarkers) {
  const sorted = [...campLabels].sort((a, b) => {
    const ca = camps.find(c => c.name === a.name);
    const cb = camps.find(c => c.name === b.name);
    return cb.lat - ca.lat;
  });
  const pool = [...greyMarkers];
  const used = new Set();
  const out = [];

  for (const c of sorted) {
    let bestIdx = -1;
    let bestD = 140;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      const d = Math.hypot(pool[i].x - c.x, pool[i].y - c.y);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      out.push({ ...c, x: pool[bestIdx].x, y: pool[bestIdx].y });
    } else {
      out.push(c);
    }
  }
  return out;
}

function projectCamps(hutLabels, campWaypoints) {
  const pairs = hutLabels.map(h => {
    const w = huts.find(x => x.name === h.name);
    return { lat: w.lat, lon: w.lon, x: h.x, y: h.y };
  });
  const project = fitAffine(pairs);
  return campWaypoints.map(c => {
    const p = project(c.lat, c.lon);
    return { name: c.name, type: c.type, x: p.x, y: p.y };
  });
}

async function main() {
  const { data, info } = await sharp(INPUT).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const trailGrid = buildTrailGrid(w, h, data);
  let { red, grey } = detectMarkers(w, h, data, trailGrid);

  console.log('detected red', red.length, 'grey', grey.length);
  red.forEach((p, i) => console.log(' red', i, Math.round(p.x), Math.round(p.y)));
  grey.forEach((p, i) => console.log(' grey', i, Math.round(p.x), Math.round(p.y)));

  const hutLabels = matchByOrder(red, huts);

  let campLabels = projectCamps(hutLabels, camps);
  const greyUsable = grey.filter(g => !(g.x > 1300 && g.y > 2500));
  campLabels = assignGreyToCamps(campLabels, greyUsable);

  const labels = [...hutLabels, ...campLabels];

  const project = fitAffine(
    hutLabels.map(h => {
      const w = huts.find(x => x.name === h.name);
      return { lat: w.lat, lon: w.lon, x: h.x, y: h.y };
    })
  );

  const campTextOffsets = {
    'Nissonjohka †': { dx: -120, dy: 44 },
    'Ábeskojávri †': { dx: 120, dy: 42 },
    Siellajohka: { dx: -120, dy: 90 },
    Rádujávri: { dx: 90, dy: 40 },
  };

  const textEls = labels.map(p => {
    const isHut = p.type === 'STF hut';
    const size = isHut ? 30 : 26;
    const weight = isHut ? '700' : '600';
    const fill = isHut ? '#b01010' : '#2a2a2a';
    let campOff = campTextOffsets[p.name] || { dx: 0, dy: 38 };
    if (!isHut && p.y < 680 && !campTextOffsets[p.name]) {
      campOff = p.x < w / 2 ? { dx: -80, dy: 40 } : { dx: 80, dy: 40 };
    }
    const tx = p.x + (isHut ? 0 : campOff.dx);
    const ty = isHut ? p.y - 30 : p.y + campOff.dy;
    return (
      `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" ` +
      `font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}" ` +
      `fill="${fill}" text-anchor="middle" ` +
      `stroke="#ffffff" stroke-width="7" paint-order="stroke" ` +
      `stroke-linejoin="round">${escapeXml(p.name)}</text>`
    );
  }).join('');

  const dryPts = DRY_PASS_GEO.map(([lat, lon]) => {
    const p = project(lat, lon);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');
  const dryMid = DRY_PASS_GEO[Math.floor(DRY_PASS_GEO.length / 2)];
  const dryMidPx = project(dryMid[0], dryMid[1]);
  const dryEls =
    `<polyline points="${dryPts}" fill="none" stroke="#c45c00" stroke-width="9" ` +
    `stroke-opacity="0.82" stroke-dasharray="18 12" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="${dryMidPx.x.toFixed(1)}" y="${(dryMidPx.y - 18).toFixed(1)}" ` +
    `font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="800" ` +
    `fill="#b35a00" text-anchor="middle" ` +
    `stroke="#ffffff" stroke-width="7" paint-order="stroke" ` +
    `stroke-linejoin="round">dry · fill at Tjäktja</text>`;

  const noShopEls = noShopHuts.map(name => {
    const h = hutLabels.find(l => l.name === name);
    if (!h) return '';
    const pos = noShopTextPos[name] || { dx: -52, anchor: 'end' };
    return (
      `<circle cx="${h.x.toFixed(1)}" cy="${h.y.toFixed(1)}" r="16" ` +
      `fill="none" stroke="#7a1010" stroke-width="4"/>` +
      `<text x="${(h.x + pos.dx).toFixed(1)}" y="${(h.y + 8).toFixed(1)}" ` +
      `font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="800" ` +
      `fill="#7a1010" text-anchor="${pos.anchor}" ` +
      `stroke="#ffffff" stroke-width="6" paint-order="stroke" ` +
      `stroke-linejoin="round">no shop</text>`
    );
  }).join('');

  const endpointEls = endpointLabels.map(ep => {
    const w = wpts.find(p => p.type === ep.wptType);
    if (!w) return '';
    const p = project(w.lat, w.lon);
    return (
      `<text x="${(p.x + ep.dx).toFixed(1)}" y="${(p.y + ep.dy).toFixed(1)}" ` +
      `font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="700" ` +
      `fill="#b01010" text-anchor="middle" ` +
      `stroke="#ffffff" stroke-width="7" paint-order="stroke" ` +
      `stroke-linejoin="round">${escapeXml(ep.name)}</text>`
    );
  }).join('');

  const dayEls = dayStops.map(d => {
    let x;
    let y;
    if (d.start) {
      const start = wpts.find(p => p.type === 'start');
      const p = project(start.lat, start.lon);
      x = p.x;
      y = p.y;
    } else if (d.finish) {
      const finish = wpts.find(p => p.type === 'finish');
      const p = project(finish.lat, finish.lon);
      x = p.x;
      y = p.y;
    } else {
      const h = hutLabels.find(l => l.name === d.hut);
      if (!h) return '';
      x = h.x;
      y = h.y;
    }
    const fill = d.pass ? '#3d1550' : '#1a4d8c';
    return (
      `<text x="${x.toFixed(1)}" y="${(y - 62).toFixed(1)}" ` +
      `font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="800" ` +
      `fill="${fill}" text-anchor="middle" ` +
      `stroke="#ffffff" stroke-width="7" paint-order="stroke" ` +
      `stroke-linejoin="round">D${d.day}</text>`
    );
  }).join('');

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${dryEls}${noShopEls}${dayEls}${endpointEls}${textEls}</svg>`;
  await sharp(INPUT).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(OUTPUT);

  // dump geo→pixel anchors (huts + start/finish) for the offline GPS map
  const anchorOut = [];
  const startW = wpts.find(p => p.type === 'start');
  if (startW) {
    const p = project(startW.lat, startW.lon);
    anchorOut.push({ name: 'Nikkaluokta', lat: startW.lat, lon: startW.lon, x: +p.x.toFixed(1), y: +p.y.toFixed(1) });
  }
  hutLabels.forEach(hl => {
    const wp = huts.find(x => x.name === hl.name);
    anchorOut.push({ name: hl.name, lat: wp.lat, lon: wp.lon, x: +hl.x.toFixed(1), y: +hl.y.toFixed(1) });
  });
  const finishW = wpts.find(p => p.type === 'finish');
  if (finishW) {
    const p = project(finishW.lat, finishW.lon);
    anchorOut.push({ name: 'Abisko', lat: finishW.lat, lon: finishW.lon, x: +p.x.toFixed(1), y: +p.y.toFixed(1) });
  }
  anchorOut.sort((a, b) => a.y - b.y);
  fs.writeFileSync(path.join(__dirname, 'map2-anchors.json'),
    JSON.stringify({ width: w, height: h, anchors: anchorOut }, null, 2));
  console.log('Wrote map2-anchors.json', JSON.stringify(anchorOut.map(a => [a.name, a.x, a.y])));
  campLabels
    .filter(c => c.y < 700)
    .forEach(c => console.log(' camp', c.name, Math.round(c.x), Math.round(c.y)));
  console.log(`Wrote ${OUTPUT} · ${hutLabels.length} huts · ${campLabels.length} camps`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

const path = require('path');
const sharp = require('sharp');

const dir = __dirname;
const bg = { r: 26, g: 77, b: 140, alpha: 1 };

async function icon(size, out) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.12}" fill="#1a4d8c"/>
    <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
      font-family="Segoe UI, sans-serif" font-weight="700" font-size="${size * 0.34}" fill="#fff">KL</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(dir, out));
}

(async () => {
  await icon(192, 'icon-192.png');
  await icon(512, 'icon-512.png');
  console.log('Wrote icon-192.png, icon-512.png');
})();

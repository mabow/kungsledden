const path = require('path');
const sharp = require('sharp');

const dir = __dirname;

/* App icon: night-blue tile, white mountains, a dashed orange trail and a GPS dot.
   Drawn in a 512 viewBox so it scales cleanly to any size. */
function iconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2566ad"/>
        <stop offset="1" stop-color="#0c2a4d"/>
      </linearGradient>
      <clipPath id="round"><rect width="512" height="512" rx="112"/></clipPath>
    </defs>
    <g clip-path="url(#round)">
      <rect width="512" height="512" fill="url(#sky)"/>
      <!-- back mountain -->
      <path d="M250 372 L372 188 L500 372 Z" fill="#cdddee"/>
      <!-- front mountain -->
      <path d="M40 372 L196 150 L322 372 Z" fill="#ffffff"/>
      <!-- snow cap -->
      <path d="M196 150 L150 215 L176 205 L196 230 L218 200 L242 212 Z" fill="#bcd2e8"/>
      <!-- trail -->
      <path d="M70 432 C150 392, 188 470, 268 420 S 408 372, 452 300"
        fill="none" stroke="#ff7a29" stroke-width="20" stroke-linecap="round" stroke-dasharray="2 40"/>
      <!-- GPS dot at the end of the trail -->
      <circle cx="452" cy="300" r="26" fill="#1a73e8" stroke="#ffffff" stroke-width="9"/>
    </g>
  </svg>`;
}

async function icon(size, out) {
  await sharp(Buffer.from(iconSvg(size))).png().toFile(path.join(dir, out));
}

(async () => {
  await icon(192, 'icon-192.png');
  await icon(512, 'icon-512.png');
  console.log('Wrote icon-192.png, icon-512.png');
})();

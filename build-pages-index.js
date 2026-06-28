const fs = require('fs');
const path = require('path');

const dir = __dirname;
const src = fs.readFileSync(path.join(dir, 'kungsleden-gps-standalone.html'), 'utf8');

const headInject = `  <meta name="apple-mobile-web-app-title" content="KL GPS" />
  <link rel="manifest" href="manifest.json" />
  <link rel="apple-touch-icon" href="icon-192.png" />
`;

const pwaBlock = `    // PWA: cache this page for offline / Add to Home screen
    const offlineBadge = document.getElementById('offlineBadge');
    function setOfflineBadge(text) {
      if (offlineBadge) offlineBadge.textContent = text;
    }
    function markOfflineReady() {
      setOfflineBadge(navigator.onLine ? 'offline ready ✓' : 'offline · no signal');
      if (!localStorage.getItem('kl-pwa-toast')) {
        showToast('Saved for offline.<br>Add to <b>Home screen</b> in Firefox (menu) for trail use.');
        localStorage.setItem('kl-pwa-toast', '1');
      }
    }
    window.addEventListener('online', () => setOfflineBadge('offline ready ✓'));
    window.addEventListener('offline', () => setOfflineBadge('offline · no signal'));

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        if (reg.active) markOfflineReady();
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') markOfflineReady();
          });
        });
        return navigator.serviceWorker.ready;
      }).then(() => markOfflineReady()).catch(() => {
        setOfflineBadge('offline map · self-contained');
      });
    } else {
      setOfflineBadge('offline map · self-contained');
    }`;

let out = src.replace(
  '  <title>Kungsleden · offline GPS</title>',
  headInject + '  <title>Kungsleden · offline GPS</title>'
);
out = out.replace(
  '<div class="offline-badge">offline map · self-contained</div>',
  '<div class="offline-badge" id="offlineBadge">offline map · loading…</div>'
);
out = out.replace(
  '    // optional PWA cache (one-time https visit → then offline)\n    /* standalone: map embedded, no service worker needed */',
  pwaBlock
);

fs.writeFileSync(path.join(dir, 'index.html'), out);
console.log('Wrote index.html from standalone + PWA');

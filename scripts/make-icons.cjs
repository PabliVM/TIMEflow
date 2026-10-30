// Genera los iconos PNG de la PWA a partir de un SVG (requiere Playwright).
const { chromium } = require('playwright');
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#0d7662"/><g transform="translate(${pad ? 77 : 0} ${pad ? 77 : 0}) scale(${pad ? 0.7 : 1})"><path d="M144 176h224M256 176v192" stroke="#fff" stroke-width="48" stroke-linecap="round"/><circle cx="360" cy="344" r="40" fill="#fff"/></g></svg>`;
(async () => {
  const b = await chromium.launch();
  for (const [name, size, pad] of [['icon-192', 192, 0], ['icon-512', 512, 0], ['icon-maskable-512', 512, 1], ['apple-touch-icon', 180, 1]]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<style>body{margin:0}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg(pad)).toString('base64')}" width="${size}" height="${size}">`);
    await p.screenshot({ path: `public/icons/${name}.png`, omitBackground: true });
    await p.close();
  }
  await b.close();
})();

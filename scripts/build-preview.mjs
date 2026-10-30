// Genera un HTML autocontenido de la app (vista previa sin servidor).
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'preview/timeflow.html';
mkdirSync('preview', { recursive: true });

const js = await build({
  entryPoints: ['src/preview/main.tsx'],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  jsx: 'automatic',
  target: 'es2020',
  define: { 'process.env.NODE_ENV': '"production"' },
});
execSync('npx tailwindcss -i src/app/globals.css -o preview/app.css --minify', { stdio: 'inherit' });
const css = readFileSync('preview/app.css', 'utf8');
const code = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

writeFileSync(
  out,
  `<title>TIMEFLOW</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&family=Sora:wght@600;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script>${code}</script>
`,
);
console.log('Preview:', out, Math.round((css.length + code.length) / 1024), 'KB');

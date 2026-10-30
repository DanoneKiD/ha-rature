import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Un seul fichier HTML, polices comprises (aucune police chargée sur le réseau au démarrage) :
// dist/index.html sert à la fois la coquille Flutter (copié dans app/assets/app.html par
// `npm run app`) et la PWA servie par Home Assistant (dossier www, adresse /local/rature/).
export default defineConfig({
  root: 'web',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
  },
  plugins: [viteSingleFile()],
  // Version affichée dans « À propos » (celle de package.json).
  define: { __VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
});

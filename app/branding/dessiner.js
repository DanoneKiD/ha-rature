// Dessine l'icône et l'écran de démarrage de Rature dans le style du Carnet (papier ligné, marge
// rouge, écriture Caveat, trait de feutre rouge), sans aucun site externe : un Canvas dans le
// Chromium de Playwright.
// Usage (depuis la racine du dépôt) : node app/branding/dessiner.js
// Puis, dans app : dart run flutter_launcher_icons && dart run flutter_native_splash:create
//
// Sorties (dans ce dossier) :
//   icone.png                  1024 px, opaque : iOS, Android ancien, base de l'icône du store
//   icone_fond.png             1024 px : fond de l'icône adaptative Android (le papier)
//   icone_avant.png            1024 px, transparent : premier plan adaptatif (le R, dans le cercle sûr de 61 %)
//   demarrage.png              768 px, transparent : écran de démarrage (fond papier dans pubspec.yaml)
//   demarrage_android12.png    1152 px, transparent : Android 12 et plus (contenu dans le cercle central)
//   play_icone_512.png         512 px : icône haute résolution de la fiche Google Play
//   web/src/pages/icone.png    192 px : la même, en petit, sur la fiche de « À propos »
// La police est celle de l'app (Caveat, OFL), lue dans node_modules/@fontsource/caveat.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, '../..');
const police = fs
  .readFileSync(path.join(racine, 'node_modules/@fontsource/caveat/files/caveat-latin-700-normal.woff2'))
  .toString('base64');

const base = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const dir = fs
  .readdirSync(base)
  .filter((d) => /^chromium-\d+$/.test(d))
  .sort((a, b) => +a.split('-')[1] - +b.split('-')[1])
  .pop();
const browser = await chromium.launch({ executablePath: path.join(base, dir, 'chrome-win64', 'chrome.exe'), headless: true });

// Code exécuté dans la page : toutes les cotes sont données pour une image de 1024 px.
const dessin = async ({ police, taille, papier, motif, echelle }) => {
  const f = new FontFace('Caveat', `url(data:font/woff2;base64,${police})`, { weight: '700' });
  await f.load();
  document.fonts.add(f);
  const c = document.createElement('canvas');
  c.width = c.height = taille;
  const g = c.getContext('2d');
  g.scale(taille / 1024, taille / 1024);
  const ENCRE = '#23324A';
  const ROUGE = '#B0453A';

  if (papier) {
    g.fillStyle = '#F7F1E3';
    g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = '#BFD0DC';
    g.lineWidth = 6;
    for (let y = 152; y < 1024; y += 128) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke();
    }
    g.strokeStyle = '#E2A0A0';
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(196, 0); g.lineTo(196, 1024); g.stroke();
  }
  if (!motif) return c.toDataURL('image/png');

  // Le motif, centré sur (512, 512) et mis à l'échelle : texte à la main, souligné au feutre.
  g.translate(512, 512);
  g.scale(echelle, echelle);
  g.rotate(-0.04);
  const mot = motif === 'R' ? 'R' : 'Rature';
  const corps = motif === 'R' ? 760 : 300;
  g.font = `700 ${corps}px Caveat`;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  // On centre le tracé réel (lettres et soulignement), pas la case de la police : le R penché de
  // Caveat déborde à droite de sa case, centrer la case décalerait le dessin.
  const m = g.measureText(mot);
  const encre = { g: -m.actualBoundingBoxLeft, d: m.actualBoundingBoxRight, h: -m.actualBoundingBoxAscent };
  const large = encre.d - encre.g;
  const ecart = corps * 0.12;
  const trait = corps * 0.06;
  // Le trait de feutre : légèrement courbe et penché, il dépasse un peu à gauche.
  const t0 = { x: encre.g - large * 0.06, y: ecart + trait * 0.2 };
  const t1 = { x: encre.d, y: ecart - trait * 0.9 };
  const gauche = Math.min(encre.g, t0.x) - trait / 2;
  const droite = Math.max(encre.d, t1.x) + trait / 2;
  const bas = t0.y + trait / 2;
  const dx = -(gauche + droite) / 2;
  const dy = -(encre.h + bas) / 2;
  g.fillStyle = ENCRE;
  g.fillText(mot, dx, dy);
  g.strokeStyle = ROUGE;
  g.lineWidth = trait;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(dx + t0.x, dy + t0.y);
  g.quadraticCurveTo(dx + (t0.x + t1.x) / 2, dy + ecart - trait * 0.6, dx + t1.x, dy + t1.y);
  g.stroke();
  return c.toDataURL('image/png');
};

const page = await browser.newPage();
const sortie = async (nom, options) => {
  const url = await page.evaluate(dessin, { police, ...options });
  fs.writeFileSync(path.join(ici, nom), Buffer.from(url.split(',')[1], 'base64'));
  console.log('écrit', nom);
};

await sortie('icone.png', { taille: 1024, papier: true, motif: 'R', echelle: 0.9 });
await sortie('play_icone_512.png', { taille: 512, papier: true, motif: 'R', echelle: 0.9 });
await sortie('../../web/src/pages/icone.png', { taille: 192, papier: true, motif: 'R', echelle: 0.9 });
await sortie('icone_fond.png', { taille: 1024, papier: true });
// Premier plan adaptatif : le masque du lanceur ne garde sûrement que le cercle central de 61 %.
await sortie('icone_avant.png', { taille: 1024, motif: 'R', echelle: 0.62 });
await sortie('demarrage.png', { taille: 768, motif: 'Rature', echelle: 1 });
// Android 12 : l'image fait 1152 px, seul le cercle central de 768 px est visible.
await sortie('demarrage_android12.png', { taille: 1152, motif: 'Rature', echelle: 0.76 });
await browser.close();

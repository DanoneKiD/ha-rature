// Chaque clé écrite en toutes lettres dans le code existe dans les trois langues : `npm test`.
// Vues : t('cle'), et les clés d'une condition, t(n === 1 ? 'a.b' : 'a.c').
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TEXTES } from './i18n.js';

const src = fileURLToPath(new URL('..', import.meta.url));
const fichiers = (dossier) =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((f) =>
    f.isDirectory() ? fichiers(join(dossier, f.name)) : f.name.endsWith('.js') && !f.name.endsWith('.test.js') ? [join(dossier, f.name)] : [],
  );

test('les clés de t() existent en français, anglais et allemand', () => {
  const manquantes = [];
  // Le fichier des textes lui-même est exclu : ses commentaires citent t('cle') en exemple.
  for (const f of fichiers(src).filter((f) => !f.endsWith('i18n.js'))) {
    for (const [, args] of readFileSync(f, 'utf8').matchAll(/\bt\(([^()]*?)[,)]/g)) {
      for (const [, cle] of args.matchAll(/'(\w+\.[\w.]+)'/g)) {
        for (const langue of Object.keys(TEXTES)) if (!(cle in TEXTES[langue])) manquantes.push(`${langue} ${cle} (${f})`);
      }
    }
  }
  assert.deepEqual(manquantes, []);
});

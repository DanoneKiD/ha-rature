// Tests du modèle : `npm test` (node --test, sans dépendance).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avecNombre, cle, ecrireDescription, lireDescription, nombre, quantite } from './modele.js';

test('anti-doublon : accents, casse, pluriel et quantité ne comptent pas', () => {
  assert.equal(cle('Bananes ×6'), cle('banane'));
  assert.equal(cle('  Œufs  x12 '), cle('oeuf'));
  assert.equal(cle('Pâtes'), cle('pates'));
  assert.equal(cle('Lait 2 L'), cle('lait'));
  assert.notEqual(cle('Pain'), cle('Pâtes'));
  assert.notEqual(cle('Vis 4x80'), cle('Vis 6x40'));
  assert.equal(cle('Bananes×6'), cle('banane'));
});

test('description : la ligne [rature] se lit et se réécrit', () => {
  const d = ecrireDescription('bio si possible', { par: 'Alex', via: 'voix', rayon: '' });
  assert.equal(d, 'bio si possible\n[rature] par=Alex; via=voix');
  assert.deepEqual(lireDescription(d), { note: 'bio si possible', meta: { par: 'Alex', via: 'voix' } });
  assert.deepEqual(lireDescription('note seule'), { note: 'note seule', meta: {} });
  assert.deepEqual(lireDescription(null), { note: '', meta: {} });
});

test('quantité séparée du libellé', () => {
  assert.deepEqual(quantite('Bananes ×6'), { libelle: 'Bananes', qte: '×6' });
  assert.deepEqual(quantite('Tomates 1 kg'), { libelle: 'Tomates', qte: '1 kg' });
  assert.deepEqual(quantite('Café'), { libelle: 'Café', qte: null });
  assert.deepEqual(quantite('3 tomates'), { libelle: 'tomates', qte: '×3' });
  assert.deepEqual(quantite('Vis 4x80'), { libelle: 'Vis 4x80', qte: null });
  assert.equal(nombre('Tomates ×3'), 3);
  assert.equal(nombre('Tomates 1 kg'), 1);
  assert.equal(avecNombre(' Tomates ', 3), 'Tomates ×3');
  assert.equal(avecNombre('Tomates', 1), 'Tomates');
  assert.equal(cle(avecNombre('Tomates', 4)), cle('tomate'));
});

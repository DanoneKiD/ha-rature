// Tests de l'organisation de la liste à l'écran : `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem() {} };
const { organiser, separer } = await import('./vue.js');

const art = (nom, ajoute) => ({ uid: nom, nom, ajoute });
const LISTE = [art('Pâtes', 300), art('lait', 100), art('Bananes ×6', 200), art('Café', 200), art('beurre', null)];
const noms = (groupes) => groupes.flatMap((g) => g.articles.map((a) => a.nom));

test('à la main : l’ordre de HA, regroupé par rayon dans l’ordre des rayons', () => {
  const g = organiser(LISTE, { tri: 'main', rayons: true });
  assert.deepEqual(g.map((x) => x.rayon), ['fruits', 'cremerie', 'epicerie']);
  assert.deepEqual(noms(g), ['Bananes ×6', 'lait', 'beurre', 'Pâtes', 'Café']);
});

test('sans rayons : un seul groupe', () => {
  const g = organiser(LISTE, { tri: 'main', rayons: false });
  assert.equal(g.length, 1);
  assert.equal(g[0].rayon, null);
  assert.deepEqual(noms(g), LISTE.map((a) => a.nom));
});

test('par date : à égalité, l’ordre de HA (ajouts à la fin) départage ; sans date, le plus vieux', () => {
  assert.deepEqual(noms(organiser(LISTE, { tri: 'recent', rayons: false })), ['Pâtes', 'Café', 'Bananes ×6', 'lait', 'beurre']);
  assert.deepEqual(noms(organiser(LISTE, { tri: 'ancien', rayons: false })), ['beurre', 'lait', 'Bananes ×6', 'Café', 'Pâtes']);
});

test('cochés : en bas par défaut, à leur place sur demande, ou gardés un instant', () => {
  const l = [{ nom: 'a', fait: false }, { nom: 'b', fait: true }, { nom: 'c', fait: true }];
  assert.deepEqual(separer(l).faits.map((a) => a.nom), ['b', 'c']);
  assert.deepEqual(separer(l, { coches: 'place' }).faits, []);
  assert.deepEqual(separer(l, {}, (a) => a.nom === 'c').actifs.map((a) => a.nom), ['a', 'c']);
});

test('par nom : sans accents ni casse, quantité ignorée', () => {
  assert.deepEqual(noms(organiser(LISTE, { tri: 'nom', rayons: false })), ['Bananes ×6', 'beurre', 'Café', 'lait', 'Pâtes']);
});

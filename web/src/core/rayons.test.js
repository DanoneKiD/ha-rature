// Tests du rangement par rayon : `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem() {} };
const { rayonDe } = await import('./rayons.js');

const rayon = (nom, extra = {}) => rayonDe({ nom, ...extra });

test('les trois langues vont aux mêmes rayons', () => {
  for (const nom of ['Lait 2 L', 'Milk', 'Milch 2 L', 'Œufs ×12', 'Eggs ×12', 'Eier ×12']) assert.equal(rayon(nom), 'cremerie', nom);
  for (const nom of ['Bananes ×6', 'Bananas', 'Bananen ×6', 'Tomates 1 kg', 'Tomatoes', 'Tomaten 1 kg', 'Pommes', 'Äpfel'])
    assert.equal(rayon(nom), 'fruits', nom);
  for (const nom of ['Pâtes', 'Pasta', 'Nudeln', 'Café', 'Kaffee']) assert.equal(rayon(nom), 'epicerie', nom);
});

test('un mot qui suit le mot-clé ne gêne pas, un mot qui le prolonge si', () => {
  assert.equal(rayon('Lait d’avoine'), 'cremerie');
  assert.equal(rayon('Painting'), 'divers');
});

test('rayon= de la description : identifiant ou libellé, dans n’importe quelle langue', () => {
  assert.equal(rayon('Truc', { rayon: 'surgeles' }), 'surgeles');
  assert.equal(rayon('Truc', { rayon: 'Crèmerie' }), 'cremerie');
  assert.equal(rayon('Truc', { rayon: 'Dairy & eggs' }), 'cremerie');
  assert.equal(rayon('Truc', { rayon: 'Rayon bio' }), 'Rayon bio');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creerSourceDemo } from './source-demo.js';
import { creerStore } from './store.js';

const LISTE = { entity_id: 'todo.essai', nom: 'Essai', description: false, deplacer: true };

/** Une source minimale : `pousse` joue le rôle de l'abonnement à HA. */
async function preparer() {
  const s = { pousse: null, ajouts: [] };
  const source = {
    nom: 'essai',
    connecte: true,
    demarrer: async () => {},
    listes: async () => [LISTE],
    abonner: (_, cb) => ((s.pousse = cb), () => {}),
    ajouter: async (_, op) => void s.ajouts.push(op.summary),
    modifier: async () => {},
    supprimer: async () => {},
  };
  const store = creerStore(source);
  await store.demarrer();
  return { store, source, ajouts: s.ajouts, pousse: (items) => s.pousse(items) };
}
const attendre = () => new Promise((r) => setTimeout(r, 5));
const noms = (store) => store.articles.map((a) => a.nom);
const item = (summary) => ({ uid: 'u1', summary, status: 'needs_action' });

test('renommer juste après un ajout ne fait pas réapparaître l’ancien nom', async () => {
  const { store, pousse } = await preparer();
  store.ajouter('Lait');
  pousse([item('Lait')]); // HA renvoie l'article avant de confirmer l'envoi
  await attendre();
  store.renommer(store.articles[0], 'Lait entier');
  await attendre();
  pousse([item('Lait entier')]);
  assert.deepEqual(noms(store), ['Lait entier']);
});

test('supprimer juste après un ajout ne fait pas réapparaître l’article', async () => {
  const { store, pousse } = await preparer();
  store.ajouter('Lait');
  pousse([item('Lait')]);
  await attendre();
  store.supprimer(store.articles[0]);
  await attendre();
  pousse([]);
  assert.deepEqual(noms(store), []);
});

test('renommer un ajout que HA n’a pas encore renvoyé le garde affiché', async () => {
  const { store, pousse } = await preparer();
  store.ajouter('Lait');
  await attendre();
  store.renommer(store.articles[0], 'Lait entier');
  await attendre();
  assert.deepEqual(noms(store), ['Lait entier']);
  pousse([item('Lait entier')]);
  assert.deepEqual(noms(store), ['Lait entier']);
});

test('un article retiré ailleurs juste après son ajout ne réapparaît pas', async () => {
  const { store, pousse } = await preparer();
  pousse([]);
  store.ajouter('Lait');
  pousse([item('Lait')]); // reçu avant la confirmation de l'envoi
  await attendre();
  pousse([]);
  assert.deepEqual(noms(store), []);
});

test('un ajout hors ligne attend que HA ait fini de démarrer', async () => {
  const { store, source, ajouts } = await preparer();
  const vraies = source.listes;
  source.connecte = false;
  source.onEtat(false);
  store.ajouter('Lait');
  // HA répond, mais finit de démarrer : ni listes, ni envoi.
  source.listes = async () => null;
  source.connecte = true;
  source.onEtat(true);
  await attendre();
  assert.deepEqual(ajouts, []);
  // HA est prêt : l'envoi part.
  source.listes = vraies;
  source.onEtat(true);
  await attendre();
  assert.deepEqual(ajouts, ['Lait']);
});

test('une coupure pendant un envoi garde l’opération, même avant la fin de la connexion', async () => {
  const { store, source, ajouts } = await preparer();
  const vrai = source.ajouter;
  source.ajouter = async () => {
    throw 3; // ERR_CONNECTION_LOST
  };
  store.ajouter('Lait');
  await attendre();
  assert.equal(store.enAttente, 1);
  source.ajouter = vrai;
  source.connecte = false;
  source.onEtat(false);
  source.connecte = true;
  source.onEtat(true);
  await attendre();
  assert.deepEqual(ajouts, ['Lait']);
  assert.equal(store.enAttente, 0);
});

test('en démo, chaque geste aboutit (la source répond sans attendre)', async () => {
  const store = creerStore(creerSourceDemo());
  await store.demarrer();
  await attendre();
  const depart = store.articles.length;
  store.ajouter('Essai démo');
  await attendre();
  assert.equal(store.articles.length, depart + 1);
  const a = store.articles.find((x) => x.nom === 'Essai démo');
  store.basculer(a);
  await attendre();
  assert.equal(store.articles.find((x) => x.nom === 'Essai démo').fait, true);
  store.renommer(store.articles.find((x) => x.nom === 'Essai démo'), 'Essai renommé');
  await attendre();
  store.supprimer(store.articles.find((x) => x.nom === 'Essai renommé'));
  await attendre();
  assert.equal(store.articles.length, depart);
  assert.equal(store.enAttente, 0);
});

test('une lecture des listes ratée se réessaie et la file repart', async () => {
  const { store, source, ajouts } = await preparer();
  const vraies = source.listes;
  source.connecte = false;
  source.onEtat(false);
  store.ajouter('Lait');
  source.listes = async () => {
    source.listes = vraies;
    throw new Error('get_config');
  };
  source.connecte = true;
  source.onEtat(true);
  await new Promise((r) => setTimeout(r, 3100));
  assert.deepEqual(ajouts, ['Lait']);
});

test('un ajout envoyé reste affiché tant que HA ne l’a pas renvoyé', async () => {
  const { store, pousse } = await preparer();
  store.ajouter('Lait');
  await attendre();
  assert.deepEqual(noms(store), ['Lait']);
  pousse([item('Lait')]);
  assert.deepEqual(noms(store), ['Lait']);
});

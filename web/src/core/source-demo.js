// Source de démonstration : une liste fictive, sans Home Assistant. Sert au développement, aux
// captures des stores et aux examinateurs de Google et d'Apple (qui n'ont pas de HA).
// Même interface que source-ha.js.
import { langueCourante } from './i18n.js';
import { A_FAIRE, FAIT } from './modele.js';

// Une liste par langue de l'interface : les examinateurs des stores la voient en anglais.
const v = (appareil) => `[rature] via=voix; appareil=${appareil}`;
const DEPART = {
  fr: {
    noms: ['Courses', 'Maison'],
    courses: [['Bananes ×6'], ['Tomates 1 kg'], ['Avocats ×2', 'par=Alex'], ['Pommes', null, FAIT], ['Lait 2 L'],
      ['Œufs ×12', v('Show')], ['Café', v('Show')], ['Pâtes']],
    maison: 'Changer l’ampoule du garage',
  },
  en: {
    noms: ['Shopping', 'House'],
    courses: [['Bananas ×6'], ['Tomatoes 1 kg'], ['Avocados ×2', 'par=Sam'], ['Apples', null, FAIT], ['Milk 2 L'],
      ['Eggs ×12', v('kitchen')], ['Coffee', v('kitchen')], ['Pasta']],
    maison: 'Change the garage bulb',
  },
  de: {
    noms: ['Einkauf', 'Haushalt'],
    courses: [['Bananen ×6'], ['Tomaten 1 kg'], ['Avocados ×2', 'par=Lena'], ['Äpfel', null, FAIT], ['Milch 2 L'],
      ['Eier ×12', v('Küche')], ['Kaffee', v('Küche')], ['Nudeln']],
    maison: 'Glühbirne in der Garage wechseln',
  },
};

export function creerSourceDemo() {
  let n = 0;
  const d = DEPART[langueCourante()] ?? DEPART.en;
  const article = ([summary, meta = null, status = A_FAIRE]) => ({
    uid: `demo-${++n}`,
    summary,
    status,
    description: meta && (meta.startsWith('[') ? meta : `[rature] ${meta}`),
    due: null,
  });
  const listes = {
    'todo.courses': d.courses.map(article),
    'todo.maison': [article([d.maison])],
  };
  const noms = { 'todo.courses': d.noms[0], 'todo.maison': d.noms[1] };
  const abonnes = {};
  const pousser = (id) => (abonnes[id] || []).forEach((cb) => cb(structuredClone(listes[id])));
  const trouver = (id, ref) => listes[id].find((i) => i.uid === ref || i.summary === ref);

  return {
    nom: 'demo',
    connecte: true,
    onEtat: null,
    async demarrer() {},
    async listes() {
      return Object.entries(noms).map(([entity_id, nom]) => ({ entity_id, nom, description: true, deplacer: true }));
    },
    async renommerListe(id, nom) {
      noms[id] = nom;
    },
    async creerListe(nom) {
      const id = `todo.demo_${++n}`;
      noms[id] = nom;
      listes[id] = [];
      return id;
    },
    abonner(id, cb) {
      (abonnes[id] ||= []).push(cb);
      queueMicrotask(() => cb(structuredClone(listes[id])));
      return () => (abonnes[id] = abonnes[id].filter((f) => f !== cb));
    },
    async ajouter(id, { summary, description }) {
      // Comme local_todo : un article ajouté va en fin de liste.
      listes[id].push({ uid: `demo-${++n}`, summary, description: description || null, status: A_FAIRE, due: null });
      pousser(id);
    },
    async modifier(id, ref, { status, rename, description }) {
      const i = trouver(id, ref);
      if (!i) return;
      if (status) i.status = status;
      if (rename) i.summary = rename;
      if (description !== undefined) i.description = description;
      pousser(id);
    },
    async purger(id) {
      listes[id] = listes[id].filter((i) => i.status !== FAIT);
      pousser(id);
    },
    async supprimer(id, ref) {
      listes[id] = listes[id].filter((i) => i.uid !== ref && i.summary !== ref);
      pousser(id);
    },
    async deplacer(id, uid, previousUid) {
      const l = listes[id];
      const i = l.findIndex((x) => x.uid === uid);
      if (i < 0) return;
      const [el] = l.splice(i, 1);
      const j = previousUid ? l.findIndex((x) => x.uid === previousUid) + 1 : 0;
      l.splice(j, 0, el);
      pousser(id);
    },
    pause() {},
    reprise() {},
  };
}

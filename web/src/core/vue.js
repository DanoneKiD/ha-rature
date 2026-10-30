// Organisation de la liste à l'écran, commune à tous les skins : l'ordre (tri) et le regroupement
// par rayon, d'après les réglages de l'appareil (`store.affichage`).
//
// Tris :
//   - `main` : l'ordre de la liste dans HA, celui qu'on change en glissant un article ;
//   - `recent`, `ancien` : la date d'ajout. HA ne la garde pas : c'est `le=` dans la description
//     (écrit par Rature et par la phrase Assist), sinon le moment où cet appareil a vu l'article
//     pour la première fois (store.js). À égalité, l'ordre HA départage : HA range les ajouts à
//     la fin, donc plus loin dans HA veut dire plus récent (tant qu'on n'a rien déplacé) ;
//   - `nom` : alphabétique, dans la langue de l'interface, sans tenir compte des accents ni de la
//     casse, les nombres dans l'ordre naturel.
//
// Cochés (`coches`) : `bas` (par défaut) les sort de la liste vers « Dans le panier », en bas et
// repliable ; `place` les laisse où ils sont, raturés.
import { langueCourante } from './i18n.js';
import { quantite } from './modele.js';
import { rayonDe, tousLesRayons } from './rayons.js';

export const TRIS = ['main', 'recent', 'ancien', 'nom'];

/**
 * Rend les groupes à dessiner : `[{ rayon, articles }]`. Sans regroupement, un seul groupe, de
 * rayon null.
 */
export function organiser(articles, { tri = 'main', rayons = true } = {}) {
  const tries = trier(articles, tri);
  if (!rayons) return [{ rayon: null, articles: tries }];
  const groupes = new Map();
  for (const a of tries) {
    const r = rayonDe(a);
    if (!groupes.has(r)) groupes.set(r, []);
    groupes.get(r).push(a);
  }
  const ordre = tousLesRayons([...groupes.keys()]);
  return ordre.filter((r) => groupes.has(r)).map((rayon) => ({ rayon, articles: groupes.get(rayon) }));
}

/** `{ actifs, faits }` : les cochés à part, sauf réglage `place` (et sauf `garder(a)` vrai). */
export function separer(articles, { coches = 'bas' } = {}, garder = () => false) {
  if (coches === 'place') return { actifs: articles, faits: [] };
  const actifs = [];
  const faits = [];
  for (const a of articles) (a.fait && !garder(a) ? faits : actifs).push(a);
  return { actifs, faits };
}

export function trier(articles, tri) {
  const l = articles.map((a, i) => ({ a, i }));
  if (tri === 'recent' || tri === 'ancien') {
    const sens = tri === 'recent' ? -1 : 1;
    l.sort((x, y) => sens * ((x.a.ajoute ?? 0) - (y.a.ajoute ?? 0) || x.i - y.i));
  } else if (tri === 'nom') {
    const c = new Intl.Collator(langueCourante(), { sensitivity: 'base', numeric: true });
    l.sort((x, y) => c.compare(quantite(x.a.nom).libelle, quantite(y.a.nom).libelle) || x.i - y.i);
  }
  return l.map((x) => x.a);
}

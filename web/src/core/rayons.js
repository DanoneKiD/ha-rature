// Dictionnaire local article vers rayon. Home Assistant ne stocke pas de rayon : un article sans
// `rayon=` dans sa description est rangé d'après ce dictionnaire, puis d'après les choix de
// l'utilisateur (mémorisés dans localStorage, donc recopiés dans les préférences natives par la
// coquille). Liste de départ volontairement courte : elle s'enrichit à l'usage.
//
// Un rayon est un identifiant stable (`cremerie`), affiché dans la langue de l'appareil
// (i18n.js, `rayon.<id>`). Les mots-clés mêlent français, anglais et allemand : dans une maison où
// l'un écrit « lait » et l'autre « Milch », les deux vont au même rayon.
//
// Rayons ajoutés : l'utilisateur en crée depuis le post-it d'un article. Un tel rayon n'a pas
// d'identifiant : son nom en tient lieu (affiché tel quel, comme un rayon écrit à la main dans HA).
// La liste est sur l'appareil ; sur une liste qui garde la description, `rayon=` part dans HA et
// l'autre téléphone voit le rayon (il l'ajoute alors aux siens).
import { t } from './i18n.js';
import { cle } from './modele.js';

export const RAYONS = ['fruits', 'cremerie', 'boucherie', 'boulangerie', 'epicerie', 'surgeles', 'boissons', 'maison', 'divers'];

const DEPART = {
  fruits:
    'banane tomate avocat pomme poire orange citron salade carotte oignon ail pomme de terre courgette fraise raisin ' +
    'banana tomato avocado apple pear lemon lettuce carrot onion garlic potato zucchini strawberry grape ' +
    'banane tomate avocado apfel birne zitrone salat karotte mohre zwiebel knoblauch kartoffel zucchini erdbeere traube',
  cremerie:
    'lait oeuf beurre yaourt fromage creme emmental mozzarella ' +
    'milk egg butter yogurt yoghurt cheese cream ' +
    'milch eier butter joghurt kase sahne quark',
  boucherie:
    'poulet steak jambon lardon saumon poisson viande ' +
    'chicken ham bacon salmon fish meat beef pork ' +
    'hahnchen schinken speck lach fisch fleisch hackfleisch wurst',
  boulangerie: 'pain baguette brioche croissant bread bagel brot brotchen semmel',
  epicerie:
    'cafe the pate riz farine sucre sel huile vinaigre conserve biscuit chocolat cereale ' +
    'coffee tea pasta rice flour sugar salt oil vinegar cookie chocolate cereal ' +
    'kaffee tee nudeln rei mehl zucker salz ol essig keks schokolade musli',
  surgeles: 'glace frite surgele ice frozen fries eis tiefkuhl',
  boissons: 'eau jus biere vin soda water juice beer wine wasser saft bier wein sprudel',
  maison:
    'papier toilette essuie-tout lessive liquide vaisselle savon dentifrice shampoing ' +
    'toilet paper kitchen roll detergent dish soap toothpaste shampoo ' +
    'toilettenpapier kuchenrolle waschmittel spulmittel seife zahnpasta shampoo',
};

const CLE_STOCKAGE = 'rature.rayons';
const CLE_AJOUTES = 'rature.rayonsAjoutes';

function lire(cleStockage, defaut) {
  try {
    return JSON.parse(localStorage.getItem(cleStockage)) ?? defaut;
  } catch {
    return defaut;
  }
}

/** Rayons créés par l'utilisateur, dans l'ordre de création. */
export const rayonsAjoutes = () => lire(CLE_AJOUTES, []);

/**
 * Tous les rayons, dans l'ordre du magasin : ceux de départ, les ajoutés, « Divers » en dernier.
 * `presents` : les rayons des articles affichés, pour reprendre ceux venus de HA.
 */
export function tousLesRayons(presents = []) {
  const ajoutes = [...rayonsAjoutes()];
  for (const r of presents) if (!RAYONS.includes(r) && !ajoutes.includes(r)) ajoutes.push(r);
  return [...RAYONS.slice(0, -1), ...ajoutes, 'divers'];
}

/** Crée un rayon ; rend son identifiant (celui de départ s'il existe déjà sous ce nom). */
export function ajouterRayon(nom) {
  nom = nom.replace(/\s+/g, ' ').trim();
  if (!nom) return null;
  const id = idRayon(nom);
  if (RAYONS.includes(id)) return id;
  const ajoutes = rayonsAjoutes();
  const deja = ajoutes.find((r) => cle(r) === cle(nom));
  if (deja) return deja;
  try {
    localStorage.setItem(CLE_AJOUTES, JSON.stringify([...ajoutes, nom]));
  } catch {
    /* stockage indisponible : le rayon vivra le temps de la session */
  }
  return nom;
}

function appris() {
  try {
    return JSON.parse(localStorage.getItem(CLE_STOCKAGE) || '{}');
  } catch {
    return {};
  }
}

/** Libellé affiché d'un rayon ; un rayon inconnu (écrit à la main dans HA) s'affiche tel quel. */
export const nomRayon = (id) => (RAYONS.includes(id) ? t(`rayon.${id}`) : id);

/**
 * `rayon=` lu dans une description : un identifiant, ou un libellé dans n'importe quelle langue
 * (« Crèmerie », « Dairy & eggs »). Rend l'identifiant, sinon le texte tel quel.
 */
function idRayon(texte) {
  const k = cle(texte);
  if (RAYONS.includes(k)) return k;
  return RAYONS.find((id) => ['fr', 'en', 'de'].some((l) => cle(t.dans(l, `rayon.${id}`)) === k)) ?? texte;
}

/** Rayon d'un article : métadonnée HA, sinon choix appris, sinon dictionnaire, sinon « divers ». */
export function rayonDe(article) {
  if (article.rayon) return idRayon(article.rayon);
  const k = cle(article.nom);
  const choix = appris()[k];
  if (choix) return choix;
  for (const [rayon, mots] of Object.entries(DEPART)) {
    if (mots.split(' ').some((m) => correspond(k, cle(m)))) return rayon;
  }
  return 'divers';
}

/**
 * Le mot-clé commence l'article, suivi au plus d'une fin de pluriel que `cle()` ne retire pas
 * (l'allemand : Tomate, Tomaten ; Ei, Eier), puis de rien ou d'un autre mot (« lait d'avoine »).
 */
const correspond = (k, m) => k.startsWith(m) && /^(n|en|e|er)?( |$)/.test(k.slice(m.length));

/** Mémorise le rayon choisi pour un article (sur cet appareil seulement). */
export function apprendreRayon(nom, rayon) {
  const a = appris();
  a[cle(nom)] = rayon;
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(a));
  } catch {
    /* stockage indisponible : tant pis, le rayon sera redemandé */
  }
}

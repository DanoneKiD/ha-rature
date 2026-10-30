// Modèle d'un article, commun à toutes les sources (démo, Home Assistant) et à tous les skins.
//
// Home Assistant ne connaît que quatre champs par élément de liste : `summary`, `description`,
// `due` et `status` (plus `uid`). Le rayon, l'auteur et l'origine (« dicté ») n'existent pas.
// Format retenu : une dernière ligne de la
// description, lisible dans l'interface de HA, que Rature lit et écrit :
//
//   [rature] par=Alex; via=voix; appareil=Show; rayon=cremerie; le=2026-10-26T07:12:05Z
//
// `le=` : la date d'ajout, en UTC à la seconde (à la minute, un ajout semblerait plus vieux que les
// articles que le téléphone a vus arriver plus tôt dans la même minute). HA ne la garde pas ; Rature et la phrase Assist
// l'écrivent, et le tri par date s'en sert (vue.js).
//
// Tout ce qui précède cette ligne reste une note libre. Une liste qui ne gère pas la description
// (l'intégration `shopping_list`, la « Liste de courses » par défaut de HA) n'aura jamais ces
// informations : le rayon vient alors du dictionnaire local (rayons.js).

export const A_FAIRE = 'needs_action';
export const FAIT = 'completed';

const MARQUE = '[rature]';

/** Lit la ligne `[rature] ...` d'une description. Rend { note, meta }. */
export function lireDescription(description) {
  const lignes = (description || '').split('\n');
  const meta = {};
  const derniere = lignes[lignes.length - 1]?.trim() ?? '';
  if (derniere.startsWith(MARQUE)) {
    lignes.pop();
    for (const morceau of derniere.slice(MARQUE.length).split(';')) {
      const i = morceau.indexOf('=');
      if (i > 0) meta[morceau.slice(0, i).trim()] = morceau.slice(i + 1).trim();
    }
  }
  return { note: lignes.join('\n').trim(), meta };
}

/** Horodatage de `le=` : UTC, à la seconde (« 2026-10-26T07:12:05Z »). */
export const maintenant = () => new Date().toISOString().slice(0, 19) + 'Z';

/** Écrit une description à partir d'une note libre et des métadonnées (clés vides ignorées). */
export function ecrireDescription(note, meta) {
  const paires = Object.entries(meta || {})
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `${k}=${String(v).replace(/[;\n]/g, ' ').trim()}`);
  const ligne = paires.length ? `${MARQUE} ${paires.join('; ')}` : '';
  return [note?.trim(), ligne].filter(Boolean).join('\n');
}

/** Article HA brut vers article Rature. */
export function depuisHA(item) {
  const { note, meta } = lireDescription(item.description);
  return {
    uid: item.uid,
    nom: item.summary ?? '',
    fait: item.status === FAIT,
    note,
    par: meta.par || null,
    via: meta.via || null,
    appareil: meta.appareil || null,
    rayon: meta.rayon || null,
    le: meta.le || null,
    due: item.due ?? null,
  };
}

/**
 * Clé de comparaison pour l'anti-doublon : sans accents, sans casse, sans espaces superflus,
 * sans quantité finale (« Bananes ×6 », « Lait 2 L ») ni pluriel simple en s ou x.
 */
export function cle(nom) {
  let s = (nom || '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  // « ×6 » collé ou non, mais « x » seulement après une espace : « Vis 4x80 » est une dimension.
  s = s.replace(/(\s+[x×]|×)\s*\d+$/u, '').replace(/\s+\d+([.,]\d+)?\s*(kg|g|l|cl|ml)?$/u, '');
  s = s.replace(/^\d+\s+/, '');
  return s.split(' ').map((m) => (m.length > 3 ? m.replace(/[sx]$/, '') : m)).join(' ');
}

/**
 * Sépare le nom et la quantité, pour l'affichage : « Bananes ×6 » donne ×6, et un nombre en tête
 * (« 3 tomates », comme on le dicte) aussi : ×3.
 */
export function quantite(nom) {
  const m = (nom || '').match(/^(.*?)\s+((?:×|x)\s*\d+|\d+([.,]\d+)?\s*(?:kg|g|l|L|cl|ml))$/u);
  if (m) return { libelle: m[1], qte: m[2].replace(/^x\s*/, '×') };
  const d = (nom || '').match(/^(\d+)\s+(\D.*)$/u);
  return d ? { libelle: d[2], qte: `×${d[1]}` } : { libelle: nom, qte: null };
}

/** Le nombre d'exemplaires (« ×3 ») ; 1 sans quantité ou pour un poids, un volume. */
export function nombre(nom) {
  const { qte } = quantite(nom);
  return qte?.startsWith('×') ? Number(qte.slice(1)) || 1 : 1;
}

/** Nom écrit avec son nombre : « Tomates ×3 », ou le nom seul pour un exemplaire. */
export function avecNombre(libelle, n) {
  libelle = libelle.replace(/\s+/g, ' ').trim();
  return n > 1 ? `${libelle} ×${n}` : libelle;
}

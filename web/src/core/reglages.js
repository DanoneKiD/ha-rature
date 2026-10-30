// Réglages de l'appareil (localStorage, recopié dans les préférences natives par la coquille).
// Aucun secret ici : dans l'app, les jetons de HA vivent dans le stockage sécurisé de la coquille
// (app/lib/connexion_ha.dart) ; dans un navigateur, la bibliothèque HA les garde elle-même.
const CLE = 'rature.reglages';

const DEFAUT = {
  mode: 'demo', // 'demo' ou 'ha'
  url: '', // adresse de Home Assistant, ex. http://192.168.1.10:8123
  skin: 'carnet',
  moi: '', // prénom tapé dans les réglages, écrit dans `par=` des articles ajoutés d'ici
  moiHA: '', // à défaut, le nom du compte HA connecté (retenu pour le démarrage hors ligne)
  tri: 'main', // 'main' (ordre de HA), 'recent', 'ancien', 'nom' : voir vue.js
  rayons: true, // regrouper par rayon
  coches: 'bas', // 'bas' (« Dans le panier », repliable) ou 'place'
  panierOuvert: false, // section des cochés dépliée
  langue: 'auto', // 'auto' (celle du téléphone), ou un code de i18n.js (fr, en, de)
  accueilVu: false, // présentation du premier lancement déjà passée
};

export function lireReglages() {
  try {
    return { ...DEFAUT, ...JSON.parse(localStorage.getItem(CLE) || '{}') };
  } catch {
    return { ...DEFAUT };
  }
}

/** Enregistre les champs donnés ; les autres réglages restent tels quels. */
export function ecrireReglages(champs) {
  try {
    localStorage.setItem(CLE, JSON.stringify({ ...lireReglages(), ...champs }));
  } catch {
    /* rien */
  }
}

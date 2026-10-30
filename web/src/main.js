// Démarrage : langue, réglages, source (démo ou Home Assistant), store, skin choisi ; présentation
// du premier lancement, page des réglages, page « À propos ».
import './base.css';
import { brancherCoquille, dansCoquille, erreur, natif } from './core/coquille.js';
import { definirLangue, t } from './core/i18n.js';
import { lireReglages, ecrireReglages } from './core/reglages.js';
import { creerSourceDemo } from './core/source-demo.js';
import { creerSourceHA } from './core/source-ha.js';
import { creerStore } from './core/store.js';
import { ouvrirAccueil } from './pages/accueil.js';
import { ouvrirAPropos, pourboiresPossibles } from './pages/apropos.js';
import { ouvrirReglages as pageReglages } from './pages/reglages.js';
import { SKINS } from './skins/index.js';

const racine = document.getElementById('app');
let demonter = null;
let store = null;
let fermerReglages = null;
let fermerAccueil = null;

async function lancer() {
  const r = lireReglages();
  definirLangue(r.langue);
  const source = r.mode === 'ha' && r.url ? creerSourceHA(r) : creerSourceDemo();
  store?.arreter();
  // Le prénom tapé dans les réglages, sinon le nom du compte HA (appris à la connexion).
  store = creerStore(source, {
    moi: r.moi || (r.mode === 'ha' && r.moiHA) || null,
    affichage: { tri: r.tri, rayons: r.rayons, coches: r.coches, panierOuvert: r.panierOuvert },
  });
  store.onRefus = () => repasserEnDemo(t('reglages.refus'));
  store.onMoi = (nom) => ecrireReglages({ moiHA: nom });
  store.onAffichage = (affichage) => ecrireReglages(affichage);
  brancherCoquille(store);
  const skin = (SKINS[r.skin] ?? SKINS.carnet).module;
  demonter?.();
  demonter = skin.monter(racine, store, {
    ouvrirReglages,
    ouvrirPourboires: pourboiresPossibles() ? () => ouvrirAPropos({ revoirAccueil: montrerAccueil, versDon: true }) : null,
  });
  if (!r.accueilVu && !fermerAccueil) montrerAccueil();
  try {
    await store.demarrer();
  } catch (e) {
    console.error(e);
    repasserEnDemo(t('reglages.echec', { message: messageErreur(e) }));
  }
}

/** La connexion est perdue pour de bon : on revient à la démo et on le dit dans les réglages. */
function repasserEnDemo(message) {
  ecrireReglages({ mode: 'demo' });
  lancer();
  fermerReglages?.();
  ouvrirReglages(message);
}

/** Erreur de la coquille (code) ou de la bibliothèque HA, dans la langue de l'interface. */
function messageErreur(e) {
  if (e?.code && e.code !== 'interne') return t(`erreur.${e.code}`);
  return t('erreur.interne', { message: e?.message ?? String(e) });
}

/**
 * Connexion à HA. Dans l'app, la coquille ouvre la page de connexion de HA et garde les jetons ;
 * dans un navigateur, la bibliothèque redirige elle-même vers HA au lancement. Rejette avec un
 * message traduit, ou un message vide si l'utilisateur a renoncé.
 */
async function connecter(saisie) {
  let url;
  try {
    url = dansCoquille()
      ? (await natif('connecter', { url: saisie, titre: t('connexion.titre') })).url
      : normaliser(saisie);
  } catch (e) {
    throw new Error(e?.code === 'annule' ? '' : messageErreur(e));
  }
  ecrireReglages({ mode: 'ha', url, moiHA: '', accueilVu: true });
  fermerReglages?.();
  fermerAccueil?.();
  lancer();
}

async function deconnecter() {
  if (dansCoquille()) await natif('deconnecter').catch(() => {});
  else localStorage.removeItem('rature.ha.jetons');
  ecrireReglages({ mode: 'demo', moiHA: '' });
  lancer();
}

function normaliser(s) {
  s = s.trim().replace(/\/+$/, '');
  if (!s) throw erreur('adresse');
  return s.includes('://') ? s : `https://${s}`;
}

/** Adresse proposée : celle de HA quand la page est servie par HA (/local/rature/). */
function adresseProposee() {
  return location.pathname.startsWith('/local/') ? location.origin : '';
}

function montrerAccueil() {
  const r = lireReglages();
  const fermer = ouvrirAccueil({
    adresse: r.url || adresseProposee(),
    connecter,
    essayer: () => {
      ecrireReglages({ accueilVu: true });
      fermerAccueil();
      lancer();
    },
  });
  fermerAccueil = () => {
    fermer();
    fermerAccueil = null;
  };
}

function ouvrirReglages(erreur = '') {
  if (fermerReglages) return;
  fermerReglages = pageReglages({
    reglages: lireReglages(),
    adresse: adresseProposee(),
    erreur,
    connecter,
    deconnecter,
    changer: (champs, { rouvrir } = {}) => {
      ecrireReglages(champs);
      // Tri et rayons ne changent que l'affichage : pas besoin de rouvrir la connexion à HA.
      if (Object.keys(champs).every((k) => ['tri', 'rayons', 'coches'].includes(k))) store.regler(champs);
      else lancer();
      if (rouvrir) {
        fermerReglages();
        ouvrirReglages();
      }
    },
    aPropos: () => ouvrirAPropos({ revoirAccueil: montrerAccueil }),
    surFermeture: () => (fermerReglages = null),
  });
}

lancer();

// Page « À propos » : un mot, les pourboires, les liens, les crédits.
//
// Pourboires : dans l'app, par l'achat intégré du store (coquille, pourboires.dart) ; c'est la
// seule voie admise par Google Play et l'App Store pour un don au développeur. Trois produits
// consommables, qui ne débloquent rien. Dans un navigateur (PWA servie par HA), un lien Ko-fi si
// KOFI est renseigné, sinon rien.
import './papier.css';
import './apropos.css';
import { dansCoquille, empiler, natif, sortir } from '../core/coquille.js';
import { echapper, t } from '../core/i18n.js';
import icone from './icone.png'; // dessinée par app/branding/dessiner.js, comme l'icône de l'app

/** Page Ko-fi de Rature ou de CodeByDK, à créer ; vide, la section ne s'affiche pas. */
const KOFI = '';

const POURBOIRES = ['cafe', 'petitdej', 'resto'];

// Petits dessins au feutre, un par pourboire, et le cœur de la signature.
const trait = (d, l = 24) =>
  `<svg width="${l}" height="${l}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const DESSINS = {
  cafe: trait('<path d="M4.5 10h11.5v4.5a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-5-5z"/><path d="M16 11.5h1.3a2.6 2.6 0 0 1 0 5.2H15.6"/><path d="M8.5 3.8c-.8 1 .8 1.8 0 3M12 3.8c-.8 1 .8 1.8 0 3"/>'),
  petitdej: trait('<path d="M3 15.5c1.5-5 5.5-8.5 9-8.5s7.5 3.5 9 8.5c-2.5 1.6-5.5 2.3-9 2.3s-6.5-.7-9-2.3z"/><path d="M9 8.2l1.6 9.4M15 8.2l-1.6 9.4M5.2 11.5l3.4 5.8M18.8 11.5l-3.4 5.8"/>'),
  resto: trait('<circle cx="12" cy="13" r="6"/><circle cx="12" cy="13" r="3.2"/><path d="M3 4v5.5a1.5 1.5 0 0 0 3 0V4M4.5 9.5V21M21 4c-1.8.6-2.5 3-2.5 6h2.5V21"/>'),
};
const COEUR = '<svg class="apropos__coeur" width="30" height="28" viewBox="0 0 30 28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 25C6 18.5 2.5 13.6 3.1 8.6 3.7 4.1 8.6 2 12 4.6c1.4 1 2.3 2.4 3 3.9.8-1.7 1.9-3.2 3.6-4.1 3.7-2 8.3.6 8.3 5.2 0 5.2-4.4 9.8-11.6 15.2"/></svg>';
const CLE_MERCI = 'rature.pourboires';

const LIENS = [
  ['apropos.codebydk', 'https://codebydk.com/'],
  ['apropos.confidentialite', 'https://codebydk.com/products/rature/privacy/'],
  ['apropos.aide', 'https://codebydk.com/products/rature/support/'],
  ['apropos.ha', 'https://www.home-assistant.io/'],
  ['apropos.ohf', 'https://www.openhomefoundation.org/'],
  ['apropos.nabu', 'https://www.nabucasa.com/'],
];
const CREDITS = [
  ['Caveat', 'Pablo Impallari, SIL Open Font License 1.1', 'https://fonts.google.com/specimen/Caveat'],
  ['Courier Prime', 'Alan Dague-Greene, SIL Open Font License 1.1', 'https://fonts.google.com/specimen/Courier+Prime'],
  ['home-assistant-js-websocket', 'Home Assistant, Apache License 2.0', 'https://github.com/home-assistant/home-assistant-js-websocket'],
];

/** Ouvre un lien hors de l'app : navigateur du téléphone dans la coquille, nouvel onglet sinon. */
export function ouvrirLien(url) {
  if (dansCoquille()) natif('ouvrir', { url }).catch(() => {});
  else window.open(url, '_blank', 'noopener');
}

/** Un pourboire est-il possible ici : dans l'app (achat intégré), ou dans la PWA avec un lien Ko-fi. */
export const pourboiresPossibles = () => dansCoquille() || !!KOFI;

/** `versDon` : la page s'ouvre directement sur les pourboires (tasse de l'en-tête du carnet). */
export function ouvrirAPropos({ revoirAccueil, versDon = false } = {}) {
  const el = document.createElement('div');
  el.className = 'papier apropos';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', t('apropos.titre'));
  const annee = new Date().getFullYear();
  el.innerHTML = `
    <div class="apropos__page">
      <button type="button" class="papier__lien apropos__retour" data-fermer>← ${t('commun.fermer')}</button>
      <div class="apropos__carte">
        <span class="apropos__scotch" aria-hidden="true"></span>
        <img class="apropos__icone" src="${icone}" alt="" width="64" height="64">
        <div>
          <h1 class="apropos__nom">Rature</h1>
          <p class="papier__tape apropos__version">${t('apropos.version', { v: __VERSION__ })}</p>
        </div>
        <span class="apropos__tampon">${t('apropos.tampon')}</span>
      </div>

      <p class="apropos__mot">${t('apropos.mot')}</p>
      <p class="apropos__signature">${t('apropos.signature')}${COEUR}</p>

      <section class="apropos__don" data-don hidden>
        <h2 class="apropos__rubrique">${t('apropos.donTitre')}</h2>
        <p class="apropos__texte">${t('apropos.donTexte')}</p>
        <div class="apropos__postits" data-postits></div>
        <p class="papier__tape apropos__etat" data-etat-don role="status"></p>
        <div class="apropos__merci" data-merci hidden><span>${t('apropos.donMerci')}</span></div>
      </section>

      <div class="apropos__fiche">
        <span class="apropos__scotch apropos__scotch--coin" aria-hidden="true"></span>
        <h2 class="apropos__rubrique">${t('apropos.liens')}</h2>
        <ul class="apropos__liens">
          ${LIENS.map(([cle, url]) => `<li><button type="button" data-url="${url}">${t(cle)} <span aria-hidden="true">↗</span></button></li>`).join('')}
          <li><button type="button" data-url="mailto:support@codebydk.com">support@codebydk.com <span aria-hidden="true">↗</span></button></li>
        </ul>
      </div>
      <p class="papier__tape apropos__note">${t('apropos.affiliation')}</p>

      <h2 class="apropos__rubrique">${t('apropos.credits')}</h2>
      <ul class="apropos__credits papier__tape">
        ${CREDITS.map(([nom, qui, url]) => `<li><button type="button" class="papier__lien" data-url="${url}">${nom}</button> · ${qui}</li>`).join('')}
      </ul>

      <button type="button" class="papier__lien" data-revoir>${t('apropos.revoir')}</button>
      <p class="papier__tape apropos__copyright">© ${annee} DanoneKiD (CodeByDK)</p>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const fermer = () => {
    retirer();
    sortir(el);
  };
  const retirer = empiler(fermer);
  $('[data-fermer]').addEventListener('click', fermer);
  $('[data-revoir]').addEventListener('click', () => {
    fermer();
    revoirAccueil?.();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-url]');
    if (b) ouvrirLien(b.dataset.url);
  });

  preparerPourboires(el);
  document.body.append(el);
  if (versDon) requestAnimationFrame(() => $('[data-don]').scrollIntoView({ block: 'start' }));
  return fermer;
}

async function preparerPourboires(el) {
  const section = el.querySelector('[data-don]');
  const postits = el.querySelector('[data-postits]');
  const etat = el.querySelector('[data-etat-don]');
  const merci = el.querySelector('[data-merci]');
  const montrerMerci = () => {
    merci.hidden = false;
    merci.classList.remove('apropos__merci--frappe');
    void merci.offsetWidth; // relance l'animation du tampon
    merci.classList.add('apropos__merci--frappe');
  };
  if (Number(lireMerci()) > 0) merci.hidden = false;

  if (!dansCoquille()) {
    if (!KOFI) return;
    section.hidden = false;
    postits.innerHTML = `<button type="button" class="apropos__postit" data-url="${KOFI}">
        <span class="apropos__postit-nom">${t('apropos.donKofi')}</span><span class="apropos__postit-prix">Ko-fi ↗</span></button>`;
    return;
  }

  section.hidden = false;
  const poser = (prix = {}) =>
    (postits.innerHTML = POURBOIRES.map(
      (id, i) => `<button type="button" class="apropos__postit apropos__postit--${i}" data-pourboire="${id}"${prix[id] ? '' : ' disabled'}>
        <span class="apropos__postit-dessin">${DESSINS[id]}</span>
        <span class="apropos__postit-nom">${t(`apropos.don.${id}`)}</span>
        <span class="apropos__postit-prix">${prix[id] ? echapper(prix[id]) : '…'}</span></button>`,
    ).join(''));
  poser();
  let prix = {};
  try {
    const r = await natif('pourboires');
    prix = Object.fromEntries((r.produits ?? []).map((p) => [p.id, p.prix]));
  } catch {
    /* store muet : on le dit ci-dessous */
  }
  const dispo = POURBOIRES.filter((id) => prix[id]);
  if (!dispo.length) {
    // Pas encore de produits dans le store : les post-its restent, barrés d'un tampon.
    postits.querySelectorAll('.apropos__postit-prix').forEach((p) => (p.textContent = ''));
    postits.insertAdjacentHTML('beforeend', `<span class="apropos__bientot">${t('apropos.bientot')}</span>`);
    etat.textContent = t('apropos.donIndispo');
    return;
  }
  poser(prix);
  postits.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pourboire]');
    if (!b || b.disabled) return;
    etat.textContent = '';
    postits.querySelectorAll('button').forEach((x) => (x.disabled = true));
    try {
      const r = await natif('offrir', { produit: b.dataset.pourboire });
      if (r.resultat === 'offert') {
        ecrireMerci(Number(lireMerci()) + 1);
        montrerMerci();
        etat.textContent = t('apropos.donMerciTexte');
      } else if (r.resultat === 'attente') etat.textContent = t('apropos.donAttente');
      else if (r.resultat !== 'annule') etat.textContent = t('apropos.donErreur');
    } catch {
      etat.textContent = t('apropos.donErreur');
    } finally {
      postits.querySelectorAll('button').forEach((x) => (x.disabled = !prix[x.dataset.pourboire]));
    }
  });
}

function lireMerci() {
  try {
    return localStorage.getItem(CLE_MERCI) || 0;
  } catch {
    return 0;
  }
}
function ecrireMerci(n) {
  try {
    localStorage.setItem(CLE_MERCI, String(n));
  } catch {
    /* rien */
  }
}

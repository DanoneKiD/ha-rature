// Présentation du premier lancement : trois pages du carnet, qu'on tourne par le coin corné, d'un
// glissement du doigt ou du bouton retour (page précédente).
//   1. une petite liste que le feutre rature mot à mot, jusqu'à « liste papier » : le nom de l'app ;
//   2. ce qui arrive tout seul (voix, autre téléphone) et le hors ligne ;
//   3. la connexion à Home Assistant, ou la démo.
// La page 3 ne connecte rien elle-même : `connecter(adresse)` vient de main.js et rejette avec un
// message déjà traduit ; `essayer()` passe en démo. L'appelant ferme la présentation. Pas de champ
// prénom : celui du compte HA signe les ajouts (modifiable ensuite dans les réglages).
import './papier.css';
import './accueil.css';
import { empiler } from '../core/coquille.js';
import { echapper, t } from '../core/i18n.js';

/** Trait légèrement ondulé, d'un bord à l'autre du mot (le SVG s'étire à sa largeur). */
const TRAIT = (n) =>
  `<svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="${
    ['M2 12 C 25 8, 55 15, 98 9', 'M1 10 C 30 14, 60 6, 99 11', 'M3 11 C 35 7, 65 14, 97 10'][n % 3]
  }"/></svg>`;
const GRIBOUILLIS =
  '<svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M1 13 C 20 6, 40 16, 60 8 S 90 14, 99 7 L 4 9 C 30 15, 70 4, 97 13"/></svg>';
const SOULIGNE =
  '<svg class="accueil__souligne" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M4 10 C 50 4, 120 14, 196 5"/></svg>';
const COCHE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M4 13l5 5L21 4"/></svg>';

export function ouvrirAccueil({ adresse = '', connecter, essayer }) {
  const mots = t('accueil.1.liste').split('|');
  const el = document.createElement('div');
  el.className = 'papier accueil';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <button type="button" class="papier__lien accueil__passer" data-passer>${t('accueil.passer')}</button>
    <div class="accueil__pages">
      <section class="accueil__page" data-page="0">
        <ul class="accueil__ratures">
          ${mots
            .map((m, i) => {
              const dernier = i === mots.length - 1;
              return `<li style="--d:${0.35 + i * 0.45}s"><span class="rayure${dernier ? ' rayure--rouge' : ''}">${echapper(m)}${
                dernier ? GRIBOUILLIS : TRAIT(i)
              }</span></li>`;
            })
            .join('')}
        </ul>
        <h1 class="accueil__nom">${t('accueil.1.titre')}${SOULIGNE}</h1>
        <p class="accueil__texte">${t('accueil.1.texte')}</p>
        <p class="accueil__tampon"><span>${t('accueil.1.promesse')}</span></p>
      </section>

      <section class="accueil__page" data-page="1">
        <h2 class="accueil__titre">${t('accueil.2.titre')}</h2>
        <div class="accueil__exemple">
          <div class="accueil__ligne" style="--d:.3s">
            <span class="accueil__case"></span><span class="accueil__ecrit">${echapper(t('accueil.2.a'))}</span>
          </div>
          <div class="accueil__ligne accueil__ligne--autre" style="--d:1.1s">
            <span class="accueil__case"></span><span class="accueil__ecrit">${echapper(t('accueil.2.b'))}</span>
            <span class="accueil__par">(${echapper(t('accueil.2.par'))})</span>
          </div>
          <div class="accueil__ligne accueil__ligne--fait" style="--d:1.9s">
            <span class="accueil__case">${COCHE}</span><span class="accueil__ecrit"><span class="rayure">${echapper(t('accueil.2.c'))}${TRAIT(1)}</span></span>
          </div>
        </div>
        <p class="accueil__texte">${t('accueil.2.texte')}</p>
      </section>

      <section class="accueil__page" data-page="2">
        <h2 class="accueil__titre">${t('accueil.3.titre')}</h2>
        <p class="accueil__texte">${t('accueil.3.texte')}</p>
        <form class="accueil__form" novalidate>
          <label class="papier__tape" for="accueil-adresse">${t('reglages.adresse')}</label>
          <input id="accueil-adresse" name="adresse" type="text" inputmode="url" autocapitalize="off" autocorrect="off"
            spellcheck="false" autocomplete="url" enterkeyhint="go" placeholder="${t('reglages.adresseExemple')}">
          <p class="accueil__erreur" data-erreur role="alert" hidden></p>
          <button type="submit" class="accueil__connecter">${t('reglages.seConnecter')}</button>
          <button type="button" class="papier__lien accueil__demo" data-demo>${t('accueil.3.demo')}</button>
        </form>
      </section>
    </div>
    <span class="papier__tape accueil__numero" data-numero></span>
    <button type="button" class="accueil__coin" data-suivant>
      <span class="accueil__coin-texte">${t('accueil.suivant')} →</span>
      <span class="accueil__coin-pli" aria-hidden="true"></span>
    </button>`;

  const $ = (s) => el.querySelector(s);
  const pages = [...el.querySelectorAll('.accueil__page')];
  const form = $('form');
  form.elements.adresse.value = adresse;
  let page = 0;
  let retirer = null;

  function aller(n) {
    page = Math.max(0, Math.min(pages.length - 1, n));
    pages.forEach((p, i) => {
      p.classList.toggle('accueil__page--active', i === page);
      p.classList.toggle('accueil__page--tournee', i < page);
      p.inert = i !== page;
    });
    $('[data-numero]').textContent = t('accueil.page', { n: page + 1 });
    el.classList.toggle('accueil--fin', page === pages.length - 1);
    // Retour d'Android : page précédente. Sur la première, rien à fermer : l'app se range.
    retirer?.();
    retirer = page > 0 ? empiler(() => aller(page - 1)) : null;
  }

  $('[data-suivant]').addEventListener('click', () => aller(page + 1));
  $('[data-passer]').addEventListener('click', () => aller(pages.length - 1));

  // Glisser vers la gauche : page suivante ; vers la droite : page précédente.
  let depart = null;
  el.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('input, button')) depart = { x: e.clientX, y: e.clientY };
  });
  el.addEventListener('pointerup', (e) => {
    if (!depart) return;
    const dx = e.clientX - depart.x;
    const dy = e.clientY - depart.y;
    depart = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) aller(page + (dx < 0 ? 1 : -1));
  });

  const erreur = $('[data-erreur]');
  const bouton = $('.accueil__connecter');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erreur.hidden = true;
    bouton.disabled = true;
    try {
      await connecter(form.elements.adresse.value);
    } catch (err) {
      if (err?.message) {
        erreur.textContent = err.message;
        erreur.hidden = false;
      }
    } finally {
      bouton.disabled = false;
    }
  });
  $('[data-demo]').addEventListener('click', () => essayer());

  document.body.append(el);
  aller(0);
  return () => {
    retirer?.();
    el.remove();
  };
}

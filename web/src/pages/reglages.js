// Page des réglages, sur le papier du Carnet. Tout s'applique tout de suite : pas de bouton
// « Enregistrer ». Les choix (skin, langue) sont des mots qu'on entoure au feutre.
//
// La page ne sait ni se connecter ni relancer l'app : main.js lui passe `connecter(adresse)`
// (rejette avec un message traduit, vide si l'utilisateur a renoncé), `deconnecter()`,
// `changer(champs)` (écrit les réglages et relance), `aPropos()`, et `surFermeture()` (appelé
// quand la page se ferme, par elle-même ou par le bouton retour).
import './papier.css';
import './reglages.css';
import { empiler, sortir } from '../core/coquille.js';
import { LANGUES, echapper, t } from '../core/i18n.js';
import { TRIS } from '../core/vue.js';
import { SKINS } from '../skins/index.js';

const choix = (nom, options, actuel) =>
  `<div class="reglages__choix" role="radiogroup" data-choix="${nom}">${options
    .map(([v, libelle, lang]) => `<button type="button" role="radio" data-valeur="${v}" aria-checked="${v === actuel}"${lang ? ` lang="${lang}"` : ''}>${echapper(libelle)}</button>`)
    .join('')}</div>`;

export function ouvrirReglages({ reglages: r, adresse = '', erreur = '', connecter, deconnecter, changer, aPropos, surFermeture }) {
  const connecte = r.mode === 'ha' && r.url;
  const el = document.createElement('div');
  el.className = 'papier reglages';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', t('reglages.titre'));
  el.innerHTML = `
    <div class="reglages__page">
      <button type="button" class="papier__lien reglages__retour" data-fermer>← ${t('commun.fermer')}</button>
      <h1 class="reglages__titre">${t('reglages.titre')}</h1>

      <h2 class="reglages__rubrique">${t('reglages.maison')}</h2>
      ${
        connecte
          ? `<p class="reglages__ligne">${t('reglages.connecteA', { url: `<b>${echapper(r.url.replace(/^https?:\/\//, ''))}</b>` })}</p>
             ${r.moiHA ? `<p class="reglages__ligne reglages__ligne--pale">${echapper(t('reglages.enTantQue', { nom: r.moiHA }))}</p>` : ''}
             <button type="button" class="papier__lien reglages__deconnecter" data-deconnecter>${t('reglages.seDeconnecter')}</button>`
          : `<form class="reglages__connexion" novalidate>
               <label class="papier__tape" for="reglages-adresse">${t('reglages.adresse')}</label>
               <input id="reglages-adresse" name="adresse" type="text" inputmode="url" autocapitalize="off" autocorrect="off"
                 spellcheck="false" autocomplete="url" enterkeyhint="go" placeholder="${t('reglages.adresseExemple')}">
               <button type="submit" class="reglages__bouton">${t('reglages.seConnecter')}</button>
               <p class="papier__tape reglages__aide">${t('reglages.aideAdresse')}</p>
             </form>`
      }
      <p class="reglages__erreur" data-erreur role="alert" hidden></p>

      <h2 class="reglages__rubrique">${t('reglages.vous')}</h2>
      <label class="papier__tape" for="reglages-moi">${t('reglages.prenom')}</label>
      <input id="reglages-moi" class="reglages__champ" name="moi" type="text" autocomplete="given-name" enterkeyhint="done"
        placeholder="${echapper(r.moiHA || t('reglages.prenomVide'))}">
      <p class="papier__tape reglages__aide">${t('reglages.prenomAide')}</p>

      <h2 class="reglages__rubrique">${t('reglages.affichage')}</h2>
      <p class="papier__tape reglages__etiquette">${t('reglages.tri')}</p>
      ${choix('tri', TRIS.map((k) => [k, t(`tri.${k}`)]), r.tri ?? 'main')}
      <p class="papier__tape reglages__etiquette">${t('reglages.rayons')}</p>
      ${choix('rayons', [['oui', t('rayons.oui')], ['non', t('rayons.non')]], r.rayons === false ? 'non' : 'oui')}
      <p class="papier__tape reglages__etiquette">${t('reglages.coches')}</p>
      ${choix('coches', [['bas', t('coches.bas')], ['place', t('coches.place')]], r.coches ?? 'bas')}
      <p class="papier__tape reglages__aide">${t('reglages.triAide')}</p>

      <h2 class="reglages__rubrique">${t('reglages.apparence')}</h2>
      <p class="papier__tape reglages__etiquette">${t('reglages.skin')}</p>
      ${choix('skin', Object.keys(SKINS).map((k) => [k, t(`skin.${k}`)]), r.skin ?? 'carnet')}
      <p class="papier__tape reglages__etiquette">${t('reglages.langue')}</p>
      ${choix('langue', [['auto', t('reglages.langueAuto')], ...Object.entries(LANGUES).map(([k, nom]) => [k, nom, k])], r.langue ?? 'auto')}

      <button type="button" class="reglages__apropos" data-apropos>${t('reglages.aPropos')} →</button>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const zoneErreur = $('[data-erreur]');
  const montrer = (m) => {
    zoneErreur.textContent = m;
    zoneErreur.hidden = !m;
  };
  montrer(erreur);

  const fermer = () => {
    retirer();
    sortir(el);
    surFermeture?.();
  };
  const retirer = empiler(fermer);
  $('[data-fermer]').addEventListener('click', fermer);
  $('[data-apropos]').addEventListener('click', () => {
    fermer();
    aPropos();
  });

  const moi = $('[name=moi]');
  moi.value = r.moi ?? '';
  moi.addEventListener('change', () => changer({ moi: moi.value.trim() }));

  el.querySelectorAll('[data-choix]').forEach((groupe) =>
    groupe.addEventListener('click', (e) => {
      const b = e.target.closest('[data-valeur]');
      if (!b || b.getAttribute('aria-checked') === 'true') return;
      groupe.querySelectorAll('[data-valeur]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      const nom = groupe.dataset.choix;
      const valeur = nom === 'rayons' ? b.dataset.valeur === 'oui' : b.dataset.valeur;
      // La langue change tous les textes, la page comprise : elle se rouvre dans la nouvelle.
      changer({ [nom]: valeur }, { rouvrir: nom === 'langue' });
    }),
  );

  if (connecte) {
    $('[data-deconnecter]').addEventListener('click', () => {
      fermer();
      deconnecter();
    });
  } else {
    const form = $('form');
    form.elements.adresse.value = r.url || adresse;
    const bouton = form.querySelector('button[type=submit]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      bouton.disabled = true;
      montrer('');
      try {
        await connecter(form.elements.adresse.value);
      } catch (err) {
        montrer(err.message);
      } finally {
        bouton.disabled = false;
      }
    });
  }

  document.body.append(el);
  return fermer;
}

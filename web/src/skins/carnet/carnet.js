// Skin « Carnet de courses » : la liste écrite à la main sur un carnet ligné.
// Il ne fait que dessiner ce que le store lui donne et lui transmettre les gestes :
//   - toucher un article : coché ou décoché ;
//   - appui long, puis glisser : l'article se soulève et se pose ailleurs. Posé dans un autre
//     rayon, il en change (retenu sur l'appareil, et dans la description si la liste la gère) ;
//     l'ordre est envoyé à HA (`todo/item/move`) si la liste sait réordonner ;
//   - appui long sans bouger : un post-it avec le nom (modifiable), le nombre, les rayons et « Rayer » (dans la page : la WebView
//     d'Android n'affiche pas les confirm()) ;
//   - l'ordre et le regroupement viennent des réglages (vue.js, `store.affichage`). Hors du tri
//     « à la main », glisser ne réordonne plus : il change seulement de rayon, et sans rayons
//     l'appui long ouvre tout de suite le post-it ;
//   - toucher le titre : liste suivante ; appui long (ou une seule liste) : post-it des listes,
//     pour en choisir, en créer ou en renommer une ;
//   - en-tête, à droite : la tasse (pourboires), « ⇅ » (tri, rayons, cochés), l'engrenage (réglages) ;
//   - les cochés descendent dans « Dans le panier », en bas, repliable (sauf réglage « à leur
//     place »). Un article qu'on vient de cocher reste un instant où il est : on voit le trait de
//     feutre, et on peut le décocher si on s'est trompé. La corbeille retire les cochés de la liste
//     HA (après confirmation) ;
//   - dernière ligne, ou le stylo quand elle est hors de l'écran : écrire un article (sans doublon, voir store.ajouter).
//
// Animations (coupées si le téléphone demande moins d'animations) : la liste est redessinée en
// entier à chaque changement, puis chaque ligne glisse de son ancienne place à la nouvelle (FLIP,
// Web Animations API). Une ligne est reconnue d'un dessin à l'autre par la clé de son nom (un
// article ajouté hors ligne change d'uid quand HA le renvoie). Une ligne nouvelle s'écrit ; une
// case cochée se dessine, puis un trait de feutre barre le nom ; un article rayé reçoit un
// gribouillis rouge et sa ligne se referme ; un doublon est surligné.
// Le regroupement par rayon est fait sur l'appareil (rayons.js, vue.js) : HA ne connaît pas les rayons.
import './carnet.css';
import { empiler } from '../../core/coquille.js';
import { echapper, langueCourante, t } from '../../core/i18n.js';
import { avecNombre, cle, nombre, quantite } from '../../core/modele.js';
import { ajouterRayon, apprendreRayon, nomRayon, rayonDe, tousLesRayons } from '../../core/rayons.js';
import { TRIS, organiser, separer, trier } from '../../core/vue.js';

const COCHE = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2E7D4F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path pathLength="1" d="M4 13l5 5L21 4"></path></svg>';
const FLECHES = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3.5v17M3.5 7.2 7 3.5l3.4 3.6M17 20.5v-17M13.6 16.9l3.4 3.6 3.5-3.7"/></svg>';
const TASSE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10h11.5v4.5a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-5-5z"/><path d="M16 11.5h1.3a2.6 2.6 0 0 1 0 5.2H15.6"/><path d="M8.5 3.8c-.8 1 .8 1.8 0 3M12 3.8c-.8 1 .8 1.8 0 3"/></svg>';
const ROUAGE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M18.6 9.5 L21.4 10.1 L21.4 13.9 L18.6 14.5 L18.4 14.9 L20.0 17.3 L17.3 20.0 L14.9 18.4 L14.5 18.6 L13.9 21.4 L10.1 21.4 L9.5 18.6 L9.1 18.4 L6.7 20.0 L4.0 17.3 L5.6 14.9 L5.4 14.5 L2.6 13.9 L2.6 10.1 L5.4 9.5 L5.6 9.1 L4.0 6.7 L6.7 4.0 L9.1 5.6 L9.5 5.4 L10.1 2.6 L13.9 2.6 L14.5 5.4 L14.9 5.6 L17.3 4.0 L20.0 6.7 L18.4 9.1Z"/><circle cx="12" cy="12" r="2.8"/></svg>';
/** Trait de feutre sur le nom d'un article coché (remplace le barré de la police). */
const RATURE = '<svg class="carnet__rature" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M1 7 C 28 4, 62 9, 99 5"/></svg>';
/** Gribouillis rouge d'un article qu'on raye pour de bon. */
const GRIFFE = '<svg class="carnet__griffe" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M2 12 C 20 4, 38 17, 56 7 S 86 15, 98 6 L 6 9 C 32 16, 70 3, 96 13"/></svg>';
const CORBEILLE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.2 6.5l1 13.5h9.6l1-13.5M10 10.5v6M14 10.5v6"/></svg>';
const CHEVRON = '<svg class="carnet__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2l4 4-4 4"/></svg>';
/** Le temps qu'un article qu'on vient de cocher reste à sa place avant de descendre au panier. */
const SURSIS = 1100;
const calme = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const DOUX = 'cubic-bezier(.2, .75, .25, 1)';
const tracer = (path, delai = 0, duree = 260) =>
  path?.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: duree, delay: delai, easing: 'ease-out', fill: 'backwards' });
const STYLO = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16z"></path></svg>';

/** Inclinaison stable d'une case, de -3 à 3 degrés, tirée de l'uid (le papier ne bouge pas). */
function inclinaison(uid) {
  let h = 0;
  for (const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (Math.abs(h) % 7) - 3;
}

function dateCourte() {
  return new Intl.DateTimeFormat(langueCourante(), { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date());
}

export function monter(racine, store, { ouvrirReglages, ouvrirPourboires } = {}) {
  racine.innerHTML = `
    <div class="carnet">
      <div class="carnet__marge"></div>
      <div class="carnet__scotch"></div>
      <div class="carnet__page">
        <div class="carnet__tete">
          <button class="carnet__titre" type="button" data-titre>${t('liste.defaut')}</button>
          <div class="carnet__infos">
            <span class="carnet__date">${dateCourte()}<span class="carnet__etat" data-etat></span></span>
            <div class="carnet__outils">
              ${ouvrirPourboires ? `<button class="carnet__outil carnet__outil--tasse" type="button" data-pourboire aria-label="${t('carnet.pourboire')}">${TASSE}</button>` : ''}
              <button class="carnet__outil" type="button" data-tri>${FLECHES}</button>
              <button class="carnet__outil" type="button" data-reglages aria-label="${t('carnet.reglages')}">${ROUAGE}</button>
            </div>
          </div>
        </div>
        <div data-liste></div>
        <input class="carnet__saisie" data-saisie type="text" enterkeyhint="done" autocomplete="off"
               placeholder="${t('carnet.ecrire')}" aria-label="${t('carnet.ajouter')}">
        <div data-bas></div>
      </div>
      <button class="carnet__stylo" type="button" data-stylo aria-label="${t('carnet.stylo')}">${STYLO}</button>
      <div class="carnet__mot" data-mot hidden></div>
      <div class="carnet__voile" data-voile hidden></div>
      <div class="carnet__question" data-question role="dialog" aria-modal="true" hidden></div>
    </div>`;

  const $ = (s) => racine.querySelector(s);
  const liste = $('[data-liste]');
  const bas = $('[data-bas]'); // le panier, sous la ligne d'écriture
  const page = $('.carnet__page'); // les gestes valent pour la liste et pour le panier
  const saisie = $('[data-saisie]');
  const mot = $('[data-mot]');
  let articles = [];
  let geste = null; // appui en cours sur un article (voir plus bas)
  let enRetard = false; // une mise à jour arrivée pendant un glisser, dessinée au lâcher
  let pageTournee = 0; // jusqu'à cet instant, la liste change en entier : pas d'animation ligne à ligne
  const sursis = new Map(); // clé du nom vers l'instant où l'article coché pourra descendre au panier
  let dansPanier = 0; // nombre de cochés au dernier dessin (pour faire sautiller le compteur)

  function dessiner() {
    if (geste?.leve) {
      enRetard = true;
      return;
    }
    const { tri, rayons } = store.affichage;
    // En-tête : le tri seul, court, sur une ligne (le regroupement se voit dans la liste).
    $('[data-tri]').setAttribute('aria-label', t('barre.trie', { tri: t(`barre.${tri}`), rayons: t(rayons ? 'barre.rayons' : 'barre.ensemble') }));
    const avant = photographier();
    $('[data-titre]').textContent = store.liste?.nom ?? t('liste.defaut');
    ajusterTitre();
    // Pas encore connecté : quelques secondes de points qui s'écrivent (démarrage, retour dans
    // l'app), puis seulement « hors ligne ».
    const etat = [];
    clearTimeout(attenteConnexion);
    if (store.connecte || store.source === 'demo') deconnecteDepuis = null;
    else deconnecteDepuis ??= Date.now();
    const reste = deconnecteDepuis ? PATIENCE - (Date.now() - deconnecteDepuis) : 0;
    if (store.source === 'demo') etat.push(echapper(t('carnet.demo')));
    else if (reste > 0) {
      etat.push(`<span class="carnet__plume" role="img" aria-label="${t('carnet.connexion')}"><i></i><i></i><i></i></span>`);
      attenteConnexion = setTimeout(dessiner, reste + 50);
    } else if (!store.connecte) etat.push(echapper(t('carnet.horsLigne')));
    if (store.enAttente) etat.push(echapper(t('carnet.attente', { n: store.enAttente })));
    $('[data-etat]').innerHTML = etat.length ? ` · ${etat.join(' · ')}` : '';

    articles = store.articles;
    const maintenant = Date.now();
    const { actifs, faits } = separer(articles, store.affichage, (a) => sursis.get(cle(a.nom)) > maintenant);
    // Sans regroupement, un seul groupe sans titre ; data-rayon vide sur les articles.
    const html = actifs.length
      ? organiser(actifs, store.affichage)
          .map(
            ({ rayon, articles: groupe }) =>
              (rayon ? `<div class="carnet__rayon" data-rayon="${echapper(rayon)}" data-cle="rayon:${echapper(rayon)}">${echapper(nomRayon(rayon))}</div>` : '') +
              groupe.map((a) => ligne(a, rayon ?? '')).join(''),
          )
          .join('')
      : `<div class="carnet__vide">${t('carnet.vide')}</div>`;
    let panier = '';
    if (faits.length) {
      const ouvert = !!store.affichage.panierOuvert;
      panier += `<div class="carnet__panier-tete" data-cle="panier">
          <button type="button" class="carnet__panier" data-panier aria-expanded="${ouvert}">${CHEVRON}${t('carnet.panier', { n: faits.length })}</button>
          <button type="button" class="carnet__outil carnet__vider" data-vider aria-label="${t('carnet.vider')}">${CORBEILLE}</button>
        </div>`;
      if (ouvert)
        panier += `<div class="carnet__panier-zone">${trier(faits, store.affichage.tri).map((a) => ligne(a, null)).join('')}</div>`;
    }
    liste.innerHTML = html;
    bas.innerHTML = panier;
    animer(avant);
    const compteur = bas.querySelector('[data-panier]');
    if (compteur && faits.length > dansPanier && avant.size && !calme())
      compteur.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12) rotate(-1deg)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
    dansPanier = faits.length;
  }

  const PATIENCE = 6000; // ms de « connexion… » avant d'avouer « hors ligne »
  let deconnecteDepuis = Date.now();
  let attenteConnexion = null;

  /** Un nom trop long pour une ligne s'écrit sur les deux lignes de l'en-tête, plus petit. */
  function ajusterTitre() {
    const titre = $('[data-titre]');
    titre.classList.remove('carnet__titre--long');
    if (titre.scrollWidth > titre.clientWidth + 1) titre.classList.add('carnet__titre--long');
  }
  // La mesure n'est juste qu'avec la police chargée, et change avec la largeur de l'écran.
  document.fonts?.ready.then(ajusterTitre);
  addEventListener('resize', ajusterTitre);

  /** Place et état de chaque ligne avant de redessiner. */
  function photographier() {
    const m = new Map();
    for (const el of page.querySelectorAll('[data-cle]'))
      m.set(el.dataset.cle, { haut: el.getBoundingClientRect().top, fait: el.getAttribute('aria-pressed') === 'true' });
    return m;
  }

  function animer(avant) {
    // Premier remplissage, ou changement de liste : rien à faire glisser ligne à ligne.
    if (calme() || !avant.size || Date.now() < pageTournee) return;
    for (const el of page.querySelectorAll('[data-cle]')) {
      const v = avant.get(el.dataset.cle);
      if (!v) {
        ecrire(el);
        continue;
      }
      const dy = v.haut - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 360, easing: DOUX });
      if (!v.fait && el.getAttribute('aria-pressed') === 'true') {
        tracer(el.querySelector('.carnet__case path'), 0, 220);
        tracer(el.querySelector('.carnet__rature path'), 170, 320);
      } else if (v.fait && el.getAttribute('aria-pressed') === 'false') {
        el.querySelector('.carnet__case')?.animate([{ transform: 'rotate(var(--r)) scale(.7)' }, { transform: 'rotate(var(--r))' }], { duration: 260, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
      }
    }
  }

  /** Une ligne nouvelle : le titre de rayon apparaît, l'article s'écrit de gauche à droite. */
  function ecrire(el) {
    if (!el.dataset.uid) return void el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
    el.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: DOUX });
    el.querySelector('.carnet__nom')?.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 520, easing: 'cubic-bezier(.45, 0, .3, 1)', fill: 'backwards' });
  }

  /** Rayer pour de bon : gribouillis rouge, la ligne se referme, puis la suppression part. */
  function rayer(a) {
    const el = page.querySelector(`[data-uid="${CSS.escape(a.uid)}"]`);
    if (calme() || !el) return store.supprimer(a);
    el.insertAdjacentHTML('beforeend', GRIFFE);
    tracer(el.lastElementChild.querySelector('path'), 0, 380)
      .finished.then(() => el.animate([{ height: '40px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 240, easing: 'ease-in', fill: 'forwards' }).finished)
      .catch(() => {})
      .finally(() => store.supprimer(a));
  }

  /** Un doublon : l'article déjà là est surligné. */
  function surligner(nom) {
    const el = page.querySelector(`[data-cle="${CSS.escape(cle(nom))}"]`);
    if (!el || calme()) return;
    el.classList.remove('carnet__article--surligne');
    void el.offsetWidth;
    el.classList.add('carnet__article--surligne');
    setTimeout(() => el.classList.remove('carnet__article--surligne'), 1600);
  }

  function ligne(a, rayon) {
    const { libelle, qte } = quantite(a.nom);
    const autre = a.par && a.par !== store.moi;
    const classes = ['carnet__article', a.fait && 'carnet__article--fait', autre && !a.fait && 'carnet__article--autre'];
    return `<button type="button" class="${classes.filter(Boolean).join(' ')}" data-uid="${echapper(a.uid)}" data-cle="${echapper(cle(a.nom))}"${rayon === null ? '' : ` data-rayon="${echapper(rayon)}"`}
        aria-pressed="${a.fait}" style="--r:${inclinaison(a.uid)}deg">
      <span class="carnet__case">${a.fait ? COCHE : ''}</span>
      <span class="carnet__nom">${echapper(libelle)}${a.fait ? RATURE : ''}</span>
      ${qte ? `<span class="carnet__qte">${echapper(qte)}</span>` : ''}
      ${autre ? `<span class="carnet__par">(${echapper(a.par)})</span>` : ''}
    </button>`;
  }

  function annoncer(texte) {
    mot.textContent = texte;
    mot.hidden = false;
    clearTimeout(annoncer.t);
    annoncer.t = setTimeout(() => (mot.hidden = true), 1800);
  }

  // Post-it : celui de l'appui long (nom, nombre, rayons, « Rayer ») et celui du tri. Un voile léger derrière ;
  // le toucher ferme le post-it, comme le bouton retour.
  const postit = $('[data-question]');
  const voile = $('[data-voile]');
  let fermerPostit = null;
  function montrerPostit(html, surClic, avantFermer) {
    fermerPostit?.();
    postit.innerHTML = html;
    postit.hidden = voile.hidden = false;
    const fermer = () => {
      avantFermer?.();
      retirer();
      postit.hidden = voile.hidden = true;
      fermerPostit = null;
    };
    const retirer = empiler(fermer);
    fermerPostit = fermer;
    postit.onclick = (e) => surClic(e, fermer);
    voile.onclick = fermer;
  }

  /** Des mots à entourer (rayons, tri...) ; `fin` : boutons ajoutés au bout (« + rayon »). */
  const entoures = (attribut, options, actuel, fin = '', classe = '') =>
    `<div class="carnet__rayons ${classe}">${options
      .map(([v, libelle]) => `<button type="button" ${attribut}="${echapper(v)}" aria-pressed="${v === actuel}">${echapper(libelle)}</button>`)
      .join('')}${fin}</div>`;

  /** Un bouton du post-it (« + rayon », « + nouvelle liste »...) devient un champ ; Entrée appelle `valider`. */
  function enChamp(bouton, { placeholder, valeur = '', classe = '' }, valider) {
    const c = document.createElement('input');
    c.className = `carnet__nouveau-champ ${classe}`;
    c.setAttribute('enterkeyhint', 'done');
    c.setAttribute('autocomplete', 'off');
    c.maxLength = 60;
    c.placeholder = placeholder;
    c.value = valeur;
    bouton.replaceWith(c);
    c.focus();
    if (valeur) c.select();
    c.addEventListener('keydown', (k) => k.key === 'Enter' && !c.disabled && c.value.trim() && valider(c));
    return c;
  }

  // Le post-it d'un article : son nom (modifiable sur place), son nombre, son rayon, « Rayer ».
  // Nom et nombre s'enregistrent à la fermeture (voile, retour, rayon choisi) ; « Annuler » les oublie.
  function ouvrirPostit(a) {
    const q = quantite(a.nom);
    let n = nombre(a.nom);
    // Un poids ou un volume (« 1 kg ») reste dans le nom, sans compteur : il compte les exemplaires.
    const poids = q.qte && !q.qte.startsWith('×');
    const libelle = poids ? a.nom : q.libelle;
    let annule = false;
    montrerPostit(
      `<div class="carnet__edition">
        <input class="carnet__edition-nom" data-nom type="text" enterkeyhint="done" autocomplete="off"
               value="${echapper(libelle)}" aria-label="${t('carnet.nom')}">
        <div class="carnet__compteur" role="group"${poids ? ' hidden' : ''} aria-label="${t('carnet.quantite')}">
          <button type="button" data-moins aria-label="${t('carnet.moins')}">−</button>
          <span data-n aria-live="polite">×${n}</span>
          <button type="button" data-plus aria-label="${t('carnet.plus')}">+</button>
        </div>
      </div>
      ${entoures(
        'data-vers',
        tousLesRayons(articles.map(rayonDe)).map((r) => [r, nomRayon(r)]),
        rayonDe(a),
        `<button type="button" class="carnet__nouveau" data-nouveau>${t('carnet.nouveauRayon')}</button>`,
      )}
      <div class="carnet__question-actions">
        <button type="button" data-non>${t('commun.annuler')}</button><button type="button" data-rayer>${t('carnet.rayerOui')}</button>
      </div>`,
      (e, fermer) => {
        const vers = e.target.closest('[data-vers]')?.dataset.vers;
        const pas = e.target.closest('[data-plus]') ? 1 : e.target.closest('[data-moins]') ? -1 : 0;
        if (pas) {
          n = Math.min(99, Math.max(1, n + pas));
          postit.querySelector('[data-n]').textContent = `×${n}`;
          postit.querySelector('[data-moins]').disabled = n === 1;
        } else if (e.target.closest('[data-nouveau]')) {
          // « + rayon » : le nom tapé crée le rayon et y range l'article.
          enChamp(e.target.closest('[data-nouveau]'), { placeholder: t('carnet.nomRayon') }, (c) => {
            const id = ajouterRayon(c.value);
            fermer();
            if (id) changerRayon(a, id);
          });
        } else if (vers) {
          fermer();
          changerRayon(a, vers);
        } else if (e.target.closest('[data-non]')) {
          annule = true;
          fermer();
        } else if (e.target.closest('[data-rayer]')) {
          annule = true;
          // Deuxième temps : la question remplace les rayons, sur le même post-it.
          postit.innerHTML = `<p>${echapper(t('carnet.rayer', { nom: a.nom }))}</p>
            <div class="carnet__question-actions"><button type="button" data-non>${t('commun.annuler')}</button><button type="button" data-oui>${t('carnet.rayerOui')}</button></div>`;
          postit.onclick = (e2) => {
            if (e2.target.closest('[data-oui], [data-non]')) fermer();
            if (e2.target.closest('[data-oui]')) rayer(a);
          };
        }
      },
      () => {
        if (annule) return;
        const champ = postit.querySelector('[data-nom]');
        if (champ?.value.trim()) store.renommer(a, avecNombre(champ.value, n));
      },
    );
    postit.querySelector('[data-moins]').disabled = n === 1;
    const champ = postit.querySelector('[data-nom]');
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') fermerPostit?.();
    });
  }

  /** Les listes de la maison : en choisir une, ou en créer une (liste locale de HA). */
  function ouvrirListes() {
    const courante = store.liste?.entity_id;
    montrerPostit(
      `<p class="carnet__question-nom">${t('listes.titre')}</p>
      ${entoures(
        'data-liste',
        store.listes.map((l) => [l.entity_id, l.nom]),
        courante,
        `<button type="button" class="carnet__nouveau" data-nouvelle>${t('listes.nouvelle')}</button>` +
          (courante ? `<button type="button" class="carnet__nouveau" data-renommer>${t('listes.renommer')}</button>` : ''),
        'carnet__listes',
      )}
      <p class="carnet__question-etiquette carnet__listes-message" data-message role="status"></p>
      <div class="carnet__question-actions"><button type="button" data-non>${t('commun.fermer')}</button></div>`,
      (e, fermer) => {
        const id = e.target.closest('[data-liste]')?.dataset.liste;
        if (id) {
          fermer();
          if (id !== courante) store.choisir(id);
        } else if (e.target.closest('[data-non]')) fermer();
        else if (e.target.closest('[data-nouvelle], [data-renommer]')) {
          // « + nouvelle liste » ou « renommer » : Entrée envoie à HA.
          const bouton = e.target.closest('[data-nouvelle], [data-renommer]');
          const renommer = bouton.hasAttribute('data-renommer');
          const message = postit.querySelector('[data-message]');
          const valeur = renommer ? store.liste?.nom : '';
          enChamp(bouton, { placeholder: t('listes.nom'), valeur, classe: 'carnet__nouveau-champ--liste' }, async (c) => {
            c.disabled = true;
            message.textContent = t(renommer ? 'listes.renommage' : 'listes.creation');
            try {
              if (renommer) await store.renommerListe(courante, c.value);
              else await store.creerListe(c.value);
              fermer();
            } catch (err) {
              c.disabled = false;
              c.focus();
              message.textContent = t(`listes.erreur.${['admin', 'existe', 'reseau'].includes(err.code) ? err.code : 'autre'}`);
            }
          });
        }
      },
    );
  }

  /** Le tri et les rayons, depuis la liste : s'applique tout de suite, le post-it reste ouvert. */
  function ouvrirTri() {
    const { tri, rayons } = store.affichage;
    montrerPostit(
      `<p class="carnet__question-nom">${t('barre.titre')}</p>
      <p class="carnet__question-etiquette">${t('reglages.tri')}</p>
      ${entoures('data-choix-tri', TRIS.map((k) => [k, t(`tri.${k}`)]), tri)}
      <p class="carnet__question-etiquette">${t('reglages.rayons')}</p>
      ${entoures('data-choix-rayons', [['oui', t('rayons.oui')], ['non', t('rayons.non')]], rayons ? 'oui' : 'non')}
      <p class="carnet__question-etiquette">${t('reglages.coches')}</p>
      ${entoures('data-choix-coches', [['bas', t('coches.bas')], ['place', t('coches.place')]], store.affichage.coches ?? 'bas')}
      <div class="carnet__question-actions"><button type="button" data-non>${t('commun.fermer')}</button></div>`,
      (e, fermer) => {
        const b = e.target.closest('[data-choix-tri], [data-choix-rayons], [data-choix-coches]');
        if (b) {
          b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          const { choixTri, choixRayons, choixCoches } = b.dataset;
          store.regler(choixTri ? { tri: choixTri } : choixRayons ? { rayons: choixRayons === 'oui' } : { coches: choixCoches });
        } else if (e.target.closest('[data-non]')) fermer();
      },
    );
  }

  function changerRayon(a, rayon) {
    if (rayonDe(a) === rayon) return;
    apprendreRayon(a.nom, rayon);
    // La description porte le rayon si la liste la gère (HA renverra la liste) ; sinon le
    // dictionnaire appris suffit, et on redessine nous-mêmes.
    if (!store.changerRayon(a, rayon)) dessiner();
  }

  // Appui court : cocher. Appui long : l'article se soulève ; on le glisse, ou on le lâche sur place
  // pour ouvrir le post-it. Un mouvement avant le délai, c'est un défilement : on laisse faire.
  const DELAI = 450;
  page.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-uid]');
    if (!b || e.button > 0) return;
    geste = { b, uid: b.dataset.uid, x: e.clientX, y: e.clientY, defile: scrollY, leve: false, bouge: false, id: e.pointerId };
    // Un article du panier n'a pas de rayon affiché : l'appui long ouvre son post-it, sans glisser.
    geste.t = setTimeout(peutGlisser() && b.dataset.rayon !== undefined ? soulever : postitDirect, DELAI);
  });
  page.addEventListener('pointermove', (e) => {
    if (!geste || e.pointerId !== geste.id) return;
    const dx = e.clientX - geste.x;
    const dy = e.clientY - geste.y;
    if (!geste.leve) {
      if (Math.hypot(dx, dy) > 10) annulerGeste();
      return;
    }
    if (Math.abs(dy) > 8) geste.bouge = true;
    geste.yCourant = e.clientY;
    suivre();
  });
  page.addEventListener('pointerup', (e) => {
    if (!geste || e.pointerId !== geste.id) return;
    clearTimeout(geste.t);
    if (!geste.leve) return void (geste = null); // un toucher simple : le clic suit
    const g = geste;
    poser();
    if (!g.bouge) {
      const a = articles.find((x) => x.uid === g.uid);
      if (a) ouvrirPostit(a);
    }
  });
  page.addEventListener('pointercancel', () => {
    if (geste?.leve) poser(true);
    else annulerGeste();
  });
  // Pendant un glisser, le doigt ne doit pas faire défiler la page.
  page.addEventListener('touchmove', (e) => geste?.leve && e.preventDefault(), { passive: false });
  page.addEventListener('contextmenu', (e) => e.target.closest('[data-uid]') && e.preventDefault());
  page.addEventListener('click', (e) => {
    const b = e.target.closest('[data-uid]');
    if (!b) return;
    // Le clic qui suit un appui long n'est pas un cochage.
    if (b.dataset.souleve) return void delete b.dataset.souleve;
    const a = articles.find((x) => x.uid === b.dataset.uid);
    if (!a) return;
    if (!a.fait) {
      // Il reste un instant à sa place, puis descend au panier.
      sursis.set(cle(a.nom), Date.now() + SURSIS);
      setTimeout(dessiner, SURSIS + 30);
    }
    store.basculer(a);
  });
  // Le panier : le replier ou le déplier, le vider (après confirmation).
  page.addEventListener('click', (e) => {
    if (e.target.closest('[data-panier]')) store.regler({ panierOuvert: !store.affichage.panierOuvert });
    else if (e.target.closest('[data-vider]')) {
      const n = articles.filter((a) => a.fait).length;
      montrerPostit(
        `<p>${echapper(t(n === 1 ? 'carnet.viderQuestionUn' : 'carnet.viderQuestion', { n }))}</p>
        <div class="carnet__question-actions"><button type="button" data-non>${t('commun.annuler')}</button><button type="button" data-oui>${t('carnet.viderOui')}</button></div>`,
        (e2, fermer) => {
          if (e2.target.closest('[data-oui], [data-non]')) fermer();
          if (!e2.target.closest('[data-oui]')) return;
          const zone = bas.querySelector('.carnet__panier-zone');
          if (calme() || !zone) return store.vider();
          zone.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px) rotate(-1deg)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' })
            .finished.then(() => store.vider());
        },
      );
    }
  });

  function annulerGeste() {
    if (geste) clearTimeout(geste.t);
    geste = null;
  }

  /** Glisser sert à réordonner (tri « à la main ») ou à changer de rayon (regroupement actif). */
  const peutGlisser = () => store.affichage.tri === 'main' || store.affichage.rayons;

  function postitDirect() {
    const g = geste;
    geste = null;
    g.b.dataset.souleve = '1';
    navigator.vibrate?.(12);
    const a = articles.find((x) => x.uid === g.uid);
    if (a) ouvrirPostit(a);
  }

  function soulever() {
    const g = geste;
    g.leve = true;
    g.yCourant = g.y;
    g.b.classList.add('carnet__article--leve');
    g.b.dataset.souleve = '1';
    try {
      g.b.setPointerCapture(g.id);
    } catch {
      /* le pointeur est déjà parti */
    }
    navigator.vibrate?.(12);
    g.repere = document.createElement('div');
    g.repere.className = 'carnet__repere';
    defiler();
  }

  /** Suit le doigt, et place le repère rouge là où l'article tomberait. */
  function suivre() {
    const g = geste;
    g.b.style.setProperty('--dy', `${g.yCourant - g.y + scrollY - g.defile}px`);
    g.cible = emplacement(g.yCourant);
    if (g.cible.avant) liste.insertBefore(g.repere, g.cible.avant);
    else liste.append(g.repere);
  }

  /** Près du haut ou du bas de l'écran, la page défile toute seule. */
  function defiler() {
    if (!geste?.leve) return;
    const y = geste.yCourant;
    const pas = y < 90 ? -8 : y > innerHeight - 90 ? 8 : 0;
    if (pas) {
      scrollBy(0, pas);
      suivre();
    }
    requestAnimationFrame(defiler);
  }

  /**
   * Où tombe l'article lâché à la hauteur `y` : avant quel élément (titre de rayon ou article),
   * dans quel rayon, et après quel article de ce rayon (null : en tête du rayon).
   */
  function emplacement(y) {
    const elements = [...liste.querySelectorAll('[data-rayon]')].filter((el) => el !== geste.b);
    const i = elements.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    const precedents = i < 0 ? elements : elements.slice(0, i);
    const dernier = precedents.at(-1);
    // Juste sous un titre de rayon, ou tout en haut : en tête de ce rayon.
    return {
      avant: i < 0 ? null : elements[i],
      rayon: dernier?.dataset.rayon ?? elements[0]?.dataset.rayon,
      apres: dernier?.dataset.uid ?? null,
    };
  }

  function poser(annule = false) {
    const g = geste;
    geste = null;
    g.b.classList.remove('carnet__article--leve');
    g.b.style.removeProperty('--dy');
    g.repere?.remove();
    const a = articles.find((x) => x.uid === g.uid);
    if (!annule && g.bouge && a && g.cible) deposer(a, g.cible);
    if (enRetard || g.bouge) {
      enRetard = false;
      dessiner();
    }
  }

  /** L'ordre affiché suit l'ordre HA dans chaque rayon : le dépôt devient un `deplacer`. */
  function deposer(a, { rayon, apres }) {
    const { tri, rayons } = store.affichage;
    if (rayons && rayon) changerRayon(a, rayon);
    if (tri !== 'main') return;
    const autres = articles.filter((x) => x.uid !== a.uid);
    let precedent = null;
    if (apres) precedent = autres.find((x) => x.uid === apres) ?? null;
    else if (rayons) {
      // En tête du rayon : juste avant le premier article de ce rayon, dans l'ordre HA.
      const premier = autres.findIndex((x) => rayonDe(x) === rayon);
      if (premier < 0) return;
      precedent = premier > 0 ? autres[premier - 1] : null;
    }
    const k = articles.indexOf(a);
    const dejaLa = precedent ? articles[k - 1]?.uid === precedent.uid : k === 0;
    if (!dejaLa) store.deplacer(a, precedent);
  }

  saisie.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const r = store.ajouter(saisie.value);
    if (r?.doublon) {
      annoncer(t(r.article.fait ? 'carnet.doublonDecoche' : 'carnet.doublonRemonte'));
      surligner(r.article.nom);
    }
    saisie.value = '';
  });
  // Le stylo ne sert qu'à rejoindre la ligne d'écriture : il se montre seulement quand elle est hors de l'écran.
  const stylo = $('[data-stylo]');
  stylo.addEventListener('click', () => saisie.focus());
  const guetteur = new IntersectionObserver(([e]) => (stylo.hidden = e.isIntersecting));
  guetteur.observe(saisie);
  $('[data-reglages]').addEventListener('click', () => ouvrirReglages?.());
  $('[data-tri]').addEventListener('click', ouvrirTri);
  $('[data-pourboire]')?.addEventListener('click', () => ouvrirPourboires());
  // Le titre : un toucher tourne la page vers la liste suivante ; un appui long (ou un toucher
  // quand il n'y a qu'une liste) ouvre le post-it des listes, d'où l'on en crée une.
  const titre = $('[data-titre]');
  let appuiTitre = null;
  titre.addEventListener('pointerdown', () => {
    clearTimeout(appuiTitre);
    titre.dataset.long = '';
    appuiTitre = setTimeout(() => {
      titre.dataset.long = '1';
      ouvrirListes();
    }, DELAI);
  });
  for (const fin of ['pointerup', 'pointercancel', 'pointerleave']) titre.addEventListener(fin, () => clearTimeout(appuiTitre));
  titre.addEventListener('contextmenu', (e) => e.preventDefault());
  titre.addEventListener('click', () => {
    if (titre.dataset.long === '1') return;
    const l = store.listes;
    if (l.length < 2) return ouvrirListes();
    const i = l.findIndex((x) => x.entity_id === store.liste?.entity_id);
    // La page tourne : l'ancienne liste part à gauche, la nouvelle arrive.
    pageTournee = Date.now() + 700;
    const tourner = () => {
      store.choisir(l[(i + 1) % l.length].entity_id);
      if (!calme()) liste.animate([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: DOUX });
    };
    if (calme()) return tourner();
    liste.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-30px) rotate(-1deg)' }], { duration: 170, easing: 'ease-in' }).finished.then(tourner);
  });

  const fin = store.ecouter(dessiner);
  dessiner();
  return () => {
    fin();
    guetteur.disconnect();
    clearTimeout(attenteConnexion);
    removeEventListener('resize', ajusterTitre);
    fermerPostit?.();
    racine.innerHTML = '';
  };
}

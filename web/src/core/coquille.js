// Pont avec la coquille Flutter (app/lib/main.dart) : la coquille appelle
// window.ratureApp.pause(), .resume() et .back() (bouton retour d'Android : vrai si la page a
// fermé quelque chose, sinon l'app se range). Dans un navigateur, rien ne les appelle.
// Appelée à chaque relance (changement de réglages) : on ne branche qu'une fois, sur le store courant.
let courant = null;
export function brancherCoquille(store) {
  const premier = !courant;
  courant = store;
  window.ratureApp = {
    pause: () => courant.pause(),
    resume: () => courant.reprise(),
    back: retour,
  };
  if (premier) {
    document.addEventListener('visibilitychange', () => (document.hidden ? courant.pause() : courant.reprise()));
    document.addEventListener('keydown', (e) => e.key === 'Escape' && retour());
    // WKWebView ignore `user-scalable=no` : le pincement s'arrête ici.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }
}

/**
 * Ce qui s'ouvre par-dessus la liste (réglages, à propos, confirmation, pages de l'accueil) s'empile
 * ici : le bouton retour d'Android, ou Échap, ferme le dernier. `empiler(fermer)` rend la fonction
 * qui le retire de la pile (à appeler quand il se ferme autrement).
 */
const pile = [];
export function empiler(fermer) {
  pile.push(fermer);
  return () => {
    const i = pile.lastIndexOf(fermer);
    if (i >= 0) pile.splice(i, 1);
  };
}
/** La page glisse et s'efface, l'inverse de son entrée ; tout de suite si on réduit les animations. */
export function sortir(el) {
  el.style.pointerEvents = 'none';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !el.animate) return el.remove();
  el.animate([{}, { transform: 'translateY(24px)', opacity: 0 }], { duration: 220, easing: 'cubic-bezier(.5, 0, .75, .3)' })
    .finished.then(() => el.remove(), () => el.remove());
}

/** Une erreur qui porte un `code` (reseau, admin, existe, deconnecte...), traduit par l'interface. */
export const erreur = (code, message = code) => Object.assign(new Error(message), { code });

function retour() {
  const fermer = pile.pop();
  if (!fermer) return false;
  fermer();
  return true;
}

/** Vrai dans l'application native (script injecté par la coquille). */
export const dansCoquille = () => !!window.__coquille?.native;

/**
 * Demande à la coquille (canal RatureNatif, app/lib/main.dart) : `connecter` { url },
 * `acces`, `deconnecter`. Rejette avec une erreur portant `code` (deconnecte, reseau, annule...).
 */
let numero = 0;
const attentes = new Map();
/**
 * Dans la coquille, un `ws://` passe par Dart (app/lib/pont_socket.dart) : la page, servie en https,
 * n'a pas le droit de l'ouvrir elle-même. La bibliothèque de HA fait `new WebSocket(url)` et n'en
 * utilise que les événements, `send`, `close`, `readyState` et les constantes d'état.
 */
export function installerPontSocket() {
  if (window.__socket) return;
  const Reel = window.WebSocket;
  const ouverts = new Map();
  let suivant = 0;
  class SocketNatif extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    CONNECTING = 0;
    OPEN = 1;
    CLOSING = 2;
    CLOSED = 3;
    readyState = 0;
    constructor(url) {
      super();
      this.url = url;
      this.n = ++suivant;
      ouverts.set(this.n, this);
      natif('socketOuvrir', { n: this.n, url }).catch(() => window.__socket(this.n, 'close'));
    }
    send(texte) {
      natif('socketEnvoyer', { n: this.n, texte }).catch(() => {});
    }
    close() {
      if (this.readyState >= 2) return;
      this.readyState = 2;
      natif('socketFermer', { n: this.n }).catch(() => {});
    }
  }
  window.__socket = (n, type, texte) => {
    const s = ouverts.get(n);
    if (!s) return;
    if (type === 'open') {
      s.readyState = 1;
      s.dispatchEvent(new Event('open'));
    } else if (type === 'message') {
      s.dispatchEvent(new MessageEvent('message', { data: texte }));
    } else {
      ouverts.delete(n);
      s.readyState = 3;
      s.dispatchEvent(new CloseEvent('close'));
    }
  };
  window.WebSocket = new Proxy(Reel, {
    construct: (R, [url, ...reste]) => (String(url).startsWith('ws://') ? new SocketNatif(url) : new R(url, ...reste)),
  });
}

export function natif(action, donnees = {}) {
  window.__natif ??= {
    repondre(id, e, valeur) {
      const a = attentes.get(id);
      attentes.delete(id);
      if (!a) return;
      if (e) a.rejeter(erreur(e.code, e.message));
      else a.resoudre(valeur);
    },
  };
  return new Promise((resoudre, rejeter) => {
    const id = ++numero;
    attentes.set(id, { resoudre, rejeter });
    // `id` et `action` passent après les données : une donnée ne peut pas les écraser.
    window.RatureNatif.postMessage(JSON.stringify({ ...donnees, id, action }));
  });
}

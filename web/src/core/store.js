// Le cœur : l'état de la liste affichée, les actions, l'anti-doublon et la file d'attente hors
// ligne. Les skins ne parlent qu'à lui ; ils ne savent pas si la source est HA ou la démo.
//
// Principe : l'état affiché = la dernière liste reçue de la source, sur laquelle on rejoue les
// opérations encore en attente (file). Une action modifie donc l'écran tout de suite, même hors
// ligne, et la file se vide dans l'ordre dès que la source est joignable.
//
// La dernière liste reçue et les listes connues sont gardées (localStorage) : l'app ouverte hors
// ligne affiche ce qu'elle avait, et se met à jour dès que HA répond.
//
// Un article ajouté hors ligne porte un uid provisoire (`tmp-...`) : les opérations qui le visent
// gardent aussi son nom, et c'est par le nom qu'on le désigne à HA (update_item et remove_item
// l'acceptent) ou qu'on le retrouve dans la liste reçue.
import { erreur } from './coquille.js';
import { A_FAIRE, FAIT, cle, depuisHA, ecrireDescription, lireDescription, maintenant } from './modele.js';

const CLE_FILE = 'rature.file';
const CLE_LISTES = 'rature.listes';
const cleCache = (id) => `rature.cache.${id}`;
/** Première fois que cet appareil a vu chaque article (uid vers date), par liste. */
const cleVus = (id) => `rature.vus.${id}`;
/** Un ajout envoyé reste affiché jusqu'à ce que HA le renvoie, au plus ce délai. */
const ECHO_MS = 10000;
/** Un nom tapé : espaces superflus retirés. */
const net = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * `affichage` : { tri, rayons } (voir vue.js), réglage de l'appareil ; `regler()` le change sans
 * toucher à la connexion.
 */
export function creerStore(source, { moi = null, affichage = {} } = {}) {
  // La démo ne garde rien : ses articles fictifs ne doivent jamais partir chez HA.
  const garder = source.nom === 'ha';
  const lire = (k, defaut) => (garder ? lireStockage(k, defaut) : defaut);
  const ecrire = (k, v) => garder && ecrireStockage(k, v);
  let listes = [];
  let liste = null; // { entity_id, nom, description, deplacer }
  let recus = []; // articles HA bruts, tels que reçus
  let vus = {}; // uid vers date de première vue, pour la liste affichée
  let file = lire(CLE_FILE, []);
  let echos = []; // ajouts envoyés que l'abonnement n'a pas encore renvoyés
  let listesFraiches = false;
  let reessai = null;
  let finAbonnement = null;
  let vidage = null;
  const abonnes = new Set();

  const store = {
    get listes() {
      return listes;
    },
    get liste() {
      return liste;
    },
    get connecte() {
      return source.connecte;
    },
    get enAttente() {
      return file.length;
    },
    get source() {
      return source.nom;
    },
    /** Prénom de l'utilisateur de cet appareil (réglages), écrit dans `par=` des ajouts. */
    get moi() {
      return moi;
    },
    /**
     * Articles affichés (modèle Rature), dans l'ordre de la liste HA. `ajoute` : date d'ajout en
     * millisecondes, d'après `le=` ou, à défaut, la première fois que cet appareil l'a vu.
     */
    get articles() {
      return appliquerFile(recus).map((item) => {
        const a = depuisHA(item);
        a.ajoute = Date.parse(a.le) || vus[a.uid] || null;
        return a;
      });
    },
    get affichage() {
      return affichage;
    },
    regler(champs) {
      affichage = { ...affichage, ...champs };
      store.onAffichage?.(affichage);
      notifier();
    },
    /** Appelé quand l'affichage change (depuis la liste ou les réglages), pour le garder. */
    onAffichage: null,
    ecouter(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    /** Appelé si la source refuse la connexion (révoquée chez HA) : il faut se reconnecter. */
    onRefus: null,
    /** Appelé avec le nom de l'utilisateur HA, quand aucun prénom n'est réglé sur l'appareil. */
    onMoi: null,

    async demarrer() {
      source.onEtat = (ok) => {
        // Après une coupure, HA a pu redémarrer : listes et abonnement sont à refaire.
        if (!ok) listesFraiches = false;
        if (ok && !listesFraiches) rafraichirListes();
        if (ok && !moi && source.utilisateur) apprendreMoi();
        notifier();
        envoyerFile();
      };
      source.onRefus = (e) => store.onRefus?.(e);
      await source.demarrer();
      const l = await source.listes();
      listesFraiches = !!l;
      listes = l ?? lire(CLE_LISTES, []);
      if (l) ecrire(CLE_LISTES, l);
      await store.choisir(preferee() ?? listes[0]?.entity_id);
    },

    /** « Tirer pour actualiser » : relit les listes et se réabonne ; hors ligne, rien à faire. */
    actualiser() {
      return source.connecte ? rafraichirListes() : Promise.resolve();
    },

    /** Crée une liste dans HA (ou la démo) et l'affiche. Rejette avec un `code` (admin, existe...). */
    async creerListe(nom) {
      if (!(nom = net(nom))) return;
      if (!source.connecte) throw erreur('reseau');
      const id = await source.creerListe(nom);
      listes = (await source.listes()) ?? listes;
      ecrire(CLE_LISTES, listes);
      await store.choisir(id);
    },

    /** Renomme la liste `entityId` dans HA (ou la démo). Rejette avec un `code` (admin, reseau...). */
    async renommerListe(entityId, nom) {
      if (!(nom = net(nom))) return;
      if (!source.connecte) throw erreur('reseau');
      await source.renommerListe(entityId, nom);
      // HA met à jour l'état un instant après : on prend le nouveau nom tout de suite.
      listes = listes.map((l) => (l.entity_id === entityId ? { ...l, nom } : l));
      if (liste?.entity_id === entityId) liste = listes.find((l) => l.entity_id === entityId);
      ecrire(CLE_LISTES, listes);
      notifier();
    },

    async choisir(entityId) {
      finAbonnement?.();
      liste = listes.find((l) => l.entity_id === entityId) ?? null;
      recus = liste ? lire(cleCache(entityId), []) : [];
      vus = liste ? lire(cleVus(entityId), {}) : {};
      notifier();
      if (!liste) return;
      try {
        localStorage.setItem('rature.liste', entityId);
      } catch {
        /* rien */
      }
      finAbonnement = source.abonner(entityId, (items) => {
        recus = items || [];
        ecrire(cleCache(entityId), recus);
        noterVus(entityId);
        echos = echos.filter(
          (e) => Date.now() - e.t < ECHO_MS && !recus.some((i) => cle(i.summary) === cle(e.summary)),
        );
        notifier();
      });
      envoyerFile();
    },

    /**
     * Ajout sans doublon : un article déjà présent (même clé) n'est pas recréé. Encore à faire, il
     * remonte en tête ; déjà coché, il est décoché et remonte en tête.
     */
    ajouter(nom, { rayon = null, via = null } = {}) {
      if (!(nom = net(nom)) || !liste) return;
      const existant = store.articles.find((a) => cle(a.nom) === cle(nom));
      if (existant) {
        const vise = { uid: existant.uid, nom: existant.nom };
        if (existant.fait) pousser({ op: 'modifier', ref: vise.uid, nom: vise.nom, status: A_FAIRE });
        if (liste.deplacer) pousser({ op: 'deplacer', ...vise, previous: null });
        return { doublon: true, article: existant };
      }
      const description = liste.description ? ecrireDescription('', { par: moi, via, rayon, le: maintenant() }) : '';
      pousser({ op: 'ajouter', summary: nom, description, tmp: `tmp-${Date.now()}` });
      return { doublon: false };
    },

    basculer(article) {
      pousser({ op: 'modifier', ref: article.uid, nom: article.nom, status: article.fait ? A_FAIRE : FAIT });
    },

    /** Change le nom (la quantité en fait partie : « Tomates ×3 »). */
    renommer(article, nom) {
      if (!(nom = net(nom)) || nom === article.nom) return;
      pousser({ op: 'modifier', ref: article.uid, nom: article.nom, rename: nom });
    },

    supprimer(article) {
      pousser({ op: 'supprimer', ref: article.uid, nom: article.nom });
    },

    /** Place `article` juste après `apres` (null : en tête). */
    deplacer(article, apres) {
      if (!liste?.deplacer) return false;
      pousser({ op: 'deplacer', uid: article.uid, nom: article.nom, previous: apres?.uid ?? null, apres: apres?.nom });
      return true;
    },

    /** Change le rayon porté par la description (listes qui la gèrent seulement). */
    changerRayon(article, rayon) {
      if (!liste?.description) return false;
      const brut = appliquerFile(recus).find((i) => i.uid === article.uid);
      const { note, meta } = lireDescription(brut?.description);
      pousser({
        op: 'modifier',
        ref: article.uid,
        nom: article.nom,
        description: ecrireDescription(note, { ...meta, rayon }),
      });
      return true;
    },

    /** Ferme la source (changement de réglages). */
    arreter() {
      finAbonnement?.();
      source.fermer?.();
    },

    /** Retire de la liste tous les articles cochés (service HA `todo.remove_completed_items`). */
    vider() {
      if (liste) pousser({ op: 'purger' });
    },

    pause: () => source.pause(),
    reprise: () => source.reprise(),
  };

  /** Date de première vue des nouveaux articles ; on oublie ceux qui ont quitté la liste. */
  function noterVus(entityId) {
    const t = Date.now();
    const suivants = {};
    for (const i of recus) suivants[i.uid] = vus[i.uid] ?? t;
    vus = suivants;
    ecrire(cleVus(entityId), vus);
  }

  /** Sans prénom réglé, celui du compte HA signe les ajouts (`par=`). */
  async function apprendreMoi() {
    try {
      const nom = await source.utilisateur();
      if (!nom || moi) return;
      moi = nom;
      store.onMoi?.(nom);
      notifier();
    } catch (e) {
      console.warn('Utilisateur HA inconnu', e);
    }
  }

  /** Connexion ou reconnexion : les listes ont pu changer, et l'abonnement est à refaire. */
  async function rafraichirListes() {
    try {
      const l = await source.listes();
      if (!l) return reessayer();
      listesFraiches = true;
      listes = l;
      ecrire(CLE_LISTES, l);
      const id = liste?.entity_id;
      await store.choisir(id && l.some((x) => x.entity_id === id) ? id : (preferee() ?? l[0]?.entity_id));
    } catch (e) {
      console.warn('Listes illisibles', e);
      reessayer();
    }
  }

  /** HA qui démarre, ou lecture ratée : l'abonnement et la file attendent des listes fraîches. */
  function reessayer() {
    clearTimeout(reessai);
    if (source.connecte) reessai = setTimeout(() => !listesFraiches && rafraichirListes(), 3000);
  }

  function notifier() {
    abonnes.forEach((f) => f(store));
  }

  function pousser(op) {
    suivreEcho(op);
    file.push({ ...op, entity_id: liste.entity_id });
    ecrire(CLE_FILE, file);
    notifier();
    envoyerFile();
  }

  /**
   * L'article renommé ou supprimé ne doit pas revenir sous son ancien nom par son écho. Renommé alors
   * que HA ne l'a pas encore renvoyé : seul l'écho le montre, il prend le nouveau nom.
   */
  function suivreEcho(op) {
    if (!op.rename && op.op !== 'supprimer') return;
    const vise = (e) => cle(e.summary) === cle(op.nom);
    if (op.rename && !recus.some((i) => vise(i))) echos = echos.map((e) => (vise(e) ? { ...e, summary: op.rename } : e));
    else echos = echos.filter((e) => !vise(e));
  }

  /** Envoie la file dans l'ordre ; s'arrête à la première erreur réseau et réessaie plus tard. */
  function envoyerFile() {
    // Sur un HA qui démarre, les services manquent encore : l'opération serait abandonnée.
    if (vidage || !source.connecte || !listesFraiches || !file.length) return;
    vidage = (async () => {
      while (file.length && source.connecte) {
        const op = file[0];
        try {
          await envoyer(op);
          // HA a pu renvoyer l'article avant de confirmer l'envoi : pas d'écho alors.
          if (op.op === 'ajouter' && !recus.some((i) => cle(i.summary) === cle(op.summary))) echos.push({ ...op, t: Date.now() });
          // Hors ligne, l'ajout et le renommage partent ensemble : l'écho vient d'être créé.
          suivreEcho(op);
        } catch (e) {
          // Erreur de HA (article disparu, fonction non gérée) : on abandonne l'opération.
          // Erreur de connexion : on garde la file pour plus tard.
          if (!source.connecte || coupure(e)) break;
          console.warn('Opération abandonnée', op, e);
        }
        file.shift();
        ecrire(CLE_FILE, file);
        notifier();
      }
      vidage = null;
    })();
  }

  async function envoyer(op) {
    const id = op.entity_id;
    // Un uid provisoire n'existe pas chez HA : on désigne l'article par son nom.
    const ref = provisoire(op.ref) ? op.nom : op.ref;
    if (op.op === 'ajouter') return source.ajouter(id, op);
    if (op.op === 'modifier') return source.modifier(id, ref, op);
    if (op.op === 'supprimer') return source.supprimer(id, ref);
    if (op.op === 'purger') return source.purger(id);
    if (op.op === 'deplacer') {
      // `todo/item/move` n'accepte que des uid : on prend ceux de la liste reçue.
      const vrai = (uid, nom) => (provisoire(uid) ? recus.find((i) => cle(i.summary) === cle(nom))?.uid : uid);
      const uid = vrai(op.uid, op.nom);
      if (uid) return source.deplacer(id, uid, op.previous ? vrai(op.previous, op.apres) : null);
    }
  }

  /** Rejoue la file sur la dernière liste reçue (affichage optimiste). */
  function appliquerFile(items) {
    let l = items.map((i) => ({ ...i }));
    // L'article visé : par son uid, ou par son nom si l'uid était provisoire et que HA l'a renvoyé
    // entre-temps sous son vrai uid.
    const ou = (uid, nom) => l.findIndex((x) => x.uid === uid || (provisoire(uid) && cle(x.summary) === cle(nom)));
    // Comme local_todo et shopping_list, un article ajouté va en fin de liste.
    const ajout = (op) => {
      if (!l.some((x) => cle(x.summary) === cle(op.summary)))
        l.push({ uid: op.tmp, summary: op.summary, description: op.description, status: A_FAIRE });
    };
    for (const op of echos) if (op.entity_id === liste?.entity_id) ajout(op);
    for (const op of file) {
      if (op.entity_id !== liste?.entity_id) continue;
      if (op.op === 'ajouter') {
        ajout(op);
      } else if (op.op === 'modifier') {
        const i = l[ou(op.ref, op.nom)];
        if (i && op.status) i.status = op.status;
        if (i && op.rename) i.summary = op.rename;
        if (i && op.description !== undefined) i.description = op.description;
      } else if (op.op === 'supprimer') {
        const k = ou(op.ref, op.nom);
        if (k >= 0) l.splice(k, 1);
      } else if (op.op === 'purger') {
        l = l.filter((x) => x.status !== FAIT);
      } else if (op.op === 'deplacer') {
        const k = ou(op.uid, op.nom);
        if (k >= 0) {
          const [el] = l.splice(k, 1);
          const j = op.previous ? ou(op.previous, op.apres) + 1 : 0;
          l.splice(j, 0, el);
        }
      }
    }
    return l;
  }

  function preferee() {
    try {
      const id = localStorage.getItem('rature.liste');
      return listes.some((l) => l.entity_id === id) ? id : null;
    } catch {
      return null;
    }
  }

  return store;
}

/** La bibliothèque de HA signale une connexion perdue par son code 3, seul ou dans un message. */
const coupure = (e) => e === 3 || e?.code === 3 || e?.error?.code === 3;

const provisoire = (uid) => typeof uid === 'string' && uid.startsWith('tmp-');

function lireStockage(k, defaut) {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? defaut;
  } catch {
    return defaut;
  }
}
function ecrireStockage(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* rien */
  }
}

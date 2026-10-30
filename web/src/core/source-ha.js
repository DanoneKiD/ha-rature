// Source Home Assistant, par la bibliothèque officielle home-assistant-js-websocket.
//
// API vérifiée le 2026-10-26 dans le code de HA (homeassistant/components/todo/__init__.py et
// services.yaml, branche dev) :
//   - WebSocket `todo/item/subscribe` { entity_id } : pousse { items: [...] } à chaque changement
//     (la liste entière, pas un différentiel), et une première fois tout de suite ;
//   - WebSocket `todo/item/move` { entity_id, uid, previous_uid? } : sans previous_uid, l'article
//     passe en tête ; erreur `not_supported` si la liste n'a pas MOVE_TODO_ITEM (8) ;
//   - services `todo.add_item` (item, description?, due_date?, due_datetime?),
//     `todo.update_item` (item = uid OU summary, rename?, status?, description?),
//     `todo.remove_item` (item = uid ou summary, ou liste), `todo.get_items` (status?, réponse),
//     `todo.remove_completed_items`.
//   - `description` n'est accepté que si la liste a SET_DESCRIPTION_ON_ITEM (64) : `local_todo`
//     oui, `shopping_list` (la « Liste de courses » par défaut) NON.
//
// Authentification :
//   - dans l'app, par la coquille : l'utilisateur s'est connecté avec son compte HA, la coquille
//     garde les jetons et nous donne un jeton d'accès à la demande (coquille.js, `natif`) ;
//   - dans un navigateur (PWA servie par HA), le flux standard getAuth() de la bibliothèque.
//
// Hors ligne, `demarrer` ne bloque pas : la connexion s'établit quand le réseau revient (le store
// affiche en attendant la dernière liste reçue), et la bibliothèque se reconnecte ensuite d'elle-même.
import {
  ERR_INVALID_AUTH,
  callService,
  createConnection,
  getAuth,
  getStates,
} from 'home-assistant-js-websocket';
import { dansCoquille, erreur, natif } from './coquille.js';

const DESCRIPTION = 64;
const DEPLACER = 8;

/** @param {{ url: string }} reglages adresse de HA (https://maison.example:8123) */
export function creerSourceHA(reglages) {
  let conn = null;
  let pret = null;
  const source = {
    nom: 'ha',
    connecte: false,
    onEtat: null,
    /** Appelé si HA refuse la connexion (révoquée) : il faut se reconnecter. */
    onRefus: null,

    async demarrer() {
      const auth = dansCoquille()
        ? authCoquille(reglages.url)
        : await getAuth({ hassUrl: reglages.url, saveTokens, loadTokens });
      pret = createConnection({ auth, setupRetry: -1 }).then((c) => {
        conn = c;
        c.addEventListener('disconnected', () => etat(false));
        c.addEventListener('ready', () => etat(true));
        // Jeton révoqué pendant une reconnexion (au démarrage, c'est `pret` qui échoue).
        c.addEventListener('reconnect-error', (_, e) => e === ERR_INVALID_AUTH && source.onRefus?.(e));
        etat(true);
        return c;
      });
      pret.catch((e) => source.onRefus?.(e));
    },

    /** Les listes `todo.*`, ou null tant que HA n'est pas joignable. */
    async listes() {
      if (!conn) return null;
      const etats = await getStates(conn);
      return etats
        .filter((e) => e.entity_id.startsWith('todo.'))
        .map((e) => {
          const f = e.attributes.supported_features || 0;
          return {
            entity_id: e.entity_id,
            nom: e.attributes.friendly_name || e.entity_id,
            description: (f & DESCRIPTION) !== 0,
            deplacer: (f & DEPLACER) !== 0,
          };
        });
    },

    /**
     * Crée une liste locale (intégration `local_todo`) et rend son entity_id, une fois l'entité
     * apparue. Il faut un compte administrateur de HA. L'assistant de configuration ne passe que par
     * l'API REST : dans l'app, la coquille l'appelle (HA refuse ces requêtes venant de la page) ;
     * dans un navigateur, la PWA est servie par HA, même origine.
     */
    async creerListe(nom) {
      if (!conn) throw erreur('reseau');
      const avant = new Set((await source.listes()).map((l) => l.entity_id));
      if (dansCoquille()) await natif('creerListe', { nom });
      else await creerListeREST(reglages.url, conn.options.auth, nom);
      // L'entité arrive un instant après l'entrée de configuration.
      for (let i = 0; i < 60; i++) {
        const nouvelle = (await source.listes()).find((l) => !avant.has(l.entity_id));
        if (nouvelle) return nouvelle.entity_id;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw erreur('interne', 'liste introuvable');
    },

    /** Renomme une liste : le nom de son entité (registre des entités, compte administrateur). */
    async renommerListe(entityId, nom) {
      if (!conn) throw erreur('reseau');
      try {
        await conn.sendMessagePromise({ type: 'config/entity_registry/update', entity_id: entityId, name: nom });
      } catch (e) {
        throw erreur(e?.code === 'unauthorized' ? 'admin' : 'autre', e?.message);
      }
    },

    /** Nom de l'utilisateur HA connecté (« Alex »), qui signe les ajouts faits d'ici. */
    async utilisateur() {
      const u = await conn.sendMessagePromise({ type: 'auth/current_user' });
      return u?.name || null;
    },

    /** La bibliothèque réabonne d'elle-même après une reconnexion. */
    abonner(entityId, cb) {
      let fin = null;
      let annule = false;
      pret
        .then((c) => c.subscribeMessage((msg) => cb(msg.items), { type: 'todo/item/subscribe', entity_id: entityId }))
        .then((f) => (annule ? f() : (fin = f)))
        .catch(() => {});
      return () => {
        annule = true;
        fin?.();
      };
    },

    ajouter(entityId, { summary, description }) {
      const data = { item: summary };
      if (description) data.description = description;
      return callService(conn, 'todo', 'add_item', data, { entity_id: entityId });
    },

    modifier(entityId, ref, champs) {
      const data = { item: ref };
      if (champs.status) data.status = champs.status;
      if (champs.rename) data.rename = champs.rename;
      if (champs.description !== undefined) data.description = champs.description;
      return callService(conn, 'todo', 'update_item', data, { entity_id: entityId });
    },

    supprimer(entityId, ref) {
      return callService(conn, 'todo', 'remove_item', { item: ref }, { entity_id: entityId });
    },

    purger(entityId) {
      return callService(conn, 'todo', 'remove_completed_items', {}, { entity_id: entityId });
    },

    deplacer(entityId, uid, previousUid) {
      const msg = { type: 'todo/item/move', entity_id: entityId, uid };
      if (previousUid) msg.previous_uid = previousUid;
      return conn.sendMessagePromise(msg);
    },

    fermer() {
      source.onEtat = source.onRefus = null;
      pret?.then((c) => c.close(), () => {});
    },

    /**
     * Application en arrière-plan : on ferme la connexion, on la rouvre au retour. La pause arrive
     * souvent deux fois (la coquille, puis `visibilitychange`) : une seconde pause remplacerait la
     * promesse que la bibliothèque attend déjà, et la connexion ne se rouvrirait jamais.
     */
    pause() {
      if (!conn || source._reprendre) return;
      conn.suspendReconnectUntil(new Promise((r) => (source._reprendre = r)));
      conn.suspend();
    },
    reprise() {
      source._reprendre?.();
      source._reprendre = null;
    },
  };

  function etat(ok) {
    source.connecte = ok;
    source.onEtat?.(ok);
  }
  return source;
}

/** Assistant de configuration de `local_todo`, par l'API REST (PWA servie par HA). */
async function creerListeREST(hassUrl, auth, nom) {
  if (auth.expired) await auth.refreshAccessToken();
  const appel = async (chemin, corps) => {
    const r = await fetch(`${hassUrl}/api/config/config_entries/${chemin}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    if (r.status === 401 || r.status === 403) throw erreur('admin');
    if (!r.ok) throw erreur('interne', `HA ${r.status}`);
    return r.json();
  };
  const f = await appel('flow', { handler: 'local_todo', show_advanced_options: false });
  const fin = f.type === 'form' ? await appel(`flow/${f.flow_id}`, { todo_list_name: nom }) : f;
  if (fin.type === 'abort') throw erreur(fin.reason === 'already_configured' ? 'existe' : 'interne', fin.reason);
  if (fin.type !== 'create_entry') throw erreur('interne', fin.type);
}

/**
 * Objet `auth` attendu par la bibliothèque, alimenté par la coquille. Il part expiré : le premier
 * jeton n'est demandé qu'une fois le WebSocket ouvert, donc jamais hors ligne.
 */
function authCoquille(hassUrl) {
  return {
    data: { hassUrl, access_token: '', expires: 0 },
    get wsUrl() {
      return `ws${hassUrl.slice(4)}/api/websocket`;
    },
    get accessToken() {
      return this.data.access_token;
    },
    get expired() {
      return Date.now() > this.data.expires - 30000;
    },
    async refreshAccessToken() {
      try {
        const a = await natif('acces');
        this.data.access_token = a.access_token;
        this.data.expires = a.expires;
      } catch (e) {
        throw e.code === 'deconnecte' ? ERR_INVALID_AUTH : e;
      }
    },
  };
}

const CLE_JETONS = 'rature.ha.jetons';
function saveTokens(t) {
  try {
    localStorage.setItem(CLE_JETONS, JSON.stringify(t));
  } catch {
    /* rien */
  }
}
function loadTokens() {
  try {
    return JSON.parse(localStorage.getItem(CLE_JETONS));
  } catch {
    return null;
  }
}

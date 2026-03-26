#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  BLOG-API SYNC MONITOR — INF222 TAF1                                  ║
 * ║  Auteur  : NYUMEA PEHA DARYL GERVAIS                                  ║
 * ║  [MODIFIE] Surveillance rapide 15s + SSE push temps reel              ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 * Usage : node monitor.js  |  Arret : Ctrl+C
 */

// Force le mode strict de JavaScript : interdit certaines mauvaises syntaxes silencieuses et protège la portée
'use strict';

// Importation du module natif "fs" (File System) permettant l'écriture et lecture de fichiers dans l'OS
const fs = require('fs');
// Importation du module natif "path" pour manipuler proprement les chemins de dossier (/ ou \\) selon Windows/Linux
const path = require('path');
// Importation du module natif "http" permettant de créer le serveur web local pour le dashboard et d'effectuer des requêtes API
const http = require('http');

function parseEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    parsed[key] = value;
  }

  return parsed;
}

//Creation automatique du .env si absent 
const ENV_PATH = path.join(__dirname, '.env');

const defaults = {

  RENDER_BASE: 'https://api-blog-ruhu.onrender.com',
  LOCAL_BASE: 'http://localhost:4000',
  INTERVAL_MS: 3 * 60 * 1000,
  WATCH_INTERVAL_MS: 15 * 1000,
  DASH_PORT: 4250,
  AUTO_RESTORE: true,
  WAKE_PING_FIRST: true,

};
//Verification de la presence du .env
if (!fs.existsSync(ENV_PATH)) {
  const content = Object.entries(defaults)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(ENV_PATH, content);
  console.log(`${ENV_PATH} fichier .env a ete cree avec les valeurs par defaut.`);
}

// Chargement du .env
const env = parseEnvFile(ENV_PATH);

// Verification de la presence des variables d'environnement
if (!env.RENDER_BASE || !env.LOCAL_BASE) {
  console.error('Erreur: Les variables d\'environnement RENDER_BASE et LOCAL_BASE sont requises.');
  process.exit(1);
}

for (const [key, value] of Object.entries(env)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

// Configuration des appels des constantes de configuration
const RENDER_BASE = process.env.RENDER_BASE;
const LOCAL_BASE = process.env.LOCAL_BASE;
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS);
const WATCH_INTERVAL_MS = parseInt(process.env.WATCH_INTERVAL_MS);
const DASH_PORT = parseInt(process.env.DASH_PORT);
const AUTO_RESTORE = process.env.AUTO_RESTORE === 'true';
const WAKE_PING_FIRST = process.env.WAKE_PING_FIRST === 'true';

// Aide a la configuration
console.log('Configuration du monitor:');
console.log('RENDER_BASE:', RENDER_BASE);
console.log('LOCAL_BASE:', LOCAL_BASE);
console.log('INTERVAL_MS:', INTERVAL_MS);
console.log('WATCH_INTERVAL_MS:', WATCH_INTERVAL_MS);
console.log('DASH_PORT:', DASH_PORT);
console.log('AUTO_RESTORE:', AUTO_RESTORE);
console.log('WAKE_PING_FIRST:', WAKE_PING_FIRST);
console.log('--------------------------------');

//Configuration de la base d'appel aide 
const envStr = (key) => process.env[key] || defaults[key];
const envInt = (key) => {
  const value = Number.parseInt(process.env[key], 10);
  return Number.isFinite(value) ? value : defaults[key];
};
const envBool = (key) => {
  const value = process.env[key];
  if (value === undefined) return defaults[key];
  return value.toLowerCase() === 'true';
};

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Objet de Configuration Constante du Monitor (CFG). Ces valeurs régissent le comportement global.
const CFG = {
  // L'URL publique de l'API de démonstration hébergée sur Render (Production gratuite, sujette aux coupures/extinctions)
  renderBase: envStr('RENDER_BASE'),
  // L'URL de développement locale au cas où 
  localBase: envStr('LOCAL_BASE'),

  // Chemins absolus vers nos divers fichiers de sauvegarde et logs. __dirname = dossier actuel (sync-monitor)
  // path.join concatène dynamiquement : sync-monitor/data/backup.json
  backupFile: path.join(__dirname, 'data', 'backup.json'),
  logFile: path.join(__dirname, 'data', 'monitor.log'),
  statsFile: path.join(__dirname, 'data', 'stats.json'),

  // Cycle d'inspection "Lourd" (Ping Render + Synchro JSON) fixé à 3 minutes (en millisecondes : 3 * 60 * 1000)
  intervalMs: envInt('INTERVAL_MS'),
  // Cycle "Rapide" (Vérifie juste si le tableau a changé) à 15 secondes pour le "Temps Réel" visuel
  watchIntervalMs: envInt('WATCH_INTERVAL_MS'),

  // Port sur lequel écoutera notre dashboard http embarqué local (http://localhost:4200)
  dashPort: envInt('DASH_PORT'),

  // Prise de décision automatique : si Render passe à 0 articles (Extinction), ce booléen force l'envoi du backup local
  autoRestore: envBool('AUTO_RESTORE'),
  // Booléen qui détermine si on doit faire un "Ping" inutile de réveil au tout début du check Lourd.
  wakePingFirst: envBool('WAKE_PING_FIRST'),
};

// ─── ETAT GLOBAL ──────────────────────────────────────────────────────────────
// Objet variable STATE mémorisé en mémoire RAM. Il sera envoyé en temps réel au navigateur frontend (via SSE)
const STATE = {
  // Tableau de chaines contenant chronologiquement chaque log important à afficher au client Web
  logs: [],
  // Date précise du dernier Check "Lourd" réussi (le gros cycle de 3 minutes)
  lastCheckTime: null,
  // Booléen True = Render est joignable, False = Render est down
  renderOnline: false,
  // Nombre d'articles détecté actuellement sur l'API distante Render
  renderCount: '—',
  // Nombre d'articles disponibles fraîchement dans notre data/backup.json
  backupCount: 0,
  // Compte absolu du nombre de cycles où Monitor.js a sauvé le serveur "disque éphémère"
  restores: 0,
  // Total des échecs réseaux comptés (connexion timeout, erreur 500)
  errors: 0,
  // Le temps restant en secondes avant le prochain gros check de 3 minutes
  nextCheckIn: CFG.intervalMs / 1000,
};

// ─── STATISTIQUES ─────────────────────────────────────────────────────────────
// Objet STATS persistant qui comptabilise l'utilisation et la performance pour les graphiques du Dashboard
const STATS = {
  // Historisation linéaire des temps (ms) de ping au serveur Render (graphique principal)
  responseTimes: [],
  // Historisation des Cycles (Heure, Succès ou Non) -- Obsolete remplacé par hourlyActivity dans l'UI
  checkHistory: [],
  // [ACTION] Renommage de requestsBySource en callsByOrigin pour refléter QUI appelle l'API distante
  callsByOrigin: { monitor: 0, manual: 0, external: 0, wake: 0 },
  // Compteurs des appels à l'API Rest : GET, POST, PUT, DELETE
  apiCalls: { GET: 0, POST: 0, PUT: 0, DELETE: 0 },
  // Timestamp du moment où le fichier monitor.js a été allumé
  startedAt: new Date().toISOString(),
  // Répartition analytique par plage horaire pour créer de beaux diagrammes colonnes
  hourlyActivity: [],
};

// ─── [NOUVEAU] CLIENTS SSE ────────────────────────────────────────────────────
// Un tableau global emprisonnant tous les connexions Web ouvertes de manière continues (Server-Sent-Events).
// C'est ce qui nous autorise le VRAI Temps Réel: dès qu'un Log pop, on l'envoie manuellement dans ce tableau.
var sseClients = [];

// ─── [NOUVEAU] HASH RENDER ────────────────────────────────────────────────────
// Signature en forme String des attributs essentiels ("id|titre|date") d'une liste d'articles.
// Connaître le hash permet au script de s'assurer vite-fait (Toutes les 15s) si des modifs (PUT) ont eu lieu sans balayer des Mo de Data.
var lastRenderHash = '';

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────

/**
 * Fonction asynchrone pour garantir que le dossier "data/" existe bien sur le PC.
 * Protège d'une erreur fatale de `fs.writeFileSync` si le chemin parent est manquant.
 */
function ensureDataDir() {
  const dir = path.join(__dirname, 'data');
  // fs.existsSync renvoie faux si on supprime le dossier.
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Fonction de formatage des Dates et Heures, standardisée en FR.
 * Utilisée pour dater les logs et chronométrer l'Execution.
 * @returns {String}
 */
// [ACTION] M3: Fonction utilitaire Date Time formattée avec millisecondes
function ts() {
  var d = new Date();
  var ms = String(d.getMilliseconds()).padStart(3, '0');
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR') + '.' + ms;
}

// [ACTION] M3: Couleurs ANSI pour un rendu Cloud-ready
var ANSI = {
  reset: "\x1b[0m", dim: "\x1b[2m",
  OK: "\x1b[32m", ERROR: "\x1b[31;1m", WARN: "\x1b[33m", RESTORE: "\x1b[36m",
  ALERT: "\x1b[31m", INFO: "\x1b[37m", CHECK: "\x1b[35m", WATCH: "\x1b[35;2m",
  PING: "\x1b[90m", SAVE: "\x1b[32;1m", MANUAL: "\x1b[36;1m", SEND: "\x1b[34;1m",
  START: "\x1b[33;1m", DASH: "\x1b[36m", STOP: "\x1b[31;1m"
};

/**
 * Super fonction d'historisation Multi-Canaux.
 * 1. Affiche le message formaté dans le Terminal Windows/Linux actuel
 * 2. L'enregistre dans STATE.logs (Mémoire Vive) -> Utilisé pour envoyer à la vue Web
 * 3. Écrit passivement dans fichier dur (monitor.log) pour garantir une traçabilité à froid
 * 4. Pousse immédiatement l'état général aux clients de SSE connectés, Temps Réel effectif !
 * @param {String} level - Code de couleur/priorité (OK, INFO, ERROR, PING, WATCH, etc)
 * @param {String} msg - Message exact décrivant l'action.
 */
function log(level, msg) {
  // Prépare le String final brut pour les logs en dur (sans ANSI)
  const line = '[' + ts() + '] [' + level.padEnd(5) + '] ' + msg;

  // [ACTION] M3: Affichage Terminal BASH avec coloration syntaxique Cloud ANSI
  var color = ANSI[level] || ANSI.INFO;
  var termLine = ANSI.dim + '[' + ts() + ']' + ANSI.reset + ' ' + color + '[' + level.padEnd(7) + ']' + ANSI.reset + ' ' + msg;
  console.log(termLine);

  // Stockage RAM : unshift au lieu de push, nous plaçons le log NEUF en pole-position [0] (Haut Ligne)
  STATE.logs.unshift({ time: ts(), level: level, msg: msg });
  // Oublie les très vieux logs pour ne pas exploser la RAM serveur si le monitor tourne sur de longs mois
  if (STATE.logs.length > 200) STATE.logs.pop();

  // Faille safe d'écriture fichier (append = ajouter a la ligne sans écraser, de façon synchrone)
  try { fs.appendFileSync(CFG.logFile, line + '\n'); } catch (_) { }

  // Temps Réel FrontEnd : Envoie la mise à jour massive du `STATE` en flux réseau Push !
  broadcast();
}

/**
 * Exporte intelligemment le JSON massif des articles fraîchement récupérés dans backup.json
 * @param {Array} articles - Le tableau des dictionnaire d'objets articles.
 */
function saveBackup(articles) {
  // Force la création du tiroir "data"
  ensureDataDir();
  // Englobe dans un wrapper `payload` indiquant quand la sauvegarde a cliqué (savedAt)
  const payload = { savedAt: new Date().toISOString(), articles: articles };

  // Enregistre silencieusement le fichier (Formaté par "2" pour être lisible dans un IDE)
  fs.writeFileSync(CFG.backupFile, JSON.stringify(payload, null, 2), 'utf8');

  // Met à jour la RAM pour affichage sur les Cartes Vertes du Dashboard Web
  STATE.backupCount = articles.length;
  // Signale au système qu'une écriture a eu lieu
  log('SAVE', 'Sauvegarde locale : ' + articles.length + ' article(s) -> data/backup.json');
}

/**
 * Tente d'absorber le fichier JSON présent pour comprendre ce qui est déjà sauvegardé.
 * @returns {Object|null} Les données (articles et metadata) ou `null` si introuvable.
 */
function loadBackup() {
  // Aucune chance si le fichier ne subsite pas
  if (!fs.existsSync(CFG.backupFile)) return null;

  try {
    // Lecture brute en string
    const raw = fs.readFileSync(CFG.backupFile, 'utf8');
    // Parsage strict depuis JSON
    const data = JSON.parse(raw);

    // Attribue la longueur à l'objet interne pour l'utiliser sans recalculer
    STATE.backupCount = data.articles ? data.articles.length : 0;
    return data;
  } catch (e) {
    // Sécurité: JSON très abimé, inexploitable.
    log('ERROR', 'Impossible de lire la sauvegarde (Format JSON Pété) : ' + e.message);
    return null;
  }
}

/**
 * Prends tout l'objet de statistiques en RAM et le compresse en "stats.json".
 * Garantit les fameux Graphiques après redémarrage du processus Windows ou VM !
 */
function saveStats() {
  try { fs.writeFileSync(CFG.statsFile, JSON.stringify(STATS, null, 2), 'utf8'); } catch (_) { }
}

/**
 * Au premier démarrage de "node monitor.js", tente de rapatrier l'ancien "stats.json".
 */
function loadStats() {
  // Coupe-circuit si jamais exécuté
  if (!fs.existsSync(CFG.statsFile)) return;
  try {
    // Restauration délicate des clés (On met un if pour éviter d'écraser des nouvelles features)
    const data = JSON.parse(fs.readFileSync(CFG.statsFile, 'utf8'));
    if (data.responseTimes) STATS.responseTimes = data.responseTimes;
    if (data.checkHistory) STATS.checkHistory = data.checkHistory;
    // [ACTION] Migration rétrocompatible de l'historique des sources vers callsByOrigin
    if (data.callsByOrigin) STATS.callsByOrigin = data.callsByOrigin;
    else if (data.requestsBySource) STATS.callsByOrigin = { monitor: data.requestsBySource.local || 0, manual: 0, external: data.requestsBySource.other || 0, wake: 0 };
    if (data.apiCalls) STATS.apiCalls = data.apiCalls;
    if (data.hourlyActivity) STATS.hourlyActivity = data.hourlyActivity;
  } catch (_) { }
}

/**
 * Un algorithme complexe traitant le "Regroupement par Tranches Horaires" (Tendance).
 * Nécessaire afin de dessiner les Graphiques Colonnes Rouges/Vertes
 * @param {Boolean} success - True si le flux HTTP était un succès, False sinon.
 * @param {Number} responseTime - MS écoulé sur le cycle pour réaliser des moyennes
 */
function recordHourlyActivity(success, responseTime) {
  // Crée un marqueur string jusqu'à l'heure : "2026-03-23T15"
  const hourKey = new Date().toISOString().substring(0, 13);

  // Cherche dans la liste si on a déjà tapé dans cette heure
  let entry = STATS.hourlyActivity.find(function (e) { return e.hour === hourKey; });

  // Première fois qu'on tape dans l'heure : initialisation à 0
  if (!entry) {
    entry = { hour: hourKey, success: 0, fail: 0, avgResponse: 0, total: 0 };
    STATS.hourlyActivity.push(entry);
  }

  // Incrémentation binaire des succès/erreurs
  if (success) entry.success++; else entry.fail++;
  entry.total++; // Compteur incrémenté sur tous les cas.

  // Mathématique Formelle pour Mettre à jour une moyenne mouvante sans tout recompter
  // Moyenne_Nouvelle = (Moyenne_Anciene * (Total_Ancien) + Element) / N_Total
  entry.avgResponse = Math.round(
    (entry.avgResponse * (entry.total - 1) + responseTime) / entry.total
  );

  // Ne conserve que 24 éléments maximum (Les dernières 24 Heures, évite un dump lourd)
  if (STATS.hourlyActivity.length > 24)
    STATS.hourlyActivity = STATS.hourlyActivity.slice(-24);
}

// ─── [NOUVEAU] SSE BROADCAST ──────────────────────────────────────────────────

/**
 * MAGIE DU TEMPS REEL (Server Sent Events).
 * C'est le coeur du système Push depuis la nouvelle version.
 * Interrompt tous les "res" (Réponses HTTP Continues) et leur glisse un bloc formatté de strings.
 * En l'occurence : la chaine "data: " + Le JSON Global + le terminateur de balise réseau \n\n
 */
function broadcast() {
  // Pas la peine de pomper le CPU s'il n'y a pas d'onglet Chrome ouvert
  if (sseClients.length === 0) return;

  // Formatte un packagé compréhensible sans erreur pour l'EventSource HTML global JS Client
  const payload = 'data: ' + JSON.stringify({ state: STATE, stats: STATS }) + '\n\n';

  // Slice clone the array pour palier au soucis de coupure simultanée d'un browser (mutations d'array)
  sseClients.slice().forEach(function (client) {
    try {
      // Ecrit littéralement dans la liaison tcp socket HTTP de l'internaute
      client.res.write(payload);
    } catch (_) {
      // Client a probablement deconnecté (Onglet Chrome Fermé) : on le retire sauvagement de l'array pour arrêter l'hémorragie !
      sseClients = sseClients.filter(function (c) { return c.id !== client.id; });
    }
  });
}

// ─── [NOUVEAU] HASH ARTICLES ──────────────────────────────────────────────────

/**
 * Fonction légère pour produire un "String Signature" identifiant rigoureusement le tableau complet
 * Ex:  "1|Premier Article|Jeudi ; 2|Dexieme Article|Vendredi"
 * Permet de déterminer qu'un POST/PUT/DELETE survenait, si "lastHash" est != de "thisHash" sans lire tous les megabytes de String
 */
function hashArticles(articles) {
  // Si le parse plante ou est vide, l'empreinte est un String arbitraire 'empty'
  if (!articles || articles.length === 0) return 'empty';

  // Boucle Maps qui concatène des valeurs d'articles en séparateur pipé "|"
  return articles.map(function (a) {
    // a.id : Si l'identifiant change, l'article a été supp/ajouté
    // a.titre : Changement visuel PUT 
    // a.updatedAt : Date de dernière modification par une Update Query SQL
    return (a.id || '') + '|' + (a.titre || '') + '|' + (a.updatedAt || a.createdAt || '');
  }).join(';'); // et les array sont splittées par des point virgules ;
}

// ─── HTTP HELPERS ─────────────────────────────────────────────────────────────

/**
 * Sur-couche Customisée d'un Fetch sans utiliser la librairie 'node-fetch' ou npm install.
 * Réduit le script à sa simple expression via http(s).request.
 * @param {String} url - L'URL API à appeler, ex: "https://api.com/test"
 * @param {Object} opts - Objet définissant des paramètres complexes : "method", "timeout", "body" JSON
 * @returns {Promise} Objet de résolution native (Attente dans les routines ASync/Await)
 */
function fetchJSON(url, opts) {
  if (!opts) opts = {};

  // Wrap dans une promesse pour utiliser le Try/Catch moderne "await" et plus les immondes Callbacks.
  return new Promise(function (resolve, reject) {
    // Discerne rapidement si le port ciblé réclame https ou non (Important sur NodeJS)
    var mod = url.startsWith('https') ? require('https') : http;

    // Injecte par défaut GET + Timeout de 10 Secondes Maximum au delà desquels le logiciel pète.
    var options = {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      timeout: opts.timeout || 10000,
    };

    // Si la méthode comprend un payload d'Envoi (ex API.POST Body)
    if (opts.body) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(opts.body);
    }

    // Exécute la native Request de l'ordinateur
    var req = mod.request(url, options, function (res) {
      var raw = '';
      // Empile la data en mémoire car Node.js lit les flux "Chunk by Chunk" et non Full Memory comme les browsers.
      res.on('data', function (d) { raw += d; });
      // Clôture du paquet HTTP
      res.on('end', function () {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }  // Test si JSON valide
        catch (e) { resolve({ status: res.statusCode, data: raw }); }          // Test si text crû validé (Ex Erreur Nginx/Render 502)
      });
    }); 

    // Échec radical Réseau Local (DNS Error) ou TimeOut Intercepter
    req.on('error', function (e) { reject(e); });
    req.on('timeout', function () { req.destroy(); reject(new Error('Timeout')); });

    // On libère le barrage -> Attache le Corp POST et End() (GO !)
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ─── LOGIQUE METIER (Moteur du Script) ────────────────────────────────────────

/**
 * Exécute une simple requête GET factice pour réveiller le conteneur lourd Node de Render. 
 * Les serveurs gratuits de Render.com s'éteignent à 15min. S'attendre à une réponse de 10-30s.
 */
async function wakeRender() {
  try {
    log('PING', 'Ping de reveil envoye a Render...');
    // Implique un Timeout Énorme (35 Secondes) pour contrer la lenteur du Container Wake-Up Pédagogique.
    // [ACTION] Passage de { isWake: true } pour la propreté (meme si on utilise fetchJSON)
    await fetchJSON(CFG.renderBase + '/api/articles', { timeout: 35000, isWake: true });
    // [ACTION] Imputer au compteur 'wake' unitairement (pas dans apiCalls.GET)
    STATS.callsByOrigin.wake++;
    log('PING', 'Render repond — instance active.');
  } catch (e) {
    log('WARN', 'Ping de reveil : ' + e.message); // En cas d'échec total (Si Timeout 35s écoulé)
  }
}

/**
 * Cœur du système : Fetch tous les articles publiés actullement dans la BDD SQLite vivante Render.
 * @param {String} base - Paramètre base d'URL.
 * @returns {Array} List d'articles JSON
 */
async function fetchArticles(base) {
  // Attends la fin du Fetch Custom avant de poursuivre
  var r = await fetchJSON(base + '/api/articles');

  // Validation Croisée : Si Http=200 et que l'API respectueuse des Formats renvoie "r.data.success = true"
  if (r.status === 200 && r.data && r.data.success) {
    return r.data.data || [];
  }

  // Si Http != 200 (Erreur 500 API SQLite Crashed, ou 404), rejette en erreur brutale
  throw new Error('HTTP ' + r.status);
}

/**
 * Envoie asynchronement un Article (sans clé) via HTTP POST au service cloud Render.
 * @param {String} base - L'api
 * @param {Object} article - Le modèle Json entier de la Data à insérer
 */
async function postArticle(base, article) {
  // Assure le Clonage Objectif pur 1/1 sans muter les références locales pour effacer son ID unique en base SQLite "Backup" locale. 
  var body = Object.assign({}, article);
  // Extirpation de l'ID natif : Render et sqlite géreront les AUTO INCREMENTS librement
  delete body.id;

  return fetchJSON(base + '/api/articles', {
    method: 'POST',
    headers: {},
    body: JSON.stringify(body),
  });
}

/**
 * Fonction massive et critique de Sauvetage de données de la Base Ephémère vers Render.com POST by POST.
 * @param {Array} articles - Tous les articles à rapatrier.
 * @param {Boolean} isManual - Origine manuelle ou automatique.
 */
async function restoreToRender(articles, isManual) {
  log('RESTORE', 'Debut de restauration — ' + articles.length + ' article(s) a envoyer...');

  // Variables Compteurs d'Evaluation Statistiques et de Logs ! (Le fail ou OK)
  var ok = 0, fail = 0;

  // Boucle bloquante (await au coeur garantissant l'enchainement)
  for (var i = 0; i < articles.length; i++) {
    var a = articles[i];
    try {
      // Exécute 
      var r = await postArticle(CFG.renderBase, a);
      if (r.status === 201) { // 201 Strict du format API de CleeRoute (TP) pour validé Created
        ok++;
        STATS.apiCalls.POST++; // [NOUVEAU] Incrément le Stats Graph Horizontal POST
        // [ACTION] Ajouter cet appel POST a l'origine appropriee
        if (isManual) STATS.callsByOrigin.manual++; else STATS.callsByOrigin.monitor++;
      } else {
        fail++;
        log('WARN', 'POST echoue pour "' + a.titre + '" : HTTP ' + r.status); // 400 Bad Request
      }
    } catch (e) {
      fail++;
      log('ERROR', 'Erreur POST pour "' + a.titre + '" : ' + e.message); // Render Closed ? DNS Lost ?
    }
    // Respect strict des limites TPS API Gratuites. Repos minimal réseau HTTP (400 Millisecondes)
    await new Promise(function (r) { setTimeout(r, 400); });
  }

  // Impute la stat générale et envoie au Broadcast un log "Final".
  STATE.restores++;
  log('RESTORE', 'Restauration terminee — ' + ok + ' succes, ' + fail + ' echec(s).');

  // Valeur pure retournée à l'utilisateur qui déclenche la restauration Web (Via le Dashboard API Custom)
  return { ok: ok, fail: fail };
}

// ─── [NOUVEAU] SURVEILLANCE RAPIDE (15s) (Système Temps-Réel API) ─────────────

/**
 * Boucle de surveillance rapide, TRES independante du cycle lourd de 3 minutes.
 * Ne déclenche AUCUN réveil forcé ni Restauration. Vise uniquement à "Savoir si ça a changé".
 * Remplis l'interface Web (SSE) en Temps Réel, en devinant ce qu'il s'est passé avec le paramètre de Hash.
 */
async function watchRenderChanges() {
  var articles;
  try {
    // Si le fetch échoue par simple timeout: l'api va dormir, pas besoin de réveiller juste pour un check rapide !
    articles = await fetchArticles(CFG.renderBase);
  } catch (e) {
    // Render inaccessible ou éteint (Dort gratuit), on ignore pour le temps réel
    STATE.renderOnline = false;
    broadcast();
    return;
  }

  // Marqueur positif au niveau de the RAM Serveur : Render Répond Actuellement.
  STATE.renderOnline = true;

  // Dévoile des indicateurs puissants de comparaison mathématiques et de signatures de Hachage
  var newHash = hashArticles(articles);
  var newCount = articles.length;
  // FallBack d'indexation (-1). Soit on sais soit le script vient d'apparaitre
  var oldCount = typeof STATE.renderCount === 'number' ? STATE.renderCount : -1;

  // L'algorithme vérifie si les variables de chaines concaténées sont les mêmes (Si on a le meme état de DB)
  if (newHash === lastRenderHash) {
    STATE.renderCount = newCount;
    broadcast(); // Au minium, signale le tic-tac du FrontEnd
    return;
  }

  /* 
   * Si ce point est atteint (Ligne 307H), on certifie qu'on changement a OPÉRÉ à DISTANCE :
   * Quelqu'un (ou le Tuteur) a exploité l'API Postman ou WebApp Frontend.
   */

  // 1. Deviner un NOUVEL Ajout : Array plus long 
  if (oldCount >= 0 && newCount > oldCount) {
    var added = newCount - oldCount;
    STATS.apiCalls.POST += added;
    // [ACTION] L'origine extérieure qui bypass le dashboard local = external
    STATS.callsByOrigin.external += added;
    log('WATCH', 'Changement detecte : +' + added + ' article(s) ajoute(s) sur Render (POST)');
  }
  // 2. Deviner une SUPPRESSION Globale : Mince, tableau Array raccourci massivement !
  else if (oldCount >= 0 && newCount < oldCount) {
    var deleted = oldCount - newCount;
    STATS.apiCalls.DELETE += deleted;
    // [ACTION] Imputer a l'origine 'external'
    STATS.callsByOrigin.external += deleted;
    log('WATCH', 'Changement detecte : -' + deleted + ' article(s) supprime(s) sur Render (DELETE)');
  }
  // 3. Cas le plus mystérieux : Count reste pareil que OldCount (ex 8=8), MAIS LE HASH EST DIFFEREEE ! Modification PUT !
  else if (oldCount === newCount && newHash !== lastRenderHash) {
    STATS.apiCalls.PUT++;
    // [ACTION] Imputer a l'origine 'external'
    STATS.callsByOrigin.external++;
    log('WATCH', 'Changement detecte : article(s) modifie(s) sur Render (PUT)');
  }

  // Pousser le résultat du Hash à l'État Stable pour le Prochain cycle de Loop Watch (15s)
  STATE.renderCount = newCount;
  lastRenderHash = newHash;

  // [ACTION] Implémentation du smartSave strict: ne sauver que si les données distantes remplacent valablement le backup !
  if (newCount > 0 && (newCount >= STATE.backupCount || STATE.backupCount === 0)) {
    // Enregistrement manuel brutal silencieux (contournement de saveBackup) vers `data/` 
    // afin de s'ancrer dans l'ordinateur en Temps-Réel Local aussi ! 
    ensureDataDir();
    const payload = { savedAt: new Date().toISOString(), articles: articles };
    fs.writeFileSync(CFG.backupFile, JSON.stringify(payload, null, 2), 'utf8');
    STATE.backupCount = newCount;

    // Alerte au dashboard que la modif externe du Tuteur a entrainé un Backup de Securite
    log('WATCH', 'backup.json mis a jour automatiquement (' + newCount + ' articles)');
  } else if (newCount > 0 && newCount < STATE.backupCount) {
    // [ACTION] Protection smartSave (cas suppression distance etrangere): alerte passive
    log('WARN', 'watchRender: articles perdus a distance, le backup protège ses donnees sans ecrasement !');
  }

  // Le JSON du stats.json est validé
  saveStats();
}

// ─── CYCLE PRINCIPAL LOURD (Système de Restauration des 3 Minutes) ───────────

/**
 * Routine complexe. 
 * - Réveille Render
 * - Vérifie l'état Render vs l'état Backup.json (La mémoire)
 * - Provoque une restauration "restoreToRender()" si la mémoire Render est devenue Éphémère (effacée) = ZERO
 * @param {Boolean} isManual - indique si déclenché par le Web
 */
async function checkCycle(isManual) {
  STATE.lastCheckTime = ts();
  log('CHECK', '== Demarrage du cycle de verification ==');

  // Chronomètre de latence "ping" pour le Graph MS Ligne de Courbe Vert
  var startTime = Date.now();
  // Reveil le système de base s'il était dormant (Extrait de Free Tier Render PaaS Serverless Node).
  if (CFG.wakePingFirst) await wakeRender();

  var renderArticles;
  try {
    // Collecte de l'ensemble
    renderArticles = await fetchArticles(CFG.renderBase);

    // Stoppe Temps = Ping Time
    var responseTime = Date.now() - startTime;

    // Déclare "Healthy" Ok 
    STATE.renderOnline = true;
    STATE.renderCount = renderArticles.length;

    // [ACTION] M2: Historisation etendue a 500 valeurs pour permettre le zoom arrière sur 24h
    STATS.responseTimes.push({ time: ts(), ms: responseTime });
    if (STATS.responseTimes.length > 500) STATS.responseTimes.shift();

    // [ACTION] M4: Le "GET Array" métier est reussi, mais on ne l'incrémente plus dans les statistiques
    // pour que l'interface ne mesure que l'activité Externe et Manuelle réelle.
    
    // [ACTION] Comptabiliser dans la bonne source d'origine
    if (isManual) STATS.callsByOrigin.manual++; else STATS.callsByOrigin.monitor++;

    // Assigne 1 PING OK de Plus le tableau Hourly Activité pour des bars vertes.
    recordHourlyActivity(true, responseTime);

    // Équilibrage des Hashes
    lastRenderHash = hashArticles(renderArticles);

    log('OK', 'Render accessible — ' + renderArticles.length + ' article(s) trouves. (' + responseTime + 'ms)');
  } catch (e) {
    // Plantage. Chrono stoppé, Graphique à faux, Stats Hourly d'Error 
    var responseTime2 = Date.now() - startTime;
    STATE.renderOnline = false;
    STATE.renderCount = 'erreur';
    STATE.errors++; // Stat globale rouge UI du Dashboard

    recordHourlyActivity(false, responseTime2); // Bar rouge !
    log('ERROR', 'Impossible d\'atteindre Render : ' + e.message);
    saveStats();
    return; // ECHAPPE ET ABANDONNE LA PROCEDURE (Car on est Aveugle sans le Data Distant)
  }

  // Lecture de la Mémoire de Secours Backup (Local System Windows JS OS) pour comparaison pre-save
  var backup = loadBackup();
  var backupLen = backup && backup.articles ? backup.articles.length : 0;

  // [ACTION] smartSave Phase Sécurité : Protection Absolue contre l'écrasement local 
  if (renderArticles.length === 0) {
    // Oups ??!! Render nous a poliment répondu succès (status 200), MAIS qu'il a 0 Articles Enregistrés ?? 
    // Signale une réinitialisation probable du DB sqlite éphémère !!
    log('WARN', 'Render renvoie 0 article — base potentiellement reinitialisee.');
  } else if (renderArticles.length >= backupLen || backupLen === 0) {
    // On ecrase en toute securité car soit on ajoute, soit on initialise le backup.
    saveBackup(renderArticles);
  } else {
    log('WARN', 'Alert: Le serveur n a plus que ' + renderArticles.length + ' articles au lieu de ' + backupLen + ' localement.');
  }

  if (!backup) {
    // Impuissance Pure : S'il y a O sur Render et Rien sur Local. Le systeme est muet et naissant
    log('INFO', 'Pas encore de sauvegarde locale disponible.');
    saveStats();
    return;
  }

  // Extract les dimensions numériques d'inventaire
  // (Deja extrait pour backupLen, renderLen)
  var renderLen = renderArticles.length;

  /*
   * SI : Config Autorisée + LOCAL détient des articles + API DISTANTE est vide OU a perdu des articles
   * ALORS: RESTAURER RENDER !! (Problème Fixé Disque Éphémère ou Corruption) 
   */
  if (CFG.autoRestore && backupLen > 0 && renderLen < backupLen) {
    if (renderLen === 0) {
      log('ALERT', 'PERTE TOTALE DE DONNEES — Sauvegarde: ' + backupLen + ', Render: 0');
    } else {
      log('ALERT', 'PERTE PARTIELLE DE DONNEES — Sauvegarde: ' + backupLen + ', Render: ' + renderLen);
    }
    
    log('ALERT', 'Lancement de la restauration automatique pour synchroniser Render sur Local...');

    // On pousse via POST l'intégralité massive des Objets de Backup
    await restoreToRender(backup.articles, false);

    try {
      // Re-vérification Pédagogique après le flot de POST pour certifier à 100% que le résultat y est. 
      var after = await fetchArticles(CFG.renderBase);
      STATE.renderCount = after.length;
      lastRenderHash = hashArticles(after);
      log('OK', 'Post-restauration : Render contient desormais ' + after.length + ' article(s).');
    } catch (_) { }
  }
  // Petite Alerte Bruit si un compte n'est plus aligné (Modération Web ? User à supprimé ??)
  else if (renderLen > 0 && renderLen < backupLen) {
    log('WARN', 'Articles partiellement perdus — Render: ' + renderLen + ', Sauvegarde: ' + backupLen);
  }
  // Cas Classique de Succès Vertueux : Egalité globale
  else {
    log('OK', 'Donnees coherentes — Render: ' + renderLen + ' | Sauvegarde: ' + backupLen);
  }

  // Fin de traitement, enregistre tout le dur.
  log('CHECK', '== Fin du cycle ==');
  saveStats();
}

// ─── SYNCHRONISATION MANUELLE (DÉCLENCHÉ DEPUIS LE DASHBOARD WEB) ──────────────

/**
 * Fonction appelée manuellement uniquement un POST au route "/api/sync". (Le fameux Bouton Front Envoyer Backup)
 * Protocole forcé de restauration, sans dépendre du Timing ni de la condition Autorestoration limitante du Check.
 */
async function manualSync() {
  log('MANUAL', 'Synchronisation manuelle declenchee depuis le dashboard.');

  // Tente l'accaparement de la base Locale System
  var backup = loadBackup();
  if (!backup || backup.articles.length === 0) {
    log('WARN', 'Aucune sauvegarde disponible pour la synchronisation manuelle.');
    return { error: 'Pas de sauvegarde disponible.' };
  }

  var renderArticles;
  try {
    // S'efforce de Check le niveau Live du Serveur avant de le matraquer aveuglément..
    renderArticles = await fetchArticles(CFG.renderBase);
  } catch (e) {
    return { error: 'Render inaccessible : ' + e.message };
  }

  // N'effectue le Force POST que SI l'instance est bel et BIEN vide pour ne pas doublonner (Contrainte de sécurité logique métier) 
  if (renderArticles.length === 0) {
    return await restoreToRender(backup.articles, true);
  }

  // Indication finale
  return { info: 'Render contient deja ' + renderArticles.length + ' article(s). Pas de restauration forcee.' };
}

// ─── ROUTAGE WEB : DASHBOARD HTTP LOCAL ───────────────────────────────────────

/**
 * Exploite (fileRead) le document HTML unique de façon synchrone pour le servir au navigateur
 */
function loadDashboardHTML() {
  var htmlPath = path.join(__dirname, 'public', 'dashboard.html');
  try {
    return fs.readFileSync(htmlPath, 'utf8');
  } catch (e) {
    return '<html><body><h1>Erreur : dashboard.html introuvable</h1><p>' + e.message + '</p></body></html>';
  }
}

/**
 * Détecteur intelligent de la Source/Origine HTTP du visiteur de l'api locale
 * Permet d'alimenter le Pie-Chart Donut "Traffic User" entre Render/Front/Back etc.
 * @param {Request} req HTTP Request Object Express Like
 */
function detectSource(req) {
  // Lit les Entêtes réseaux Header Referer et l'IP Socket
  var referer = req.headers.referer || req.headers.origin || '';
  var ip = req.connection.remoteAddress || '';

  // Est du pur "Local Host ?"
  if (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('localhost')) {
    if (referer.includes('Frontend') || referer.includes('frontend')) return 'frontend';
    return 'local';
  }
  // Vient t'il du déploiement Render Front Web Rabaix de sécurité
  if (referer.includes('onrender.com') || referer.includes('render')) return 'render';
  // Tout le reste non défini (Ex IP Externe de mon ami qui teste chez lui)
  return 'other';
}

/**
 * Fonction de Routage principale affectée au Node JS CreateServer !
 * Routes :
 *   GET  /            → Page HTML (Affiche la vue du navigateur)
 *   GET  /api/state   → Etat JSON (Récupération pure en direct si SSE non écoutable)
 *   GET  /api/stats   → Statistiques JSON 
 *   GET  /api/backup  → Sauvegarde entière JSON de sécurité
 *   GET  /api/stream  → [NOUVEAU] Flux SSE Réseau Continu du temps Réel (PUSH Serveur)
 *   POST /api/check   → Bouton Web Vérifier (Forcer ping)
 *   POST /api/sync    → Bouton Web Synchronisation manuelle (Force Push Data Render)
 * 
 * @param {Request} req - Objet de la Requete Web Interne
 * @param {Response} res - Objet Response Web Native Stream
 */
function serveDashboard(req, res) {
  // Strip les potentiellement Get URI '?q=test' pour une comparaison routière limpide et stricte
  var url = req.url.split('?')[0];

  // [ACTION] Retrait du calcul old school requestsBySource qui s'amusait a tracer des IPs locales
  // (DetectSource() n'est plus pertinent en V2.0 pour les statistiques Pie chart)

  // 1ère Route: L'Acceuil. Renvoi au Browser File HTML complet à balayages.
  if (url === '/' || url === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(loadDashboardHTML());
    return;
  }

  // [NOUVEAU] SSE FLUX (Server Sent Events) 
  // Connexion persistante Web ("Keep-Alive"). Jamais close tant que l'onglet du user est ouvert
  if (url === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',  // C'est ce header MIME qui indique un flux d'évènement continu
      'Cache-Control': 'no-cache', // Interdit radicalement toute mémoire
      'Connection': 'keep-alive', // Demande réseau de Garder la TCP ouverte
      'Access-Control-Allow-Origin': '*', // CORS libre si nécéssaire 
    });

    // Le serveur salue la connexion du navigateur en envoyant "Res.write()" l'objet immédiatement ! 
    res.write('data: ' + JSON.stringify({ state: STATE, stats: STATS }) + '\n\n');

    // On index un numéro ID Aléatoire Mathématique Identifiant Unique pour le Navigateur
    var clientId = Date.now() + Math.random();

    // Le Push dans "SSEClients" lie ce Client web au système Broadcast de Notifications JS (push event logs)
    sseClients.push({ res: res, id: clientId });
    log('DASH', 'Client SSE connecte (total: ' + sseClients.length + ')');

    // Si le gars ferme l'Onglet Chrome son Request "Close" Interceptera Le Retrait de l'Array Memory Ram ! Stop l'Hémorragie de res !
    req.on('close', function () {
      sseClients = sseClients.filter(function (c) { return c.id !== clientId; });
    });
    // ATTENTION: Nous ne faisons surtout PAS "return res.end();" afin de ne PAS briser le flux persistant Socket. 
    return;
  }

  // Ancien Flux classique Legacy si non utilisté à defaut par SSE: State de Base de données (No-Cache Aggressif Fixé)
  if (url === '/api/state') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache', 'Expires': '0',
    });
    res.end(JSON.stringify(STATE));
    return;
  }

  // Ancien Flux Classique des Objets Stats Array Object de Graphique
  if (url === '/api/stats') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache', 'Expires': '0',
    });
    res.end(JSON.stringify(STATS));
    return;
  }

  // Reçoit des Boutons Action: Force la vérification manuellement 
  if (url === '/api/check' && req.method === 'POST') {
    res.writeHead(202, { 'Content-Type': 'application/json' });
    // Valide HTTP 202 (Processing Accepté) Immediat, afin de clore HTTP Call du User Rapide !
    res.end(JSON.stringify({ queued: true }));
    // [ACTION] Passage du isManual a `true`. Execution de Long Runtime Asynchrone dans Base Node.
    checkCycle(true).catch(function (e) { log('ERROR', e.message); });
    return;
  }

  // Reçoit Bonton Action Restauration Secours Force POST !
  if (url === '/api/sync' && req.method === 'POST') {
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ started: true }));
    // Idem: Backgrounding. "manuelSync" appellera "restoreToRender" si validé
    manualSync().then(function () { }).catch(function (e) { log('ERROR', e.message); });
    return;
  }

  // Backup file dump
  if (url === '/api/backup' && req.method === 'GET') {
    var backup = loadBackup();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(backup || { articles: [] })); // Array Vide si Rien d'inscrit local ou null
    return;
  }

  // [ACTION] Maintenance V1: Route pour forcer la sauvegarde (Backup Manuel)
  if (url === '/api/backup/force-save' && req.method === 'POST') {
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ started: true }));
    
    // On lance une sauvegarde immédiate en utilisant l'état actuel en RAM (STATE.renderCount)
    // Mais on doit d'abord s'assurer qu'on a bien des articles en RAM
    if (STATE.renderCount > 0 && STATE.renderOnline) {
      fetchArticles(CFG.renderBase).then(function(articles) {
        saveBackup(articles);
        log('SAVE', 'Sauvegarde locale forcee via le Dashboard (Bouton Manuel)');
      }).catch(function(e) {
        log('ERROR', 'Echec du backup manuel : ' + e.message);
      });
    } else {
      log('WARN', 'Impossible de faire un backup manuel : Render est hors-ligne ou vide.');
    }
    return;
  }

  // Erreurs standard de WebBrowser pour la Fin de Course Fichier
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

// ─── DEMARRAGE ────────────────────────────────────────────────────────────────

/**
 * Super Procedure de Démarrage et Instanciation Système Générale
 */
function startMonitor() {
  // Affiche Encart Startup
  log('START', '========================================');
  log('START', '  Blog-API Sync Monitor   ');
  log('START', '========================================');
  log('START', 'API Render       : ' + CFG.renderBase);
  log('START', 'API locale       : ' + CFG.localBase);
  log('START', 'Sauvegarde       : ' + CFG.backupFile);
  log('START', 'Cycle principal  : ' + (CFG.intervalMs / 1000) + 's'); // Diviser pour lire des Secondes
  log('START', 'Surveillance     : ' + (CFG.watchIntervalMs / 1000) + 's (detection changements)');
  log('START', 'Restauration auto: ' + (CFG.autoRestore ? 'OUI' : 'NON'));
  log('START', 'Dashboard        : http://localhost:' + CFG.dashPort);

  // Instancie via la Mémoire Disk si la session précedente comportait de précieuses infos d'analyses "Statistiques Graphiques MS"
  loadStats();

  // Premier Initial Check Manuel Automatique sur le Lanceur (sans Attendre Forcée la loop 3m !)
  checkCycle(false).catch(function (e) { log('ERROR', e.message); });

  // [LE TIMER LOURD] Configuré à 3 Minutes (setInterval Timer Asynchrone Node natif sans while loop bloquante)
  var timer = setInterval(function () {
    // Reset le compteur avant Cycle Wait (Grosse requetes ping, test)
    STATE.nextCheckIn = CFG.intervalMs / 1000;
    checkCycle(false).catch(function (e) { log('ERROR', e.message); });
  }, CFG.intervalMs);

  // [LE TIMER RAPIDE SSE] Configuré à 15 Secondes 
  // Ce script observe Render en mode léger et passif de détection Modèle HACHAGE Poussee et Met en temps réel les changements !
  setInterval(function () {
    watchRenderChanges().catch(function () { });
  }, CFG.watchIntervalMs);

  // Un timer cosmétique toutes les "1 secondes" à peine. Ne fait que descendre un chiffre Integer de décompte (-1) pour l'indicateur Web.
  setInterval(function () {
    if (STATE.nextCheckIn > 0) STATE.nextCheckIn--;
  }, 1000);

  // Affectation et écoute LocalHost port 3500 via l'Instance CreateServer API Native!
  var server = http.createServer(serveDashboard);
  server.listen(CFG.dashPort, '127.0.0.1', function () {
    log('DASH', 'Dashboard disponible -> http://localhost:' + CFG.dashPort);
    log('DASH', 'SSE actif — le dashboard se met a jour en temps reel.');
  });

  // Gestion des Sorties Système OS : (Si le Dev Tape "Ctrl+C" on intercepte la demande d'arrêt pour clotûrer finement les flux).
  process.on('SIGINT', function () {
    log('STOP', 'Arret demande (Ctrl+C). Nettoyage...');

    // Extrême importance : On sauve in-extrémis le JSON avec les tableaux array statistiques remplies grace au runtime RAM !
    saveStats();

    // Rompt poliment les sockets réseaux des pauvres navigeateurs branchés pour ne pas faire un "Conn Reset Err" vilain Chrome
    sseClients.forEach(function (c) { try { c.res.end(); } catch (_) { } });

    // Purge Thread
    clearInterval(timer);

    // Coupe WebServer
    server.close();

    // Code de sortie OS Unix Win 0 Neutre Valide ! Bye !!
    process.exit(0);
  });
}

// ─── POINT D'ENTREE ───────────────────────────────────────────────────────────

// Vérifie si "data" existe. Si non, le créer !
ensureDataDir();

// Lance la méthode Maîtresse d'instanciation. Et roulez jeunesses !
startMonitor();

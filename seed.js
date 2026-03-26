#!/usr/bin/env node
/**
 * ╔═════════════════════════════════════════════════════════════════════════╗
 * ║  SEED SCRIPT — Peuple l'API Blog avec des articles de démonstration     ║
 * ║  INF222 TAF1 · NYUMEA PEHA DARYL GERVAIS                                ║
 * ║                                                                         ║
 * ║  Usage :                                                                ║
 * ║    node seed.js                  → envoie vers Render (par défaut)      ║
 * ║    node seed.js local            → envoie vers localhost:4000           ║
 * ║    node seed.js https://...      → envoie vers URL personnalisée        ║
 * ╚═════════════════════════════════════════════════════════════════════════╝
 */
 
// Mode d'exécution strict pour éviter les variables globales implicites et certaines erreurs silencieuses
'use strict';

// Importation du module natif 'https' de Node.js pour faire des requêtes sécurisées vers Render
const https = require('https');
// Importation du module natif 'http' de Node.js pour faire des requêtes locales ou non sécurisées
const http  = require('http');

// ─── CIBLE ────────────────────────────────────────────────────────────────────

// Récupère l'argument passé en ligne de commande (le 3ème élément du tableau process.argv)
// Exemple: 'node seed.js local' -> process.argv[2] vaudra 'local'
const arg = process.argv[2] || '';

// Déclaration de la variable de base d'URL (BASE) qui sera utilisée pour les appels API
let BASE;

// Si l'utilisateur tape "node seed.js local", on cible le serveur de développement local
if (arg === 'local') {
  BASE = 'http://localhost:4000';
} 
// Si l'utilisateur passe une URL explicite (ex: https://mon-api.com)
else if (arg.startsWith('http')) {
  BASE = arg;
} 
// Par défaut, si aucun argument n'est fourni, on cible l'API de production sur Render
else {
  BASE = 'https://api-blog-ruhu.onrender.com';
}

// Affiche dans la console la cible choisie pour informer l'utilisateur
console.log(`\n🎯 Cible : ${BASE}\n`);

// ─── ARTICLES DE DÉMONSTRATION ────────────────────────────────────────────────

// Tableau contenant une liste d'objets représentant les articles à insérer dans la base de données
// Les IDs ne sont pas spécifiés car la base de données (SQLite) va les générer automatiquement en Auto-Increment
const ARTICLES = [
  {
    titre    : 'Introduction aux API REST avec Node.js et Express',
    contenu  : `Une API REST (Representational State Transfer) est un style architectural qui permet à des applications de communiquer via HTTP. Dans ce cours INF222, nous explorons comment Node.js et Express simplifient la création d'APIs REST robustes.\n\nLes principes fondamentaux d'une API REST incluent : l'architecture client-serveur, la communication sans état (stateless), la mise en cache, l'interface uniforme et le système en couches. Ces contraintes garantissent une API prévisible, scalable et facile à maintenir.\n\nAvec Express.js, la définition des routes devient intuitive : app.get('/api/articles', ...), app.post('/api/articles', ...). Le framework gère la sérialisation JSON et les middlewares de validation, ce qui nous permet de nous concentrer sur la logique métier.\n\nDans ce TAF1, nous avons implémenté un CRUD complet sur les articles de blog : création (POST 201), lecture (GET 200), modification (PUT 200), suppression (DELETE 200) et recherche full-text. Chaque endpoint respecte les codes HTTP standards et renvoie un format JSON cohérent.`,
    auteur   : 'NYUMEA PEHA DARYL GERVAIS',
    categorie: 'Backend / Architecture',
    tags     : 'node,express,rest,api,http',
    date     : '2026-03-20',
  },
  {
    titre    : 'SQLite avec better-sqlite3 : persistance locale pour Node.js',
    contenu  : `SQLite est une base de données relationnelle stockée dans un seul fichier .db, sans serveur séparé à installer. C'est le choix idéal pour un TP ou un prototype : légèreté, zéro configuration, SQL standard.\n\nLe module better-sqlite3 se distingue des autres bibliothèques SQLite par son API synchrone. Contrairement à node-sqlite3 qui utilise des callbacks asynchrones, better-sqlite3 bloque le thread jusqu'à la fin de la requête — ce qui simplifie considérablement le code.\n\nExemple de requête préparée :\nconst stmt = db.prepare("SELECT * FROM articles WHERE id = ?");\nconst article = stmt.get(42);\n\nLes requêtes préparées sont essentielles pour la sécurité : elles empêchent les injections SQL en séparant le code SQL des données utilisateur. On ne concatène JAMAIS une valeur utilisateur directement dans une chaîne SQL.\n\nLimitation importante en production : SQLite utilise le disque de l'hôte. Sur Render (plan gratuit), le système de fichiers est éphémère — les données sont perdues à chaque redémarrage ou redéploiement. Pour une application en production, on préférera PostgreSQL ou MySQL.`,
    auteur   : 'NYUMEA PEHA DARYL GERVAIS',
    categorie: 'Base de données',
    tags     : 'sqlite,better-sqlite3,sql,node',
    date     : '2026-03-20',
  },
  {
    titre    : 'Architecture MVC dans une API Express : Routes, Controllers, Models',
    contenu  : `L'architecture MVC (Model-View-Controller) est un patron de conception qui sépare les responsabilités d'une application. Dans le contexte d'une API REST, le "View" est remplacé par la réponse JSON.\n\nLa Route reçoit la requête HTTP et la dirige vers le bon contrôleur. Elle ne contient aucune logique métier. Exemple : router.post("/", validateArticle, articleController.creerArticle).\n\nLe Controller gère la logique HTTP : il extrait les paramètres (req.params, req.query, req.body), appelle le modèle, et construit la réponse JSON avec le bon code statut. Il ne fait aucune requête SQL directement.\n\nLe Model contient toutes les requêtes SQL. Il reçoit des paramètres propres et retourne des objets JavaScript. Exemple : articleModel.trouverParId(id) exécute SELECT * FROM articles WHERE id = ? et retourne l'objet ou undefined.\n\nCette séparation rend le code maintenable, testable et évolutif. Si on change de base de données (SQLite → PostgreSQL), on ne modifie que le Model. Si on change le format des réponses, on ne modifie que le Controller.`,
    auteur   : 'NYUMEA PEHA DARYL GERVAIS',
    categorie: 'Architecture',
    tags     : 'mvc,express,architecture,controller,model',
    date     : '2026-03-21',
  },
  {
    titre    : 'Middleware Express : Validation des données et chaîne de requête',
    contenu  : `Un middleware dans Express est une fonction (req, res, next) qui s'exécute entre la réception de la requête et l'envoi de la réponse. Les middlewares peuvent modifier req et res, exécuter du code, et appeler next() pour passer au middleware suivant.\n\nDans notre API Blog, le middleware validateArticle vérifie les données avant chaque POST et PUT. Si la validation échoue, il renvoie immédiatement un HTTP 400 avec la liste des erreurs et n'appelle pas next() — le contrôleur n'est jamais atteint.\n\nRègles de validation implémentées :\n- titre : obligatoire, string, 3-255 caractères\n- contenu : obligatoire, string, minimum 10 caractères\n- auteur : obligatoire, string, minimum 2 caractères\n\nD'autres middlewares globaux sont utilisés : express.json() parse le corps des requêtes en JSON (sans lui, req.body est undefined), cors() autorise les requêtes cross-origin depuis le frontend, et notre logger personnalisé affiche chaque requête dans la console.\n\nL'ordre des middlewares est crucial : express.json() doit être déclaré avant les routes, sinon req.body sera toujours vide.`,
    auteur   : 'NYUMEA PEHA DARYL GERVAIS',
    categorie: 'Backend / Express',
    tags     : 'middleware,validation,express,cors,json',
    date     : '2026-03-21',
  },
  {
    titre    : 'Documentation API avec Swagger UI (OpenAPI 3.0)',
    contenu  : `Swagger (spécification OpenAPI) est un standard pour décrire, documenter et tester les APIs REST. Il génère une interface web interactive où l'on peut voir tous les endpoints, leurs paramètres, et les tester directement depuis le navigateur.\n\nDeux packages npm sont nécessaires : swagger-jsdoc (lit les commentaires @swagger dans le code et génère la spec JSON) et swagger-ui-express (sert l'interface graphique sur /api-docs).\n\nLes annotations Swagger sont des commentaires JSDoc spéciaux. Exemple pour documenter POST /api/articles :\n/**\n * @swagger\n * /api/articles:\n *   post:\n *     summary: Créer un nouvel article\n *     requestBody:\n *       required: true\n *       content:\n *         application/json:\n *           schema:\n *             $ref: '#/components/schemas/Article'\n */\n\nL'interface Swagger UI est accessible sur https://api-blog-ruhu.onrender.com/api-docs. Elle permet de tester tous les endpoints sans installer Postman, ce qui est particulièrement utile pour la démonstration à l'enseignant.\n\nSur Render, la variable RENDER_EXTERNAL_URL est utilisée pour configurer le serveur dans la spec Swagger, afin que le bouton "Try it out" pointe vers la bonne URL en production.`,
    auteur   : 'NYUMEA PEHA DARYL GERVAIS',
    categorie: 'Documentation',
    tags     : 'swagger,openapi,documentation,api',
    date     : '2026-03-21',
  },
  {
    titre    : 'Déploiement sur Render et gestion du disque éphémère',
    contenu  : `Render est une plateforme cloud (PaaS) qui permet de déployer des applications Node.js gratuitement. Le plan gratuit présente plusieurs caractéristiques importantes à connaître.\n\nPremière caractéristique : le disque est éphémère. Cela signifie que tous les fichiers créés à l'exécution (dont blog.db) sont perdus à chaque redéploiement ou redémarrage. C'est la cause principale des réinitialisations de données observées en cours de TP.\n\nDeuxième caractéristique : le service entre en veille après 15 minutes d'inactivité. Le premier accès déclenche un "cold start" qui peut prendre jusqu'à 30 secondes — c'est normal sur le plan gratuit.\n\nTroisième caractéristique : PORT est défini automatiquement par Render. On ne peut pas coder un numéro de port fixe ; il faut utiliser process.env.PORT || 4000.\n\nPour un TP ou une démonstration, SQLite convient parfaitement. Pour une application en production nécessitant une persistance garantie, il faudrait migrer vers PostgreSQL (disponible sur Render, plan gratuit limité à 30 jours) ou utiliser un disque persistant (plan payant).\n\nDans le cadre de ce TAF1, la solution mise en place est un script local de surveillance et restauration automatique qui détecte la perte de données et re-sème la base depuis une sauvegarde locale.`,
    auteur   : 'NYUMEA PEHA DARYL GERVAIS',
    categorie: 'DevOps / Déploiement',
    tags     : 'render,deployment,sqlite,ephemeral,devops',
    date     : '2026-03-22',
  },
  {
    titre    : 'Codes HTTP et gestion des erreurs dans une API REST',
    contenu  : `Les codes de statut HTTP sont des signaux standardisés que le serveur envoie au client pour indiquer le résultat d'une requête. Une API REST bien conçue utilise les bons codes pour chaque situation.\n\n200 OK : requête réussie (GET, PUT, DELETE réussis). 201 Created : ressource créée avec succès (POST réussi). 400 Bad Request : données envoyées invalides ou manquantes — c'est l'erreur client la plus courante. 404 Not Found : la ressource demandée n'existe pas (article avec l'ID spécifié introuvable). 500 Internal Server Error : erreur inattendue côté serveur — on log l'erreur réelle mais on renvoie un message générique au client pour ne pas exposer les détails de l'implémentation.\n\nToutes nos réponses suivent le même format JSON :\n{ "success": true/false, "message": "...", "data": {...}, "errors": [...] }\n\nCette cohérence est essentielle pour le frontend : il peut toujours vérifier res.data.success pour savoir si la requête a réussi, quelle que soit la route appelée.\n\nLa gestion des erreurs utilise des blocs try/catch dans chaque méthode du contrôleur. En cas d'erreur inattendue, on log l'erreur complète côté serveur (avec console.error) mais on renvoie uniquement un message générique au client (HTTP 500).`,
    auteur   : 'NYUMEA PEHA DARYL GERVAIS',
    categorie: 'Backend / HTTP',
    tags     : 'http,status-codes,error-handling,rest',
    date     : '2026-03-22',
  },
  {
    titre    : 'Analyse critique de CleeRoute comme outil d\'apprentissage',
    contenu  : `CleeRoute est une plateforme d'apprentissage adaptatif qui génère des parcours personnalisés selon le niveau et les objectifs de l'apprenant. Dans le cadre du cours INF222, j'ai utilisé cet outil pour structurer mon apprentissage du développement backend.\n\nPoints forts observés : La personnalisation du parcours est remarquable. En définissant mon objectif (API REST Node.js) et mon niveau (intermédiaire), CleeRoute a généré un parcours de 8 modules progressifs, du plus simple au plus complexe. L'assistant de chat est disponible en permanence et répond de manière contextuelle aux questions posées. Les quiz d'évaluation permettent de tester sa compréhension après chaque module.\n\nPoints faibles identifiés : Le niveau de détail technique est parfois insuffisant pour des questions avancées. Par exemple, la configuration précise de swagger-jsdoc nécessite des recherches complémentaires. L'absence d'environnement de code intégré oblige à copier les exemples dans un éditeur externe. L'assistant ne conserve pas le contexte entre les sessions.\n\nAméliorations suggérées : Intégrer un éditeur de code en ligne (type CodeSandbox) pour tester directement les exemples. Proposer des projets guidés avec correction automatique. Améliorer la persistance du contexte de conversation.\n\nNote globale pour un étudiant en génie informatique : 7/10. CleeRoute est un excellent complément aux cours magistraux, mais ne remplace pas la documentation officielle et la pratique concrète.`,
    auteur   : 'NYUMEA PEHA DARYL GERVAIS',
    categorie: 'Analyse / CleeRoute',
    tags     : 'cleeroute,analyse,apprentissage,inf222',
    date     : '2026-03-22',
  },
];

// ─── ENVOI HTTP ───────────────────────────────────────────────────────────────

/**
 * Fonction asynchrone pour envoyer un article via la méthode HTTP POST
 * @param {Object} article - L'objet représentant l'article à sauvegarder
 * @returns {Promise<Object>} Promesse résolue avec le code statut de la réponse HTTP et les données renvoyées
 */
function postArticle(article) {
  // On retourne une promesse native, qui bloque l'exécution en aval jusqu'à la réponse totale du code
  return new Promise((resolve, reject) => {
    // Convertit l'objet Javascript "article" en chaîne JSON (Format natif compréhensible des APIs Node.js)
    const body = JSON.stringify(article);
    
    // Convertit le string de l'url de base en véritable objet Javascript (Ex: {hostname: 'api-blog-ruhu.onrender.com'...})
    const url  = new URL(`${BASE}/api/articles`);
    
    // On configure précisément les options de notre appel externe
    const opts = {
      // nom de domaine extrait de notre URL objet
      hostname: url.hostname,
      // Le port. Soit défini explicitement, soit 443 pour HTTPS, soit 80 pour de l'HTTP (local)
      port    : url.port || (url.protocol === 'https:' ? 443 : 80),
      // Le chemin après le nom de domaine, donc "/api/articles"
      path    : url.pathname,
      // La méthode POST car on veut INSÉRER de la donnée sur le serveur distant
      method  : 'POST',
      // Les en-têtes sont cruciaux
      headers : {
        // Indique que le serveur distant doit parser les données Body ci-dessous avec du JSON (`express.json()` l'interprêtera)  
        'Content-Type'  : 'application/json',
        // Nécessaire en HTTP classique pour indiquer la taille du format encodé, Node Buffer le compte en octets.
        'Content-Length': Buffer.byteLength(body),
      },
    };
    
    // Définit la librairie utilisée selon le protocole (sécurisé ou non) : "https" ou "http"
    const mod = url.protocol === 'https:' ? https : http;
    
    // Construit l'initialisation de la requête et attache un callback en retour pour la réponse (res)
    const req = mod.request(opts, res => {
      // Stocke le texte brut qui va être streamé par blocs
      let raw = '';
      
      // A chaque bloc reçu, on concatène
      res.on('data', d => raw += d);
      
      // Lorsque la réponse s'achève (end)
      res.on('end', () => {
        try { 
          // On tente d'interpréter la réponse Json du serveur distant (Ex: {success:true...} )
          resolve({ status: res.statusCode, data: JSON.parse(raw) }); 
        }
        catch { 
          // En cas d'erreur de parse du Serveur distant, on renvoie une String brute, ainsi il n'y a pas de crash dans le catch
          resolve({ status: res.statusCode, data: raw }); 
        }
      });
    });
    
    // Si la requête HTTP elle-même plante (Ex: Network Timeout, DNS Error), on "Rejette" la promesse
    req.on('error', reject);
    
    // Le code n'est pas encore parti : on va d'abord y insérer le contenu POST (l'article) "body"
    req.write(body);
    
    // Étape finale : signale à l'Agent HTTP interne que la requête est close et doit être EXPÉDIÉE sur le réseau
    req.end();
  });
}

/**
 * Fonction asynchrone utilitaire pour simuler un "sleep" ou une "pause" pendant l'itération de la boucle.
 * @param {Number} ms - Le temps de pause à observer en millisecondes.
 */
function sleep(ms) { 
  // Rétourne une promesse qui se résoudra d'elle même après le "setTimeout" natif de Node
  return new Promise(r => setTimeout(r, ms)); 
}

// ─── MAIN (Point d'entrée Script) ─────────────────────────────────────────────

// Fonction principale immédiate, utilisée pour bénéficier du mot clé "await" qui requiert un enrobé asynchrone en NodeJS
(async () => {
  // Affiche un Header d'introduction dans le Batch Windows/Unix Terminal
  console.log('═══════════════════════════════════════════════');
  console.log(' SEED SCRIPT — Blog-API INF222 TAF1');
  console.log(' Envoi de ' + ARTICLES.length + ' articles de démonstration');
  console.log('═══════════════════════════════════════════════\n');

  // Initialisation des compteurs de succès ("ok") et d'erreurs ("fail")
  let ok = 0, fail = 0;

  // Lance une boucle qui va itérer méthodiquement sur les articles statiques définis plus haut
  for (let i = 0; i < ARTICLES.length; i++) {
    // Récupère l'article au point I
    const a = ARTICLES[i];
    
    // Utile pour la lisibilité de la console avec de multiples tirets.
    // process.stdout.write n'ajoute pas de "\n" au contraire du "console.log" (affiche ceci sur la même ligne)
    process.stdout.write(`[${i+1}/${ARTICLES.length}] "${a.titre.substring(0, 55)}…" `);
    
    try {
      // Exécute la fonction native définie plus haut en attendant volontairement son issue (await)
      const r = await postArticle(a);
      
      // Si la réponse de Render / Local est "201 Created" (Standard REST pour la création)
      if (r.status === 201) {
        // On affiche un Check avec l'Id créé
        console.log(`→ ✅ HTTP 201 (id=${r.data.data?.id})`);
        
        // On augmente le compteur de statuts positifs (Succès)
        ok++;
      } else {
        // En cas d'erreur logique 400 (Bad Format), 500 etc... affiche la cause (jusqu'à 80 caractères)
        console.log(`→ ❌ HTTP ${r.status} — ${JSON.stringify(r.data).substring(0, 80)}`);
        
        // Compte comme Echec
        fail++;
      }
    } catch (e) {
      // Dans le cadre d'un echec Réseau Pur (TimeOut, Network Lost...) (Reject() est intercepté ici)
      console.log(`→ ❌ ERREUR — ${e.message}`);
      // Compte comme un Echec
      fail++;
    }
    
    // Avant de passer à la boucle d'itération suivante de l'article suivant "i+1",
    // on effectue une petite pause native de Node (ms: 500 -> 0.5 secondes)
    // Cela protège de la limitation tarifaire (Rate-Limiting DDoS) sur les Free Tier de Render ou autres PaaS.
    await sleep(500); 
  }

  // Affiche les Statistiques Terminales avec le bilan de la procédure ("Seed")
  console.log('\n═══════════════════════════════════════════════');
  console.log(` Résultat : ${ok} succès, ${fail} échec(s)`);
  
  // S'il y'a au moins eu un succès, on affiche les liens utiles où les observer.
  if (ok > 0) {
    console.log(` ✅ Articles visibles sur : ${BASE}/api/articles`);
    console.log(` 📚 Swagger UI             : ${BASE}/api-docs`);
    console.log(` 🖥  Frontend               : ${BASE}/Frontend/index.html`);
  }
  console.log('═══════════════════════════════════════════════\n');
})();

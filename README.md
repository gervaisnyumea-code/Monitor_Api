# Blog-API Sync Monitor

<img width="2560" height="1600" alt="image" src="https://github.com/user-attachments/assets/a8ba3027-821a-4e41-8aa8-b19ea874ff98" />






Ce sous-projet est un outil de surveillance et de sauvegarde en temps réel pour l'API Blog (INF222). 
Il a été conçu pour pallier le problème du "disque éphémère" sur la version gratuite de Render, qui supprime la base de données SQLite à chaque redémarrage.

## 🚀 Fonctionnalités Principales

- **Sauvegarde Temporisée et Temps Réel** : Copie les articles depuis l'API distante vers un fichier local `data/backup.json`.
- **Détection des Changements** : Interroge Render toutes les 15 secondes pour détecter silencieusement les modifications (POST, PUT, DELETE).
- **Restauration Automatique** : Si le serveur distant redémarre avec 0 articles, le Monitor détecte la perte et renvoie automatiquement le contenu du `backup.json` vers Render (POST automatisé).
- **Dashboard Temps Réel (SSE)** : Une interface web moderne (`localhost:3500`) utilisant les *Server-Sent Events* pour afficher les logs, métriques et graphiques sans clignotement ni rechargement.
- **Métriques & Graphiques** : Surveille les temps de réponse de l'API, les succès/échecs horaires, les proportions des requêtes selon leur source (Locale, Frontend distant) et les requêtes par méthode HTTP.

## 🛠️ Architecture Technologique

Ce projet **ne dépend d'aucun module externe** (pas besoin de `npm install`). 
Il utilise exclusivement les bibliothèques standards de Node.js pour garantir sa légèreté :

- `http` / `https` : Serveur web du Dashboard et requêtes vers Render.
- `fs` : Enregistrement des données (`backup.json`, `stats.json`, `monitor.log`).
- `path` : Gestion des chemins de fichiers.

## 📂 Structure des fichiers

```text
MONITOR_API/
├── monitor.js                # Le cerveau backend (script Node.js principal)
├── RAPPORT_DIAGNOSTIC.md     # Explication du problème du disque éphémère
├── README.md                 # Ce fichier
├── seed.js                   # (Optionnel) Script de test d'injection d'articles
├── public/
│   └── dashboard.html        # L'interface Vue/Frontend du Monitor (CSS + JS + HTML)
└── data/                     # Généré automatiquement
    ├── backup.json           # Sauvegarde locale des articles
    ├── stats.json            # Historique pour les graphiques
    └── monitor.log           # Journal des opérations txt
```

## 💻 Instructions d'Utilisation

1. **Démarrer le script**
   Ouvrez un terminal dans le dossier `sync-monitor` et exécutez :
   
   ```bash
   node monitor.js
   ```

2. **Accéder au Dashboard**
   Le script ouvre un serveur HTTP local gérant le Dashboard en temps réel. Accédez à :
   [http://localhost:4250](http://localhost:4250)

3. **Interactions**
   
   - **Forcer la vérification** : Ping manuel de Render pour vérifier l'état actuel.
   - **Envoyer Backup** : Force le renvoi des articles de `backup.json` vers Render (utile si la synchro auto est capricieuse).
   - Les modifications effectuées via le **Frontend ou Postman** vers Render apparaîtront **instantanément** sur le Dashboard !

## ⚙️ Configuration (dans `monitor.js`)

Vous pouvez ajuster les paramètres suivants dans l'objet `CFG` tout en haut de `monitor.js` :

- `intervalMs` : Délai entre les vérifications complètes (Check) (par défaut : 3 minutes).
- `watchIntervalMs` : Surveillance rapide des changements (par défaut : 15 secondes).
- `dashPort` : Port local du dashboard (par défaut : 4250).
- `autoRestore` : Activer/Désactiver la restauration automatique de données (`true`/`false`).

---

*Projet réalisé dans le cadre du cours INF222 - NYUMEA PEHA DARYL GERVAIS.*

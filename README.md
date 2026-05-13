# 🏗️ Menara Préfa — Application Full Stack
## Guide de démarrage complet (pour débutants)

---

## 📁 Structure du projet

```
menara-prefa-fullstack/
│
├── database/
│   └── setup.sql          ← Script SQL à exécuter en premier
│
├── backend/
│   ├── config/
│   │   └── db.js          ← Connexion à SQL Server
│   ├── middleware/
│   │   └── auth.js        ← Login, logout, blocage
│   ├── routes/
│   │   ├── stock.js       ← CRUD Stock
│   │   ├── production.js  ← CRUD Production + déduction stock
│   │   └── dashboard.js   ← Statistiques
│   ├── server.js          ← Point d'entrée principal
│   ├── package.json       ← Dépendances Node.js
│   └── .env.example       ← Config à copier en .env
│
└── frontend/
    ├── index.html         ← Interface utilisateur
    ├── style.css          ← Design
    ├── api.js             ← Couche fetch (remplace localStorage)
    └── app.js             ← Logique de l'interface
```

---

## ✅ ÉTAPE 1 — Prérequis à installer

Avant de commencer, assurez-vous d'avoir :

| Outil | Version | Lien |
|-------|---------|------|
| Node.js | ≥ 18 | https://nodejs.org |
| SQL Server | Express (gratuit) | https://www.microsoft.com/sql-server |
| SSMS | Dernière version | https://aka.ms/ssms |
| VS Code | Dernière version | https://code.visualstudio.com |

---

## ✅ ÉTAPE 2 — Créer la base de données SQL Server

### 2.1 Ouvrir SQL Server Management Studio (SSMS)
1. Lancez **SSMS**
2. Connectez-vous à votre serveur SQL (généralement `localhost` ou `.\SQLEXPRESS`)
3. Choisissez l'authentification Windows ou SQL Server

### 2.2 Exécuter le script SQL
1. Cliquez sur **"Nouvelle requête"** (bouton en haut)
2. Ouvrez le fichier `database/setup.sql`
3. Copiez tout le contenu dans la fenêtre de requête
4. Cliquez sur **"Exécuter"** (F5) ou le bouton vert ▶️

Vous devriez voir dans les messages :
```
✅ Base de données MenaraPrefa créée.
✅ Table Utilisateurs créée.
✅ Table Stock créée.
✅ Table Production créée avec clé étrangère vers Stock.
✅ Données de démonstration insérées.
🎉 Base de données MenaraPrefa prête !
```

---

## ✅ ÉTAPE 3 — Configurer le Backend

### 3.1 Créer le fichier .env
Dans le dossier `backend/`, dupliquez `.env.example` et renommez-le `.env` :

```
backend/
├── .env.example    ← fichier modèle
└── .env            ← votre fichier (à créer)
```

Contenu du fichier `.env` à adapter :
```env
PORT=3000
DB_SERVER=localhost
DB_PORT=1433
DB_DATABASE=MenaraPrefa
DB_USER=sa
DB_PASSWORD=VotreMotDePasseSQL
SESSION_SECRET=une_cle_secrete_longue
```

> ⚠️ Si vous utilisez l'authentification Windows (pas de mot de passe SQL),
> remplacez `DB_USER=sa` par votre nom Windows et laissez `DB_PASSWORD` vide.

### 3.2 Installer les dépendances Node.js
Ouvrez un terminal dans le dossier `backend/` :

```bash
cd backend
npm install
```

Vous devriez voir : `added 150 packages...`

### 3.3 Ajouter express-session (oublié dans package.json)
```bash
npm install express-session
```

---

## ✅ ÉTAPE 4 — Lancer le Backend

```bash
# Dans le dossier backend/
node server.js
```

Vous devriez voir :
```
╔══════════════════════════════════════════╗
║       MENARA PRÉFA — Backend API         ║
╚══════════════════════════════════════════╝

✅ Connecté à SQL Server — Base : MenaraPrefa
✅ Mot de passe admin initialisé (admin123)
🚀 Serveur démarré sur http://localhost:3000
```

> 💡 Pour relancer automatiquement après chaque modification : `npx nodemon server.js`

### Tester que l'API fonctionne
Ouvrez votre navigateur et allez sur :
```
http://localhost:3000/api/ping
```
Vous devriez voir : `{ "message": "🟢 Serveur Menara Préfa opérationnel !" }`

---

## ✅ ÉTAPE 5 — Lancer le Frontend

### Option A : VS Code Live Server (recommandé)
1. Installez l'extension **"Live Server"** dans VS Code
2. Ouvrez le dossier `frontend/`
3. Clic droit sur `index.html` → **"Open with Live Server"**
4. Le navigateur ouvre : `http://localhost:5500`

### Option B : Serveur HTTP simple
```bash
cd frontend
npx serve .
```

---

## ✅ ÉTAPE 6 — Se connecter

- **URL** : `http://localhost:5500`
- **Identifiant** : `admin`
- **Mot de passe** : `admin123`

---

## 🔗 Routes API disponibles

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/login` | Connexion |
| POST | `/api/auth/logout` | Déconnexion |
| GET | `/api/auth/session` | Vérifier session |
| GET | `/api/stock` | Lister le stock |
| GET | `/api/stock?search=ciment` | Rechercher |
| POST | `/api/stock` | Ajouter matériau |
| PUT | `/api/stock/:id` | Modifier matériau |
| DELETE | `/api/stock/:id` | Supprimer matériau |
| GET | `/api/stock/alertes` | Stock faible |
| GET | `/api/production` | Lister productions |
| POST | `/api/production` | Ajouter production |
| PUT | `/api/production/:id` | Modifier production |
| DELETE | `/api/production/:id` | Supprimer production |
| GET | `/api/dashboard` | Toutes les stats |

---

## 🔒 Sécurité

- **Blocage** : Après 6 tentatives de connexion échouées → compte bloqué 20 minutes
- **Mot de passe** : Hashé avec bcrypt (jamais stocké en clair)
- **Sessions** : Gérées côté serveur (pas dans le navigateur)
- **Auth** : Toutes les routes API nécessitent d'être connecté

---

## ❓ Problèmes fréquents

### "Cannot connect to SQL Server"
- Vérifiez que SQL Server est démarré (Services Windows)
- Vérifiez le nom du serveur dans `.env`
- Activez TCP/IP dans SQL Server Configuration Manager

### "CORS error" dans le navigateur
- Vérifiez que le frontend est sur `http://localhost:5500`
- Vérifiez le `origin` dans `server.js`

### "Session not working"
- Vérifiez que `credentials: 'include'` est dans les appels fetch (api.js)
- Vérifiez que le CORS autorise `credentials: true` (server.js)

---

## 🚀 Résumé des commandes

```bash
# Terminal 1 : Backend
cd backend
npm install
npm install express-session
node server.js

# Terminal 2 : Frontend
cd frontend
# Ouvrir avec Live Server dans VS Code
```

---

*Développé pour Menara Préfa Holding — Système de Gestion Interne*

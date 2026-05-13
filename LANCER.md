# 🚀 Menara Préfa — Comment lancer

## Étape 1 : Base de données
Ouvrez SSMS → Exécutez `database/setup.sql` dans la base MenaraPrefa

## Étape 2 : Fichier .env
Dans le dossier `backend/`, renommez `.env.example` en `.env`
Vérifiez que DB_SERVER correspond à votre serveur (ex: localhost\SQLEXPRESS)

## Étape 3 : Installer les packages
```
cd backend
npm install
```

## Étape 4 : Lancer le serveur
```
node server.js
```

## Étape 5 : Ouvrir l'application
Allez sur : http://localhost:3000

Login : admin / admin123

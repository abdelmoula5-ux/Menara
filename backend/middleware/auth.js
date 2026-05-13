// ============================================================
//  middleware/auth.js — Authentification & blocage
// ============================================================
const bcrypt   = require('bcryptjs');
const { query } = require('../config/db');

const MAX_TENTATIVES  = 6;
const DUREE_BLOCAGE   = 20 * 60 * 1000; // 20 minutes en ms

// ── Middleware : vérifier que la session est active ─────────
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();  // ✅ Connecté → passer à la route
    }
    return res.status(401).json({ error: 'Non authentifié. Veuillez vous connecter.' });
}

// ── Login : vérifier identifiants + gérer le blocage ────────
async function login(req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
    }

    try {
        console.log(`🔐 Tentative de login pour: ${username}`);
        // 1. Chercher l'utilisateur en base
        const result = await query(
            'SELECT * FROM Utilisateurs WHERE username = @username',
            { username }
        );
        console.log(`👤 Utilisateur trouvé: ${result.recordset.length > 0}`);

        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
        }

        const user = result.recordset[0];

        // 2. Vérifier si compte bloqué
        const now = Date.now();
        if (user.bloque_jusqu && user.bloque_jusqu > now) {
            const minutesRestantes = Math.ceil((user.bloque_jusqu - now) / 60000);
            return res.status(423).json({
                error: `Compte bloqué. Réessayez dans ${minutesRestantes} minute(s).`,
                bloque: true,
                minutesRestantes
            });
        }

        // 3. Vérifier le mot de passe avec bcrypt
        const mdpCorect = await bcrypt.compare(password, user.password);

        if (!mdpCorect) {
            // Incrémenter les tentatives
            const newTentatives = (user.tentatives || 0) + 1;
            let bloqueJusqu = null;

            if (newTentatives >= MAX_TENTATIVES) {
                bloqueJusqu = Date.now() + DUREE_BLOCAGE;
                await query(
                    'UPDATE Utilisateurs SET tentatives = @t, bloque_jusqu = @b WHERE id = @id',
                    { t: 0, b: bloqueJusqu, id: user.id }
                );
                return res.status(423).json({
                    error: `6 tentatives échouées. Compte bloqué 20 minutes.`,
                    bloque: true,
                    minutesRestantes: 20
                });
            }

            await query(
                'UPDATE Utilisateurs SET tentatives = @t WHERE id = @id',
                { t: newTentatives, id: user.id }
            );

            return res.status(401).json({
                error: `Mot de passe incorrect. (${newTentatives}/${MAX_TENTATIVES})`,
                tentatives: newTentatives
            });
        }

        // 4. ✅ Connexion réussie → reset tentatives, créer session
        await query(
            'UPDATE Utilisateurs SET tentatives = 0, bloque_jusqu = NULL WHERE id = @id',
            { id: user.id }
        );

        req.session.userId   = user.id;
        req.session.username = user.username;
        req.session.role     = user.role;

        return res.json({
            success: true,
            message: 'Connexion réussie.',
            user: { id: user.id, username: user.username, role: user.role }
        });

    } catch (err) {
        console.error('Erreur login:', err);
        return res.status(500).json({ error: 'Erreur serveur lors du login.' });
    }
}

// ── Logout ───────────────────────────────────────────────────
function logout(req, res) {
    req.session.destroy(() => {
        res.json({ success: true, message: 'Déconnexion réussie.' });
    });
}

// ── Vérifier statut session (pour le frontend) ───────────────
function checkSession(req, res) {
    if (req.session && req.session.userId) {
        return res.json({
            loggedIn: true,
            user: { id: req.session.userId, username: req.session.username, role: req.session.role }
        });
    }
    return res.json({ loggedIn: false });
}

// ── Initialiser le mot de passe admin au 1er démarrage ──────
async function initAdminPassword() {
    try {
        const usersToInit = [
            { username: 'admin',        password: 'admin123' },
            { username: 'responsable',  password: 'resp123' },
            { username: 'chef_equipe',  password: 'chef123' },
            { username: 'lecteur',      password: 'lecteur123' }
        ];

        for (const u of usersToInit) {
            const result = await query("SELECT * FROM Utilisateurs WHERE username = @u", { u: u.username });
            if (result.recordset.length > 0) {
                const currentPwd = result.recordset[0].password;
                // Si c'est le placeholder ou le hash d'exemple du setup.sql
                if (currentPwd === 'PLACEHOLDER' || currentPwd === '$2b$10$YourHashedPasswordHere') {
                    const hash = await bcrypt.hash(u.password, 10);
                    await query(
                        "UPDATE Utilisateurs SET password = @p WHERE username = @u",
                        { p: hash, u: u.username }
                    );
                    console.log(`✅ Mot de passe réinitialisé pour ${u.username} (${u.password})`);
                }
            }
        }
    } catch (err) {
        console.error('Erreur init users:', err.message);
    }
}

module.exports = { requireAuth, login, logout, checkSession, initAdminPassword };

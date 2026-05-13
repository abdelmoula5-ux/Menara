// ============================================================
//  middleware/roleCheck.js — Vérifier les rôles de l'utilisateur
// ============================================================

// Fonction pour créer des vérificateurs de rôle
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        // Vérifier si l'utilisateur est connecté
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ error: 'Non authentifié' });
        }

        // Vérifier si le rôle est autorisé
        if (!allowedRoles.includes(req.session.role)) {
            return res.status(403).json({
                error: `Accès refusé. Rôle requis : ${allowedRoles.join(', ')}`
            });
        }

        next(); // ✅ Continuer si tout est bon
    };
}

module.exports = { requireRole };
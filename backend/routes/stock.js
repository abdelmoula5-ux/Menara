// ============================================================
//  routes/stock.js — CRUD Stock avec SÉCURITÉ + RÔLES
// ============================================================
const express        = require('express');
const router         = express.Router();
const { body, validationResult } = require('express-validator');  // ✅ VALIDATION
const { query }      = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');  // ✅ RÔLES

// Toutes les routes stock nécessitent d'être connecté
router.use(requireAuth);

// ────────────────────────────────────────────────────────────
// GET /api/stock — Récupérer tout le stock (avec recherche)
// ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { search } = req.query;
        let sql = `
            SELECT
                s.id,
                s.materiel,
                s.quantite,
                s.date_ajout,
                s.date_ajout,
                CASE
                    WHEN s.quantite < 10 THEN 'CRITIQUE'
                    WHEN s.quantite < 50 THEN 'FAIBLE'
                    ELSE 'OK'
                END AS etat,
                CASE WHEN s.quantite < 10 THEN 1 ELSE 0 END AS alerte
            FROM Stock s
        `;

        const params = {};
        if (search) {
            sql += ` WHERE s.materiel LIKE @search`;
            params.search = `%${search}%`;
        }

        sql += ` ORDER BY s.date_ajout DESC`;

        const result = await query(sql, params);
        res.json({ success: true, data: result.recordset });

    } catch (err) {
        console.error('GET /stock:', err);
        res.status(500).json({ error: 'Erreur lors de la récupération du stock.' });
    }
});

// ────────────────────────────────────────────────────────────
// GET /api/stock/alertes — Matériaux en stock faible
// ────────────────────────────────────────────────────────────
router.get('/alertes', async (req, res) => {
    try {
        const result = await query(`
            SELECT id, materiel, quantite,
                CASE WHEN quantite < 10 THEN 'CRITIQUE' ELSE 'FAIBLE' END AS etat
            FROM Stock
            WHERE quantite < 10
            ORDER BY quantite ASC
        `);
        res.json({ success: true, data: result.recordset, count: result.recordset.length });
    } catch (err) {
        res.status(500).json({ error: 'Erreur alertes stock.' });
    }
});

// ────────────────────────────────────────────────────────────
// GET /api/stock/:id — Récupérer un matériau par son ID
// ────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query('SELECT * FROM Stock WHERE id = @id', { id: parseInt(id) });

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Matériau non trouvé.' });
        }
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ error: 'Erreur récupération matériau.' });
    }
});

// ────────────────────────────────────────────────────────────
// POST /api/stock — Ajouter un matériau
// ✅ VALIDATION + RÔLES (admin et chef_equipe seulement)
// ────────────────────────────────────────────────────────────
router.post('/', 
    requireRole('admin', 'chef_equipe'),  // ✅ Vérifier le rôle
    [
        // ✅ Validation des champs
        body('materiel').trim().notEmpty().withMessage('Le nom du matériau est requis.'),
        body('quantite').isInt({ min: 0 }).withMessage('La quantité doit être un nombre positif.'),
    ],
    async (req, res) => {
        try {
            // ✅ Vérifier les erreurs de validation
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { materiel, quantite, date_ajout } = req.body;
            const dateAjout = date_ajout || new Date().toISOString().split('T')[0];

            const result = await query(`
                INSERT INTO Stock (materiel, quantite, date_ajout)
                OUTPUT INSERTED.*
                VALUES (@materiel, @quantite, @date_ajout)
            `, {
                materiel: materiel.trim(),
                quantite: parseInt(quantite),
                date_ajout: dateAjout
            });

            const newItem = result.recordset[0];
            res.status(201).json({
                success: true,
                message: `✅ Matériau "${materiel}" ajouté au stock.`,
                data: newItem
            });

        } catch (err) {
            console.error('POST /stock:', err);
            res.status(500).json({ error: 'Erreur ajout matériau.' });
        }
    }
);

// ────────────────────────────────────────────────────────────
// PUT /api/stock/:id — Modifier un matériau
// ✅ VALIDATION + RÔLES (admin et chef_equipe seulement)
// ────────────────────────────────────────────────────────────
router.put('/:id',
    requireRole('admin', 'chef_equipe'),  // ✅ Vérifier le rôle
    [
        body('materiel').trim().notEmpty().withMessage('Le nom du matériau est requis.'),
        body('quantite').isInt({ min: 0 }).withMessage('La quantité doit être un nombre positif.'),
    ],
    async (req, res) => {
        try {
            // ✅ Vérifier les erreurs de validation
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const { materiel, quantite, date_ajout } = req.body;

            // Vérifier que le matériau existe
            const existing = await query('SELECT id FROM Stock WHERE id = @id', { id: parseInt(id) });
            if (existing.recordset.length === 0) {
                return res.status(404).json({ error: 'Matériau non trouvé.' });
            }

            const result = await query(`
                UPDATE Stock
                SET materiel   = @materiel,
                    quantite   = @quantite,
                    date_ajout = @date_ajout
                OUTPUT INSERTED.*
                WHERE id = @id
            `, {
                materiel:   materiel.trim(),
                quantite:   parseInt(quantite),
                date_ajout: date_ajout || new Date().toISOString().split('T')[0],
                id:         parseInt(id)
            });

            res.json({
                success: true,
                message: `✅ Matériau modifié.`,
                data: result.recordset[0]
            });

        } catch (err) {
            console.error('PUT /stock:', err);
            res.status(500).json({ error: 'Erreur modification matériau.' });
        }
    }
);

// ────────────────────────────────────────────────────────────
// DELETE /api/stock/:id — Supprimer un matériau
// ✅ RÔLES (admin seulement)
// ────────────────────────────────────────────────────────────
router.delete('/:id',
    requireRole('admin'),  // ✅ Seulement admin peut supprimer
    async (req, res) => {
        try {
            const { id } = req.params;

            // Vérifier s'il est utilisé dans des productions
            const used = await query(
                'SELECT COUNT(*) AS cnt FROM Production WHERE stock_id = @id',
                { id: parseInt(id) }
            );
            const useCount = used.recordset[0].cnt;

            // Récupérer le nom pour le message
            const mat = await query('SELECT materiel FROM Stock WHERE id = @id', { id: parseInt(id) });
            if (mat.recordset.length === 0) {
                return res.status(404).json({ error: 'Matériau non trouvé.' });
            }

            const nomMateriau = mat.recordset[0].materiel;

            // Supprimer
            await query('DELETE FROM Stock WHERE id = @id', { id: parseInt(id) });

            res.json({
                success: true,
                message: `🗑️ "${nomMateriau}" supprimé.${useCount > 0 ? ` (${useCount} production(s) dissociée(s))` : ''}`
            });

        } catch (err) {
            console.error('DELETE /stock:', err);
            res.status(500).json({ error: 'Erreur suppression matériau.' });
        }
    }
);

module.exports = router;

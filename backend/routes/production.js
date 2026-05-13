// ============================================================
//  routes/production.js — CRUD Production + déduction stock
// ============================================================
const express        = require('express');
const router         = express.Router();
const { query }      = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');

router.use(requireAuth);

// ────────────────────────────────────────────────────────────
// GET /api/production — Récupérer toutes les productions
// ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT
                p.id,
                p.produit,
                p.quantite,
                p.responsable,
                p.date_prod,
                p.cout,
                p.statut,
                p.stock_id,
                p.qte_consommee,
                p.date_prod,   -- Use date_prod instead of created_at
                s.materiel AS materiel_nom   -- nom du matériau lié
            FROM Production p
            LEFT JOIN Stock s ON p.stock_id = s.id
            ORDER BY p.date_prod DESC
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('GET /production:', err);
        res.status(500).json({ error: 'Erreur récupération productions.' });
    }
});

// ────────────────────────────────────────────────────────────
// GET /api/production/alertes — Productions critiques
// ────────────────────────────────────────────────────────────
router.get('/alertes', async (req, res) => {
    try {
        const result = await query(`
            SELECT id, produit, responsable, statut, date_prod
            FROM Production
            WHERE statut IN ('Critique', 'En retard')
            ORDER BY date_prod DESC
        `);
        res.json({ success: true, data: result.recordset, count: result.recordset.length });
    } catch (err) {
        res.status(500).json({ error: 'Erreur alertes production.' });
    }
});

// ────────────────────────────────────────────────────────────
// GET /api/production/stats — Statistiques de production
// ────────────────────────────────────────────────────────────
router.get('/stats', requireRole('admin', 'chef_equipe'), async (req, res) => {
    try {
        // Statistiques générales
        const totalProd = await query('SELECT COUNT(*) as total FROM Production');
        const prodParStatut = await query(`
            SELECT statut, COUNT(*) as count 
            FROM Production 
            GROUP BY statut
        `);
        const prodParMois = await query(`
            SELECT 
                YEAR(date_prod) as annee,
                MONTH(date_prod) as mois,
                COUNT(*) as total
            FROM Production
            GROUP BY YEAR(date_prod), MONTH(date_prod)
            ORDER BY annee DESC, mois DESC
        `);
        
        res.json({ 
            success: true, 
            data: {
                total: totalProd.recordset[0].total,
                par_statut: prodParStatut.recordset,
                par_mois: prodParMois.recordset
            }
        });
    } catch (err) {
        console.error('GET /production/stats:', err);
        res.status(500).json({ error: 'Erreur récupération statistiques.' });
    }
});

// ────────────────────────────────────────────────────────────
// GET /api/production/:id — Récupérer une production
// ────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const result = await query(`
            SELECT p.*, s.materiel AS materiel_nom
            FROM Production p
            LEFT JOIN Stock s ON p.stock_id = s.id
            WHERE p.id = @id
        `, { id: parseInt(req.params.id) });

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Production non trouvée.' });
        }
        res.json({ success: true, data: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ error: 'Erreur récupération production.' });
    }
});

// ────────────────────────────────────────────────────────────
// POST /api/production — Ajouter une production
//   → Déduction automatique du stock si stock_id fourni
//   → Rôles autorisés : admin, responsable, chef_equipe
// ────────────────────────────────────────────────────────────
router.post('/', requireRole('admin', 'responsable', 'chef_equipe'), async (req, res) => {
    try {
        const {
            produit, quantite, responsable, date_prod,
            cout, statut, stock_id, qte_consommee
        } = req.body;

        // Vérification spéciale : responsable ne peut créer que ses propres productions
        if (req.session.role === 'responsable') {
            if (responsable !== req.session.username) {
                return res.status(403).json({
                    error: 'Tu peux seulement créer tes propres productions'
                });
            }
        }

        // ── Validation ────────────────────────────────────────
        if (!produit || produit.trim() === '')
            return res.status(400).json({ error: 'Le nom du produit est requis.' });
        if (!quantite || parseInt(quantite) < 1)
            return res.status(400).json({ error: 'La quantité doit être ≥ 1.' });
        if (!responsable || responsable.trim() === '')
            return res.status(400).json({ error: 'Le responsable est requis.' });

        const statuts_valides = ['En cours', 'Terminé', 'En attente', 'Critique', 'En retard'];
        if (statut && !statuts_valides.includes(statut))
            return res.status(400).json({ error: 'Statut invalide.' });

        // ── Vérifier et déduire le stock ─────────────────────
        let stockIdFinal  = null;
        let qteConso      = 0;
        let nomMateriau   = null;

        if (stock_id && parseInt(stock_id) > 0) {
            stockIdFinal = parseInt(stock_id);
            qteConso     = parseInt(qte_consommee) || 0;

            if (qteConso > 0) {
                // Récupérer le stock actuel
                const stockResult = await query(
                    'SELECT materiel, quantite FROM Stock WHERE id = @id',
                    { id: stockIdFinal }
                );

                if (stockResult.recordset.length === 0) {
                    return res.status(404).json({ error: 'Matériau en stock non trouvé.' });
                }

                const stockActuel = stockResult.recordset[0];
                nomMateriau = stockActuel.materiel;

                if (stockActuel.quantite < qteConso) {
                    return res.status(400).json({
                        error: `Stock insuffisant pour "${stockActuel.materiel}". Disponible : ${stockActuel.quantite} unités, demandé : ${qteConso} unités.`
                    });
                }

                // ✅ Déduire du stock
                await query(
                    'UPDATE Stock SET quantite = quantite - @qte WHERE id = @id',
                    { qte: qteConso, id: stockIdFinal }
                );

                console.log(`📦 Stock "${nomMateriau}" réduit de ${qteConso} unités.`);
            }
        }

        // ── Insérer la production ─────────────────────────────
        const result = await query(`
            INSERT INTO Production (produit, quantite, responsable, date_prod, cout, statut, stock_id, qte_consommee)
            OUTPUT INSERTED.*
            VALUES (@produit, @quantite, @responsable, @date_prod, @cout, @statut, @stock_id, @qte_consommee)
        `, {
            produit:       produit.trim(),
            quantite:      parseInt(quantite),
            responsable:   responsable.trim(),
            date_prod:     date_prod || new Date().toISOString().split('T')[0],
            cout:          parseFloat(cout) || 0,
            statut:        statut || 'En cours',
            stock_id:      stockIdFinal,
            qte_consommee: qteConso
        });

        const newProd = result.recordset[0];
        let message   = `✅ Production "${produit}" enregistrée.`;
        if (nomMateriau && qteConso > 0) {
            message += ` ${qteConso} unités de "${nomMateriau}" déduites du stock.`;
        }

        res.status(201).json({ success: true, message, data: newProd });

    } catch (err) {
        console.error('POST /production:', err);
        res.status(500).json({ error: 'Erreur enregistrement production.' });
    }
});

// ────────────────────────────────────────────────────────────
// PUT /api/production/:id — Modifier une production
//   Note : on ne re-déduit pas le stock à chaque modification
//          pour éviter les double-déductions
// ────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { produit, quantite, responsable, date_prod, cout, statut, stock_id, qte_consommee } = req.body;

        const existing = await query('SELECT id FROM Production WHERE id = @id', { id: parseInt(id) });
        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Production non trouvée.' });
        }

        if (!produit || produit.trim() === '')
            return res.status(400).json({ error: 'Le nom du produit est requis.' });

        const result = await query(`
            UPDATE Production
            SET produit       = @produit,
                quantite      = @quantite,
                responsable   = @responsable,
                date_prod     = @date_prod,
                cout          = @cout,
                statut        = @statut,
                stock_id      = @stock_id,
                qte_consommee = @qte_consommee
            OUTPUT INSERTED.*
            WHERE id = @id
        `, {
            produit:       produit.trim(),
            quantite:      parseInt(quantite) || 1,
            responsable:   responsable?.trim() || '',
            date_prod:     date_prod || new Date().toISOString().split('T')[0],
            cout:          parseFloat(cout) || 0,
            statut:        statut || 'En cours',
            stock_id:      stock_id ? parseInt(stock_id) : null,
            qte_consommee: parseInt(qte_consommee) || 0,
            id:            parseInt(id)
        });

        res.json({
            success: true,
            message: '✅ Production modifiée.',
            data: result.recordset[0]
        });

    } catch (err) {
        console.error('PUT /production:', err);
        res.status(500).json({ error: 'Erreur modification production.' });
    }
});

// ────────────────────────────────────────────────────────────
// DELETE /api/production/:id — Supprimer une production
// ────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const prod = await query('SELECT produit FROM Production WHERE id = @id', { id: parseInt(id) });
        if (prod.recordset.length === 0) {
            return res.status(404).json({ error: 'Production non trouvée.' });
        }

        await query('DELETE FROM Production WHERE id = @id', { id: parseInt(id) });

        res.json({
            success: true,
            message: `🗑️ Production "${prod.recordset[0].produit}" supprimée.`
        });
    } catch (err) {
        console.error('DELETE /production:', err);
        res.status(500).json({ error: 'Erreur suppression production.' });
    }
});

module.exports = router;

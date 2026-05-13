// ============================================================
//  routes/dashboard.js — Statistiques pour le Dashboard
// ============================================================
const express         = require('express');
const router          = express.Router();
const { query }       = require('../config/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ────────────────────────────────────────────────────────────
// GET /api/dashboard — Toutes les stats en un seul appel
// ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        // 1. KPIs globaux
        const kpis = await query(`
            SELECT
                (SELECT COUNT(*) FROM Stock)                         AS total_materiaux,
                (SELECT ISNULL(SUM(quantite), 0) FROM Stock)         AS total_unites,
                (SELECT COUNT(*) FROM Production)                    AS total_productions,
                (SELECT ISNULL(SUM(cout), 0) FROM Production)        AS cout_total,
                (SELECT COUNT(*) FROM Stock WHERE quantite < 10)     AS alertes_stock,
                (SELECT COUNT(*) FROM Production
                 WHERE statut IN ('Critique', 'En retard'))          AS alertes_prod
        `);

        // 2. Stock par matériau (pour le graphique barres)
        const stockData = await query(`
            SELECT TOP 10 materiel, quantite,
                CASE WHEN quantite < 10 THEN 'rouge' WHEN quantite < 50 THEN 'orange' ELSE 'bleu' END AS couleur
            FROM Stock
            ORDER BY quantite DESC
        `);

        // 3. Productions par statut (pour le graphique donut)
        const prodParStatut = await query(`
            SELECT statut, COUNT(*) AS nombre
            FROM Production
            GROUP BY statut
        `);

        // 4. Productions récentes (5 dernières)
        const recent = await query(`
            SELECT TOP 5
                p.produit, p.quantite, p.responsable,
                p.date_prod, p.cout, p.statut,
                s.materiel AS materiel_nom
            FROM Production p
            LEFT JOIN Stock s ON p.stock_id = s.id
            ORDER BY p.date_prod DESC
        `);

        // 5. Alertes stock faible
        const alertesStock = await query(`
            SELECT id, materiel, quantite
            FROM Stock WHERE quantite < 10
            ORDER BY quantite ASC
        `);

        // 6. Alertes production critique
        const alertesProd = await query(`
            SELECT id, produit, statut, responsable
            FROM Production
            WHERE statut IN ('Critique', 'En retard')
            ORDER BY date_prod DESC
        `);

        res.json({
            success: true,
            data: {
                kpis:         kpis.recordset[0],
                stockChart:   stockData.recordset,
                prodChart:    prodParStatut.recordset,
                recent:       recent.recordset,
                alertesStock: alertesStock.recordset,
                alertesProd:  alertesProd.recordset,
            }
        });

    } catch (err) {
        console.error('GET /dashboard:', err);
        res.status(500).json({ error: 'Erreur chargement dashboard.' });
    }
});

module.exports = router;

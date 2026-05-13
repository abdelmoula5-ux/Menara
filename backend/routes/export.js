// ============================================================
//  routes/export.js — Export PDF professionnel avec PDFKit
//  Génère de vrais PDF avec tableaux de données imprimables
// ============================================================
const express        = require('express');
const router         = express.Router();
const PDFDocument    = require('pdfkit');
const { requireAuth } = require('../middleware/auth');
const { query }      = require('../config/db');

router.use(requireAuth);

// ── Couleurs & Config ─────────────────────────────────────────
const COLORS = {
    primary:    '#1e4080',
    secondary:  '#2563eb',
    accent:     '#3b82f6',
    success:    '#059669',
    warning:    '#d97706',
    danger:     '#dc2626',
    white:      '#ffffff',
    lightGray:  '#f3f4f6',
    mediumGray: '#9ca3af',
    darkGray:   '#374151',
    black:      '#111827',
    tableHead:  '#1e3a5f',
    rowEven:    '#f0f4ff',
    rowOdd:     '#ffffff',
};

// ── Helper : formater date ─────────────────────────────────────
function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR');
}

// ── Helper : formater monnaie ──────────────────────────────────
function formatMAD(n) {
    if (n === null || n === undefined) return '—';
    return `${parseFloat(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

// ── Helper : couleur statut ────────────────────────────────────
function statutColor(statut) {
    const map = {
        'Terminé':    COLORS.success,
        'En cours':   COLORS.secondary,
        'En attente': COLORS.warning,
        'Critique':   COLORS.danger,
        'En retard':  '#9d174d',
    };
    return map[statut] || COLORS.darkGray;
}

// ── Helper : couleur état stock ────────────────────────────────
function etatStockColor(quantite) {
    if (quantite < 10)  return COLORS.danger;
    if (quantite < 50)  return COLORS.warning;
    return COLORS.success;
}

// ── Helper : dessiner entête du document ──────────────────────
function drawHeader(doc, title, subtitle) {
    const pageW = doc.page.width;

    // Bande bleue en haut
    doc.rect(0, 0, pageW, 90).fill(COLORS.primary);

    // Logo / Marque
    doc.fillColor(COLORS.white)
       .font('Helvetica-Bold')
       .fontSize(22)
       .text('MP', 45, 22);

    doc.rect(44, 20, 38, 38)
       .stroke(COLORS.white);

    doc.fillColor(COLORS.white)
       .font('Helvetica-Bold')
       .fontSize(14)
       .text('Menara Préfa', 95, 22);

    doc.fillColor('rgba(255,255,255,0.65)')
       .font('Helvetica')
       .fontSize(9)
       .text('Système de Gestion Interne', 95, 40);

    // Titre du rapport (droite)
    doc.fillColor(COLORS.white)
       .font('Helvetica-Bold')
       .fontSize(16)
       .text(title, 0, 20, { align: 'right', width: pageW - 45 });

    doc.fillColor('rgba(255,255,255,0.75)')
       .font('Helvetica')
       .fontSize(9)
       .text(subtitle, 0, 42, { align: 'right', width: pageW - 45 });

    // Date de génération
    const now = new Date().toLocaleString('fr-FR');
    doc.fillColor('rgba(255,255,255,0.6)')
       .font('Helvetica')
       .fontSize(8)
       .text(`Généré le : ${now}`, 0, 62, { align: 'right', width: pageW - 45 });

    // Ligne de séparation sous l'entête
    doc.moveTo(0, 90).lineTo(pageW, 90).strokeColor(COLORS.accent).lineWidth(2).stroke();

    doc.y = 110;
    doc.x = 45;
}

// ── Helper : dessiner pied de page ────────────────────────────
function drawFooter(doc) {
    const pageW  = doc.page.width;
    const pageH  = doc.page.height;
    const pageNum = doc.bufferedPageRange ? doc.bufferedPageRange().count : 1;

    doc.rect(0, pageH - 35, pageW, 35).fill(COLORS.lightGray);
    doc.moveTo(0, pageH - 35).lineTo(pageW, pageH - 35).strokeColor(COLORS.mediumGray).lineWidth(0.5).stroke();

    doc.fillColor(COLORS.mediumGray)
       .font('Helvetica')
       .fontSize(8)
       .text('© Menara Préfa — Document confidentiel', 45, pageH - 22)
       .text(`Page ${pageNum}`, 0, pageH - 22, { align: 'right', width: pageW - 45 });
}

// ── Helper : KPI Card (petite boîte statistique) ──────────────
function drawKpiCard(doc, x, y, w, h, label, value, color) {
    doc.rect(x, y, w, h).fill(COLORS.white).stroke(color);
    doc.rect(x, y, 5, h).fill(color);
    doc.fillColor(color)
       .font('Helvetica-Bold')
       .fontSize(20)
       .text(value, x + 14, y + 10, { width: w - 18 });
    doc.fillColor(COLORS.darkGray)
       .font('Helvetica')
       .fontSize(8)
       .text(label, x + 14, y + 36, { width: w - 18 });
}

// ── Helper : dessiner un tableau ──────────────────────────────
function drawTable(doc, headers, rows, startX, colWidths, options = {}) {
    const rowH      = options.rowH     || 22;
    const headerH   = options.headerH  || 26;
    const fontSize  = options.fontSize || 9;
    const pageH     = doc.page.height;
    const marginBot = 60;

    let y = doc.y + 8;
    const tableW = colWidths.reduce((a, b) => a + b, 0);

    // ── En-tête du tableau ──
    doc.rect(startX, y, tableW, headerH).fill(COLORS.tableHead);

    let x = startX;
    headers.forEach((h, i) => {
        doc.fillColor(COLORS.white)
           .font('Helvetica-Bold')
           .fontSize(fontSize)
           .text(h, x + 5, y + 8, { width: colWidths[i] - 8, align: options.headerAlign?.[i] || 'left' });
        x += colWidths[i];
    });
    y += headerH;

    // ── Lignes du tableau ──
    rows.forEach((row, rowIdx) => {
        // Nouvelle page si nécessaire
        if (y + rowH > pageH - marginBot) {
            drawFooter(doc);
            doc.addPage();
            drawHeader(doc, options.title || 'Rapport', options.subtitle || '');
            y = doc.y + 8;

            // Re-dessiner l'entête du tableau
            doc.rect(startX, y, tableW, headerH).fill(COLORS.tableHead);
            let xh = startX;
            headers.forEach((h, i) => {
                doc.fillColor(COLORS.white)
                   .font('Helvetica-Bold')
                   .fontSize(fontSize)
                   .text(h, xh + 5, y + 8, { width: colWidths[i] - 8, align: options.headerAlign?.[i] || 'left' });
                xh += colWidths[i];
            });
            y += headerH;
        }

        // Fond de ligne (alternance)
        const bgColor = rowIdx % 2 === 0 ? COLORS.rowOdd : COLORS.rowEven;
        doc.rect(startX, y, tableW, rowH).fill(bgColor);

        // Bordure basse légère
        doc.moveTo(startX, y + rowH).lineTo(startX + tableW, y + rowH)
           .strokeColor('#e5e7eb').lineWidth(0.4).stroke();

        // Cellules
        let cx = startX;
        row.forEach((cell, colIdx) => {
            const cellOpts = options.cellOptions?.[colIdx] || {};
            const align    = cellOpts.align || 'left';
            const color    = cell?.color   || COLORS.black;
            const bold     = cell?.bold    || false;

            const text = typeof cell === 'object' ? (cell?.text ?? '—') : (cell ?? '—');

            if (cell?.badge) {
                const badgeW = colWidths[colIdx] - 16;
                const bx     = cx + 8;
                const by     = y + 5;
                doc.rect(bx, by, badgeW, 12).fill(cell.badge + '22');
                doc.fillColor(cell.badge).font('Helvetica-Bold').fontSize(7)
                   .text(text, bx, by + 2, { width: badgeW, align: 'center' });
            } else {
                doc.fillColor(color)
                   .font(bold ? 'Helvetica-Bold' : 'Helvetica')
                   .fontSize(fontSize)
                   .text(String(text), cx + 5, y + 6, {
                       width:   colWidths[colIdx] - 10,
                       align,
                       ellipsis: true,
                   });
            }

            cx += colWidths[colIdx];
        });

        y += rowH;
    });

    doc.y = y + 10;
    return y;
}

// ── Section titre ─────────────────────────────────────────────
// CORRECTION BUG : utiliser titleY fixe pour éviter décalage après fill()
function drawSectionTitle(doc, title, icon = '▪') {
    const pageW = doc.page.width;
    doc.y += 6;

    const titleY = doc.y;
    doc.rect(45, titleY, pageW - 90, 24).fill(COLORS.secondary);
    doc.fillColor(COLORS.white)
       .font('Helvetica-Bold')
       .fontSize(11)
       .text(`${icon}  ${title}`, 55, titleY + 6, { width: pageW - 100 });

    doc.y = titleY + 24 + 10;
}

// ════════════════════════════════════════════════════════════
//  ROUTE : Export PDF Stock
//  GET /api/export/stock.pdf
// ════════════════════════════════════════════════════════════
router.get('/stock.pdf', async (req, res) => {
    try {
        const stockResult = await query(`
            SELECT id, materiel, quantite, date_ajout,
                CASE
                    WHEN quantite < 10 THEN 'CRITIQUE'
                    WHEN quantite < 50 THEN 'FAIBLE'
                    ELSE 'OK'
                END AS etat
            FROM Stock
            ORDER BY quantite ASC
        `);
        const stocks = stockResult.recordset;

        const total       = stocks.length;
        const critiques   = stocks.filter(s => s.quantite < 10).length;
        const faibles     = stocks.filter(s => s.quantite >= 10 && s.quantite < 50).length;
        const totalUnites = stocks.reduce((s, r) => s + (r.quantite || 0), 0);

        const doc = new PDFDocument({ size: 'A4', margin: 45, bufferPages: true });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=menara_stock_${new Date().toISOString().split('T')[0]}.pdf`);
        doc.pipe(res);

        drawHeader(doc, 'Rapport de Stock', `État des matériaux — ${formatDate(new Date())}`);

        const kpiY      = doc.y + 4;
        const kpiW      = 110;
        const kpiH      = 54;
        const kpiGap    = 12;
        const startKpiX = 45;

        drawKpiCard(doc, startKpiX,                      kpiY, kpiW, kpiH, 'Total matériaux',  String(total),       COLORS.secondary);
        drawKpiCard(doc, startKpiX + kpiW + kpiGap,      kpiY, kpiW, kpiH, 'Total unités',     String(totalUnites), COLORS.primary);
        drawKpiCard(doc, startKpiX + (kpiW + kpiGap)*2,  kpiY, kpiW, kpiH, 'Stock CRITIQUE',   String(critiques),   COLORS.danger);
        drawKpiCard(doc, startKpiX + (kpiW + kpiGap)*3,  kpiY, kpiW, kpiH, 'Stock FAIBLE',     String(faibles),     COLORS.warning);

        doc.y = kpiY + kpiH + 16;

        drawSectionTitle(doc, 'Inventaire complet des matériaux', '📦');

        const headers   = ['#', 'Matériau', 'Quantité', 'Date Ajout', 'État'];
        const colWidths = [35, 210, 80, 100, 80];

        const rows = stocks.map(s => [
            { text: s.id, color: COLORS.mediumGray },
            { text: s.materiel, bold: true, color: COLORS.black },
            { text: String(s.quantite), color: etatStockColor(s.quantite), bold: true },
            { text: formatDate(s.date_ajout), color: COLORS.darkGray },
            { text: s.etat, badge: etatStockColor(s.quantite) },
        ]);

        drawTable(doc, headers, rows, 45, colWidths, {
            title: 'Rapport de Stock',
            subtitle: `État des matériaux — ${formatDate(new Date())}`,
            headerAlign: ['center', 'left', 'center', 'center', 'center'],
            cellOptions: [{ align: 'center' }, {}, { align: 'center' }, { align: 'center' }, { align: 'center' }],
        });

        // Note légale
        doc.y += 10;
        const noteY = doc.y;
        doc.rect(45, noteY, doc.page.width - 90, 28).fill('#fef3c7');
        doc.fillColor('#92400e')
           .font('Helvetica')
           .fontSize(8)
           .text('⚠  Les matériaux en état CRITIQUE (< 10 unités) nécessitent un réapprovisionnement urgent. '
               + 'Les matériaux FAIBLES (< 50 unités) sont à surveiller.', 52, noteY + 8, {
               width: doc.page.width - 104,
           });

        drawFooter(doc);
        doc.end();

    } catch (err) {
        console.error('Erreur export stock PDF:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erreur génération PDF stock: ' + err.message });
        }
    }
});

// ════════════════════════════════════════════════════════════
//  ROUTE : Export PDF Production
//  GET /api/export/production.pdf
// ════════════════════════════════════════════════════════════
router.get('/production.pdf', async (req, res) => {
    try {
        const prodResult = await query(`
            SELECT p.id, p.produit, p.quantite, p.responsable,
                   p.date_prod, p.cout, p.statut, p.qte_consommee,
                   s.materiel AS materiau
            FROM Production p
            LEFT JOIN Stock s ON p.stock_id = s.id
            ORDER BY p.date_prod DESC
        `);
        const prods = prodResult.recordset;

        const total     = prods.length;
        const termines  = prods.filter(p => p.statut === 'Terminé').length;
        const critiques = prods.filter(p => p.statut === 'Critique' || p.statut === 'En retard').length;
        const coutTotal = prods.reduce((s, p) => s + (parseFloat(p.cout) || 0), 0);
        const qteTotale = prods.reduce((s, p) => s + (parseInt(p.quantite) || 0), 0);

        const doc = new PDFDocument({ size: 'A4', margin: 45, bufferPages: true, layout: 'landscape' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=menara_production_${new Date().toISOString().split('T')[0]}.pdf`);
        doc.pipe(res);

        drawHeader(doc, 'Rapport de Production', `Suivi des productions — ${formatDate(new Date())}`);

        const kpiY   = doc.y + 4;
        const kpiW   = 140;
        const kpiH   = 54;
        const kpiGap = 14;
        const startX = 45;

        drawKpiCard(doc, startX,                     kpiY, kpiW, kpiH, 'Total productions',         String(total),        COLORS.secondary);
        drawKpiCard(doc, startX + kpiW + kpiGap,     kpiY, kpiW, kpiH, 'Productions terminées',     String(termines),     COLORS.success);
        drawKpiCard(doc, startX + (kpiW+kpiGap)*2,   kpiY, kpiW, kpiH, 'Alertes (Critique/Retard)', String(critiques),    COLORS.danger);
        drawKpiCard(doc, startX + (kpiW+kpiGap)*3,   kpiY, kpiW, kpiH, 'Quantité totale produite',  String(qteTotale),    COLORS.primary);
        drawKpiCard(doc, startX + (kpiW+kpiGap)*4,   kpiY, kpiW, kpiH, 'Coût total cumulé',         formatMAD(coutTotal), COLORS.tableHead);

        doc.y = kpiY + kpiH + 16;

        drawSectionTitle(doc, 'Journal de Production complet', '🏭');

        const headers   = ['#', 'Produit', 'Qté', 'Matériau', 'Responsable', 'Date', 'Coût (MAD)', 'Statut'];
        const colWidths = [30, 165, 45, 130, 100, 75, 100, 90];

        const rows = prods.map(p => [
            { text: p.id, color: COLORS.mediumGray, align: 'center' },
            { text: p.produit, bold: true, color: COLORS.black },
            { text: String(p.quantite), color: COLORS.secondary, bold: true },
            { text: p.materiau || '—', color: COLORS.darkGray },
            { text: p.responsable, color: COLORS.darkGray },
            { text: formatDate(p.date_prod), color: COLORS.darkGray },
            { text: formatMAD(p.cout), color: COLORS.primary, bold: true },
            { text: p.statut, badge: statutColor(p.statut) },
        ]);

        drawTable(doc, headers, rows, 45, colWidths, {
            title: 'Rapport de Production',
            subtitle: `Suivi des productions — ${formatDate(new Date())}`,
            headerAlign: ['center','left','center','left','left','center','right','center'],
            cellOptions: [{align:'center'},{},{align:'center'},{},{},{align:'center'},{align:'right'},{align:'center'}],
        });

        // Total coût en bas
        doc.y += 6;
        const sumY = doc.y;
        doc.rect(45, sumY, doc.page.width - 90, 24).fill(COLORS.tableHead);
        doc.fillColor(COLORS.white)
           .font('Helvetica-Bold')
           .fontSize(10)
           .text(`TOTAL COÛT DE PRODUCTION : ${formatMAD(coutTotal)}`, 55, sumY + 7, {
               width: doc.page.width - 100,
               align: 'right',
           });

        drawFooter(doc);
        doc.end();

    } catch (err) {
        console.error('Erreur export production PDF:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erreur génération PDF production: ' + err.message });
        }
    }
});

// ════════════════════════════════════════════════════════════
//  ROUTE : Export PDF Dashboard (résumé global)
//  GET /api/export/dashboard.pdf
// ════════════════════════════════════════════════════════════
router.get('/dashboard.pdf', async (req, res) => {
    try {
        const kpisResult = await query(`
            SELECT
                (SELECT COUNT(*) FROM Stock)                          AS total_materiaux,
                (SELECT ISNULL(SUM(quantite), 0) FROM Stock)          AS total_unites,
                (SELECT COUNT(*) FROM Production)                     AS total_productions,
                (SELECT ISNULL(SUM(cout), 0) FROM Production)         AS cout_total,
                (SELECT COUNT(*) FROM Stock WHERE quantite < 10)      AS alertes_stock,
                (SELECT COUNT(*) FROM Production WHERE statut IN ('Critique','En retard')) AS alertes_prod
        `);
        const kpis = kpisResult.recordset[0];

        const stockResult = await query(`
            SELECT TOP 10 materiel, quantite,
                CASE WHEN quantite < 10 THEN 'CRITIQUE' WHEN quantite < 50 THEN 'FAIBLE' ELSE 'OK' END AS etat
            FROM Stock ORDER BY quantite ASC
        `);

        const prodResult = await query(`
            SELECT TOP 10 p.produit, p.quantite, p.responsable, p.date_prod, p.cout, p.statut
            FROM Production p ORDER BY p.created_at DESC
        `);

        const statutResult = await query(`
            SELECT statut, COUNT(*) AS nombre FROM Production GROUP BY statut
        `);

        const doc = new PDFDocument({ size: 'A4', margin: 45, bufferPages: true });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=menara_dashboard_${new Date().toISOString().split('T')[0]}.pdf`);
        doc.pipe(res);

        drawHeader(doc, 'Tableau de Bord', `Résumé global — ${formatDate(new Date())}`);

        const kpiY   = doc.y + 4;
        const kpiW   = 155;
        const kpiH   = 52;
        const kpiGap = 10;
        const sx     = 45;

        drawKpiCard(doc, sx,                     kpiY,            kpiW, kpiH, 'Matériaux en stock',    String(kpis.total_materiaux),   COLORS.secondary);
        drawKpiCard(doc, sx + kpiW + kpiGap,     kpiY,            kpiW, kpiH, 'Total unités',          String(kpis.total_unites),      COLORS.primary);
        drawKpiCard(doc, sx + (kpiW+kpiGap)*2,   kpiY,            kpiW, kpiH, 'Productions totales',   String(kpis.total_productions), COLORS.success);

        drawKpiCard(doc, sx,                     kpiY + kpiH + 8, kpiW, kpiH, 'Coût total production', formatMAD(kpis.cout_total),     COLORS.tableHead);
        drawKpiCard(doc, sx + kpiW + kpiGap,     kpiY + kpiH + 8, kpiW, kpiH, 'Alertes Stock',         String(kpis.alertes_stock),     COLORS.danger);
        drawKpiCard(doc, sx + (kpiW+kpiGap)*2,   kpiY + kpiH + 8, kpiW, kpiH, 'Alertes Production',    String(kpis.alertes_prod),      COLORS.warning);

        doc.y = kpiY + kpiH * 2 + 24;

        drawSectionTitle(doc, 'Répartition des Productions par Statut', '📊');

        const statuts = statutResult.recordset;
        if (statuts.length > 0) {
            const rowStatuts = statuts.map(s => [
                { text: s.statut, badge: statutColor(s.statut) },
                { text: String(s.nombre), bold: true, color: COLORS.primary },
                {
                    text: kpis.total_productions > 0
                        ? `${Math.round(s.nombre / kpis.total_productions * 100)} %`
                        : '0 %',
                    color: COLORS.darkGray,
                },
            ]);
            drawTable(doc, ['Statut', 'Nombre', 'Pourcentage'], rowStatuts, 45, [200, 100, 100], {
                title: 'Tableau de Bord',
                subtitle: `Résumé global — ${formatDate(new Date())}`,
                headerAlign: ['left','center','center'],
                cellOptions: [{},{align:'center'},{align:'center'}],
            });
        }

        drawSectionTitle(doc, 'État du Stock (10 matériaux les plus faibles)', '📦');

        const rowsStock = stockResult.recordset.map(s => [
            { text: s.materiel, bold: true },
            { text: String(s.quantite), color: etatStockColor(s.quantite), bold: true },
            { text: s.etat, badge: etatStockColor(s.quantite) },
        ]);
        drawTable(doc, ['Matériau', 'Quantité', 'État'], rowsStock, 45, [280, 100, 120], {
            title: 'Tableau de Bord',
            subtitle: `Résumé global — ${formatDate(new Date())}`,
            headerAlign: ['left','center','center'],
            cellOptions: [{},{align:'center'},{align:'center'}],
        });

        drawSectionTitle(doc, '10 Dernières Productions', '🏭');

        const rowsProd = prodResult.recordset.map(p => [
            { text: p.produit, bold: true },
            { text: String(p.quantite), color: COLORS.secondary, bold: true },
            { text: p.responsable },
            { text: formatDate(p.date_prod), color: COLORS.darkGray },
            { text: formatMAD(p.cout), color: COLORS.primary, bold: true },
            { text: p.statut, badge: statutColor(p.statut) },
        ]);
        drawTable(doc, ['Produit','Quantité','Responsable','Date','Coût','Statut'],
            rowsProd, 45, [165, 55, 105, 75, 90, 75], {
            title: 'Tableau de Bord',
            subtitle: `Résumé global — ${formatDate(new Date())}`,
            headerAlign: ['left','center','left','center','right','center'],
            cellOptions: [{},{align:'center'},{},{align:'center'},{align:'right'},{align:'center'}],
        });

        drawFooter(doc);
        doc.end();

    } catch (err) {
        console.error('Erreur export dashboard PDF:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erreur génération PDF dashboard: ' + err.message });
        }
    }
});

// ════════════════════════════════════════════════════════════
//  ROUTE : Export CSV Stock
//  CORRECTION : séparateur ";" pour Excel français
// ════════════════════════════════════════════════════════════
router.get('/stock.csv', async (req, res) => {
    try {
        const result = await query('SELECT id, materiel, quantite, date_ajout FROM Stock ORDER BY id');

        const BOM = '\uFEFF'; // UTF-8 BOM pour Excel
        let csv = BOM + 'ID;Matériau;Quantité;Date ajout;État\n';
        result.recordset.forEach(row => {
            const etat = row.quantite < 10 ? 'CRITIQUE' : row.quantite < 50 ? 'FAIBLE' : 'OK';
            csv += `${row.id};"${row.materiel}";${row.quantite};${formatDate(row.date_ajout)};${etat}\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=stock_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: 'Erreur export CSV stock: ' + err.message });
    }
});

// ════════════════════════════════════════════════════════════
//  ROUTE : Export CSV Production
//  CORRECTION : séparateur ";" pour Excel français
// ════════════════════════════════════════════════════════════
router.get('/production.csv', async (req, res) => {
    try {
        const result = await query(`
            SELECT p.id, p.produit, p.quantite, p.responsable, p.date_prod, p.cout, p.statut, s.materiel
            FROM Production p
            LEFT JOIN Stock s ON p.stock_id = s.id
            ORDER BY p.date_prod DESC
        `);

        const BOM = '\uFEFF';
        let csv = BOM + 'ID;Produit;Quantité;Responsable;Date;Coût (MAD);Statut;Matériau\n';
        result.recordset.forEach(row => {
            csv += `${row.id};"${row.produit}";${row.quantite};"${row.responsable}";${formatDate(row.date_prod)};${row.cout};"${row.statut}";"${row.materiel || ''}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=production_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: 'Erreur export CSV production: ' + err.message });
    }
});

// ── Route liste des exports disponibles ──────────────────────
router.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API Export opérationnelle',
        exports: [
            { url: '/api/export/dashboard.pdf',   description: 'Tableau de bord complet (PDF)' },
            { url: '/api/export/stock.pdf',        description: 'Rapport de stock (PDF)' },
            { url: '/api/export/production.pdf',   description: 'Rapport de production (PDF)' },
            { url: '/api/export/stock.csv',        description: 'Stock au format CSV (Excel)' },
            { url: '/api/export/production.csv',   description: 'Production au format CSV (Excel)' },
        ]
    });
});

module.exports = router;
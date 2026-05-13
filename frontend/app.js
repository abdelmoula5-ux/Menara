// ============================================================
//  frontend/app.js — Logique principale de l'interface
//  Menara Préfa — Dashboard, Stock, Production, Recherche
// ============================================================

// ── État global ───────────────────────────────────────────────
let currentUser = null;
let stockData   = [];
let prodData    = [];
let stockChart  = null;
let prodChart   = null;

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    updateDate();
    await checkAuth();
});

function updateDate() {
    const el = document.getElementById('navDate');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleDateString('fr-FR', {
        weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
    });
}

// ── AUTH ──────────────────────────────────────────────────────
async function checkAuth() {
    try {
        const res = await Auth.checkSession();
        if (res.loggedIn) {
            currentUser = res.user;
            showApp();
        } else {
            showLogin();
        }
    } catch (err) {
        showLogin();
    }
}

function showLogin() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
}

function showApp() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';

    // Afficher infos utilisateur
    const avatar  = document.getElementById('userAvatar');
    const nameEl  = document.getElementById('userName');
    const roleEl  = document.getElementById('userRole');
    if (avatar)  avatar.textContent  = (currentUser.username || 'U')[0].toUpperCase();
    if (nameEl)  nameEl.textContent  = currentUser.username || 'Utilisateur';
    if (roleEl)  roleEl.textContent  = roleLabel(currentUser.role);

    // Stocker en sessionStorage pour updateUserDisplay()
    sessionStorage.setItem('userRole',  currentUser.role);
    sessionStorage.setItem('username',  currentUser.username);

    applyRoleUI();
    showPage('dashboard', document.querySelector('.nav-item.active'));
}

function roleLabel(role) {
    const map = { admin: 'Administrateur', responsable: 'Responsable Production', chef_equipe: "Chef d'équipe", lecteur: 'Lecteur' };
    return map[role] || 'Menara Préfa';
}

async function handleLogin() {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const alertEl  = document.getElementById('loginAlert');
    const btn      = document.querySelector('.btn-login');

    if (!username || !password) {
        showLoginError('Identifiant et mot de passe requis.');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Connexion...';
    alertEl.style.display = 'none';

    try {
        const res = await Auth.login(username, password);
        if (res.success) {
            currentUser = res.user;
            showApp();
        }
    } catch (err) {
        showLoginError(err.message || 'Identifiant ou mot de passe incorrect.');
        btn.disabled = false;
        btn.textContent = 'Se connecter';
    }
}

function showLoginError(msg) {
    const el = document.getElementById('loginAlert');
    el.textContent = msg;
    el.style.display = 'block';
}

// Enter key on login
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('loginPage').style.display !== 'none') {
        handleLogin();
    }
});

async function logout() {
    try { await Auth.logout(); } catch (_) {}
    currentUser = null;
    stockData   = [];
    prodData    = [];
    showLogin();
}

// ── RÔLES UI ──────────────────────────────────────────────────
function applyRoleUI() {
    const role = currentUser?.role;

    // Stats nav (admin + chef_equipe)
    const navStats = document.getElementById('nav-stats');
    if (navStats) navStats.style.display = (role === 'admin' || role === 'chef_equipe') ? 'flex' : 'none';

    // Bouton ajouter stock (admin + chef_equipe)
    const btnStock = document.getElementById('btn-ajouter-stock');
    if (btnStock) btnStock.style.display = (role === 'admin' || role === 'chef_equipe') ? '' : 'none';

    // Bouton ajouter production (admin + responsable + chef_equipe)
    const btnProd = document.getElementById('btn-ajouter-production');
    if (btnProd) btnProd.style.display = (role !== 'lecteur') ? '' : 'none';

    // Boutons export dropdown (tous les rôles)
    ['exportDropdownDashboard','exportDropdownStock','exportDropdownProduction'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    });
}

// ── NAVIGATION ────────────────────────────────────────────────
function showPage(name, linkEl) {
    // Désactiver tous les liens
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (linkEl) linkEl.classList.add('active');

    // Masquer toutes les pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    const page = document.getElementById('page-' + name);
    if (page) page.classList.add('active');

    // Mettre à jour le titre
    const titles = { dashboard: 'Dashboard', stock: 'Gestion du Stock', production: 'Gestion de la Production', search: 'Recherche Globale', stats: 'Statistiques' };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[name] || name;

    // Charger les données selon la page
    if (name === 'dashboard') loadDashboard();
    if (name === 'stock')     loadStock();
    if (name === 'production') loadProduction();
    if (name === 'stats')     loadStatsPage();

    // Fermer sidebar mobile
    document.getElementById('sidebar').classList.remove('open');
    return false;
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ── DASHBOARD ─────────────────────────────────────────────────
async function loadDashboard() {
    try {
        const res = await DashboardAPI.getStats();
        if (!res.success) return;
        const d = res.data;

        // KPIs
        setText('kpi-materials',  d.kpis.total_materiaux);
        setText('kpi-productions', d.kpis.total_productions);
        setText('kpi-alerts',     (d.kpis.alertes_stock || 0) + (d.kpis.alertes_prod || 0));
        setText('kpi-cost',       formatCurrency(d.kpis.cout_total));

        // Bell dot
        const totalAlerts = (d.kpis.alertes_stock || 0) + (d.kpis.alertes_prod || 0);
        const bellDot = document.getElementById('bellDot');
        if (bellDot) bellDot.style.display = totalAlerts > 0 ? 'block' : 'none';

        // Badges nav
        const badgeStock = document.getElementById('badge-stock');
        if (badgeStock) {
            badgeStock.textContent = d.kpis.alertes_stock > 0 ? d.kpis.alertes_stock : '';
            badgeStock.style.display = d.kpis.alertes_stock > 0 ? '' : 'none';
        }
        const badgeProd = document.getElementById('badge-prod');
        if (badgeProd) {
            badgeProd.textContent = d.kpis.alertes_prod > 0 ? d.kpis.alertes_prod : '';
            badgeProd.style.display = d.kpis.alertes_prod > 0 ? '' : 'none';
        }

        // Charts
        renderStockChart(d.stockChart || []);
        renderProdChart(d.prodChart || []);

        // Recent productions
        renderRecentProd(d.recent || []);

    } catch (err) {
        console.error('Dashboard error:', err);
        showToast('Erreur chargement dashboard', 'error');
    }
}

function refreshDashboard() {
    loadDashboard();
    showToast('Dashboard actualisé ✓', 'success');
}

function renderStockChart(data) {
    const ctx = document.getElementById('stockChart');
    if (!ctx) return;
    if (stockChart) stockChart.destroy();

    const colors = data.map(d => {
        if (d.couleur === 'rouge')  return '#ef4444';
        if (d.couleur === 'orange') return '#f59e0b';
        return '#3b82f6';
    });

    stockChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.materiel),
            datasets: [{ label: 'Quantité', data: data.map(d => d.quantite), backgroundColor: colors, borderRadius: 6 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderProdChart(data) {
    const ctx = document.getElementById('prodChart');
    if (!ctx) return;
    if (prodChart) prodChart.destroy();

    const colors = { 'Terminé': '#10b981', 'En cours': '#3b82f6', 'En attente': '#f59e0b', 'Critique': '#ef4444', 'En retard': '#ec4899' };

    prodChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.statut),
            datasets: [{ data: data.map(d => d.nombre), backgroundColor: data.map(d => colors[d.statut] || '#9ca3af'), borderWidth: 0 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 16 } } },
            cutout: '65%'
        }
    });
}

function renderRecentProd(data) {
    const tbody = document.getElementById('recentProdBody');
    if (!tbody) return;
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Aucune production récente</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(p => `
        <tr>
            <td>${p.produit}</td>
            <td>${p.quantite}</td>
            <td>${p.responsable}</td>
            <td>${formatDate(p.date_prod)}</td>
            <td>${formatCurrency(p.cout)}</td>
            <td><span class="status-badge ${statusClass(p.statut)}">${p.statut}</span></td>
        </tr>
    `).join('');
}

// ── STOCK ─────────────────────────────────────────────────────
async function loadStock() {
    try {
        const res = await StockAPI.getAll();
        if (!res.success) return;
        stockData = res.data;
        renderStockTable(stockData);
        updateStockCount(stockData.length);

        // Alerte stock faible
        const faible = stockData.filter(s => s.quantite < 10);
        const alertEl = document.getElementById('lowStockAlert');
        if (alertEl) alertEl.style.display = faible.length > 0 ? '' : 'none';
    } catch (err) {
        console.error('Stock error:', err);
        showToast('Erreur chargement stock', 'error');
    }
}

function renderStockTable(data) {
    const tbody = document.getElementById('stockTableBody');
    if (!tbody) return;
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Aucun matériau dans le stock</td></tr>';
        return;
    }

    const canEdit   = currentUser?.role === 'admin' || currentUser?.role === 'chef_equipe';
    const canDelete = currentUser?.role === 'admin';

    tbody.innerHTML = data.map(s => {
        const pct   = Math.min(100, Math.round(s.quantite / 200 * 100));
        const level = s.quantite < 10 ? 'low' : s.quantite < 50 ? 'medium' : 'high';
        const fillClass = { low: 'level-low', medium: 'level-medium', high: 'level-high' }[level];
        const labelText = { low: 'CRITIQUE', medium: 'FAIBLE', high: 'OK' }[level];

        const editBtn   = canEdit   ? `<button class="btn-icon" onclick="openStockModal(${s.id})" title="Modifier">✏️</button>` : '';
        const deleteBtn = canDelete ? `<button class="btn-icon danger" onclick="deleteStock(${s.id}, '${escapeHtml(s.materiel)}')" title="Supprimer">🗑️</button>` : '';

        return `
            <tr>
                <td>${s.id}</td>
                <td><strong>${escapeHtml(s.materiel)}</strong></td>
                <td>${s.quantite}</td>
                <td>
                    <div class="level-bar-wrap">
                        <div class="level-bar"><div class="level-fill ${fillClass}" style="width:${pct}%"></div></div>
                        <div class="level-label ${level}">${labelText}</div>
                    </div>
                </td>
                <td>${formatDate(s.date_ajout)}</td>
                <td>${editBtn}${deleteBtn}</td>
            </tr>
        `;
    }).join('');
}

function updateStockCount(n) {
    const el = document.getElementById('stockCount');
    if (el) el.textContent = `${n} matériaux`;
}

function filterStock() {
    const q = document.getElementById('stockSearch')?.value.toLowerCase() || '';
    const filtered = stockData.filter(s => s.materiel.toLowerCase().includes(q));
    renderStockTable(filtered);
    updateStockCount(filtered.length);
}

// ── STOCK MODAL ───────────────────────────────────────────────
async function openStockModal(id = null) {
    document.getElementById('stockEditId').value = id || '';
    document.getElementById('stockModalTitle').textContent = id ? 'Modifier le matériau' : 'Ajouter un matériau';
    document.getElementById('stockDate').value = new Date().toISOString().split('T')[0];

    if (id) {
        const item = stockData.find(s => s.id === id);
        if (item) {
            document.getElementById('stockName').value = item.materiel;
            document.getElementById('stockQty').value  = item.quantite;
            document.getElementById('stockDate').value = item.date_ajout?.split('T')[0] || '';
        }
    } else {
        document.getElementById('stockName').value = '';
        document.getElementById('stockQty').value  = '';
    }

    document.getElementById('stockModal').classList.add('open');
}

async function saveStock() {
    const id       = document.getElementById('stockEditId').value;
    const materiel = document.getElementById('stockName').value.trim();
    const quantite = document.getElementById('stockQty').value;
    const date     = document.getElementById('stockDate').value;

    if (!materiel || quantite === '') { showToast('Nom et quantité requis', 'warn'); return; }

    const payload = { materiel, quantite: parseInt(quantite), date_ajout: date };

    try {
        if (id) {
            await StockAPI.update(id, payload);
            showToast('✅ Matériau modifié', 'success');
        } else {
            await StockAPI.add(payload);
            showToast('✅ Matériau ajouté', 'success');
        }
        closeModal('stockModal');
        loadStock();
    } catch (err) {
        showToast(err.message || 'Erreur sauvegarde', 'error');
    }
}

async function deleteStock(id, name) {
    if (!confirm(`Supprimer "${name}" du stock ?`)) return;
    try {
        await StockAPI.delete(id);
        showToast(`🗑️ "${name}" supprimé`, 'success');
        loadStock();
    } catch (err) {
        showToast(err.message || 'Erreur suppression', 'error');
    }
}

// ── PRODUCTION ────────────────────────────────────────────────
async function loadProduction() {
    try {
        const res = await ProductionAPI.getAll();
        if (!res.success) return;
        prodData = res.data;
        renderProdTable(prodData);

        const el = document.getElementById('prodCount');
        if (el) el.textContent = `${prodData.length} productions`;

        // Alerte critique
        const critiques = prodData.filter(p => p.statut === 'Critique' || p.statut === 'En retard');
        const alertEl = document.getElementById('criticalAlert');
        if (alertEl) alertEl.style.display = critiques.length > 0 ? '' : 'none';
    } catch (err) {
        console.error('Production error:', err);
        showToast('Erreur chargement production', 'error');
    }
}

function renderProdTable(data) {
    const tbody = document.getElementById('prodTableBody');
    if (!tbody) return;
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Aucune production enregistrée</td></tr>';
        return;
    }

    const canEdit   = currentUser?.role !== 'lecteur';
    const canDelete = currentUser?.role === 'admin' || currentUser?.role === 'chef_equipe';

    tbody.innerHTML = data.map(p => {
        const editBtn   = canEdit   ? `<button class="btn-icon" onclick="openProdModal(${p.id})" title="Modifier">✏️</button>` : '';
        const deleteBtn = canDelete ? `<button class="btn-icon danger" onclick="deleteProd(${p.id}, '${escapeHtml(p.produit)}')" title="Supprimer">🗑️</button>` : '';

        return `
            <tr>
                <td>${p.id}</td>
                <td><strong>${escapeHtml(p.produit)}</strong></td>
                <td>${p.quantite}</td>
                <td>${p.materiel_nom ? escapeHtml(p.materiel_nom) : '—'}</td>
                <td>${escapeHtml(p.responsable)}</td>
                <td>${formatDate(p.date_prod)}</td>
                <td>${formatCurrency(p.cout)}</td>
                <td><span class="status-badge ${statusClass(p.statut)}">${p.statut}</span></td>
                <td>${editBtn}${deleteBtn}</td>
            </tr>
        `;
    }).join('');
}

// ── PRODUCTION MODAL ──────────────────────────────────────────
async function openProdModal(id = null) {
    document.getElementById('prodEditId').value = id || '';
    document.getElementById('prodModalTitle').textContent = id ? 'Modifier la production' : 'Nouvelle production';
    document.getElementById('prodDate').value = new Date().toISOString().split('T')[0];

    // Charger la liste des matériaux
    await populateMaterialSelect(id ? prodData.find(p => p.id === id)?.stock_id : null);

    if (id) {
        const prod = prodData.find(p => p.id === id);
        if (prod) {
            document.getElementById('prodName').value      = prod.produit;
            document.getElementById('prodQty').value       = prod.quantite;
            document.getElementById('prodResp').value      = prod.responsable;
            document.getElementById('prodDate').value      = prod.date_prod?.split('T')[0] || '';
            document.getElementById('prodCost').value      = prod.cout;
            document.getElementById('prodStatus').value    = prod.statut;
            document.getElementById('prodMatQty').value    = prod.qte_consommee || 0;
            if (prod.stock_id) {
                document.getElementById('prodMaterial').value = prod.stock_id;
            }
        }
    } else {
        document.getElementById('prodName').value   = '';
        document.getElementById('prodQty').value    = '';
        document.getElementById('prodResp').value   = currentUser?.username || '';
        document.getElementById('prodCost').value   = '';
        document.getElementById('prodMatQty').value = '';
        document.getElementById('prodStatus').value = 'En cours';
    }

    document.getElementById('prodModal').classList.add('open');
}

async function populateMaterialSelect(selectedId = null) {
    const sel = document.getElementById('prodMaterial');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Sélectionner --</option>';
    try {
        const res = await StockAPI.getAll();
        if (res.success) {
            res.data.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.materiel} (${s.quantite} disponibles)`;
                if (selectedId && s.id === selectedId) opt.selected = true;
                sel.appendChild(opt);
            });
        }
    } catch (_) {}
}

async function saveProduction() {
    const id         = document.getElementById('prodEditId').value;
    const produit    = document.getElementById('prodName').value.trim();
    const quantite   = document.getElementById('prodQty').value;
    const responsable = document.getElementById('prodResp').value.trim();
    const date_prod  = document.getElementById('prodDate').value;
    const cout       = document.getElementById('prodCost').value;
    const statut     = document.getElementById('prodStatus').value;
    const stock_id   = document.getElementById('prodMaterial').value;
    const qte_consommee = document.getElementById('prodMatQty').value;

    if (!produit || !quantite || !responsable) {
        showToast('Produit, quantité et responsable requis', 'warn');
        return;
    }

    const payload = { produit, quantite: parseInt(quantite), responsable, date_prod, cout: parseFloat(cout) || 0, statut, stock_id: stock_id ? parseInt(stock_id) : null, qte_consommee: parseInt(qte_consommee) || 0 };

    try {
        if (id) {
            await ProductionAPI.update(id, payload);
            showToast('✅ Production modifiée', 'success');
        } else {
            await ProductionAPI.add(payload);
            showToast('✅ Production enregistrée', 'success');
        }
        closeModal('prodModal');
        loadProduction();
    } catch (err) {
        showToast(err.message || 'Erreur sauvegarde', 'error');
    }
}

async function deleteProd(id, name) {
    if (!confirm(`Supprimer la production "${name}" ?`)) return;
    try {
        await ProductionAPI.delete(id);
        showToast(`🗑️ Production supprimée`, 'success');
        loadProduction();
    } catch (err) {
        showToast(err.message || 'Erreur suppression', 'error');
    }
}

// ── STATS ─────────────────────────────────────────────────────
async function loadStatsPage() {
    const container = document.getElementById('statsContent');
    if (!container) return;
    container.innerHTML = '<div class="loading-placeholder">Chargement...</div>';

    try {
        const [dashRes, stockRes, prodRes] = await Promise.all([
            DashboardAPI.getStats(),
            StockAPI.getAll(),
            ProductionAPI.getAll()
        ]);

        const d = dashRes.data;
        const stocks = stockRes.data || [];
        const prods  = prodRes.data || [];

        // Calculs
        const totalCout = prods.reduce((s, p) => s + (parseFloat(p.cout) || 0), 0);
        const avgCout   = prods.length ? totalCout / prods.length : 0;
        const topProd   = [...prods].sort((a, b) => b.quantite - a.quantite).slice(0, 5);

        container.innerHTML = `
            <div class="kpi-grid" style="margin-bottom:28px">
                <div class="kpi-card kpi-blue">
                    <div class="kpi-icon">📦</div>
                    <div class="kpi-value">${stocks.length}</div>
                    <div class="kpi-label">Matériaux total</div>
                </div>
                <div class="kpi-card kpi-green">
                    <div class="kpi-icon">✅</div>
                    <div class="kpi-value">${prods.filter(p => p.statut === 'Terminé').length}</div>
                    <div class="kpi-label">Productions terminées</div>
                </div>
                <div class="kpi-card kpi-orange">
                    <div class="kpi-icon">💰</div>
                    <div class="kpi-value">${formatCurrency(avgCout)}</div>
                    <div class="kpi-label">Coût moyen/production</div>
                </div>
                <div class="kpi-card kpi-purple">
                    <div class="kpi-icon">💎</div>
                    <div class="kpi-value">${formatCurrency(totalCout)}</div>
                    <div class="kpi-label">Coût total cumulé</div>
                </div>
            </div>
            <div class="table-card">
                <div class="table-card-header"><h3>Top 5 productions par quantité</h3></div>
                <div class="table-wrapper">
                    <table class="modern-table">
                        <thead><tr><th>Produit</th><th>Quantité</th><th>Responsable</th><th>Coût</th><th>Statut</th></tr></thead>
                        <tbody>
                            ${topProd.map(p => `
                                <tr>
                                    <td><strong>${escapeHtml(p.produit)}</strong></td>
                                    <td>${p.quantite}</td>
                                    <td>${escapeHtml(p.responsable)}</td>
                                    <td>${formatCurrency(p.cout)}</td>
                                    <td><span class="status-badge ${statusClass(p.statut)}">${p.statut}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (err) {
        container.innerHTML = `<div class="inline-alert inline-alert-red">Erreur chargement statistiques: ${err.message}</div>`;
    }
}

// ── SEARCH ────────────────────────────────────────────────────
async function globalSearchFn() {
    const q = document.getElementById('globalSearch')?.value.trim().toLowerCase() || '';
    const container = document.getElementById('searchResults');
    if (!container) return;

    if (!q) { container.innerHTML = ''; return; }

    // Charger si pas encore fait
    if (!stockData.length)  { try { const r = await StockAPI.getAll();       stockData = r.data || []; } catch (_) {} }
    if (!prodData.length)   { try { const r = await ProductionAPI.getAll();  prodData  = r.data || []; } catch (_) {} }

    const filteredStock = stockData.filter(s => s.materiel.toLowerCase().includes(q));
    const filteredProd  = prodData.filter(p =>
        p.produit.toLowerCase().includes(q) ||
        p.responsable.toLowerCase().includes(q) ||
        (p.materiel_nom || '').toLowerCase().includes(q)
    );

    const stockHtml = filteredStock.length
        ? filteredStock.map(s => `
            <div class="search-item">
                <span>${escapeHtml(s.materiel)}</span>
                <span><strong>${s.quantite}</strong> unités</span>
            </div>`).join('')
        : '<div class="search-item" style="color:#9ca3af">Aucun résultat</div>';

    const prodHtml = filteredProd.length
        ? filteredProd.map(p => `
            <div class="search-item">
                <span>${escapeHtml(p.produit)}</span>
                <span class="status-badge ${statusClass(p.statut)}">${p.statut}</span>
            </div>`).join('')
        : '<div class="search-item" style="color:#9ca3af">Aucun résultat</div>';

    container.innerHTML = `
        <div class="search-result-card">
            <h4>📦 Stock (${filteredStock.length})</h4>
            ${stockHtml}
        </div>
        <div class="search-result-card">
            <h4>🏭 Productions (${filteredProd.length})</h4>
            ${prodHtml}
        </div>
    `;
}

// ── ALERTS ────────────────────────────────────────────────────
async function showAlerts() {
    const bar = document.getElementById('alertsBar');
    if (!bar) return;
    if (bar.style.display !== 'none') { bar.style.display = 'none'; return; }

    bar.innerHTML = '';
    try {
        const [sRes, pRes] = await Promise.all([StockAPI.getAlertes(), ProductionAPI.getAlertes()]);
        const chips = [];

        (sRes.data || []).forEach(s => {
            chips.push(`<div class="alert-chip red">📦 ${escapeHtml(s.materiel)}: ${s.quantite} unités restantes</div>`);
        });
        (pRes.data || []).forEach(p => {
            chips.push(`<div class="alert-chip orange">🏭 ${escapeHtml(p.produit)}: ${p.statut}</div>`);
        });

        if (!chips.length) {
            bar.innerHTML = '<div class="alert-chip" style="background:#d1fae5;color:#065f46">✅ Aucune alerte active</div>';
        } else {
            bar.innerHTML = chips.join('');
        }
    } catch (_) {
        bar.innerHTML = '<div class="alert-chip red">Erreur chargement alertes</div>';
    }

    bar.style.display = 'flex';
}

// ── MODAL HELPERS ─────────────────────────────────────────────
function closeModal(id, event) {
    if (event && event.target !== document.getElementById(id)) return;
    document.getElementById(id).classList.remove('open');
}

// ── EXPORT — Ouvre/ferme le menu déroulant ────────────────────
function toggleExportMenu(page) {
    const menu = document.getElementById('exportMenu' + page);
    if (!menu) return;
    // Fermer tous les autres menus ouverts
    document.querySelectorAll('.export-menu').forEach(m => {
        if (m !== menu) m.style.display = 'none';
    });
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// Fermer les menus si on clique ailleurs sur la page
document.addEventListener('click', (e) => {
    if (!e.target.closest('.export-dropdown')) {
        document.querySelectorAll('.export-menu').forEach(m => {
            m.style.display = 'none';
        });
    }
});

// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast show ' + type;
    setTimeout(() => { toast.classList.remove('show'); }, 3500);
}

// ── UTILS ─────────────────────────────────────────────────────
function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '—';
}

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR');
}

function formatCurrency(n) {
    if (n === null || n === undefined) return '—';
    return new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(n);
}

function statusClass(s) {
    const map = { 'En cours': 's-encours', 'Terminé': 's-termine', 'En attente': 's-attente', 'Critique': 's-critique', 'En retard': 's-retard' };
    return map[s] || '';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

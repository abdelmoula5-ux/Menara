// ============================================================
//  frontend/api.js — Couche API : remplace localStorage
//  Tous les appels au backend Express passent par ce fichier
// ============================================================

const API_BASE = '/api';  // Relatif : fonctionne que ce soit sur port 3000 ou 5500

// ── Helper : fetch avec gestion d'erreurs centralisée ────────
async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(API_BASE + url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            credentials: 'include',   // ← IMPORTANT : envoie les cookies de session
            ...options,
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        const data = await response.json();

        if (!response.ok) {
            // L'API a retourné une erreur (4xx, 5xx)
            throw new Error(data.error || `Erreur HTTP ${response.status}`);
        }

        return data;
    } catch (err) {
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
            throw new Error('❌ Impossible de joindre le serveur. Vérifiez que Node.js est lancé.');
        }
        throw err;
    }
}

// ════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════
const Auth = {
    async login(username, password) {
        return apiFetch('/auth/login', {
            method: 'POST',
            body: { username, password }
        });
    },
    async logout() {
        return apiFetch('/auth/logout', { method: 'POST' });
    },
    async checkSession() {
        return apiFetch('/auth/session');
    }
};

// ════════════════════════════════════════════════════════════
//  STOCK
// ════════════════════════════════════════════════════════════
const StockAPI = {
    // Récupérer tout le stock (avec recherche optionnelle)
    async getAll(search = '') {
        const url = search ? `/stock?search=${encodeURIComponent(search)}` : '/stock';
        return apiFetch(url);
    },

    // Récupérer les alertes stock faible
    async getAlertes() {
        return apiFetch('/stock/alertes');
    },

    // Ajouter un matériau
    async add(data) {
        return apiFetch('/stock', {
            method: 'POST',
            body: data
        });
    },

    // Modifier un matériau
    async update(id, data) {
        return apiFetch(`/stock/${id}`, {
            method: 'PUT',
            body: data
        });
    },

    // Supprimer un matériau
    async delete(id) {
        return apiFetch(`/stock/${id}`, { method: 'DELETE' });
    }
};

// ════════════════════════════════════════════════════════════
//  PRODUCTION
// ════════════════════════════════════════════════════════════
const ProductionAPI = {
    async getAll() {
        return apiFetch('/production');
    },

    async getAlertes() {
        return apiFetch('/production/alertes');
    },

    async add(data) {
        return apiFetch('/production', {
            method: 'POST',
            body: data
        });
    },

    async update(id, data) {
        return apiFetch(`/production/${id}`, {
            method: 'PUT',
            body: data
        });
    },

    async delete(id) {
        return apiFetch(`/production/${id}`, { method: 'DELETE' });
    }
};

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════
const DashboardAPI = {
    async getStats() {
        return apiFetch('/dashboard');
    }
};

// ============================================================
//  server.js — Point d'entrée principal du backend
//  Menara Préfa — Express + SQL Server + SÉCURITÉ + LOGS
// ============================================================
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const session    = require('express-session');
const path       = require('path');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const { connectDB } = require('./config/db');
const { login, logout, checkSession, initAdminPassword } = require('./middleware/auth');
const stockRoutes      = require('./routes/stock');
const productionRoutes = require('./routes/production');
const dashboardRoutes  = require('./routes/dashboard');
const estimateRoutes   = require('./routes/estimate');
const exportRoutes     = require('./routes/export');
const userRoutes       = require('./routes/users');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── RATE LIMITING ─────────────────────────────────────────────
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
    skipSuccessfulRequests: true,
});

// ── LOGGING ───────────────────────────────────────────────────
const fs = require('fs');
const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
}

const accessLogStream = fs.createWriteStream(
    path.join(logDirectory, 'access.log'),
    { flags: 'a' }
);

if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
}
app.use(morgan('combined', { stream: accessLogStream }));

// ── HELMET / CSP ──────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:      ["'self'"],
            styleSrc:        ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc:         ["'self'", "https://fonts.gstatic.com"],
            scriptSrc:       ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr:   ["'unsafe-inline'"],   // ← allows onclick= in HTML
            imgSrc:          ["'self'", "data:", "https:"],
            connectSrc:      ["'self'", "https://cdnjs.cloudflare.com"],  // ← html2pdf fetch
            workerSrc:       ["'self'", "blob:"],   // ← html2pdf web workers
        },
    },
}));

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            callback(new Error('CORS non autorisé'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// ── PARSERS ───────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── SESSIONS ──────────────────────────────────────────────────
const sessionConfig = {
    secret:            process.env.SESSION_SECRET || 'menara_secret_2024_change_this_in_production',
    resave:            false,
    saveUninitialized: false,
    cookie: {
        secure:   process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge:   8 * 60 * 60 * 1000,
        sameSite: 'lax',
    },
    name: 'sessionId',
};

if (process.env.NODE_ENV === 'production') {
    const SQLiteStore = require('connect-sqlite3')(session);
    sessionConfig.store = new SQLiteStore({
        db: 'sessions.db',
        table: 'sessions',
    });
}

app.use(session(sessionConfig));

// ── ACTIVITY LOGGING MIDDLEWARE ───────────────────────────────
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (req.path.startsWith('/api/') && process.env.NODE_ENV !== 'production') {
            console.log(`📊 ${req.method} ${req.url} - ${res.statusCode} (${duration}ms) - ${req.session?.username || 'anonymous'}`);
        }
        if (res.statusCode >= 500) {
            console.error(`❌ ERREUR SERVEUR: ${req.method} ${req.url} - ${res.statusCode}`);
        }
    });
    next();
});

// ── STATIC FILES ──────────────────────────────────────────────
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

const reportsPath = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsPath)) {
    fs.mkdirSync(reportsPath, { recursive: true });
}
app.use('/reports', express.static(reportsPath));

// ── AUTH ROUTES ───────────────────────────────────────────────
app.post('/api/auth/login',   loginLimiter, login);
app.post('/api/auth/logout',  logout);
app.get('/api/auth/session',  checkSession);

// ── API ROUTES ────────────────────────────────────────────────
app.use('/api/stock',      stockRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api/estimate',   estimateRoutes);
app.use('/api/export',     exportRoutes);
app.use('/api/users',      userRoutes);

// ── STATUS / HEALTH / PING ────────────────────────────────────
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get('/api/health', async (req, res) => {
    try {
        const { query } = require('./config/db');
        await query('SELECT 1 as health');
        res.json({ status: 'healthy', database: 'connected', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: 'unhealthy', database: 'disconnected', error: err.message });
    }
});

app.get('/api/ping', (req, res) => {
    res.json({ ok: true, message: 'Serveur Menara Prefa operationnel !', date: new Date() });
});

// ── FALLBACK ──────────────────────────────────────────────────
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            error: 'Route API non trouvee.',
            path: req.path,
            method: req.method
        });
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// ── GLOBAL ERROR HANDLER ──────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('❌ ERREUR SERVEUR:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        user: req.session?.username || 'anonymous'
    });

    const errorLog = path.join(logDirectory, 'error.log');
    fs.appendFileSync(errorLog, `${new Date().toISOString()} - ${err.stack}\n`);

    const errorMessage = process.env.NODE_ENV === 'production'
        ? 'Erreur interne du serveur.'
        : err.message;

    res.status(err.status || 500).json({
        error: errorMessage,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// ── GRACEFUL SHUTDOWN ─────────────────────────────────────────
const gracefulShutdown = async () => {
    console.log('\n🛑 Arrêt propre...');
    try {
        const { pool } = require('./config/db');
        if (pool) { await pool.close(); console.log('✅ Connexion DB fermée'); }
    } catch (err) {
        console.error('❌ Erreur fermeture DB:', err);
    }
    process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT',  gracefulShutdown);

// ── UNCAUGHT ERRORS ───────────────────────────────────────────
process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception:', err);
    fs.appendFileSync(path.join(logDirectory, 'fatal.log'), `${new Date().toISOString()} - FATAL: ${err.stack}\n`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
    fs.appendFileSync(path.join(logDirectory, 'unhandled.log'), `${new Date().toISOString()} - UNHANDLED: ${reason}\n`);
});

// ── START ─────────────────────────────────────────────────────
async function startServer() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    MENARA PRÉFA — Backend API                 ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  Version: 1.0.0                    Mode: ' + (process.env.NODE_ENV || 'development').padEnd(27) + '║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    await connectDB();
    await initAdminPassword();

    app.listen(PORT, () => {
        console.log('');
        console.log('🚀 Serveur démarré avec succès !');
        console.log(`📡 URL: http://localhost:${PORT}`);
        console.log('');
        console.log('📦 API Endpoints:');
        console.log(`   - Stock       : http://localhost:${PORT}/api/stock`);
        console.log(`   - Production  : http://localhost:${PORT}/api/production`);
        console.log(`   - Dashboard   : http://localhost:${PORT}/api/dashboard`);
        console.log(`   - Estimation  : http://localhost:${PORT}/api/estimate`);
        console.log(`   - Export      : http://localhost:${PORT}/api/export`);
        console.log(`   - Users       : http://localhost:${PORT}/api/users`);
        console.log('');
        console.log(`📂 Frontend : ${frontendPath}`);
        console.log(`📁 Logs     : ${logDirectory}`);
        console.log(`📁 Reports  : ${reportsPath}`);
        console.log('');
        console.log('🔒 Sécurité active:');
        console.log('   - Helmet (XSS + CSP)');
        console.log('   - Rate limiting (100 req/15min)');
        console.log('   - Login rate limiting (10 tentatives/15min)');
        console.log('   - CORS configuré');
        console.log('   - Sessions sécurisées');
        console.log('');
        console.log('📊 Monitoring:');
        console.log(`   - Santé : http://localhost:${PORT}/api/health`);
        console.log(`   - Statut: http://localhost:${PORT}/api/status`);
        console.log('');
        console.log('📌 Comptes de test:');
        console.log('   - admin        / admin123');
        console.log('   - responsable  / resp123');
        console.log('   - chef_equipe  / chef123');
        console.log('   - lecteur      / lecteur123');
        console.log('');
    });
}

startServer();
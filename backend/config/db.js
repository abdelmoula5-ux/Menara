// ============================================================
//  config/db.js — Connexion SQL Server (SQL Auth)
// ============================================================
require('dotenv').config();
const sql = require('mssql');

const SERVER   = (process.env.DB_SERVER || 'localhost\\SQLEXPRESS').replace(/\\\\/g, '\\');
const DATABASE = process.env.DB_DATABASE || 'MenaraPrefa';
const DB_PORT  = parseInt(process.env.DB_PORT) || 1433;

console.log('   Serveur :', SERVER);
console.log('   Port    :', DB_PORT);
console.log('   Base    :', DATABASE);
console.log('   Auth    : SQL Server (user/password)');

const config = {
    server:   SERVER,
    database: DATABASE,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port:     DB_PORT,
    options: {
        encrypt:                process.env.DB_ENCRYPT === 'true' || process.env.NODE_ENV === 'production',
        trustServerCertificate: process.env.DB_TRUST_CERT === 'true' || process.env.NODE_ENV !== 'production',
        enableArithAbort:       true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000,
    requestTimeout:    15000,
};

let pool = null;

async function connectDB() {
    try {
        if (pool) return pool;
        pool = await sql.connect(config);
        console.log('✅ Connexion SQL Server réussie !');
        return pool;
    } catch (err) {
        console.error('\n❌ Échec connexion SQL Server');
        console.error('   Erreur : ' + err.message);
        console.error('\n💡 Vérifiez votre fichier .env :');
        console.error('   DB_SERVER   = ' + SERVER);
        console.error('   DB_DATABASE = ' + DATABASE);
        console.error('   DB_USER     = ' + process.env.DB_USER);
        console.error('\n📋 Vérifiez aussi :');
        console.error('   - TCP/IP activé dans SQL Server Configuration Manager');
        console.error('   - SQL Server redémarré après activation TCP/IP');
        console.error('   - Le login menara_user existe dans SSMS');
        process.exit(1);
    }
}

async function query(sql_str, params = {}) {
    const db      = await connectDB();
    const request = db.request();
    for (const [key, value] of Object.entries(params)) {
        if (value === null || value === undefined) {
            request.input(key, sql.NVarChar, null);
        } else if (typeof value === 'number' && !Number.isInteger(value)) {
            request.input(key, sql.Decimal(12, 2), value);
        } else if (typeof value === 'number') {
            request.input(key, sql.Int, value);
        } else if (value instanceof Date) {
            request.input(key, sql.Date, value);
        } else {
            request.input(key, sql.NVarChar, String(value));
        }
    }
    return request.query(sql_str);
}

module.exports = { connectDB, query, sql };

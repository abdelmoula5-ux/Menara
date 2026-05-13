const { query } = require('../config/db');

async function logAction(userId, username, action, tableName, recordId, oldValue, newValue) {
    try {
        await query(
            `INSERT INTO Historique (utilisateur, action, table_name, record_id, ancienne_valeur, nouvelle_valeur)
             VALUES (@user, @action, @table, @id, @old, @new)`,
            {
                user: username,
                action: action,
                table: tableName,
                id: recordId,
                old: JSON.stringify(oldValue),
                new: JSON.stringify(newValue)
            }
        );
    } catch (err) {
        console.error('Erreur log action:', err);
    }
}

module.exports = { logAction };
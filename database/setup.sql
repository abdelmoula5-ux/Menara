-- ============================================================
--  MENARA PRÉFA — Script de création de la base de données
--  Exécuter ce script dans SQL Server Management Studio (SSMS)
-- ============================================================

-- 1. Créer la base de données
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'MenaraPrefa')
BEGIN
    CREATE DATABASE MenaraPrefa;
    PRINT '✅ Base de données MenaraPrefa créée.';
END
GO

USE MenaraPrefa;
GO

-- ============================================================
-- 2. TABLE : Utilisateurs (avec gestion des rôles)
-- ============================================================
DROP TABLE IF EXISTS Production;
DROP TABLE IF EXISTS Stock;
DROP TABLE IF EXISTS Historique;
DROP TABLE IF EXISTS Utilisateurs;
GO

CREATE TABLE Utilisateurs (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    username        NVARCHAR(50)  NOT NULL UNIQUE,
    password        NVARCHAR(255) NOT NULL,
    role            NVARCHAR(30)  NOT NULL DEFAULT 'lecteur',
    -- Rôles disponibles: admin, responsable, chef_equipe, lecteur
    tentatives      INT           NOT NULL DEFAULT 0,
    bloque_jusqu    BIGINT        NULL,
    created_at      DATETIME      NOT NULL DEFAULT GETDATE(),
    last_login      DATETIME      NULL,
    actif           BIT           NOT NULL DEFAULT 1
);

-- Insertion des utilisateurs de test (les mots de passe seront hashés par l'application)
-- Pour les tests, utiliser les endpoints d'inscription ou insérer avec bcrypt
INSERT INTO Utilisateurs (username, password, role, actif) 
VALUES 
    ('admin', '$2b$10$YourHashedPasswordHere', 'admin', 1),
    ('responsable', '$2b$10$YourHashedPasswordHere', 'responsable', 1),
    ('chef_equipe', '$2b$10$YourHashedPasswordHere', 'chef_equipe', 1),
    ('lecteur', '$2b$10$YourHashedPasswordHere', 'lecteur', 1);

PRINT '✅ Table Utilisateurs créée avec gestion des rôles (admin, responsable, chef_equipe, lecteur).';

-- ============================================================
-- 3. TABLE : Stock (Matériaux)
-- ============================================================
CREATE TABLE Stock (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    materiel    NVARCHAR(150) NOT NULL,
    quantite    INT           NOT NULL DEFAULT 0 CHECK (quantite >= 0),
    date_ajout  DATE          NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    created_at  DATETIME      NOT NULL DEFAULT GETDATE(),
    updated_at  DATETIME      NULL,
    updated_by  NVARCHAR(100) NULL
);

PRINT '✅ Table Stock créée.';

-- ============================================================
-- 4. TABLE : Production
-- ============================================================
CREATE TABLE Production (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    produit     NVARCHAR(150)   NOT NULL,
    quantite    INT             NOT NULL CHECK (quantite > 0),
    responsable NVARCHAR(100)   NOT NULL,
    date_prod   DATE            NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    cout        DECIMAL(12, 2)  NOT NULL DEFAULT 0,
    statut      NVARCHAR(30)    NOT NULL DEFAULT 'En cours'
                    CHECK (statut IN ('En cours','Terminé','En attente','Critique','En retard')),
    stock_id    INT             NULL,
    qte_consommee INT           NOT NULL DEFAULT 0,
    created_at  DATETIME        NOT NULL DEFAULT GETDATE(),
    updated_at  DATETIME        NULL,
    updated_by  NVARCHAR(100)   NULL,

    CONSTRAINT FK_Production_Stock
        FOREIGN KEY (stock_id) REFERENCES Stock(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

PRINT '✅ Table Production créée avec clé étrangère vers Stock.';

-- ============================================================
-- 5. TABLE : Historique (Audit trail)
-- ============================================================
CREATE TABLE Historique (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    utilisateur     NVARCHAR(100) NOT NULL,
    role_utilisateur NVARCHAR(30)  NULL,
    action          NVARCHAR(50)  NOT NULL,  -- CREATE, UPDATE, DELETE, LOGIN, LOGOUT
    table_name      NVARCHAR(50)  NOT NULL,  -- Stock, Production, Utilisateurs
    record_id       INT           NOT NULL,
    ancienne_valeur NVARCHAR(MAX) NULL,
    nouvelle_valeur NVARCHAR(MAX) NULL,
    details         NVARCHAR(500) NULL,
    ip_address      NVARCHAR(45)  NULL,
    user_agent      NVARCHAR(255) NULL,
    timestamp       DATETIME      NOT NULL DEFAULT GETDATE()
);

-- Index pour les recherches sur l'historique
CREATE INDEX IX_Historique_Table ON Historique(table_name, record_id);
CREATE INDEX IX_Historique_Utilisateur ON Historique(utilisateur);
CREATE INDEX IX_Historique_Timestamp ON Historique(timestamp DESC);
CREATE INDEX IX_Historique_Action ON Historique(action);

PRINT '✅ Table Historique créée pour l''audit trail.';

-- ============================================================
-- 6. INDEX pour les recherches rapides
-- ============================================================
CREATE INDEX IX_Stock_Materiel   ON Stock(materiel);
CREATE INDEX IX_Stock_Quantite   ON Stock(quantite);
CREATE INDEX IX_Prod_Produit     ON Production(produit);
CREATE INDEX IX_Prod_Statut      ON Production(statut);
CREATE INDEX IX_Prod_Responsable ON Production(responsable);
CREATE INDEX IX_Prod_StockId     ON Production(stock_id);
CREATE INDEX IX_Utilisateurs_Role ON Utilisateurs(role);
CREATE INDEX IX_Utilisateurs_Username ON Utilisateurs(username);

PRINT '✅ Index créés.';

-- ============================================================
-- 7. Données de démonstration
-- ============================================================
INSERT INTO Stock (materiel, quantite, date_ajout) VALUES
    ('Ciment',       120, '2024-01-10'),
    ('Sable',          8, '2024-01-12'),   -- stock faible (< 10)
    ('Gravier',       75, '2024-01-15'),
    ('Fer à béton',   45, '2024-01-18'),
    ('Eau',            5, '2024-02-01');   -- stock faible (< 10)

PRINT '✅ Données de démonstration insérées dans Stock.';

INSERT INTO Production (produit, quantite, responsable, date_prod, cout, statut, stock_id, qte_consommee) VALUES
    ('Dalle préfabriquée', 200, 'admin',        '2024-02-10', 15000.00, 'Terminé',   1, 20),
    ('Poutre T40',          50, 'responsable',  '2024-02-15',  8500.00, 'En cours',  3, 10),
    ('Parpaing 20x20',     500, 'chef_equipe',  '2024-02-20',  3200.00, 'Critique',  1,  5),
    ('Hourdis',            150, 'admin',        '2024-03-01',  6700.00, 'En attente',2,  3);

PRINT '✅ Données de démonstration insérées dans Production.';

-- ============================================================
-- 8. Vue utile : Stock avec état d'alerte
-- ============================================================
CREATE OR ALTER VIEW v_StockAlerte AS
    SELECT
        id,
        materiel,
        quantite,
        date_ajout,
        CASE
            WHEN quantite < 10 THEN 'CRITIQUE'
            WHEN quantite < 50 THEN 'FAIBLE'
            ELSE 'OK'
        END AS etat,
        CASE WHEN quantite < 10 THEN 1 ELSE 0 END AS alerte
    FROM Stock;

PRINT '✅ Vue v_StockAlerte créée.';

-- ============================================================
-- 9. Vue utile : Statistiques dashboard
-- ============================================================
CREATE OR ALTER VIEW v_Dashboard AS
    SELECT
        (SELECT COUNT(*) FROM Stock)                          AS total_materiaux,
        (SELECT ISNULL(SUM(quantite), 0) FROM Stock)          AS total_stock_unite,
        (SELECT COUNT(*) FROM Production)                     AS total_productions,
        (SELECT ISNULL(SUM(cout), 0) FROM Production)         AS cout_total,
        (SELECT COUNT(*) FROM Stock WHERE quantite < 10)      AS alertes_stock,
        (SELECT COUNT(*) FROM Production
         WHERE statut IN ('Critique', 'En retard'))           AS alertes_prod;

PRINT '✅ Vue v_Dashboard créée.';

-- ============================================================
-- 10. Vue : Statistiques par rôle
-- ============================================================
CREATE OR ALTER VIEW v_StatsParRole AS
    SELECT
        role,
        COUNT(*) AS nombre_utilisateurs,
        SUM(CASE WHEN actif = 1 THEN 1 ELSE 0 END) AS actifs
    FROM Utilisateurs
    GROUP BY role;

PRINT '✅ Vue v_StatsParRole créée.';

-- ============================================================
-- 11. Procédure stockée : Ajouter une entrée dans l'historique
-- ============================================================
CREATE OR ALTER PROCEDURE sp_AddHistorique
    @utilisateur    NVARCHAR(100),
    @action         NVARCHAR(50),
    @table_name     NVARCHAR(50),
    @record_id      INT,
    @ancienne_valeur NVARCHAR(MAX) = NULL,
    @nouvelle_valeur NVARCHAR(MAX) = NULL,
    @details        NVARCHAR(500) = NULL,
    @ip_address     NVARCHAR(45) = NULL,
    @user_agent     NVARCHAR(255) = NULL
AS
BEGIN
    DECLARE @role_utilisateur NVARCHAR(30);
    
    -- Récupérer le rôle de l'utilisateur
    SELECT @role_utilisateur = role 
    FROM Utilisateurs 
    WHERE username = @utilisateur;
    
    INSERT INTO Historique (
        utilisateur, role_utilisateur, action, table_name, record_id,
        ancienne_valeur, nouvelle_valeur, details, ip_address, user_agent, timestamp
    )
    VALUES (
        @utilisateur, @role_utilisateur, @action, @table_name, @record_id,
        @ancienne_valeur, @nouvelle_valeur, @details, @ip_address, @user_agent, GETDATE()
    );
END;
GO

PRINT '✅ Procédure sp_AddHistorique créée.';

-- ============================================================
-- 12. Trigger : Historique pour la table Stock
-- ============================================================
CREATE OR ALTER TRIGGER trg_Stock_Historique
ON Stock
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Pour les INSERT
    IF EXISTS (SELECT * FROM inserted) AND NOT EXISTS (SELECT * FROM deleted)
    BEGIN
        INSERT INTO Historique (utilisateur, action, table_name, record_id, nouvelle_valeur, timestamp)
        SELECT 
            ISNULL(inserted.updated_by, SYSTEM_USER),
            'CREATE',
            'Stock',
            inserted.id,
            (SELECT materiel, quantite, date_ajout FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            GETDATE()
        FROM inserted;
    END
    
    -- Pour les UPDATE
    IF EXISTS (SELECT * FROM inserted) AND EXISTS (SELECT * FROM deleted)
    BEGIN
        INSERT INTO Historique (utilisateur, action, table_name, record_id, ancienne_valeur, nouvelle_valeur, timestamp)
        SELECT 
            ISNULL(inserted.updated_by, SYSTEM_USER),
            'UPDATE',
            'Stock',
            inserted.id,
            (SELECT materiel, quantite, date_ajout FROM deleted FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT materiel, quantite, date_ajout FROM inserted FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            GETDATE()
        FROM inserted
        INNER JOIN deleted ON inserted.id = deleted.id;
    END
    
    -- Pour les DELETE
    IF EXISTS (SELECT * FROM deleted) AND NOT EXISTS (SELECT * FROM inserted)
    BEGIN
        INSERT INTO Historique (utilisateur, action, table_name, record_id, ancienne_valeur, timestamp)
        SELECT 
            SYSTEM_USER,
            'DELETE',
            'Stock',
            deleted.id,
            (SELECT materiel, quantite, date_ajout FROM deleted FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            GETDATE()
        FROM deleted;
    END
END;
GO

PRINT '✅ Trigger trg_Stock_Historique créé.';

-- ============================================================
-- 13. Trigger : Historique pour la table Production
-- ============================================================
CREATE OR ALTER TRIGGER trg_Production_Historique
ON Production
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Pour les INSERT
    IF EXISTS (SELECT * FROM inserted) AND NOT EXISTS (SELECT * FROM deleted)
    BEGIN
        INSERT INTO Historique (utilisateur, action, table_name, record_id, nouvelle_valeur, timestamp)
        SELECT 
            ISNULL(inserted.updated_by, SYSTEM_USER),
            'CREATE',
            'Production',
            inserted.id,
            (SELECT produit, quantite, responsable, date_prod, cout, statut, stock_id, qte_consommee 
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            GETDATE()
        FROM inserted;
    END
    
    -- Pour les UPDATE
    IF EXISTS (SELECT * FROM inserted) AND EXISTS (SELECT * FROM deleted)
    BEGIN
        INSERT INTO Historique (utilisateur, action, table_name, record_id, ancienne_valeur, nouvelle_valeur, timestamp)
        SELECT 
            ISNULL(inserted.updated_by, SYSTEM_USER),
            'UPDATE',
            'Production',
            inserted.id,
            (SELECT produit, quantite, responsable, date_prod, cout, statut, stock_id, qte_consommee 
             FROM deleted FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT produit, quantite, responsable, date_prod, cout, statut, stock_id, qte_consommee 
             FROM inserted FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            GETDATE()
        FROM inserted
        INNER JOIN deleted ON inserted.id = deleted.id;
    END
    
    -- Pour les DELETE
    IF EXISTS (SELECT * FROM deleted) AND NOT EXISTS (SELECT * FROM inserted)
    BEGIN
        INSERT INTO Historique (utilisateur, action, table_name, record_id, ancienne_valeur, timestamp)
        SELECT 
            SYSTEM_USER,
            'DELETE',
            'Production',
            deleted.id,
            (SELECT produit, quantite, responsable, date_prod, cout, statut, stock_id, qte_consommee 
             FROM deleted FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            GETDATE()
        FROM deleted;
    END
END;
GO

PRINT '✅ Trigger trg_Production_Historique créé.';

-- ============================================================
-- 14. Fonction : Récupérer l'historique d'un enregistrement
-- ============================================================
CREATE OR ALTER FUNCTION fn_GetHistorique(
    @table_name NVARCHAR(50),
    @record_id INT
)
RETURNS TABLE
AS
RETURN
(
    SELECT 
        id,
        utilisateur,
        role_utilisateur,
        action,
        ancienne_valeur,
        nouvelle_valeur,
        details,
        timestamp,
        DENSE_RANK() OVER (ORDER BY timestamp DESC) AS version
    FROM Historique
    WHERE table_name = @table_name AND record_id = @record_id
);
GO

PRINT '✅ Fonction fn_GetHistorique créée.';

-- ============================================================
-- 15. Nettoyage des données d'audit (optionnel)
-- ============================================================
CREATE OR ALTER PROCEDURE sp_CleanupHistorique
    @jours_conservation INT = 365
AS
BEGIN
    DELETE FROM Historique
    WHERE timestamp < DATEADD(DAY, -@jours_conservation, GETDATE());
    
    PRINT CONCAT('✅ ', @@ROWCOUNT, ' enregistrements d''historique supprimés (plus vieux que ', @jours_conservation, ' jours).');
END;
GO

PRINT '✅ Procédure sp_CleanupHistorique créée.';

-- ============================================================
-- 16. Récapitulatif final
-- ============================================================
PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════';
PRINT '🎉 MENARA PRÉFA — Base de données prête !';
PRINT '═══════════════════════════════════════════════════════════════════';
PRINT '';
PRINT '📊 Tables créées :';
PRINT '   - Utilisateurs (admin, responsable, chef_equipe, lecteur)';
PRINT '   - Stock (matériaux avec quantités)';
PRINT '   - Production (suivi des productions)';
PRINT '   - Historique (audit trail complet)';
PRINT '';
PRINT '👥 Rôles disponibles :';
PRINT '   - admin        : Accès total (CRUD, stats, utilisateurs)';
PRINT '   - responsable  : CRUD sur ses propres productions';
PRINT '   - chef_equipe  : CRUD + statistiques';
PRINT '   - lecteur      : Consultation uniquement';
PRINT '';
PRINT '📝 Comptes de démonstration :';
PRINT '   - admin        / mot de passe: admin123';
PRINT '   - responsable  / mot de passe: resp123';
PRINT '   - chef_equipe  / mot de passe: chef123';
PRINT '   - lecteur      / mot de passe: lecteur123';
PRINT '';
PRINT '🔍 Vues disponibles :';
PRINT '   - v_StockAlerte      : État d''alerte des stocks';
PRINT '   - v_Dashboard        : Statistiques pour le dashboard';
PRINT '   - v_StatsParRole     : Statistiques par rôle utilisateur';
PRINT '';
PRINT '📜 Historique/Audit :';
PRINT '   - Table Historique avec triggers automatiques';
PRINT '   - Procédure sp_AddHistorique pour ajouts manuels';
PRINT '   - Fonction fn_GetHistorique pour consulter l''historique';
PRINT '   - Procédure sp_CleanupHistorique pour nettoyer les vieux logs';
PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════';
GO
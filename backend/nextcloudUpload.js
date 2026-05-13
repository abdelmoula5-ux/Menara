const axios = require('axios');
const fs = require('fs');

// Configuration Nextcloud
const config = {
    url: 'http://192.168.146.133:30027',
    utilisateur: 'admin',
    motDePasse: 'admin123',
};

async function uploadVersNextcloud(cheminFichier, nomFichier) {
    console.log(`📤 Début upload: ${nomFichier}`);
    
    // Vérifier que le fichier existe
    if (!fs.existsSync(cheminFichier)) {
        console.error(`❌ Fichier introuvable: ${cheminFichier}`);
        throw new Error(`Fichier introuvable: ${cheminFichier}`);
    }

    // Lire le fichier
    const contenu = fs.readFileSync(cheminFichier);
    console.log(`📄 Taille du fichier: ${contenu.length} octets`);
    
    // URL WebDAV CORRIGÉE
    const urlWebDAV = `${config.url}/remote.php/dav/files/${config.utilisateur}/${nomFichier}`;
    console.log(`🌐 URL WebDAV: ${urlWebDAV}`);
    
    try {
        const reponse = await axios.put(urlWebDAV, contenu, {
            auth: {
                username: config.utilisateur,
                password: config.motDePasse
            },
            headers: {
                'Content-Type': getContentType(nomFichier)
            },
            timeout: 30000
        });
        
        console.log(`✅ Upload réussi: ${nomFichier}`);
        console.log(`📊 Status: ${reponse.status}`);
        return `${config.url}/index.php/f/${nomFichier}`;
        
    } catch (erreur) {
        console.error('❌ Erreur détaillée:');
        if (erreur.response) {
            console.error(`   Status: ${erreur.response.status}`);
            console.error(`   Message: ${erreur.response.statusText}`);
            if (erreur.response.status === 401) {
                throw new Error('Mot de passe incorrect - Vérifiez admin/admin123');
            }
            if (erreur.response.status === 404) {
                throw new Error('Dossier Nextcloud introuvable - Vérifiez que admin existe');
            }
        } else if (erreur.code === 'ECONNREFUSED') {
            console.error(`   Connexion refusée - Nextcloud est-il accessible ?`);
            throw new Error('Impossible de se connecter à Nextcloud');
        } else {
            console.error(`   Erreur: ${erreur.message}`);
        }
        throw erreur;
    }
}

function getContentType(nom) {
    if (nom.endsWith('.pdf')) return 'application/pdf';
    if (nom.endsWith('.csv')) return 'text/csv';
    return 'application/octet-stream';
}

// Test direct
async function testUpload() {
    console.log('🧪 TEST DIRECT UPLOAD');
    console.log('====================');
    
    // Créer un fichier test
    const testContent = 'Nom,Age\nTest,123';
    const testPath = './test_upload.csv';
    fs.writeFileSync(testPath, testContent, 'utf8');
    
    try {
        const lien = await uploadVersNextcloud(testPath, 'test_upload.csv');
        console.log(`🎉 SUCCÈS ! Lien: ${lien}`);
    } catch (err) {
        console.error(`💥 ÉCHEC: ${err.message}`);
    }
    
    // Nettoyer
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
}

// Décommenter pour tester directement
// testUpload();

module.exports = { uploadVersNextcloud };
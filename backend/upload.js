const axios = require('axios');
const fs = require('fs');

// VOTRE CONFIGURATION - CORRECTE
const config = {
    url: 'http://192.168.146.133:30027',
    utilisateur: 'admin',           // ← admin, pas A !
    motDePasse: 'admin123',         // ← votre mot de passe
};

// Fonction d'upload
async function uploadVersNextcloud(cheminFichier, nomFichier) {
    // Vérifier que le fichier existe
    if (!fs.existsSync(cheminFichier)) {
        throw new Error(`Fichier introuvable: ${cheminFichier}`);
    }

    // Lire le fichier
    const contenu = fs.readFileSync(cheminFichier);
    
    // URL WebDAV avec admin
    const urlWebDAV = `http://192.168.146.133:30027/remote.php/dav/files/admin/${nomFichier}`;
    
    console.log(`📤 Upload vers: ${urlWebDAV}`);
    
    try {
        // Envoyer le fichier
        const reponse = await axios.put(urlWebDAV, contenu, {
            auth: {
                username: 'admin',        // ← admin
                password: 'admin123'      // ← votre mot de passe
            },
            headers: {
                'Content-Type': getContentType(nomFichier)
            }
        });
        
        console.log(`✅ Upload réussi: ${nomFichier}`);
        
        // Retourner le lien
        return `${config.url}/index.php/f/${nomFichier}`;
        
    } catch (erreur) {
        if (erreur.response) {
            console.error(`❌ Erreur HTTP ${erreur.response.status}`);
            if (erreur.response.status === 401) {
                throw new Error('Mot de passe incorrect (admin123 ?)');
            }
            if (erreur.response.status === 404) {
                throw new Error('Dossier Nextcloud introuvable - Vérifiez que admin existe');
            }
        } else if (erreur.code === 'ECONNREFUSED') {
            throw new Error('Connexion à Nextcloud impossible');
        }
        throw erreur;
    }
}

// Fonction utilitaire
function getContentType(nom) {
    if (nom.endsWith('.pdf')) return 'application/pdf';
    if (nom.endsWith('.csv')) return 'text/csv';
    return 'application/octet-stream';
}

// TEST
async function testUpload() {
    console.log('📝 Création du fichier test...');
    fs.writeFileSync('test.csv', 'Nom,Age\nTest,123');
    
    console.log('📤 Envoi vers Nextcloud avec admin/admin123...');
    try {
        const lien = await uploadVersNextcloud('test.csv', 'mon-test.csv');
        console.log('🎉 SUCCÈS !');
        console.log('📎 Lien:', lien);
        fs.unlinkSync('test.csv');
    } catch (erreur) {
        console.error('💥 ÉCHEC:', erreur.message);
    }
}

// Lancer le test
testUpload();

module.exports = { uploadVersNextcloud };
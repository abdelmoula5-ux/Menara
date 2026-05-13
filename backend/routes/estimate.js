const express = require('express');
const router = express.Router();

// Route simple pour l'estimation
router.get('/', (req, res) => {
    res.json({ success: true, message: 'API Estimation opérationnelle' });
});

module.exports = router;
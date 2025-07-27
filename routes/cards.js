const express = require('express');
const router = express.Router();
const cardController = require('../controllers/cardController');

// ========================================
// MAIN QR SCAN ENDPOINT
// ========================================
// POST /api/cards/scan/:qrCode
// This is the endpoint your mobile app will call when scanning QR codes
router.post('/scan/:qrCode', cardController.scanQRCode);

// Alternative GET endpoint for testing
router.get('/scan/:qrCode', cardController.scanQRCode);

// ========================================
// UTILITY ENDPOINTS
// ========================================

// Generate all possible QR codes for physical cards
// GET /api/cards/generate-qr
router.get('/generate-qr', cardController.generateQRCodes);

// Health check for card service
// GET /api/cards/health
router.get('/health', cardController.healthCheck);

// ========================================
// TEST ENDPOINTS
// ========================================

// Test specific card types
router.get('/test/:trackId/:cardType/:difficulty?', (req, res) => {
  const { trackId, cardType, difficulty = 'medium' } = req.params;
  const qrCode = `HITBACK_${trackId}_${cardType.toUpperCase()}_${difficulty.toUpperCase()}`;

  // Redirect to scan endpoint
  req.params.qrCode = qrCode;
  cardController.scanQRCode(req, res);
});

module.exports = router;
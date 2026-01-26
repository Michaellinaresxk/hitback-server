/**
 * ⚡ POWER CARD ROUTES - IMPROVED VERSION
 *
 * Rutas organizadas para operaciones con PowerCards:
 * - Escaneo de QR
 * - Gestión de inventario
 * - Uso de cartas
 * - Combos y recompensas
 *
 * ✅ CLEAN CODE: Rutas RESTful, middleware apropiado
 */

const express = require('express');
const router = express.Router();
const powerCardController = require('../controllers/PowerCardController');

// ═══════════════════════════════════════════════════════════════
// 📱 ESCANEO DE QR
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/cards/scan-qr
 * Escanear QR de PowerCard física
 * 
 * Body: { qrCode, playerId, sessionId? }
 * Response: { cardId, cardName, emoji, inventory }
 * 
 * Este es el endpoint PRINCIPAL que el frontend usa cuando:
 * 1. Detecta combo (Hot Streak)
 * 2. Muestra modal de QR scanner
 * 3. Usuario escanea carta física
 * 4. Backend valida, parsea y asigna la carta
 */
router.post('/scan-qr', powerCardController.scanPowerCardQR);

// ═══════════════════════════════════════════════════════════════
// 🎒 INVENTARIO
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/cards/inventory/:playerId
 * Obtener inventario de PowerCards de un jugador
 * 
 * Response: { 
 *   inventory: [{ cardId, name, emoji, count, canUse }],
 *   summary: { totalCards, uniqueCards, availableTypes }
 * }
 */
router.get('/inventory/:playerId', powerCardController.getPlayerInventory);

/**
 * GET /api/cards/inventories/all
 * Obtener todos los inventarios (admin/debug)
 */
router.get('/inventories/all', powerCardController.getAllInventories);

// ═══════════════════════════════════════════════════════════════
// ⚡ USAR POWER CARDS
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/cards/use
 * Usar una PowerCard del inventario
 * 
 * Body: { playerId, cardId, targetPlayerId?, sessionId }
 * Response: { activated, effect, message }
 * 
 * Flujo:
 * 1. Jugador tiene carta en inventario
 * 2. Decide usarla (antes de responder)
 * 3. Backend activa la carta
 * 4. Cuando responde correctamente, se aplica el efecto
 */
router.post('/use', powerCardController.usePowerCard);

// ═══════════════════════════════════════════════════════════════
// 🧪 TESTING & DEBUG
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/cards/test-add
 * SOLO TESTING: Agregar carta directamente
 * 
 * Body: { playerId, cardId, count }
 */
router.post('/test-add', powerCardController.testAddCard);

/**
 * DELETE /api/cards/player/:playerId
 * Limpiar datos de jugador
 */
router.delete('/player/:playerId', powerCardController.clearPlayerData);

// ═══════════════════════════════════════════════════════════════
// ❌ ERROR HANDLING
// ═══════════════════════════════════════════════════════════════

// Global error handler para rutas de PowerCards
router.use((err, req, res, next) => {
  console.error('PowerCard Route Error:', err);

  if (res.sendError) {
    res.sendError(
      'PowerCard operation failed',
      'POWER_CARD_ERROR',
      500,
      err.message
    );
  } else {
    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
});

module.exports = router;
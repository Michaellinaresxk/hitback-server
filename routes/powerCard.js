
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

/**
 * 🎁 OBTENER POWER CARDS, COMBOS Y THRESHOLDS
 * GET /api/game/power-cards
 */
router.get('/power-cards', async (req, res) => {
  try {
    console.log('🎁 Getting power cards from backend...');

    // ✅ LEER powerCards.json DESDE BACKEND
    const powerCardsPath = path.join(__dirname, '../data/powerCards.json');

    if (!fs.existsSync(powerCardsPath)) {
      logger.error('❌ powerCards.json not found in backend');
      return res.sendError(
        'PowerCards configuration not found',
        'POWER_CARDS_NOT_FOUND',
        404,
        'powerCards.json file is missing from backend/data/ directory'
      );
    }

    const powerCardsData = JSON.parse(fs.readFileSync(powerCardsPath, 'utf8'));

    // ✅ VALIDAR ESTRUCTURA
    if (!powerCardsData.powerCards || !powerCardsData.combos) {
      logger.error('❌ Invalid powerCards.json structure');
      return res.sendError(
        'Invalid PowerCards configuration',
        'INVALID_POWER_CARDS_STRUCTURE',
        500,
        'powerCards.json must contain powerCards and combos arrays'
      );
    }

    // ✅ PREPARAR RESPUESTA
    const responseData = {
      powerCards: powerCardsData.powerCards,
      combos: powerCardsData.combos || powerCardsData.combosList || [], // Compatibilidad
      rewardThresholds: powerCardsData.rewardThresholds || {
        easy: { minTokens: 0, powerCardChance: 0.1, bonusTokenChance: 0.2 },
        medium: { minTokens: 1, powerCardChance: 0.2, bonusTokenChance: 0.3 },
        hard: { minTokens: 2, powerCardChance: 0.4, bonusTokenChance: 0.5 },
        expert: { minTokens: 3, powerCardChance: 0.6, bonusTokenChance: 0.7 }
      },
      metadata: {
        totalPowerCards: powerCardsData.powerCards.length,
        totalCombos: (powerCardsData.combos || powerCardsData.combosList || []).length,
        lastUpdated: powerCardsData.lastUpdated || new Date().toISOString(),
        version: powerCardsData.version || '1.0.0'
      }
    };

    logger.info(`✅ Power cards loaded: ${responseData.powerCards.length} cards, ${responseData.combos.length} combos`);

    res.sendSuccess(
      responseData,
      'Power cards and combos retrieved successfully',
      {
        powerCardsCount: responseData.powerCards.length,
        combosCount: responseData.combos.length,
        source: 'backend_file'
      }
    );

  } catch (error) {
    logger.error('❌ Error loading power cards:', error);
    res.sendError(
      'Failed to load power cards',
      'POWER_CARDS_ERROR',
      500,
      error.message
    );
  }
});

/**
 * 🎯 OBTENER POWER CARD ESPECÍFICA POR TIPO
 * GET /api/game/power-cards/:type
 */
router.get('/power-cards/:type', async (req, res) => {
  try {
    const { type } = req.params;

    const powerCardsPath = path.join(__dirname, '../data/powerCards.json');
    const powerCardsData = JSON.parse(fs.readFileSync(powerCardsPath, 'utf8'));

    const powerCard = powerCardsData.powerCards.find(card => card.type === type);

    if (!powerCard) {
      return res.sendNotFound('PowerCard', type);
    }

    // ✅ CREAR NUEVA INSTANCIA CON ID ÚNICO
    const newInstance = {
      ...powerCard,
      id: `${powerCard.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      currentUses: 0,
      instanceCreated: new Date().toISOString()
    };

    res.sendSuccess(
      newInstance,
      `Power card '${type}' retrieved`,
      { originalId: powerCard.id }
    );

  } catch (error) {
    logger.error(`❌ Error getting power card '${req.params.type}':`, error);
    res.sendError(
      'Failed to get power card',
      'POWER_CARD_GET_ERROR',
      500,
      error.message
    );
  }
});

/**
 * 🎲 OBTENER POWER CARD ALEATORIA
 * GET /api/game/power-cards/random
 */
router.get('/power-cards/random', async (req, res) => {
  try {
    const powerCardsPath = path.join(__dirname, '../data/powerCards.json');
    const powerCardsData = JSON.parse(fs.readFileSync(powerCardsPath, 'utf8'));

    const randomIndex = Math.floor(Math.random() * powerCardsData.powerCards.length);
    const randomCard = powerCardsData.powerCards[randomIndex];

    // ✅ CREAR NUEVA INSTANCIA CON ID ÚNICO
    const newInstance = {
      ...randomCard,
      id: `${randomCard.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      currentUses: 0,
      instanceCreated: new Date().toISOString()
    };

    res.sendSuccess(
      newInstance,
      `Random power card generated: ${randomCard.name}`,
      { originalId: randomCard.id, randomIndex }
    );

  } catch (error) {
    logger.error('❌ Error getting random power card:', error);
    res.sendError(
      'Failed to get random power card',
      'RANDOM_POWER_CARD_ERROR',
      500,
      error.message
    );
  }
});

/**
 * 🔥 OBTENER TODOS LOS COMBOS
 * GET /api/game/combos
 */
router.get('/combos', async (req, res) => {
  try {
    const powerCardsPath = path.join(__dirname, '../data/powerCards.json');
    const powerCardsData = JSON.parse(fs.readFileSync(powerCardsPath, 'utf8'));

    const combos = powerCardsData.combos || powerCardsData.combosList || [];

    res.sendSuccess(
      combos,
      'Combos retrieved successfully',
      { totalCombos: combos.length }
    );

  } catch (error) {
    logger.error('❌ Error getting combos:', error);
    res.sendError(
      'Failed to get combos',
      'COMBOS_ERROR',
      500,
      error.message
    );
  }
});

/**
 * 💰 CALCULAR MULTIPLICADOR DE APUESTA
 * GET /api/game/betting/multiplier/:amount
 */
router.get('/betting/multiplier/:amount', (req, res) => {
  try {
    const amount = parseInt(req.params.amount);

    if (isNaN(amount) || amount < 1 || amount > 3) {
      return res.sendValidationError(
        [{ field: 'amount', message: 'Bet amount must be between 1 and 3' }],
        'Invalid bet amount'
      );
    }

    let multiplier = 1;
    if (amount === 1) multiplier = 2;
    else if (amount === 2) multiplier = 3;
    else if (amount >= 3) multiplier = 4;

    res.sendSuccess(
      { amount, multiplier },
      `Betting multiplier calculated: ${amount} tokens = ${multiplier}x`,
      {
        formula: 'amount 1 = 2x, amount 2 = 3x, amount 3+ = 4x',
        maxBet: 3,
        minBet: 1
      }
    );

  } catch (error) {
    logger.error('❌ Error calculating betting multiplier:', error);
    res.sendError(
      'Failed to calculate betting multiplier',
      'BETTING_MULTIPLIER_ERROR',
      500,
      error.message
    );
  }
});

module.exports = router;

// ========================================
// 📁 controllers/powerCardsController.js - NUEVO ARCHIVO (OPCIONAL)
// ========================================
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class PowerCardsController {
  constructor() {
    this.powerCardsPath = path.join(__dirname, '../data/powerCards.json');
  }

  loadPowerCardsData() {
    try {
      if (!fs.existsSync(this.powerCardsPath)) {
        throw new Error('powerCards.json not found');
      }
      return JSON.parse(fs.readFileSync(this.powerCardsPath, 'utf8'));
    } catch (error) {
      logger.error('Failed to load power cards data:', error);
      throw error;
    }
  }

  getAllPowerCards() {
    const data = this.loadPowerCardsData();
    return data.powerCards || [];
  }

  getPowerCardByType(type) {
    const powerCards = this.getAllPowerCards();
    return powerCards.find(card => card.type === type) || null;
  }

  getRandomPowerCard() {
    const powerCards = this.getAllPowerCards();
    const randomIndex = Math.floor(Math.random() * powerCards.length);
    return powerCards[randomIndex];
  }

  getAllCombos() {
    const data = this.loadPowerCardsData();
    return data.combos || data.combosList || [];
  }

  getRewardThresholds() {
    const data = this.loadPowerCardsData();
    return data.rewardThresholds || {
      easy: { minTokens: 0, powerCardChance: 0.1, bonusTokenChance: 0.2 },
      medium: { minTokens: 1, powerCardChance: 0.2, bonusTokenChance: 0.3 },
      hard: { minTokens: 2, powerCardChance: 0.4, bonusTokenChance: 0.5 },
      expert: { minTokens: 3, powerCardChance: 0.6, bonusTokenChance: 0.7 }
    };
  }
}

module.exports = PowerCardsController;

// ========================================
// 📝 AGREGAR A server.js
// ========================================
/*
// Agregar esta línea en server.js después de las otras rutas:

const powerCardsRoutes = require('./routes/powerCards');
app.use('/api/game', powerCardsRoutes);

// O si prefieres rutas más específicas:
// app.use('/api/power-cards', powerCardsRoutes);
*/
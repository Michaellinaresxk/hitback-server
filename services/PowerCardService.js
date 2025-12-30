/**
 * ⚡ POWER CARD SERVICE
 * 
 * Responsabilidad: Gestión integral de power cards
 * - Cargar configuración de cartas (powerCards.json)
 * - Gestionar inventario de cartas por jugador
 * - Validar y activar cartas
 * - Integración con ComboTracker para otorgar cartas
 * - Aplicar efectos de cartas (REPLAY = x2 puntos)
 * 
 * ✅ CLEAN CODE: Manejo de errores, validación, métodos puros
 */

const fs = require('fs');
const path = require('path');
const ComboTracker = require('./ComboTracker');

class PowerCardService {
  constructor() {
    this.powerCardsPath = path.join(__dirname, '../data/powerCards.json');
    this.powerCardsData = this._loadPowerCardsData();

    // Inventario de cartas por jugador: { playerId: { cardId: count } }
    this.playerInventory = new Map();

    // Historial de cartas usadas: { playerId: [{ cardId, timestamp, effect }] }
    this.usageHistory = new Map();

    // Cartas activas/pendientes de usar: { playerId: { cardId, status: 'pending'|'active' } }
    this.activePowerCards = new Map();
  }

  // ═══════════════════════════════════════════════════════════════
  // 📤 OBTENER POWER CARDS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtener todas las power cards disponibles
   * 
   * @returns {array} Lista de power cards
   */
  getAllPowerCards() {
    if (!this.powerCardsData || !this.powerCardsData.powerCards) {
      throw new Error('Power cards data not loaded');
    }

    return this.powerCardsData.powerCards;
  }

  /**
   * Obtener una power card específica por ID
   * 
   * @param {string} cardId - ID de la carta
   * @returns {object} Objeto de la carta
   */
  getPowerCardById(cardId) {
    const card = this.powerCardsData.powerCards.find(c => c.id === cardId);

    if (!card) {
      throw new Error(`Power card not found: ${cardId}`);
    }

    return card;
  }

  /**
   * Obtener power card por tipo
   * 
   * @param {string} type - Tipo de carta (replay, stop, hit_steal, etc.)
   * @returns {object} Objeto de la carta
   */
  getPowerCardByType(type) {
    const card = this.powerCardsData.powerCards.find(c => c.type === type);

    if (!card) {
      throw new Error(`Power card type not found: ${type}`);
    }

    return card;
  }

  /**
   * Obtener una carta aleatoria
   * 
   * @returns {object} Carta aleatoria
   */
  getRandomPowerCard() {
    const cards = this.powerCardsData.powerCards;
    return cards[Math.floor(Math.random() * cards.length)];
  }

  // ═══════════════════════════════════════════════════════════════
  // 🎯 COMBOS - DETECTAR Y OTORGAR CARTAS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Procesar respuesta de jugador y detectar combos
   * Esta es la FUNCIÓN PRINCIPAL de integración
   * 
   * @param {string} playerId - ID del jugador
   * @param {boolean} isCorrect - ¿Acertó?
   * @param {object} context - Contexto adicional { gameSessionId, roundNumber }
   * @returns {object} { comboDetected, cardAwarded, playerData }
   */
  processPlayerAnswer(playerId, isCorrect, context = {}) {
    // 1. Registrar respuesta en ComboTracker
    const comboResult = ComboTracker.recordAnswer(playerId, isCorrect);

    // 2. Si se detectó combo, otorgar power card
    let cardAwarded = null;

    if (comboResult.comboDetected) {
      cardAwarded = this._awardCardForCombo(playerId, comboResult.comboType);
      console.log(`⚡ Carta otorgada a ${playerId}: ${cardAwarded.name} (${cardAwarded.id})`);
    }

    return {
      success: true,
      comboDetected: comboResult.comboDetected,
      comboType: comboResult.comboType,
      comboMessage: comboResult.comboMessage,
      currentStreak: comboResult.currentStreak,
      cardAwarded: cardAwarded ? {
        id: cardAwarded.id,
        type: cardAwarded.type,
        name: cardAwarded.name,
        description: cardAwarded.description,
        emoji: cardAwarded.emoji,
        qrCode: this._generateQRForCard(cardAwarded.id, playerId)
      } : null,
      playerInventory: this.getPlayerInventory(playerId),
      progressToNextCombo: comboResult.progressToNextCombo,
      context
    };
  }

  /**
   * Obtener estado actual de combo de un jugador
   * Usado para mostrar en la UI: "Necesitas 1 más para Hit Master"
   * 
   * @param {string} playerId
   * @returns {object} Estado del combo
   */
  getComboStatus(playerId) {
    const streak = ComboTracker.getPlayerStreak(playerId);

    return {
      playerId,
      currentStreak: streak.streak,
      isHitMaster: streak.streak >= 3,
      nextComboIn: streak.nextComboIn,
      message: this._generateComboMessage(streak.streak),
      canDrawCard: streak.streak >= 3 && !this._hasRecentlyDrawnCard(playerId)
    };
  }

  /**
   * Otorgar carta por combo (uso interno)
   * 
   * @private
   */
  _awardCardForCombo(playerId, comboType) {
    let cardToAward;

    switch (comboType) {
      case 'HOT_STREAK':
        // Para Hot Streak otorgamos la carta REPLAY
        cardToAward = this.getPowerCardByType('replay');
        break;
      case 'DOUBLE_HIT':
        // Para DOUBLE_HIT, dos cartas
        cardToAward = this.getPowerCardByType('replay');
        // En el futuro podríamos otorgar otra carta adicional
        break;
      case 'TRIPLE_HIT':
        cardToAward = this.getPowerCardByType('replay');
        break;
      default:
        return null;
    }

    // Añadir a inventario del jugador
    this.addCardToInventory(playerId, cardToAward.id);

    // Marcar última carta otorgada
    this._recordCardAwarded(playerId, cardToAward.id);

    return cardToAward;
  }

  // ═══════════════════════════════════════════════════════════════
  // 🎒 INVENTARIO DE CARTAS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtener inventario de un jugador
   * 
   * @param {string} playerId
   * @returns {object} { cardId: count, ... }
   */
  getPlayerInventory(playerId) {
    return this.playerInventory.get(playerId) || {};
  }

  /**
   * Añadir carta al inventario
   * 
   * @param {string} playerId
   * @param {string} cardId
   * @param {number} count - Cuántas cartas (default 1)
   */
  addCardToInventory(playerId, cardId, count = 1) {
    if (!this.playerInventory.has(playerId)) {
      this.playerInventory.set(playerId, {});
    }

    const inventory = this.playerInventory.get(playerId);
    inventory[cardId] = (inventory[cardId] || 0) + count;

    console.log(`✅ ${playerId} obtuvo ${count}x ${cardId}`);
  }

  /**
   * Remover carta del inventario (cuando se usa)
   * 
   * @param {string} playerId
   * @param {string} cardId
   * @returns {boolean} Si se removió exitosamente
   */
  removeCardFromInventory(playerId, cardId) {
    const inventory = this.playerInventory.get(playerId);

    if (!inventory || !inventory[cardId] || inventory[cardId] <= 0) {
      throw new Error(`Player ${playerId} doesn't have card ${cardId}`);
    }

    inventory[cardId]--;

    if (inventory[cardId] === 0) {
      delete inventory[cardId];
    }

    console.log(`⚠️  ${playerId} usó carta ${cardId}`);

    return true;
  }

  /**
   * Obtener inventarios de todos los jugadores
   * 
   * @returns {object} { playerId: { cardId: count } }
   */
  getAllInventories() {
    const allInventories = {};

    this.playerInventory.forEach((inventory, playerId) => {
      allInventories[playerId] = inventory;
    });

    return allInventories;
  }

  // ═══════════════════════════════════════════════════════════════
  // ⚡ ACTIVAR Y USAR CARTAS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Activar una power card antes de una respuesta
   * El Game Master escanea el QR de la carta física
   * 
   * @param {string} playerId
   * @param {string} cardId - ID de la carta (del QR)
   * @param {string} sessionId - ID de sesión de juego
   * @returns {object} { success, effect, multiplier }
   */
  activatePowerCard(playerId, cardId, sessionId) {
    try {
      // 1. Validar que el jugador tiene la carta
      const inventory = this.getPlayerInventory(playerId);
      if (!inventory[cardId] || inventory[cardId] <= 0) {
        throw new Error(`Player ${playerId} doesn't have card ${cardId}`);
      }

      // 2. Obtener datos de la carta
      const card = this.getPowerCardById(cardId);

      // 3. Crear activación
      if (!this.activePowerCards.has(playerId)) {
        this.activePowerCards.set(playerId, {});
      }

      this.activePowerCards.get(playerId)[cardId] = {
        status: 'active',
        activatedAt: new Date().toISOString(),
        sessionId,
        effectApplied: false
      };

      console.log(`✨ ${playerId} activó: ${card.name} (${card.type})`);

      return {
        success: true,
        activated: true,
        cardId,
        type: card.type,
        name: card.name,
        effect: this._getCardEffect(card.type),
        message: `${card.emoji} ${card.name} activada`,
        sessionId
      };

    } catch (error) {
      console.error(`❌ Error activando carta: ${error.message}`);
      return {
        success: false,
        error: error.message,
        cardId
      };
    }
  }

  /**
   * Aplicar efecto de carta activa a puntos
   * Usado en revealAnswer del GameSessionService
   * 
   * Ejemplo: si carta es REPLAY, multiplica puntos por 2
   * 
   * @param {string} playerId
   * @param {number} basePoints - Puntos sin modificar
   * @returns {object} { finalPoints, multiplier, cardUsed }
   */
  applyActiveCardEffect(playerId, basePoints) {
    const activeCards = this.activePowerCards.get(playerId);

    if (!activeCards) {
      return {
        finalPoints: basePoints,
        multiplier: 1,
        cardUsed: null
      };
    }

    // Buscar carta activa (debería haber solo una por respuesta)
    for (const [cardId, cardData] of Object.entries(activeCards)) {
      if (cardData.status === 'active' && !cardData.effectApplied) {
        const card = this.getPowerCardById(cardId);
        const effect = this._getCardEffect(card.type);

        let finalPoints = basePoints;
        let multiplier = 1;

        // Aplicar efecto según tipo de carta
        if (card.type === 'replay') {
          multiplier = 2;
          finalPoints = basePoints * 2;
        }

        // Marcar como usado y remover de inventario
        cardData.effectApplied = true;
        this.removeCardFromInventory(playerId, cardId);

        // Registrar uso
        this._recordCardUsage(playerId, cardId, { basePoints, finalPoints, multiplier });

        console.log(`⚡ ${playerId}: Carta ${card.name} aplicada (${basePoints} → ${finalPoints})`);

        return {
          finalPoints,
          multiplier,
          cardUsed: {
            id: cardId,
            type: card.type,
            name: card.name,
            emoji: card.emoji,
            effect: card.description
          }
        };
      }
    }

    return {
      finalPoints: basePoints,
      multiplier: 1,
      cardUsed: null
    };
  }

  /**
   * Limpiar cartas activas después de procesar respuesta
   * 
   * @param {string} playerId
   */
  clearActiveCards(playerId) {
    this.activePowerCards.delete(playerId);
  }

  // ═══════════════════════════════════════════════════════════════
  // 📊 COMBOS Y THRESHOLDS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtener configuración de todos los combos
   * 
   * @returns {array} Lista de combos
   */
  getAllCombos() {
    return this.powerCardsData.combos || [];
  }

  /**
   * Obtener información de reward thresholds
   * 
   * @returns {object} Thresholds por dificultad
   */
  getRewardThresholds() {
    return this.powerCardsData.rewardThresholds || {
      easy: { minTokens: 0, powerCardChance: 0.1, bonusTokenChance: 0.2 },
      medium: { minTokens: 1, powerCardChance: 0.2, bonusTokenChance: 0.3 },
      hard: { minTokens: 2, powerCardChance: 0.4, bonusTokenChance: 0.5 },
      expert: { minTokens: 3, powerCardChance: 0.6, bonusTokenChance: 0.7 }
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 🧹 LIMPIAR Y RESETEAR
  // ═══════════════════════════════════════════════════════════════

  /**
   * Resetear datos de un jugador (fin de sesión)
   * 
   * @param {string} playerId
   */
  clearPlayerData(playerId) {
    this.playerInventory.delete(playerId);
    this.usageHistory.delete(playerId);
    this.activePowerCards.delete(playerId);
    ComboTracker.clearPlayerData(playerId);

    console.log(`🧹 ${playerId}: Datos limpiados`);
  }

  /**
   * Resetear todo
   */
  clearAll() {
    this.playerInventory.clear();
    this.usageHistory.clear();
    this.activePowerCards.clear();
    ComboTracker.clearAll();

    console.log(`🧹 Sistema de Power Cards completamente reseteado`);
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔧 MÉTODOS PRIVADOS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Cargar datos de powerCards.json
   * 
   * @private
   */
  _loadPowerCardsData() {
    try {
      if (!fs.existsSync(this.powerCardsPath)) {
        throw new Error(`powerCards.json not found at ${this.powerCardsPath}`);
      }

      const data = JSON.parse(fs.readFileSync(this.powerCardsPath, 'utf8'));

      if (!data.powerCards || !Array.isArray(data.powerCards)) {
        throw new Error('Invalid powerCards.json structure: missing powerCards array');
      }

      console.log(`✅ Power Cards cargadas: ${data.powerCards.length} cartas`);

      return data;

    } catch (error) {
      console.error(`❌ Error cargando powerCards.json: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener efecto de una carta por tipo
   * 
   * @private
   */
  _getCardEffect(cardType) {
    const effects = {
      replay: { multiplier: 2, description: 'Próxima respuesta vale 2x' },
      stop: { protection: true, description: 'Protección contra robos' },
      hit_steal: { steal: true, description: 'Robar carta de otro' },
      stop_blast: { protection: true, steal: true, description: 'Protección + contraataque' },
      precision: { bonus: 2, description: '+2 puntos si aciertas año exacto' }
    };

    return effects[cardType] || { description: 'Efecto desconocido' };
  }

  /**
   * Generar código QR para una carta
   * 
   * @private
   */
  _generateQRForCard(cardId, playerId) {
    return `HITBACK_POWERCARD_${cardId}_${playerId}_${Date.now()}`;
  }

  /**
   * Registrar uso de carta
   * 
   * @private
   */
  _recordCardUsage(playerId, cardId, details = {}) {
    if (!this.usageHistory.has(playerId)) {
      this.usageHistory.set(playerId, []);
    }

    this.usageHistory.get(playerId).push({
      cardId,
      timestamp: new Date().toISOString(),
      details
    });
  }

  /**
   * Registrar cuando se otorgó una carta
   * 
   * @private
   */
  _recordCardAwarded(playerId, cardId) {
    // Registrar en historial para evitar otorgar múltiples veces
    if (!this.usageHistory.has(playerId)) {
      this.usageHistory.set(playerId, []);
    }

    this.usageHistory.get(playerId).push({
      cardId,
      event: 'awarded',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Generar mensaje de combo según racha
   * 
   * @private
   */
  _generateComboMessage(streak) {
    if (streak === 0) {
      return '¡Comienza tu racha! Acerta la siguiente pregunta.';
    } else if (streak === 1) {
      return '🔥 1 correcta - ¡Vamos! 2 más para Hit Master';
    } else if (streak === 2) {
      return '🔥🔥 2 correctas - ¡Una más para poder tomar una carta!';
    } else if (streak === 3) {
      return '🔥🔥🔥 ¡HIT MASTER! Puedes tomar una carta del mazo';
    } else if (streak >= 4) {
      return `🔥 Racha en ${streak} - ¡Sigue así!`;
    }
  }

  /**
   * Verificar si el jugador ya sacó una carta recientemente
   * 
   * @private
   */
  _hasRecentlyDrawnCard(playerId) {
    const history = this.usageHistory.get(playerId);

    if (!history) return false;

    const recentAward = history.find(h =>
      h.event === 'awarded' &&
      new Date() - new Date(h.timestamp) < 10000 // Menos de 10 segundos
    );

    return !!recentAward;
  }
}

// ✅ Exportar como singleton
module.exports = new PowerCardService();
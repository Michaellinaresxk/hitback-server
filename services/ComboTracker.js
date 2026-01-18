/**
 * 🔥 COMBO TRACKER SERVICE
 * 
 * Responsabilidad: Rastrear y detectar combos de respuestas correctas consecutivas
 * 
 * Características:
 * - Seguimiento de rachas por jugador
 * - Detección de "Hit Master" (3 correctas consecutivas)
 * - Reseteo automático al fallar
 * - Historial de combos completados
 * 
 * ✅ CLEAN CODE: Single Responsibility, encapsulación, métodos puros
 */

class ComboTracker {
  constructor() {
    // Estructura: { playerId: { streak: number, lastCorrect: boolean, history: [] } }
    this.playerStreaks = new Map();
    this.comboThresholds = {
      HOT_STREAK: 3, // 3 correctas consecutivas = Hot Streak
      DOUBLE_HIT: 5,
      TRIPLE_HIT: 7
    };
  }

  /**
   * Registrar respuesta de un jugador
   * 
   * @param {string} playerId - ID del jugador
   * @param {boolean} isCorrect - ¿Acertó la respuesta?
   * @returns {object} { currentStreak, comboDetected, comboType, message }
   */
  recordAnswer(playerId, isCorrect) {
    if (!playerId) {
      throw new Error('PlayerId is required');
    }

    // Obtener o inicializar racha del jugador
    const playerData = this._getOrCreatePlayerData(playerId);

    console.log(`\n🔍 COMBO TRACKER DEBUG - recordAnswer():`);
    console.log(`   PlayerId: ${playerId}`);
    console.log(`   Is Correct: ${isCorrect}`);
    console.log(`   Streak ANTES: ${playerData.streak}`);
    console.log(`   Threshold HOT_STREAK: ${this.comboThresholds.HOT_STREAK}`);

    // Si acertó, incrementar racha
    if (isCorrect) {
      playerData.streak += 1;
      playerData.lastCorrect = true;

      console.log(`🔥 ${playerId}: +1 CORRECTA (racha: ${playerData.streak})`);
      console.log(`   Streak DESPUÉS: ${playerData.streak}`);

      // Detectar combos completados
      const comboDetected = this._detectCombo(playerId, playerData.streak);

      console.log(`   Combo Detected: ${!!comboDetected}`);
      if (comboDetected) {
        console.log(`   Combo Type: ${comboDetected.type}`);
        console.log(`   ⚠️ COMBO SE ACTIVÓ con streak = ${playerData.streak}`);
      }

      const result = {
        success: true,
        currentStreak: playerData.streak, // Retornar streak actual (3 cuando combo)
        comboDetected: !!comboDetected,
        comboType: comboDetected?.type || null,
        comboMessage: comboDetected?.message || null,
        progressToNextCombo: this._calculateProgress(playerData.streak),
        playerStreak: playerData
      };

      // ✅ SI DETECTAMOS COMBO: Registrar + RESETEAR streak a 0 DESPUÉS
      if (comboDetected) {
        this._recordCompletion(playerId, comboDetected.type);
        playerData.streak = 0; // 🔥 RESETEAR AFTER RETURNING
        console.log(`⚡ ${playerId}: COMBO ${comboDetected.type}! Streak reseteado a 0`);
      }

      return result;
    } else {
      // Si falló, resetear racha pero guardar en historial
      if (playerData.streak > 0) {
        playerData.history.push({
          completedStreak: playerData.streak,
          timestamp: new Date().toISOString(),
          triggered: false // No alcanzó combo
        });
        console.log(`❌ ${playerId}: RACHA ROTA (fue: ${playerData.streak})`);
      }

      playerData.streak = 0;
      playerData.lastCorrect = false;

      return {
        success: true,
        currentStreak: 0,
        comboDetected: false,
        comboType: null,
        comboMessage: 'Racha rota - vuelve a comenzar',
        progressToNextCombo: 0,
        playerStreak: playerData
      };
    }
  }

  /**
   * Obtener información de la racha actual de un jugador
   * 
   * @param {string} playerId
   * @returns {object} Datos de la racha
   */
  getPlayerStreak(playerId) {
    const playerData = this.playerStreaks.get(playerId);

    if (!playerData) {
      return {
        playerId,
        streak: 0,
        history: [],
        completedCombos: [],
        nextComboIn: this.comboThresholds.HOT_STREAK
      };
    }

    return {
      playerId,
      streak: playerData.streak,
      lastCorrect: playerData.lastCorrect,
      history: playerData.history,
      completedCombos: playerData.history.filter(h => h.triggered),
      nextComboIn: Math.max(0, this.comboThresholds.HOT_STREAK - playerData.streak)
    };
  }

  /**
   * Obtener todas las rachas de jugadores activos
   * 
   * @returns {array} Lista de rachas
   */
  getAllPlayerStreaks() {
    const streaks = [];

    this.playerStreaks.forEach((data, playerId) => {
      streaks.push({
        playerId,
        currentStreak: data.streak,
        history: data.history,
        completedCombos: data.history.filter(h => h.triggered).length
      });
    });

    return streaks.sort((a, b) => b.currentStreak - a.currentStreak);
  }

  /**
   * Resetear racha de un jugador (ej: cuando usa un power card)
   * 
   * @param {string} playerId
   * @param {string} reason - Razón del reset
   */
  resetStreak(playerId, reason = 'manual_reset') {
    const playerData = this.playerStreaks.get(playerId);

    if (playerData && playerData.streak > 0) {
      console.log(`🔄 ${playerId}: RACHA RESETEADA (razón: ${reason})`);

      playerData.history.push({
        completedStreak: playerData.streak,
        reason,
        timestamp: new Date().toISOString(),
        triggered: false
      });

      playerData.streak = 0;
      playerData.lastCorrect = false;
    }
  }

  /**
   * Limpiar datos de un jugador (ej: fin de sesión)
   * 
   * @param {string} playerId
   */
  clearPlayerData(playerId) {
    this.playerStreaks.delete(playerId);
    console.log(`🧹 ${playerId}: Datos de racha limpiados`);
  }

  /**
   * Limpiar todos los datos
   */
  clearAll() {
    this.playerStreaks.clear();
    console.log(`🧹 Tracker limpiado completamente`);
  }

  // ═══════════════════════════════════════════════════════════════
  // MÉTODOS PRIVADOS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtener o crear datos de jugador
   * 
   * @private
   */
  _getOrCreatePlayerData(playerId) {
    if (!this.playerStreaks.has(playerId)) {
      this.playerStreaks.set(playerId, {
        streak: 0,
        lastCorrect: false,
        history: []
      });
    }

    return this.playerStreaks.get(playerId);
  }

  /**
   * Detectar si se completó un combo
   * 
   * @private
   */
  _detectCombo(playerId, streak) {
    console.log(`\n🔍 _detectCombo() called:`);
    console.log(`   PlayerId: ${playerId}`);
    console.log(`   Streak: ${streak}`);
    console.log(`   HOT_STREAK threshold: ${this.comboThresholds.HOT_STREAK}`);
    console.log(`   Checking: ${streak} === ${this.comboThresholds.HOT_STREAK} ? ${streak === this.comboThresholds.HOT_STREAK}`);

    // Detectar Hot Streak (3 correctas consecutivas)
    if (streak === this.comboThresholds.HOT_STREAK) {
      console.log(`   ✅ HOT_STREAK COMBO DETECTED!`);
      return {
        type: 'HOT_STREAK',
        message: '🔥 ¡HIT MASTER! 3 respuestas correctas consecutivas',
        reward: 'power_card',
        points: 10
      };
    }

    // Detectar Double Hit (5 correctas consecutivas)
    if (streak === this.comboThresholds.DOUBLE_HIT) {
      return {
        type: 'DOUBLE_HIT',
        message: '⚡ ¡DOBLE HIT! 5 respuestas correctas consecutivas',
        reward: 'two_power_cards',
        points: 25
      };
    }

    // Detectar Triple Hit (7 correctas consecutivas)
    if (streak === this.comboThresholds.TRIPLE_HIT) {
      return {
        type: 'TRIPLE_HIT',
        message: '💥 ¡TRIPLE HIT! 7 respuestas correctas consecutivas',
        reward: 'three_power_cards',
        points: 50
      };
    }

    return null;
  }

  /**
   * Calcular progreso hacia el siguiente combo
   * 
   * @private
   */
  _calculateProgress(currentStreak) {
    if (currentStreak < this.comboThresholds.HOT_STREAK) {
      const nextCombo = this.comboThresholds.HOT_STREAK;
      return {
        nextMilestone: nextCombo,
        currentProgress: currentStreak,
        remaining: nextCombo - currentStreak,
        percentage: Math.round((currentStreak / nextCombo) * 100)
      };
    } else if (currentStreak < this.comboThresholds.DOUBLE_HIT) {
      const nextCombo = this.comboThresholds.DOUBLE_HIT;
      return {
        nextMilestone: nextCombo,
        currentProgress: currentStreak,
        remaining: nextCombo - currentStreak,
        percentage: Math.round((currentStreak / nextCombo) * 100)
      };
    } else {
      const nextCombo = this.comboThresholds.TRIPLE_HIT;
      return {
        nextMilestone: nextCombo,
        currentProgress: currentStreak,
        remaining: nextCombo - currentStreak,
        percentage: Math.round((currentStreak / nextCombo) * 100)
      };
    }
  }

  /**
   * Registrar combo completado en historial
   * 
   * @private
   */
  _recordCompletion(playerId, comboType) {
    const playerData = this.playerStreaks.get(playerId);

    if (playerData) {
      playerData.history.push({
        completedStreak: playerData.streak,
        comboType,
        timestamp: new Date().toISOString(),
        triggered: true
      });
    }
  }
}

// ✅ Exportar como singleton
module.exports = new ComboTracker();
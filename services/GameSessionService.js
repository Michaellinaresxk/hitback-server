/**
 * 🎮 GAME SESSION SERVICE - UPDATED
 * 
 * ✅ INTEGRACIÓN CON POWER CARDS
 * - Detecta combos automáticamente
 * - Aplica efectos de cartas a puntos
 * - Registra uso de power cards
 * 
 * CAMBIOS:
 * - revealAnswer(): Integración con PowerCardService y ComboTracker
 * - Nuevos métodos: processCombos(), applyPowerCardBonus()
 */

const trackService = require('./TrackService');
const QuestionService = require('./QuestionService');
const DeezerService = require('./DeezerService');
const PowerCardService = require('./PowerCardService');

class GameSessionService {
  constructor() {
    this.trackService = trackService;
    this.questionService = new QuestionService();
    this.sessions = new Map();
  }

  // ═══════════════════════════════════════════════════════════════
  // 🎮 CREAR SESIÓN
  // ═══════════════════════════════════════════════════════════════

  createSession(config = {}) {
    const {
      players = [],
      genres = ['ANY'],
      decades = ['ANY'],
      difficulty = 'ANY',
      targetScore = 15,
      timeLimit = 1200,
      powerCardsPerPlayer = 3
    } = config;

    const sessionId = this._generateSessionId();

    const playerList = players.map((name, index) => ({
      id: `player_${index + 1}`,
      name: name || `Jugador ${index + 1}`,
      score: 0,
      availableTokens: [1, 2, 3],
      powerCards: [],
      stats: {
        correctAnswers: 0,
        wrongAnswers: 0,
        tokensWon: 0,
        tokensLost: 0,
        tokensUsed: [],
        combosCompleted: 0,
        powerCardsUsed: 0,
        totalComboStreak: 0
      }
    }));

    const session = {
      id: sessionId,
      status: 'created',
      createdAt: new Date().toISOString(),
      config: {
        genres,
        decades,
        difficulty,
        targetScore,
        timeLimit,
        powerCardsPerPlayer
      },
      players: playerList,
      currentPlayerIndex: 0,
      round: 0,
      usedTrackIds: [],
      currentRound: null,
      timeRemaining: timeLimit,
      startedAt: null,
      history: []
    };

    this.sessions.set(sessionId, session);
    this.trackService.resetUsedTracks();

    console.log(`🎮 Sesión creada: ${sessionId}`);
    console.log(`   Jugadores: ${playerList.length}`);
    console.log(`   Tokens por jugador: [1, 2, 3]`);
    console.log(`   ✅ Power Cards System ACTIVO`);

    return {
      success: true,
      session: this._sanitizeSession(session)
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // ✅ REVELAR RESPUESTA CON INTEGRACIÓN DE POWER CARDS
  // ═══════════════════════════════════════════════════════════════

  revealAnswer(sessionId, winnerId = null) {
    const session = this.sessions.get(sessionId);

    if (!session || !session.currentRound) {
      return { success: false, error: 'No hay ronda activa' };
    }

    const round = session.currentRound;
    const answer = round._answer;

    const results = {
      correctAnswer: answer.correct,
      trackInfo: {
        title: answer.trackTitle,
        artist: answer.trackArtist
      },
      winner: null,
      pointsAwarded: 0,
      basePoints: round.question.points,
      tokenBonus: 0,
      powerCardEffect: null,            // ✅ NUEVA PROP
      comboStatus: null                 // ✅ NUEVA PROP
    };

    console.log(`\n═══ REVEAL ANSWER ═══`);
    console.log(`Winner: ${winnerId || 'none'}`);
    console.log(`Base points: ${round.question.points}`);

    // ═══════════════════════════════════════════════════════════════
    // PROCESAR GANADOR
    // ═══════════════════════════════════════════════════════════════

    if (winnerId) {
      const winner = session.players.find(p => p.id === winnerId);

      if (winner) {
        const basePoints = round.question.points;
        const bet = round.bets[winnerId];
        const tokenBonus = bet ? bet.tokenValue : 0;

        // Paso 1: Calcular puntos base con token
        let totalPoints = basePoints + tokenBonus;

        console.log(`✅ ${winner.name} ACIERTA:`);
        console.log(`   Base: ${basePoints} pts`);
        console.log(`   Token: +${tokenBonus} pts`);

        // ✅ CORREGIDO: Registrar token ganado
        if (tokenBonus > 0) {
          winner.stats.tokensWon += tokenBonus;
        }

        // ═══════════════════════════════════════════════════════════
        // Paso 2: APLICAR EFECTO DE POWER CARD
        // ═══════════════════════════════════════════════════════════

        const powerCardEffect = PowerCardService.applyActiveCardEffect(
          winnerId,
          totalPoints
        );

        if (powerCardEffect.cardUsed) {
          totalPoints = powerCardEffect.finalPoints;
          winner.stats.powerCardsUsed++;

          results.powerCardEffect = {
            cardId: powerCardEffect.cardUsed.id,
            cardName: powerCardEffect.cardUsed.name,
            emoji: powerCardEffect.cardUsed.emoji,
            multiplier: powerCardEffect.multiplier,
            basePointsBeforeCard: totalPoints / powerCardEffect.multiplier,
            finalPointsAfterCard: totalPoints
          };

          console.log(`   💥 Power Card ${powerCardEffect.cardUsed.name}: x${powerCardEffect.multiplier}`);
          console.log(`   → ${totalPoints} pts (con poder)`);
        } else {
          console.log(`   Total: ${totalPoints} pts`);
        }

        // ═══════════════════════════════════════════════════════════
        // Paso 3: REGISTRAR RESPUESTA Y DETECTAR COMBOS
        // ═══════════════════════════════════════════════════════════

        console.log(`\n🔍 DEBUG COMBO - Antes de procesar:`);
        console.log(`   Player: ${winnerId}`);
        console.log(`   Round: ${round.roundNumber}`);
        console.log(`   Correct answers antes: ${winner.stats.correctAnswers}`);

        const comboResult = PowerCardService.processPlayerAnswer(
          winnerId,
          true,  // Es correcta
          { gameSessionId: sessionId, roundNumber: round.roundNumber }
        );

        console.log(`🔍 DEBUG COMBO - Resultado:`);
        console.log(`   Current Streak: ${comboResult.currentStreak}`);
        console.log(`   Combo Detected: ${comboResult.comboDetected}`);
        console.log(`   Combo Type: ${comboResult.comboType}`);

        // Actualizar stats de combo
        if (comboResult.comboDetected) {
          winner.stats.combosCompleted++;

          results.comboStatus = {
            type: comboResult.comboType,
            message: comboResult.comboMessage,
            cardAwarded: comboResult.cardAwarded
          };

          console.log(`   🔥 COMBO ACTIVADO: ${comboResult.comboMessage}`);
          console.log(`   🔥 Correct answers TOTAL: ${winner.stats.correctAnswers + 1}`);
        }

        // Actualizar streak en stats
        winner.stats.totalComboStreak = comboResult.currentStreak;

        // Sumar puntos finales
        winner.score += totalPoints;
        winner.stats.correctAnswers++;

        // Limpiar cartas activas
        PowerCardService.clearActiveCards(winnerId);

        results.winner = {
          id: winner.id,
          name: winner.name,
          newScore: winner.score
        };
        results.pointsAwarded = totalPoints;
        results.tokenBonus = tokenBonus;

        // ═══════════════════════════════════════════════════════════
        // ⚠️ IMPORTANTE: Resetear streak de los jugadores que NO ganaron
        // ═══════════════════════════════════════════════════════════
        console.log(`\n🔄 Reseteando streak de jugadores que NO ganaron:`);
        session.players.forEach(player => {
          if (player.id !== winnerId) {
            console.log(`   ❌ ${player.name} (${player.id}) no ganó esta ronda - reseteando streak`);
            PowerCardService.processPlayerAnswer(
              player.id,
              false,  // Incorrecto
              { gameSessionId: sessionId, roundNumber: round.roundNumber }
            );

            // ✅ CORREGIDO: Registrar tokens perdidos
            const playerBet = round.bets[player.id];
            if (playerBet && playerBet.tokenValue > 0) {
              player.stats.tokensLost += playerBet.tokenValue;
            }
          }
        });
      }
    } else {
      // ═══════════════════════════════════════════════════════════
      // NADIE ACERTÓ - Registrar respuestas incorrectas para todos
      // ═══════════════════════════════════════════════════════════

      console.log(`😅 Nadie acertó`);

      session.players.forEach(player => {
        PowerCardService.processPlayerAnswer(
          player.id,
          false,  // Incorrecto
          { gameSessionId: sessionId, roundNumber: round.roundNumber }
        );

        // ✅ CORREGIDO: Registrar tokens perdidos cuando nadie acierta
        const playerBet = round.bets[player.id];
        if (playerBet && playerBet.tokenValue > 0) {
          player.stats.tokensLost += playerBet.tokenValue;
        }
      });
    }

    // Log estado de jugadores
    console.log(`\n📊 Estado:`);
    session.players.forEach(p => {
      const bet = round.bets[p.id];
      const tokenUsed = bet ? `(usó +${bet.tokenValue})` : '';
      const combos = p.stats.combosCompleted > 0 ? ` | ${p.stats.combosCompleted} combos` : '';
      console.log(`   ${p.name}: ${p.score} pts, tokens: [${p.availableTokens.join(', ')}] ${tokenUsed}${combos}`);
    });

    // Historial
    session.history.push({
      round: round.roundNumber,
      trackId: round.trackId,
      questionType: round.question.type,
      winner: winnerId,
      pointsAwarded: results.pointsAwarded,
      comboDetected: results.comboStatus ? results.comboStatus.type : null,
      powerCardUsed: results.powerCardEffect ? results.powerCardEffect.cardName : null,
      timestamp: new Date().toISOString()
    });

    session.currentRound = null;

    // Verificar ganador del juego
    const gameWinner = this._checkWinner(session);
    if (gameWinner) {
      session.status = 'finished';
      results.gameOver = true;
      results.gameWinner = gameWinner;
      console.log(`🏆 GAME OVER - ${gameWinner.name}`);
    }

    console.log(`═══════════════════════\n`);

    return {
      success: true,
      results,
      players: session.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        tokens: p.availableTokens.length,
        powerCards: p.powerCards || [],
        stats: {
          correctAnswers: p.stats.correctAnswers || 0,
          wrongAnswers: p.stats.wrongAnswers || 0,
          tokensWon: p.stats.tokensWon || 0,
          tokensLost: p.stats.tokensLost || 0,
          tokensUsed: p.stats.tokensUsed || [],
          combosCompleted: p.stats.combosCompleted || 0,
          powerCardsUsed: p.stats.powerCardsUsed || 0,
          totalComboStreak: p.stats.totalComboStreak || 0
        }
      }))
    };
  }

  /**
 * Aplica un delta de puntos a un jugador en la sesión.
 * Usado por Reaction Cards (frontend-only) para mantener el backend sincronizado.
 *
 * @param {string} sessionId
 * @param {string} playerId  - ID del backend (player_1, player_2, etc.)
 * @param {number} delta     - positivo o negativo
 * @param {string} reason    - para logging (MANAGEMENT_FEE, BAD_REVIEW, etc.)
 */
  applyScoreDelta(sessionId, playerId, delta, reason = 'REACTION_CARD') {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    const player = session.players.find(p => p.id === playerId);

    if (!player) {
      return { success: false, error: 'Jugador no encontrado' };
    }

    const previousScore = player.score;
    player.score = Math.max(0, player.score + delta);

    console.log(`🎴 ${reason}: ${player.name} ${delta > 0 ? '+' : ''}${delta} (${previousScore} → ${player.score})`);

    return {
      success: true,
      player: {
        id: player.id,
        name: player.name,
        previousScore,
        newScore: player.score,
        delta,
        reason,
      },
      players: session.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        availableTokens: p.availableTokens,
      })),
    };
  }


  // ═══════════════════════════════════════════════════════════════
  // ⚡ MÉTODOS HELPER PARA POWER CARDS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Obtener estado de combo de un jugador en sesión
   */
  getPlayerComboStatus(sessionId, playerId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    const comboStatus = PowerCardService.getComboStatus(playerId);
    const player = session.players.find(p => p.id === playerId);

    return {
      success: true,
      comboStatus,
      playerStats: player ? {
        name: player.name,
        score: player.score,
        combosCompleted: player.stats.combosCompleted,
        powerCardsUsed: player.stats.powerCardsUsed
      } : null
    };
  }

  /**
   * Obtener inventario de cartas del jugador
   */
  getPlayerPowerCards(playerId) {
    const inventory = PowerCardService.getPlayerInventory(playerId);

    return {
      success: true,
      playerId,
      inventory,
      totalCards: Object.values(inventory).reduce((a, b) => a + b, 0)
    };
  }

  /**
   * Activar power card (llamado desde frontend)
   */
  activatePlayerPowerCard(sessionId, playerId, cardId) {
    const session = this.sessions.get(sessionId);

    if (!session || session.status !== 'playing') {
      return { success: false, error: 'Sesión no activa' };
    }

    const result = PowerCardService.activatePowerCard(playerId, cardId, sessionId);

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // MÉTODOS ORIGINALES (sin cambios)
  // ═══════════════════════════════════════════════════════════════

  startGame(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    if (session.status === 'playing') {
      return { success: false, error: 'El juego ya está en curso' };
    }

    session.status = 'playing';
    session.startedAt = new Date().toISOString();

    console.log(`▶️ Juego iniciado: ${sessionId}`);

    return {
      success: true,
      session: this._sanitizeSession(session)
    };
  }

  async nextRound(sessionId, forcedQuestionType = null) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    if (session.status !== 'playing') {
      return { success: false, error: 'El juego no está en curso' };
    }

    const winner = this._checkWinner(session);
    if (winner) {
      session.status = 'finished';
      return {
        success: true,
        gameOver: true,
        winner,
        session: this._sanitizeSession(session)
      };
    }

    session.round++;

    const filters = {
      genre: this._getRandomFromArray(session.config.genres),
      decade: this._getRandomFromArray(session.config.decades),
      difficulty: session.config.difficulty
    };

    // 🔄 Intentar hasta MAX_AUDIO_RETRIES veces para encontrar un track con audio
    const MAX_AUDIO_RETRIES = 3;
    let track = null;
    let audioUrl = null;
    let audioSource = 'deezer';

    for (let attempt = 1; attempt <= MAX_AUDIO_RETRIES; attempt++) {
      const candidate = await this.trackService.getRandomTrack(filters);

      if (!candidate) {
        break; // No quedan tracks
      }

      let candidateAudioUrl = candidate.previewUrl || null;
      let candidateAudioSource = candidate.audioSource || 'deezer';

      if (!candidateAudioUrl) {
        try {
          console.log(`🎵 [${attempt}/${MAX_AUDIO_RETRIES}] Buscando audio: "${candidate.title}" - ${candidate.artist}`);
          const deezerResult = await DeezerService.searchTrack(candidate.title, candidate.artist);
          if (deezerResult && deezerResult.previewUrl) {
            candidateAudioUrl = deezerResult.previewUrl;
            candidateAudioSource = 'deezer';
            console.log(`✅ Audio encontrado en intento ${attempt}`);
          }
        } catch (error) {
          console.error(`❌ Error Deezer (intento ${attempt}):`, error.message);
        }
      }

      track = candidate;
      audioUrl = candidateAudioUrl;
      audioSource = candidateAudioSource;

      if (audioUrl) {
        // ✅ Track con audio encontrado
        break;
      }

      console.warn(`⚠️ Intento ${attempt}: sin audio para "${candidate.title}", probando otro track...`);
    }

    if (!track) {
      return { success: false, error: 'No hay tracks disponibles' };
    }

    if (!audioUrl) {
      console.warn(`⚠️ No se encontró audio después de ${MAX_AUDIO_RETRIES} intentos — continuando sin audio`);
    }

    console.log(`🎵 Track: "${track.title}" - ${track.artist} (${audioUrl ? audioSource : 'sin audio'})`);

    const question = this.questionService.generateQuestion(track, forcedQuestionType);

    session.currentRound = {
      roundNumber: session.round,
      trackId: track.id,
      track: {
        id: track.id,
        genre: track.genre,
        decade: track.decade,
        audioUrl: audioUrl,
        audioSource: audioSource
      },
      question: {
        type: question.type,
        text: question.question,
        icon: question.icon,
        points: question.points,
        hints: question.hints,
        isChallenge: question.isChallenge || false
      },
      _answer: {
        correct: question.answer,
        acceptableAnswers: question.acceptableAnswers,
        trackTitle: track.title,
        trackArtist: track.artist
      },
      bets: {},
      startedAt: new Date().toISOString(),
      status: 'playing'
    };

    session.usedTrackIds.push(track.id);

    console.log(`🎵 Ronda ${session.round}: ${track.title}`);
    console.log(`   Pregunta: ${question.type} (${question.points} pts base)`);

    return {
      success: true,
      round: {
        number: session.round,
        track: session.currentRound.track,
        question: session.currentRound.question,
        gameMasterAnswer: {
          correct: session.currentRound._answer?.correct,
          trackTitle: session.currentRound._answer?.trackTitle,
          trackArtist: session.currentRound._answer?.trackArtist,
          acceptableAnswers: session.currentRound._answer?.acceptableAnswers || []
        }
      }
    };
  }

  placeBet(sessionId, playerId, tokenValue) {
    const session = this.sessions.get(sessionId);

    if (!session || !session.currentRound) {
      return { success: false, error: 'No hay ronda activa' };
    }

    const player = session.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Jugador no encontrado' };
    }

    if (!player.availableTokens.includes(tokenValue)) {
      console.log(`❌ Token +${tokenValue} no disponible para ${player.name}`);
      console.log(`   Tokens disponibles: [${player.availableTokens.join(', ')}]`);
      return {
        success: false,
        error: `Token +${tokenValue} ya fue usado`,
        availableTokens: player.availableTokens
      };
    }

    console.log(`🪙 ${player.name} usa token +${tokenValue}`);
    console.log(`   Tokens antes: [${player.availableTokens.join(', ')}]`);

    player.availableTokens = player.availableTokens.filter(t => t !== tokenValue);
    player.stats.tokensUsed.push(tokenValue);

    console.log(`   Tokens después: [${player.availableTokens.join(', ')}]`);

    session.currentRound.bets[playerId] = {
      tokenValue: tokenValue,
      usedAt: new Date().toISOString()
    };

    return {
      success: true,
      bet: {
        tokens: tokenValue,           // ✅ CORREGIDO: nombre correcto para frontend
        multiplier: tokenValue
      },
      playerTokens: player.availableTokens.length  // ✅ CORREGIDO: devolver número, no array
    };
  }

  usePowerCard(sessionId, playerId, cardType, targetPlayerId = null) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    const player = session.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Jugador no encontrado' };
    }

    console.log(`⚡ ${player.name} usa: ${cardType}`);

    // ─── FESTIVAL ─────────────────────────────────────────────────
    // Efecto inmediato: +1 a todos los jugadores de la sesión.
    if (cardType === 'power_festival_001' || cardType === 'festival') {
      session.players.forEach(p => { p.score += 1; });
      const affected = session.players.map(p => ({ id: p.id, name: p.name, score: p.score }));
      console.log(`🎪 FESTIVAL: +1 a todos (${session.players.length} jugadores)`);
      return {
        success: true,
        message: `🎪 ¡Festival! Todos los jugadores +1 pt`,
        effect: 'festival',
        affected,
      };
    }

    return {
      success: true,
      message: `Poder ${cardType} activado`,
    };
  }

  getStatus(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    return {
      success: true,
      session: this._sanitizeSession(session)
    };
  }

  getAllSessions() {
    const sessions = [];
    this.sessions.forEach((session, id) => {
      sessions.push({
        id,
        status: session.status,
        players: session.players.length,
        round: session.round,
        createdAt: session.createdAt
      });
    });
    return sessions;
  }

  deleteSession(sessionId) {
    const deleted = this.sessions.delete(sessionId);
    return { success: deleted };
  }

  cleanupOldSessions() {
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    let cleaned = 0;

    this.sessions.forEach((session, id) => {
      const createdAt = new Date(session.createdAt).getTime();
      if (createdAt < twoHoursAgo) {
        this.sessions.delete(id);
        cleaned++;
      }
    });

    return { cleaned };
  }

  _generateSessionId() {
    return 'game_' + Math.random().toString(36).substring(2, 9);
  }

  _getRandomFromArray(arr) {
    if (!arr || arr.length === 0) return 'ANY';
    if (arr.includes('ANY')) return 'ANY';
    return arr[Math.floor(Math.random() * arr.length)];
  }

  _checkWinner(session) {
    const targetScore = session.config.targetScore;

    for (const player of session.players) {
      if (player.score >= targetScore) {
        return {
          id: player.id,
          name: player.name,
          score: player.score,
          stats: player.stats  // ✅ Incluir stats
        };
      }
    }

    return null;
  }

  _sanitizeSession(session) {
    const sanitized = { ...session };

    if (sanitized.currentRound) {
      sanitized.currentRound = { ...sanitized.currentRound };
      delete sanitized.currentRound._answer;
    }

    return sanitized;
  }
}

module.exports = GameSessionService;
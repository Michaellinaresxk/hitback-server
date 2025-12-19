/**
 * 🎮 Game Session Service - HITBACK Backend
 * 
 * ✅ FIX: Sistema de tokens ÚNICOS
 * - Cada jugador tiene 3 tokens: [1, 2, 3] (valores +1, +2, +3)
 * - Al apostar: el token se REMUEVE del array (disabled)
 * - Si acierta: puntos = base + valor del token
 * - Si falla: 0 puntos, token ya usado
 * - Tokens NO se recuperan
 */

const trackService = require('./TrackService');
const QuestionService = require('./QuestionService');
const DeezerService = require('./DeezerService');

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
      availableTokens: [1, 2, 3], // ✅ 3 tokens ÚNICOS
      powerCards: [],
      stats: {
        correctAnswers: 0,
        wrongAnswers: 0,
        tokensUsed: []
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

    return {
      success: true,
      session: this._sanitizeSession(session)
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // ▶️ INICIAR JUEGO
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

  // ═══════════════════════════════════════════════════════════════
  // 🎵 SIGUIENTE RONDA
  // ═══════════════════════════════════════════════════════════════

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

    const track = this.trackService.getRandomTrack(filters);

    if (!track) {
      return { success: false, error: 'No hay tracks disponibles' };
    }

    let audioUrl = null;
    let audioSource = 'none';

    try {
      console.log(`🎵 Buscando: "${track.title}" - ${track.artist}`);
      const deezerResult = await DeezerService.searchTrack(track.title, track.artist);

      if (deezerResult && deezerResult.previewUrl) {
        audioUrl = deezerResult.previewUrl;
        audioSource = 'deezer';
        console.log(`✅ Audio encontrado`);
      }
    } catch (error) {
      console.error(`❌ Error Deezer:`, error.message);
    }

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
        question: session.currentRound.question
      },
      gameMasterData: {
        correctAnswer: question.answer,
        trackTitle: track.title,
        trackArtist: track.artist,
        acceptableAnswers: question.acceptableAnswers
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 🎰 USAR TOKEN (APOSTAR)
  // ═══════════════════════════════════════════════════════════════

  /**
   * ✅ FIX: Usar un token ÚNICO
   * - Verifica que el token específico esté disponible
   * - Lo REMUEVE del array (disabled)
   * - Guarda el valor para calcular puntos
   */
  placeBet(sessionId, playerId, tokenValue) {
    const session = this.sessions.get(sessionId);

    if (!session || !session.currentRound) {
      return { success: false, error: 'No hay ronda activa' };
    }

    const player = session.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Jugador no encontrado' };
    }

    // ✅ Verificar que el token ESPECÍFICO está disponible
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

    // ✅ REMOVER el token del array (disabled)
    player.availableTokens = player.availableTokens.filter(t => t !== tokenValue);
    player.stats.tokensUsed.push(tokenValue);

    console.log(`   Tokens después: [${player.availableTokens.join(', ')}]`);

    // Registrar la apuesta
    session.currentRound.bets[playerId] = {
      tokenValue: tokenValue,
      usedAt: new Date().toISOString()
    };

    return {
      success: true,
      bet: {
        tokenValue: tokenValue,
        multiplier: tokenValue // Compatibilidad
      },
      availableTokens: player.availableTokens // ✅ Retornar tokens restantes
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // ✅ REVELAR RESPUESTA
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
      tokenBonus: 0
    };

    console.log(`\n═══ REVEAL ANSWER ═══`);
    console.log(`Winner: ${winnerId || 'none'}`);
    console.log(`Base points: ${round.question.points}`);

    // PROCESAR GANADOR
    if (winnerId) {
      const winner = session.players.find(p => p.id === winnerId);

      if (winner) {
        const basePoints = round.question.points;
        const bet = round.bets[winnerId];
        const tokenBonus = bet ? bet.tokenValue : 0;

        // ✅ Total = base + token bonus
        const totalPoints = basePoints + tokenBonus;

        winner.score += totalPoints;
        winner.stats.correctAnswers++;

        results.winner = {
          id: winner.id,
          name: winner.name,
          newScore: winner.score
        };
        results.pointsAwarded = totalPoints;
        results.tokenBonus = tokenBonus;

        console.log(`✅ ${winner.name} GANA:`);
        console.log(`   Base: ${basePoints} pts`);
        console.log(`   Token: +${tokenBonus} pts`);
        console.log(`   Total: ${totalPoints} pts`);
      }
    } else {
      console.log(`😅 Nadie acertó`);
      // Los tokens ya fueron removidos en placeBet - no se recuperan
    }

    // Log estado de jugadores
    console.log(`\n📊 Estado:`);
    session.players.forEach(p => {
      const bet = round.bets[p.id];
      const tokenUsed = bet ? `(usó +${bet.tokenValue})` : '';
      console.log(`   ${p.name}: ${p.score} pts, tokens: [${p.availableTokens.join(', ')}] ${tokenUsed}`);
    });

    // Historial
    session.history.push({
      round: round.roundNumber,
      trackId: round.trackId,
      questionType: round.question.type,
      winner: winnerId,
      pointsAwarded: results.pointsAwarded,
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
      // ✅ Retornar availableTokens en lugar de tokens (número)
      players: session.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        availableTokens: p.availableTokens,
        tokens: p.availableTokens.length // Compatibilidad
      }))
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 📊 ESTADO
  // ═══════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════
  // ⚡ POWER CARDS
  // ═══════════════════════════════════════════════════════════════

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

    return {
      success: true,
      message: `Poder ${cardType} activado`
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔧 UTILS
  // ═══════════════════════════════════════════════════════════════

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
          score: player.score
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

  // ═══════════════════════════════════════════════════════════════
  // 🧹 CLEANUP
  // ═══════════════════════════════════════════════════════════════

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
}

module.exports = GameSessionService;